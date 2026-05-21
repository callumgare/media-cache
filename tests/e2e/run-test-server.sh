#!/usr/bin/env bash

# Enable strict mode
# http://redsymbol.net/articles/unofficial-bash-strict-mode/
set -euo pipefail
IFS=$'\n\t'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

# Load .env from project root if it exists
if [ -f "${PROJECT_ROOT}/.env" ]; then
  set -a
  # shellcheck source=/dev/null
  source "${PROJECT_ROOT}/.env"
  set +a
fi

# Derive test DB URL from DATABASE_URL (or use default)
_BASE_DB_URL="${DATABASE_URL:-postgresql://postgres:example@localhost:5432/postgres}"
_PARSED_HOST="$(node -e "const u = new URL('${_BASE_DB_URL}'); u.pathname='/media_cache_test'; process.stdout.write(u.toString())")"
export DATABASE_URL="${_PARSED_HOST}"

export ENABLE_TEST_API=true

# Create a temporary plugins dir with the test plugin "installed" so that
# loadInstalledPlugins() picks it up without needing LIASE_PLUGINS.
TEST_PLUGINS_DIR=$(mktemp -d)
mkdir -p "${TEST_PLUGINS_DIR}/node_modules/test-plugin"
echo '{"name":"media-cache-test-plugins","type":"module","dependencies":{"test-plugin":"1.0.0"}}' > "${TEST_PLUGINS_DIR}/package.json"
echo '{"name":"test-plugin","version":"1.0.0","type":"module","main":"index.js"}' > "${TEST_PLUGINS_DIR}/node_modules/test-plugin/package.json"
echo "export { default } from '${SCRIPT_DIR}/../unit/fixtures/test-plugin.ts';" > "${TEST_PLUGINS_DIR}/node_modules/test-plugin/index.js"
export PLUGINS_DIR="${TEST_PLUGINS_DIR}"

tsx -e "import('${SCRIPT_DIR}/../setup/global-setup.ts').then(mod => mod.setup()).then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })"

cd "$PROJECT_ROOT"
npx nuxt dev