#!/bin/bash
# Mahalliy Postgres'da sxema va ssenariy testini ishga tushiradi
set -e
P=/usr/lib/postgresql/16/bin
D=$(mktemp -d)/pg
mkdir -p $D
chown -R postgres $(dirname $D) 2>/dev/null || true
RUN="su postgres -c"
if [ "$(id -u)" != "0" ]; then RUN="bash -c"; fi
$RUN "$P/initdb -D $D -A trust -U postgres >/dev/null"
$RUN "$P/pg_ctl -D $D -o '-p 5499 -k /tmp' -l $D/log start >/dev/null"
sleep 2
PSQL="psql -h /tmp -p 5499 -U postgres -v ON_ERROR_STOP=1 -q -tA"
$PSQL -c "create database t" postgres
R=$(cd "$(dirname "$0")/.." && pwd)
$PSQL -d t -f $R/tests/supabase_stubs.sql
$PSQL -d t -c "insert into vault.decrypted_secrets values ('notify_url','http://x/notify'),('notify_secret','s')"
sed 's/^create extension if not exists pg_net;/-- pg_net (stub)/' $R/supabase/migrations/20261016000001_schema.sql | $PSQL -d t
$PSQL -d t -f $R/supabase/migrations/20261016000002_seed_drugs.sql
# Ikkinchi marta ishga tushirish xavfsizligi (idempotent)
sed 's/^create extension if not exists pg_net;/-- pg_net (stub)/' $R/supabase/migrations/20261016000001_schema.sql | $PSQL -d t
$PSQL -d t -f $R/tests/scenario.sql 2>&1 | grep -vE "^$" || STATUS=$?
$RUN "$P/pg_ctl -D $D stop >/dev/null"
exit ${STATUS:-0}
