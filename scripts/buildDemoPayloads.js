import fs from 'fs';
import path from 'path';

const files = [
  'chat-whatsapp-incident-1.png',
  'chat-instagram-incident-2.png',
  'chat-sms-incident-3.png',
  'whatsapp-chat-export-oct2026.txt',
  'hr-incident-report-oct2026.pdf',
];

let out = '// Auto-generated demo asset payloads for offline & isomorphic vault storage\n';
out += 'export const DEMO_ASSET_PAYLOADS = {\n';

for (const f of files) {
  const p = path.join('public', 'demo-assets', f);
  const buf = fs.readFileSync(p);
  const b64 = buf.toString('base64');
  out += `  ${JSON.stringify(f)}: ${JSON.stringify(b64)},\n`;
}

out += '};\n\n';
out += `export function getDemoAssetBuffer(filename) {
  const b64 = DEMO_ASSET_PAYLOADS[filename];
  if (!b64) return null;
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(b64, 'base64');
  }
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8.buffer;
}
`;

fs.writeFileSync('src/data/demoAssetPayloads.js', out);
console.log('src/data/demoAssetPayloads.js written successfully. Size:', out.length);
