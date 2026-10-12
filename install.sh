#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo "→ installing seedr-cli"

if ! command -v deno >/dev/null 2>&1; then
  echo "✗ Deno is not installed. Install it with:"
  echo "    curl -fsSL https://deno.land/install.sh | sh"
  exit 1
fi

echo "  Deno $(deno --version | head -n1 | awk '{print $2}') detected"
echo "→ caching dependencies (react, ink)"
deno cache src/mod.ts
chmod +x src/mod.ts 2>/dev/null || true

echo ""
echo "✓ ready."
echo ""
echo "  First run:"
echo "    deno task start -- --pat 'sdp_...'"
echo "    # or: export SEEDR_PAT='sdp_...' && deno task start"
echo ""
