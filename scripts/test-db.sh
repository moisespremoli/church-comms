#!/usr/bin/env bash
# Aplica as migrações numa base de dados PostgreSQL descartável e corre os
# testes de RLS/autorização. Não precisa de conta Supabase.
#
# Uso:
#   PG_ADMIN_URL=postgresql://postgres:postgres@localhost:5432/postgres npm run test:db
#
# PG_ADMIN_URL tem de apontar para um utilizador com permissão para criar bases
# de dados e papéis (superuser). Por omissão usa o socket local.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ADMIN_URL="${PG_ADMIN_URL:-postgresql:///postgres}"
DB_NAME="${PG_TEST_DB:-church_comms_test}"

# Substitui o nome da base de dados no URL de administração.
TEST_URL="$(printf '%s' "$ADMIN_URL" | sed -E "s#/[^/?]*(\?|$)#/${DB_NAME}\1#")"

psql_admin() { psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q "$@"; }
psql_test() { psql "$TEST_URL" -v ON_ERROR_STOP=1 -q "$@"; }

echo "→ A recriar a base de dados de teste '${DB_NAME}'"
psql_admin -c "drop database if exists ${DB_NAME} with (force);"
psql_admin -c "create database ${DB_NAME};"

echo "→ Ambiente Supabase simulado"
psql_test -f "$ROOT/db-tests/00_supabase_stub.sql"

for migration in "$ROOT"/supabase/migrations/*.sql; do
  echo "→ Migração $(basename "$migration")"
  PGOPTIONS="-c client_min_messages=warning" psql_test -f "$migration"
done

for test_file in "$ROOT"/db-tests/*.test.sql; do
  echo "→ Testes $(basename "$test_file")"
  psql_test -o /dev/null -f "$test_file" 2>&1 | sed -E "s/^psql:[^ ]+ (NOTICE|ERROR):  /  \1 /"
  # pipefail garante que uma falha do psql falha o script
done

if [[ "${PG_KEEP_DB:-0}" != "1" ]]; then
  psql_admin -c "drop database if exists ${DB_NAME} with (force);"
fi
echo "✓ Base de dados: todas as migrações e testes passaram."
