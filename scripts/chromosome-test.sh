#!/usr/bin/env bash
# Chromosome portability test driver.
#
# For each (provider, model) combination in PROVIDERS, run pi with the legion
# loader + 3 tissues active and ask for an opening-ritual structured-JSON
# emission. Captures output to /tmp/legion-chromosome-test/<provider>.json.
#
# A companion vitest in test/legion/chromosome-portability.test.ts parses
# each output and computes the structural-match rate.
#
# Required env: TELUS_GPT_OSS_KEY, TELUS_GEMMA_KEY, TELUS_QWEN_KEY (sourced
# from ~/.claude/local/secrets/telus-api.env).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT=/tmp/legion-chromosome-test
rm -rf "$OUT"
mkdir -p "$OUT"

if [[ -f "$HOME/.claude/local/secrets/telus-api.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$HOME/.claude/local/secrets/telus-api.env"
  set +a
fi

PI_CLI="$REPO_ROOT/packages/coding-agent/dist/cli.js"
EXT_LOADER="$REPO_ROOT/extensions/legion/_loader.ts"
EXT_KOI="$REPO_ROOT/extensions/legion/koi.ts"
EXT_KNOWLEDGE="$REPO_ROOT/extensions/legion/knowledge.ts"
EXT_JOURNAL="$REPO_ROOT/extensions/legion/journal.ts"

PROMPT='Operator: shawn. Run your opening ritual now, but instead of natural language, output a single JSON object only - no prose, no markdown fences. The object MUST have these keys: model (string), identity_first_line (string), channel_confirmed (boolean), tissues_named (array of strings), available_peers (array of strings), next_action (string).'

PROVIDERS=(
  "telus-gpt-oss|gpt-oss:120b"
  "telus-gemma|google/gemma-4-31b-it"
  "telus-qwen|Qwen/Qwen3.6-35B-A3B"
)

for combo in "${PROVIDERS[@]}"; do
  provider="${combo%%|*}"
  model="${combo##*|}"
  echo "=== running provider=$provider model=$model ==="
  timeout 180 node "$PI_CLI" \
    -p --no-session \
    --provider "$provider" \
    --model "$model" \
    -e "$EXT_LOADER" -e "$EXT_KOI" -e "$EXT_KNOWLEDGE" -e "$EXT_JOURNAL" \
    --legion koi,knowledge,journal \
    --no-context-files --no-skills \
    "$PROMPT" \
    > "$OUT/${provider}.json" 2> "$OUT/${provider}.stderr.log" < /dev/null || true
done

echo "=== outputs ==="
for f in "$OUT"/*.json; do
  echo "--- $(basename "$f") ---"
  cat "$f"
  echo
done
