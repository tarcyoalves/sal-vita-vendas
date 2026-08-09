#!/bin/bash
# Expose the WhatsApp pairing QR over HTTP so the admin panel can show it.
#
# Why: the wa-server only serves GET /status and POST /send. Everything else
# (/qr, /reconnect, /restart, /connect) 404s — which is why the panel's reconnect
# button never did anything, and why a dropped session could only be recovered by
# SSHing in and reading the ASCII QR out of `docker logs`.
#
# Baileys already emits the QR on every 'connection.update' while unauthenticated.
# This patch just remembers the most recent one and serves it at GET /qr, so
# /sal-vita-recovery can render it. It adds a listener alongside the existing
# handler rather than rewriting it, so the current reconnect logic is untouched.
#
# Runs entirely through `docker exec` — the VPS host itself has no Node
# installed, only the container does, so every step below happens inside it.
#
# Run ON the VPS:
#   bash vps-wa-qr-patch.sh
#
# Safe to run twice — it detects its own marker and exits.

set -e

CONTAINER="wa-server"
STAMP=$(date +%Y%m%d-%H%M%S)
BACKUP="/home/ubuntu/server.js.bak-$STAMP"

echo "[1/5] Backing up current server.js -> $BACKUP"
docker cp "$CONTAINER:/app/server.js" "$BACKUP"

echo "[2/5] Patching inside the container (the host has no Node — using the container's)"
set +e
docker exec -i "$CONTAINER" node <<'EOF'
const fs = require('fs');
const SRC = '/app/server.js';
let code = fs.readFileSync(SRC, 'utf8');

if (code.includes('__SALVITA_QR_PATCH__')) {
  console.log('SKIP: already patched.');
  process.exit(3);
}

// 1) Module-level slot for the newest QR.
code = `// __SALVITA_QR_PATCH__\nlet __lastQr = null, __lastQrAt = 0;\n` + code;

// 2) Register an extra 'connection.update' listener just before the existing
//    one. Baileys is an EventEmitter, so both run; the original is not modified.
const evRe = /(\b[\w$.]+)\.ev\.on\(\s*['"]connection\.update['"]\s*,/;
const m = code.match(evRe);
if (!m) {
  console.error('FAIL: no "connection.update" listener found — cannot capture the QR.');
  process.exit(1);
}
const receiver = m[1];
code = code.replace(
  evRe,
  `${receiver}.ev.on('connection.update', (__u) => {\n` +
  `  if (__u && __u.qr) { __lastQr = __u.qr; __lastQrAt = Date.now(); console.log('[qr] captured, len=' + __u.qr.length); }\n` +
  `  if (__u && __u.connection === 'open') { __lastQr = null; }\n` +
  `});\n` +
  `${receiver}.ev.on('connection.update',`
);

// 3) Serve it. Anchored on the /send route, whose exact shape we already know.
const sendRe = /app\.post\(\s*['"]\/send['"]\s*,\s*auth\s*,/;
if (!sendRe.test(code)) {
  console.error('FAIL: no "app.post(\'/send\', auth," route found — cannot place GET /qr.');
  process.exit(2);
}
code = code.replace(
  sendRe,
  `app.get('/qr', auth, (req, res) => {\n` +
  `  if (!__lastQr) return res.json({ qr: null, reason: 'no_qr_pending' });\n` +
  `  res.json({ qr: __lastQr, ageSeconds: Math.round((Date.now() - __lastQrAt) / 1000) });\n` +
  `});\n\n` +
  `$&`
);

fs.writeFileSync('/tmp/server.patched.js', code, 'utf8');
console.log('OK: patch written.');
EOF
RC=$?
set -e

if [ $RC -eq 3 ]; then
  echo "Nothing to do — already patched."
  exit 0
fi
if [ $RC -ne 0 ]; then
  echo ""
  echo "Patch aborted, container untouched. Here is what the anchors look like — send this back:"
  docker exec "$CONTAINER" grep -n "connection.update" /app/server.js | head -5 || true
  docker exec "$CONTAINER" grep -n "app.post('/send'\|app.post(\"/send\"" /app/server.js | head -5 || true
  exit 1
fi

echo "[3/5] Syntax-checking the patched file"
docker exec "$CONTAINER" node --check /tmp/server.patched.js

echo "[4/5] Installing and restarting"
docker exec "$CONTAINER" cp /tmp/server.patched.js /app/server.js
docker restart "$CONTAINER"

echo "[5/5] Waiting for the container to come back..."
sleep 6

echo ""
echo "Done. Verify (export WA_API_KEY first — do not paste the key inline):"
echo "  curl -s https://evolution.salvitarn.com.br/qr -H \"apikey: \$WA_API_KEY\" | head -c 200"
echo ""
echo "  {\"qr\": null, \"reason\": \"no_qr_pending\"}  -> no pairing in progress."
echo "     The session is either already open, or the server stopped retrying:"
echo "     run 'docker restart $CONTAINER', wait ~10s, then ask for /qr again."
echo "  {\"qr\": \"2@...\"}                            -> open the panel and click QR code."
echo ""
echo "Rollback if anything looks wrong:"
echo "  docker cp $BACKUP $CONTAINER:/app/server.js && docker restart $CONTAINER"
