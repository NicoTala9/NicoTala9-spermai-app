#!/bin/bash

TOKEN="TU_TOKEN"
REPO="NicoTala9/spermai-app"

upload_file() {
  FILE=$1; PATH_IN_REPO=$2
  CONTENT=$(base64 -i "$FILE")
  SHA=$(curl -s -H "Authorization: token $TOKEN" \
    "https://api.github.com/repos/$REPO/contents/$PATH_IN_REPO" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('sha',''))" 2>/dev/null)
  DATA="{\"message\":\"feat: SpermAI initial deploy\",\"content\":\"$CONTENT\""
  if [ -n "$SHA" ]; then DATA="$DATA,\"sha\":\"$SHA\""; fi
  DATA="$DATA}"
  curl -s -X PUT -H "Authorization: token $TOKEN" -H "Content-Type: application/json" \
    -d "$DATA" "https://api.github.com/repos/$REPO/contents/$PATH_IN_REPO" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK:', d.get('content',{}).get('name','error'))"
}

echo "🚀 Subiendo SpermAI a GitHub..."

upload_file ~/Downloads/sperm-deploy/index.html "index.html"
upload_file ~/Downloads/sperm-deploy/package.json "package.json"
upload_file ~/Downloads/sperm-deploy/vite.config.js "vite.config.js"
upload_file ~/Downloads/sperm-deploy/vercel.json "vercel.json"
upload_file ~/Downloads/sperm-deploy/src/main.jsx "src/main.jsx"
upload_file ~/Downloads/sperm-deploy/src/App.jsx "src/App.jsx"

echo "✅ Listo! Revisá https://github.com/NicoTala9/spermai-app"
