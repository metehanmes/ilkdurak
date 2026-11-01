// Yerel test için Supabase taklidi: /rest/v1 → PostgREST, /auth/v1 ve /storage/v1 → bu dosya.
// Gerçek Supabase davranışına yakın tutulmuştur (anonim giriş, yenileme, depolama kuralları RLS ile).
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.MOCK_PORT || 54321);
const PGRST = process.env.PGRST_URL || 'http://127.0.0.1:3001';
const SECRET = process.env.JWT_SECRET || 'ilkdurak-yerel-test-gizli-anahtari-32-karakter';
const STORE = process.env.STORE_DIR || '/tmp/ilk-store';
const BUCKETS = { 'ilk-media': { limit: 10 * 1024 * 1024, mimes: ['image/jpeg', 'image/png', 'image/webp', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/webm', 'audio/ogg'] } };
fs.mkdirSync(STORE, { recursive: true });

const b64u = (b) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
function sign(payload) {
  const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64u(JSON.stringify(payload));
  const s = b64u(crypto.createHmac('sha256', SECRET).update(h + '.' + p).digest());
  return `${h}.${p}.${s}`;
}
function verify(token) {
  try {
    const [h, p, s] = token.split('.');
    const exp = b64u(crypto.createHmac('sha256', SECRET).update(h + '.' + p).digest());
    if (exp !== s) return null;
    const payload = JSON.parse(Buffer.from(p, 'base64').toString());
    if (payload.exp && payload.exp < Date.now() / 1000) return null;
    return payload;
  } catch { return null; }
}
const refreshTokens = new Map();
function session(user) {
  const now = Math.floor(Date.now() / 1000);
  const ttl = Number(process.env.TOKEN_TTL || 3600);
  const access_token = sign({ sub: user.id, role: 'authenticated', aud: 'authenticated', is_anonymous: !!user.is_anonymous, email: user.email || '', iat: now, exp: now + ttl });
  const refresh_token = crypto.randomBytes(18).toString('hex');
  refreshTokens.set(refresh_token, user);
  return { access_token, token_type: 'bearer', expires_in: ttl, expires_at: now + ttl, refresh_token, user };
}

async function pg(pathname, { method = 'POST', body, token } = {}) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const r = await fetch(PGRST + pathname, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let data = null; try { data = JSON.parse(text); } catch { data = text; }
  return { status: r.status, data };
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, apikey, content-type, prefer, x-client-info, x-upsert, cache-control, range, accept-profile, content-profile');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'content-range');
}
function send(res, status, obj, type = 'application/json') {
  cors(res);
  res.writeHead(status, { 'Content-Type': type });
  res.end(typeof obj === 'string' || Buffer.isBuffer(obj) ? obj : JSON.stringify(obj));
}
const readBody = (req) => new Promise((ok) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); });
const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer\s+/i, '');

