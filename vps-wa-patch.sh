#!/bin/bash
# Patch wa-server to resolve WhatsApp JID (9th digit fix) before sending.
# Run this on the Oracle Cloud VPS:
#   ssh -i "C:\ssh\ssh-key-2026-05-20.key" ubuntu@147.15.88.162
#   bash vps-wa-patch.sh
#
# What it does:
#   1. Backs up the current server.js
#   2. Replaces the /send route with a version that calls sock.onWhatsApp()
#      to find the real JID, trying both 9th-digit variants
#   3. Restarts the wa-server container

set -e

CONTAINER="wa-server"
echo "[1/4] Backing up server.js..."
docker cp $CONTAINER:/app/server.js /home/ubuntu/server.js.bak
echo "  -> saved to /home/ubuntu/server.js.bak"

echo "[2/4] Copying server.js from container..."
docker cp $CONTAINER:/app/server.js /tmp/server.js

echo "[3/4] Patching /send route..."
# Write a Node.js patcher that modifies the /send handler in-place
node - <<'EOF'
const fs = require('fs');
const code = fs.readFileSync('/tmp/server.js', 'utf8');

// The existing send handler body — we inject JID resolution before sock.sendMessage
// Strategy: wrap the existing sendMessage call inside a JID resolver
const patched = code.replace(
  /app\.post\(['"]\/send['"],\s*auth\s*,\s*async\s*\(req,\s*res\)\s*=>\s*\{/,
  `app.post('/send', auth, async (req, res) => {
  // Resolve the real WhatsApp JID — handles Brazil 9th digit issue
  async function resolveJid(phone) {
    try {
      const [r] = await sock.onWhatsApp(phone);
      if (r && r.exists) return r.jid;
    } catch {}
    return null;
  }
  async function findJid(raw) {
    const d = raw.replace(/\\D/g, '');
    const p = d.startsWith('55') ? d : '55' + d;
    let jid = await resolveJid(p);
    if (jid) return jid;
    // Try toggling 9th digit (Brazil mobile)
    const alt = p.length === 13
      ? p.slice(0, 4) + p.slice(5)
      : p.length === 12 ? p.slice(0, 4) + '9' + p.slice(4) : null;
    if (alt) jid = await resolveJid(alt);
    return jid || (p + '@s.whatsapp.net');
  }
  // __PATCHED_MARKER__ — do not patch twice`
);

if (patched === code) {
  // Already patched or different format — try gentler approach
  if (code.includes('__PATCHED_MARKER__')) {
    console.log('Already patched, skipping.');
    process.exit(0);
  }
  console.error('Could not find /send handler to patch. Manual patch required.');
  process.exit(1);
}

// Also replace sock.sendMessage(phone ...) or sock.sendMessage(jid ...) with findJid version
// Look for the pattern inside the patched handler
const patched2 = patched.replace(
  /await\s+sock\.sendMessage\(\s*([^,]+)\s*,/g,
  (match, arg) => {
    if (arg.trim().includes('findJid') || arg.trim().includes('@s.whatsapp.net')) return match;
    return `await sock.sendMessage(await findJid(${arg.trim()}),`;
  }
);

fs.writeFileSync('/tmp/server.patched.js', patched2, 'utf8');
console.log('Patch written to /tmp/server.patched.js');
EOF

echo "[4/4] Copying patched file back and restarting..."
docker cp /tmp/server.patched.js $CONTAINER:/app/server.js
docker restart $CONTAINER
echo ""
echo "Done! Test with:"
echo "  curl -s -X POST https://evolution.salvitarn.com.br/send \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -H 'apikey: MinhaChaveSuperSegura123456' \\"
echo "    -d '{\"phone\":\"5584986207841\",\"message\":\"Teste patch\"}'"
