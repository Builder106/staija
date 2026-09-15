#!/usr/bin/env sh

set -eu

paths='package.json package-lock.json .env.example tools src public .github scripts'
if rg -n -i 'vectorizer|vectorizer\.ai|VECTORIZER_' $paths --glob '!JOURNAL.md' --glob '!scripts/check-avatar-backend.sh' --glob '!.github/workflows/ci.yml' --glob '!node_modules/**' --glob '!dist/**'; then
  echo 'Active retired avatar backend references detected outside JOURNAL.md.' >&2
  exit 1
fi

echo 'No active retired avatar backend references detected.'
