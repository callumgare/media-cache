#!/usr/bin/env bash

# Enable strict mode
# http://redsymbol.net/articles/unofficial-bash-strict-mode/
set -euo pipefail
IFS=$'\n\t'

tsx -e 'import("./tests/setup/global-setup.ts").then(mod => mod.setup())'

npx nuxt dev --port 3001