// Testlerin araya girebilmesi için gecikme/hata enjeksiyonu
let faults = { slowMs: 0, failRest: 0 };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); return res.end(); }
  try {
    if (url.pathname === '/__faults') { faults = { ...faults, ...JSON.parse((await readBody(req)).toString() || '{}') }; return send(res, 200, faults); }
    if (faults.slowMs) await new Promise((r) => setTimeout(r, faults.slowMs));

    // ── REST → PostgREST
    if (url.pathname.startsWith('/rest/v1/')) {
      if (faults.failRest > 0) { faults.failRest--; return send(res, 503, { message: 'test arızası' }); }
      const body = await readBody(req);
      const headers = {};
      for (const k of ['content-type', 'prefer', 'accept', 'range']) if (req.headers[k]) headers[k] = req.headers[k];
      const tok = bearer(req);
      if (tok && tok.split('.').length === 3) {
        if (!verify(tok)) return send(res, 401, { code: 'PGRST301', message: 'JWT expired' });
        headers.authorization = 'Bearer ' + tok;
      }
      const r = await fetch(PGRST + url.pathname.slice(8) + url.search, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
      const buf = Buffer.from(await r.arrayBuffer());
      cors(res);
      const out = { 'Content-Type': r.headers.get('content-type') || 'application/json' };
      if (r.headers.get('content-range')) out['Content-Range'] = r.headers.get('content-range');
      res.writeHead(r.status, out);
      return res.end(buf);
    }

    // ── AUTH
    if (url.pathname === '/auth/v1/signup' && req.method === 'POST') {
      const b = JSON.parse((await readBody(req)).toString() || '{}');
      const anon = !b.email;
      const r = await pg('/rpc/zz_test_create_user', { body: { p_email: b.email || null, p_password: b.password || null, p_anon: anon } });
      if (r.status >= 300) return send(res, 400, { msg: 'signup failed', detail: r.data });
      const u = (await pg('/rpc/zz_test_user', { body: { p_id: r.data } })).data;
      return send(res, 200, session(u));
    }
    if (url.pathname === '/auth/v1/token' && req.method === 'POST') {
      const b = JSON.parse((await readBody(req)).toString() || '{}');
      const grant = url.searchParams.get('grant_type');
      if (grant === 'password') {
        const r = await pg('/rpc/zz_test_check_login', { body: { p_email: b.email, p_password: b.password } });
        if (!r.data) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
        const u = (await pg('/rpc/zz_test_user', { body: { p_id: r.data } })).data;
        return send(res, 200, session(u));
      }
      if (grant === 'refresh_token') {
        const u = refreshTokens.get(b.refresh_token);
        if (!u) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' });
        refreshTokens.delete(b.refresh_token);
        return send(res, 200, session(u));
      }
    }
    if (url.pathname === '/auth/v1/user' && req.method === 'GET') {
      const p = verify(bearer(req));
      if (!p) return send(res, 401, { msg: 'invalid token' });
      return send(res, 200, (await pg('/rpc/zz_test_user', { body: { p_id: p.sub } })).data);
    }
    if (url.pathname === '/auth/v1/logout') return send(res, 204, '');

    // ── STORAGE
    let m;
    if ((m = url.pathname.match(/^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/)) && req.method === 'GET') {
      const file = path.join(STORE, m[1], decodeURIComponent(m[2]));
      if (!file.startsWith(STORE) || !fs.existsSync(file)) return send(res, 404, { error: 'not_found' });
      const meta = JSON.parse(fs.readFileSync(file + '.meta'));
      cors(res);
      res.writeHead(200, { 'Content-Type': meta.type, 'Cache-Control': 'public, max-age=3600', 'Accept-Ranges': 'bytes' });
      return res.end(fs.readFileSync(file));
    }
    if ((m = url.pathname.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/)) && req.method === 'POST') {
      const bucket = m[1], name = decodeURIComponent(m[2]);
      const tok = bearer(req);
      if (!verify(tok)) return send(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'invalid jwt' });
      const conf = BUCKETS[bucket];
      if (!conf) return send(res, 400, { statusCode: '404', error: 'Bucket not found' });
      const body = await readBody(req);
      const type = (req.headers['content-type'] || '').split(';')[0].trim();
      if (body.length > conf.limit) return send(res, 413, { statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' });
      if (!conf.mimes.includes(type)) return send(res, 400, { statusCode: '415', error: 'invalid_mime_type', message: `mime type ${type} is not supported` });
      const r = await pg('/rpc/zz_test_storage_insert', { body: { p_bucket: bucket, p_name: name }, token: tok });
      if (r.status >= 300) return send(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
      const file = path.join(STORE, bucket, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, body);
      fs.writeFileSync(file + '.meta', JSON.stringify({ type }));
      return send(res, 200, { Key: `${bucket}/${name}`, Id: crypto.randomUUID() });
    }
    if ((m = url.pathname.match(/^\/storage\/v1\/object\/([^/]+)$/)) && req.method === 'DELETE') {
      const bucket = m[1];
      const tok = bearer(req);
      const b = JSON.parse((await readBody(req)).toString() || '{}');
      const done = [];
      for (const name of b.prefixes || []) {
        const r = await pg('/rpc/zz_test_storage_delete', { body: { p_bucket: bucket, p_name: name }, token: tok });
        if (r.data === true) {
          const file = path.join(STORE, bucket, name);
          try { fs.unlinkSync(file); fs.unlinkSync(file + '.meta'); } catch {}
          done.push({ name });
        }
      }
      return send(res, 200, done);
    }
    send(res, 404, { error: 'mock: bilinmeyen uç ' + req.method + ' ' + url.pathname });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: String(e) });
  }
});
server.listen(PORT, () => console.log('mock supabase on', PORT));
