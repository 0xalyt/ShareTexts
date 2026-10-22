#!/usr/bin/env bash
# One-off: run every verify-*.mjs gate, record pass/fail + seconds.
# Output: /tmp/gate-results.txt (pipe-separated: name | exit | seconds | tail)
: > /tmp/gate-results.txt
cd "$(dirname "$0")/.." || exit 1
for f in scripts/verify-*.mjs; do
  name=$(basename "$f")
  start=$(date +%s)
  timeout 180 node "$f" > "/tmp/gate-$name.log" 2>&1
  code=$?
  end=$(date +%s)
  tail=$(tail -c 300 "/tmp/gate-$name.log" | tr '\n' ' ' | tr '|' '/' | cut -c1-260)
  echo "$name | $code | $((end-start))s | $tail" >> /tmp/gate-results.txt
done
echo "DONE" >> /tmp/gate-results.txt
