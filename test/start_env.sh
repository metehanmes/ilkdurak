#!/bin/bash
# PostgREST + Supabase taklidi + web sunucusu
cd "$(dirname "$0")/.."
S=/tmp/claude-0/-home-claude/c7dba939-70dd-5fb9-989e-c1e7c77d61e1/scratchpad
pkill -f "^/tmp/claude-0/.*/postgrest" 2>/dev/null; pkill -f "^node test/mock_supabase" 2>/dev/null; pkill -f "^python3 -m http.server 8080" 2>/dev/null
sleep 0.5
rm -rf /tmp/ilk-store
nohup $S/pgrst/postgrest test/pgrst.conf > /tmp/pgrst.log 2>&1 &
nohup node test/mock_supabase.mjs > /tmp/mock.log 2>&1 &
(cd web && nohup python3 -m http.server 8080 --bind 127.0.0.1 > /tmp/web.log 2>&1 &)
for i in $(seq 1 30); do
  curl -s -o /dev/null http://127.0.0.1:3001/ && curl -s -o /dev/null http://127.0.0.1:54321/__faults -X POST -d '{}' && break
  sleep 0.3
done
curl -s http://127.0.0.1:3001/ >/dev/null && echo "postgrest ok" || (echo "postgrest FAIL"; tail -5 /tmp/pgrst.log)
curl -s -X POST http://127.0.0.1:54321/__faults -d '{}' >/dev/null && echo "mock ok" || (echo "mock FAIL"; tail -5 /tmp/mock.log)
