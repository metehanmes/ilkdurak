#!/bin/bash
# Yerel veritabanını sıfırdan kurar ve kuralları test eder
set -e
cd "$(dirname "$0")/.."
P="psql -h /tmp -p 5433 -U postgres -v ON_ERROR_STOP=1 -q"
su postgres -c "psql -h /tmp -p 5433 -q -c 'drop database if exists ilkdurak with (force)' -c 'create database ilkdurak'" 2>/dev/null
su postgres -c "$P -d ilkdurak -f test/supabase_stub.sql" 2>&1 | grep -v NOTICE || true
su postgres -c "$P -d ilkdurak -f test/test_helpers.sql" 2>&1 | grep -v NOTICE || true
su postgres -c "$P -d ilkdurak -f supabase/migrations/001_ilk_durak.sql" 2>&1 | grep -v NOTICE || true
su postgres -c "$P -d ilkdurak -f supabase/migrations/002_ilk_storage.sql" 2>&1 | grep -v NOTICE || true
if [ "$1" != "--no-tests" ]; then
  su postgres -c "$P -d ilkdurak -f test/01_rules.sql" 2>&1 | grep -E "GEÇTİ|ERROR|error|assert" || true
  # testler veriyi kirlettiği için tekrar temiz kur
  su postgres -c "psql -h /tmp -p 5433 -q -c 'drop database if exists ilkdurak with (force)' -c 'create database ilkdurak'" 2>/dev/null
  su postgres -c "$P -d ilkdurak -f test/supabase_stub.sql" 2>&1 | grep -v NOTICE || true
  su postgres -c "$P -d ilkdurak -f test/test_helpers.sql" 2>&1 | grep -v NOTICE || true
  su postgres -c "$P -d ilkdurak -f supabase/migrations/001_ilk_durak.sql" 2>&1 | grep -v NOTICE || true
  su postgres -c "$P -d ilkdurak -f supabase/migrations/002_ilk_storage.sql" 2>&1 | grep -v NOTICE || true
fi
