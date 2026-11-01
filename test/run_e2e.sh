#!/bin/bash
# Temiz veritabanıyla uçtan uca testleri çalıştırır (yerel yığın açık olmalı: test/start_env.sh)
cd "$(dirname "$0")/.."
./test/run_db.sh --no-tests >/dev/null 2>&1
rm -rf /tmp/ilk-store
python3 test/e2e.py
