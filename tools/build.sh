#!/bin/bash
# Yayın kopyası: web/ → dist/. Kullanım: tools/build.sh https://kullanici.github.io/ilkdurak
# Paylaşım önizlemeleri (WhatsApp/Instagram) için görsel adresleri tam adres olmalı; 404 sayfası her derinlikte çalışmalı.
set -e
cd "$(dirname "$0")/.."
BASE="${1%/}"
[ -z "$BASE" ] && { echo "Kullanım: tools/build.sh https://alan-adi"; exit 1; }
rm -rf dist && cp -r web dist
sed -i "s#content=\"assets/img/#content=\"$BASE/assets/img/#g" dist/*.html
sed -i "s#href=\"assets/#href=\"$BASE/assets/#g; s#src=\"assets/#src=\"$BASE/assets/#g; s#href=\"./\"#href=\"$BASE/\"#g" dist/404.html
touch dist/.nojekyll
echo "$BASE" > dist/.base
grep -c "$BASE" dist/index.html dist/s.html dist/404.html
