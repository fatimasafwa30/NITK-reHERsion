import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import PDFDocument from 'pdfkit';

const DEMO_DIR = path.resolve('public', 'demo-assets');
if (!fs.existsSync(DEMO_DIR)) {
  fs.mkdirSync(DEMO_DIR, { recursive: true });
}

// -------------------------------------------------------------
// Pure Node PNG Canvas & Text Renderer (No external native deps)
// -------------------------------------------------------------
const FONT_MAP = {
  'A': [0x18, 0x24, 0x42, 0x7e, 0x42, 0x42, 0x42],
  'B': [0x7c, 0x42, 0x42, 0x7c, 0x42, 0x42, 0x7c],
  'C': [0x3c, 0x42, 0x40, 0x40, 0x40, 0x42, 0x3c],
  'D': [0x78, 0x44, 0x42, 0x42, 0x42, 0x44, 0x78],
  'E': [0x7e, 0x40, 0x40, 0x78, 0x40, 0x40, 0x7e],
  'F': [0x7e, 0x40, 0x40, 0x78, 0x40, 0x40, 0x40],
  'G': [0x3c, 0x42, 0x40, 0x4e, 0x42, 0x42, 0x3c],
  'H': [0x42, 0x42, 0x42, 0x7e, 0x42, 0x42, 0x42],
  'I': [0x3e, 0x08, 0x08, 0x08, 0x08, 0x08, 0x3e],
  'J': [0x1e, 0x04, 0x04, 0x04, 0x04, 0x24, 0x18],
  'K': [0x44, 0x48, 0x50, 0x60, 0x50, 0x48, 0x44],
  'L': [0x40, 0x40, 0x40, 0x40, 0x40, 0x40, 0x7e],
  'M': [0x42, 0x66, 0x5a, 0x42, 0x42, 0x42, 0x42],
  'N': [0x42, 0x62, 0x52, 0x4a, 0x46, 0x42, 0x42],
  'O': [0x3c, 0x42, 0x42, 0x42, 0x42, 0x42, 0x3c],
  'P': [0x7c, 0x42, 0x42, 0x7c, 0x40, 0x40, 0x40],
  'Q': [0x3c, 0x42, 0x42, 0x42, 0x4a, 0x44, 0x3a],
  'R': [0x7c, 0x42, 0x42, 0x7c, 0x50, 0x48, 0x44],
  'S': [0x3c, 0x42, 0x40, 0x3c, 0x02, 0x42, 0x3c],
  'T': [0x7f, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08],
  'U': [0x42, 0x42, 0x42, 0x42, 0x42, 0x42, 0x3c],
  'V': [0x42, 0x42, 0x42, 0x42, 0x24, 0x24, 0x18],
  'W': [0x42, 0x42, 0x42, 0x5a, 0x5a, 0x66, 0x42],
  'X': [0x42, 0x24, 0x18, 0x18, 0x18, 0x24, 0x42],
  'Y': [0x42, 0x24, 0x18, 0x08, 0x08, 0x08, 0x08],
  'Z': [0x7e, 0x04, 0x08, 0x10, 0x20, 0x40, 0x7e],
  '0': [0x3c, 0x46, 0x4a, 0x52, 0x62, 0x42, 0x3c],
  '1': [0x18, 0x28, 0x08, 0x08, 0x08, 0x08, 0x3e],
  '2': [0x3c, 0x42, 0x02, 0x0c, 0x30, 0x40, 0x7e],
  '3': [0x3c, 0x42, 0x02, 0x1c, 0x02, 0x42, 0x3c],
  '4': [0x08, 0x18, 0x28, 0x48, 0x7e, 0x08, 0x08],
  '5': [0x7e, 0x40, 0x7c, 0x02, 0x02, 0x42, 0x3c],
  '6': [0x1c, 0x20, 0x40, 0x7c, 0x42, 0x42, 0x3c],
  '7': [0x7e, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40],
  '8': [0x3c, 0x42, 0x42, 0x3c, 0x42, 0x42, 0x3c],
  '9': [0x3c, 0x42, 0x42, 0x3e, 0x02, 0x04, 0x38],
  ' ': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  '-': [0x00, 0x00, 0x00, 0x3e, 0x00, 0x00, 0x00],
  '_': [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x7f],
  ':': [0x00, 0x18, 0x18, 0x00, 0x18, 0x18, 0x00],
  '.': [0x00, 0x00, 0x00, 0x00, 0x00, 0x18, 0x18],
  ',': [0x00, 0x00, 0x00, 0x00, 0x00, 0x18, 0x30],
  '+': [0x00, 0x08, 0x08, 0x3e, 0x08, 0x08, 0x00],
  '@': [0x3c, 0x42, 0x4e, 0x52, 0x4e, 0x40, 0x3c],
  '/': [0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80],
  '(': [0x0c, 0x18, 0x30, 0x30, 0x30, 0x18, 0x0c],
  ')': [0x30, 0x18, 0x0c, 0x0c, 0x0c, 0x18, 0x30],
  '[': [0x3c, 0x30, 0x30, 0x30, 0x30, 0x30, 0x3c],
  ']': [0x3c, 0x0c, 0x0c, 0x0c, 0x0c, 0x0c, 0x3c],
  '!': [0x18, 0x18, 0x18, 0x18, 0x00, 0x18, 0x18],
  '?': [0x3c, 0x42, 0x04, 0x08, 0x10, 0x00, 0x10],
  '\'': [0x18, 0x18, 0x30, 0x00, 0x00, 0x00, 0x00],
  '"': [0x24, 0x24, 0x48, 0x00, 0x00, 0x00, 0x00],
};

// Mirror uppercase to lowercase
for (let c = 97; c <= 122; c++) {
  const upper = String.fromCharCode(c - 32);
  const lower = String.fromCharCode(c);
  if (FONT_MAP[upper]) {
    FONT_MAP[lower] = FONT_MAP[upper];
  }
}

class Canvas2D {
  constructor(width, height, bgColor = [255, 255, 255, 255]) {
    this.width = width;
    this.height = height;
    this.buffer = Buffer.alloc((1 + width * 4) * height);
    for (let y = 0; y < height; y++) {
      this.buffer[y * (1 + width * 4)] = 0; // Filter none
      for (let x = 0; x < width; x++) {
        this.setPixel(x, y, bgColor);
      }
    }
  }

  setPixel(x, y, [r, g, b, a = 255]) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return;
    const offset = y * (1 + this.width * 4) + 1 + x * 4;
    this.buffer[offset] = r;
    this.buffer[offset + 1] = g;
    this.buffer[offset + 2] = b;
    this.buffer[offset + 3] = a;
  }

  fillRect(x, y, w, h, color) {
    for (let py = y; py < y + h; py++) {
      for (let px = x; px < x + w; px++) {
        this.setPixel(px, py, color);
      }
    }
  }

  drawText(text, startX, startY, color = [0, 0, 0, 255], scale = 1) {
    let cursorX = startX;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '\n') {
        cursorX = startX;
        startY += 8 * scale + 2;
        continue;
      }
      const glyph = FONT_MAP[char] || FONT_MAP['?'];
      if (glyph) {
        for (let row = 0; row < glyph.length; row++) {
          const byte = glyph[row];
          for (let col = 0; col < 7; col++) {
            if ((byte & (0x40 >> col)) !== 0) {
              for (let sy = 0; sy < scale; sy++) {
                for (let sx = 0; sx < scale; sx++) {
                  this.setPixel(cursorX + col * scale + sx, startY + row * scale + sy, color);
                }
              }
            }
          }
        }
      }
      cursorX += 8 * scale;
    }
  }

  toPngBuffer() {
    const idatData = zlib.deflateSync(this.buffer);

    const crcTable = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[i] = c;
    }
    function crc32(buf) {
      let c = 0xffffffff;
      for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
      return (c ^ 0xffffffff) >>> 0;
    }
    function makeChunk(type, data) {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length, 0);
      const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(crc32(typeAndData), 0);
      return Buffer.concat([len, typeAndData, crc]);
    }

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(this.width, 0);
    ihdr.writeUInt32BE(this.height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      makeChunk('IHDR', ihdr),
      makeChunk('IDAT', idatData),
      makeChunk('IEND', Buffer.alloc(0))
    ]);
  }
}

// -------------------------------------------------------------
// 1. WhatsApp Chat Screenshot
// -------------------------------------------------------------
function generateWhatsAppScreenshot() {
  const canvas = new Canvas2D(520, 420, [240, 238, 233, 255]); // Chat background

  // Watermark Banner
  canvas.fillRect(0, 0, 520, 24, [217, 119, 6, 255]); // Amber warning banner
  canvas.drawText('[SIMULATED DEMO DATA - VERA TRACE INVESTIGATION]', 30, 8, [255, 255, 255, 255], 1);

  // App Bar Header (WhatsApp dark green)
  canvas.fillRect(0, 24, 520, 50, [18, 140, 126, 255]);
  canvas.drawText('< WHATSAPP DIRECT CHAT', 16, 42, [255, 255, 255, 255], 2);
  canvas.drawText('+91 98201 44892  ·  ONLINE', 280, 46, [210, 245, 230, 255], 1);

  // Date Separator Pill
  canvas.fillRect(180, 88, 160, 20, [225, 220, 212, 255]);
  canvas.drawText('OCTOBER 12, 2026', 200, 93, [100, 90, 85, 255], 1);

  // Incoming Message 1 (White bubble)
  canvas.fillRect(20, 120, 400, 48, [255, 255, 255, 255]);
  canvas.drawText('YOU NEED TO RESPOND RIGHT NOW REGARDING', 30, 130, [30, 30, 30, 255], 1);
  canvas.drawText('THE DESIGN ASSETS AND PORTFOLIO DRAFTS.', 30, 144, [30, 30, 30, 255], 1);
  canvas.drawText('23:42', 380, 154, [140, 140, 140, 255], 1);

  // Incoming Message 2 (Coercion)
  canvas.fillRect(20, 180, 420, 60, [255, 255, 255, 255]);
  canvas.drawText('IF YOU DONT SEND OVER THE FILES BY TOMORROW', 30, 192, [30, 30, 30, 255], 1);
  canvas.drawText('MORNING, I WILL EMAIL YOUR TEAM LEAD.', 30, 206, [30, 30, 30, 255], 1);
  canvas.drawText('YOU CANNOT AVOID THIS CONVERSATION.', 30, 220, [180, 40, 40, 255], 1);
  canvas.drawText('23:45', 390, 226, [140, 140, 140, 255], 1);

  // Outgoing Response (Light green bubble)
  canvas.fillRect(100, 260, 400, 48, [220, 248, 198, 255]);
  canvas.drawText('PLEASE STOP CONTACTING ME. THIS IS UNWANTED', 112, 272, [30, 30, 30, 255], 1);
  canvas.drawText('AND UNACCEPTABLE HARASSMENT. DO NOT MESSAGE.', 112, 286, [30, 30, 30, 255], 1);
  canvas.drawText('OCT 13, 09:15', 410, 294, [120, 150, 120, 255], 1);

  // System notification: Blocked
  canvas.fillRect(80, 330, 360, 24, [240, 215, 215, 255]);
  canvas.drawText('[!] YOU BLOCKED THIS CONTACT ON OCT 14, 08:30', 92, 337, [180, 20, 20, 255], 1);

  // Hash / Provenance Footer
  canvas.fillRect(0, 390, 520, 30, [40, 30, 45, 255]);
  canvas.drawText('VERATRACE INTAKE ID: EV_DEMO_01  |  SHA-256 BITSTREAM SEALED', 20, 400, [230, 220, 240, 255], 1);

  return canvas.toPngBuffer();
}

// -------------------------------------------------------------
// 2. Instagram Direct Message Screenshot (Block Bypass)
// -------------------------------------------------------------
function generateInstagramScreenshot() {
  const canvas = new Canvas2D(520, 440, [250, 250, 250, 255]);

  // Watermark Banner
  canvas.fillRect(0, 0, 520, 24, [217, 119, 6, 255]);
  canvas.drawText('[SIMULATED DEMO DATA - VERA TRACE INVESTIGATION]', 30, 8, [255, 255, 255, 255], 1);

  // Header (Instagram styling)
  canvas.fillRect(0, 24, 520, 54, [38, 38, 38, 255]);
  canvas.drawText('< INSTAGRAM DIRECT', 16, 42, [255, 255, 255, 255], 2);
  canvas.drawText('@KARAN_ARCHIVE_TEMP', 260, 40, [255, 220, 230, 255], 1);
  canvas.drawText('ACTIVE 5M AGO · 0 MUTUALS', 260, 54, [180, 180, 180, 255], 1);

  // Date header
  canvas.fillRect(190, 92, 140, 18, [235, 235, 235, 255]);
  canvas.drawText('OCTOBER 16, 2026', 205, 96, [100, 100, 100, 255], 1);

  // Incoming Message 1 (Block Bypass clue)
  canvas.fillRect(20, 125, 430, 50, [239, 239, 239, 255]);
  canvas.drawText('BLOCKING MY NUMBER ON WHATSAPP DOES NOT', 32, 136, [15, 15, 15, 255], 1);
  canvas.drawText('END THIS CONVERSATION.', 32, 150, [200, 30, 30, 255], 1);
  canvas.drawText('10:15 AM', 390, 158, [130, 130, 130, 255], 1);

  // Incoming Message 2 (Offline Surveillance clue)
  canvas.fillRect(20, 190, 450, 64, [239, 239, 239, 255]);
  canvas.drawText('I SAW YOU LEAVING THE OFFICE BUILDING ON', 32, 202, [15, 15, 15, 255], 1);
  canvas.drawText('4TH STREET YESTERDAY EVENING.', 32, 216, [180, 30, 30, 255], 1);
  canvas.drawText('DONT MAKE ME COME SPEAK TO YOU IN PERSON.', 32, 230, [180, 30, 30, 255], 1);
  canvas.drawText('10:17 AM', 410, 240, [130, 130, 130, 255], 1);

  // Incoming Message 3 (Shared Clue: email / project leak)
  canvas.fillRect(20, 270, 440, 52, [239, 239, 239, 255]);
  canvas.drawText('CHECK KARAN.V.DESIGN@PROTON.ME. YOU HAVE', 32, 282, [15, 15, 15, 255], 1);
  canvas.drawText('UNTIL FRIDAY OR PROJECT_STARLIGHT_LEAK GOES LIVE.', 32, 296, [15, 15, 15, 255], 1);
  canvas.drawText('10:20 AM', 400, 306, [130, 130, 130, 255], 1);

  // Warning Tag
  canvas.fillRect(60, 345, 400, 24, [254, 242, 242, 255]);
  canvas.drawText('[!] CORRELATION: SHARES ROOT WITH @KARAN_V_ARCH', 70, 352, [185, 28, 28, 255], 1);

  // Footer
  canvas.fillRect(0, 410, 520, 30, [40, 30, 45, 255]);
  canvas.drawText('VERATRACE INTAKE ID: EV_DEMO_02  |  SHA-256 BITSTREAM SEALED', 20, 420, [230, 220, 240, 255], 1);

  return canvas.toPngBuffer();
}

// -------------------------------------------------------------
// 3. SMS Message Screenshot (Nocturnal / High Velocity)
// -------------------------------------------------------------
function generateSmsScreenshot() {
  const canvas = new Canvas2D(520, 400, [245, 245, 248, 255]);

  // Watermark Banner
  canvas.fillRect(0, 0, 520, 24, [217, 119, 6, 255]);
  canvas.drawText('[SIMULATED DEMO DATA - VERA TRACE INVESTIGATION]', 30, 8, [255, 255, 255, 255], 1);

  // Header (SMS)
  canvas.fillRect(0, 24, 520, 50, [230, 230, 236, 255]);
  canvas.drawText('< SMS / TEXT MESSAGE', 16, 42, [40, 40, 50, 255], 2);
  canvas.drawText('+91 98201 44892', 320, 42, [20, 20, 20, 255], 1);

  // Date Header
  canvas.fillRect(180, 88, 160, 18, [220, 220, 230, 255]);
  canvas.drawText('OCT 18, 2026 - 23:48', 195, 92, [70, 70, 80, 255], 1);

  // Incoming SMS bubble (Blue/Gray)
  canvas.fillRect(20, 120, 450, 76, [229, 229, 234, 255]);
  canvas.drawText('FINAL NOTICE: IGNORING EMAILS WON\'T SAVE YOU.', 32, 132, [20, 20, 20, 255], 1);
  canvas.drawText('I HAVE THE COMPLETE PROJECT_STARLIGHT_LEAK ZIP.', 32, 146, [20, 20, 20, 255], 1);
  canvas.drawText('YOU HAVE 24 HOURS BEFORE THIS IS POSTED PUBLICLY.', 32, 160, [190, 20, 20, 255], 1);
  canvas.drawText('23:48 PM', 400, 180, [110, 110, 120, 255], 1);

  // System tag: Late Night & Repetitive contact
  canvas.fillRect(40, 230, 440, 24, [254, 243, 199, 255]);
  canvas.drawText('[!] NOCTURNAL INTRUSION: CONTACT RECORDED AT 11:48 PM', 50, 237, [180, 83, 9, 255], 1);

  canvas.fillRect(40, 265, 440, 24, [254, 226, 226, 255]);
  canvas.drawText('[!] SECONDARY CHANNEL: NUMBER REUSED AFTER WHATSAPP BLOCK', 50, 272, [185, 28, 28, 255], 1);

  // Footer
  canvas.fillRect(0, 370, 520, 30, [40, 30, 45, 255]);
  canvas.drawText('VERATRACE INTAKE ID: EV_DEMO_03  |  SHA-256 BITSTREAM SEALED', 20, 380, [230, 220, 240, 255], 1);

  return canvas.toPngBuffer();
}

// -------------------------------------------------------------
// 4. Text Conversation Export File
// -------------------------------------------------------------
function generateChatExportTxt() {
  return [
    '================================================================================',
    'VERATRACE FORENSIC EVIDENCE PRESERVATION — SIMULATED DEMO EXPORT',
    '================================================================================',
    'Case Identifier: VT-DEMO-2026',
    'Service: WhatsApp Direct Chat Export',
    'Participant A (Complainant): [Victim User — Redacted in Demo]',
    'Participant B (Sender): +91 98201 44892 (Associated with @karan_v_arch)',
    'Intake Timestamp: 2026-10-14T09:15:00.000Z',
    'Integrity Algorithm: SHA-256 (FIPS 180-4 standard)',
    'Simulated Data Notice: All accounts, phone numbers and timestamps are fictional.',
    '================================================================================',
    '',
    '[12/10/2026, 23:42:10 UTC] +91 98201 44892: You need to respond right now regarding the design assets and portfolio drafts.',
    '[12/10/2026, 23:45:18 UTC] +91 98201 44892: If you don\'t send over the files by tomorrow morning, I will email your team lead.',
    '[12/10/2026, 23:48:02 UTC] +91 98201 44892: You cannot avoid this conversation.',
    '[13/10/2026, 09:15:20 UTC] Victim: Please stop contacting me. This is unwanted and unacceptable harassment. Do not message me again.',
    '[13/10/2026, 09:16:04 UTC] +91 98201 44892: You think you have a choice here? Check your email later today.',
    '[14/10/2026, 08:30:00 UTC] [SYSTEM NOTE: User configured boundary and blocked +91 98201 44892 on WhatsApp]',
    '',
    '================================================================================',
    'END OF CHAT EXPORT STREAM — VERATRACE TAMPER-EVIDENT INTAKE',
    '================================================================================'
  ].join('\r\n');
}

// -------------------------------------------------------------
// 5. PDF HR Incident Report
// -------------------------------------------------------------
function generateHrReportPdf() {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ margin: 45 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    doc.fontSize(16).text('VERATRACE — FORMAL INCIDENT REPORT DRAFT', { align: 'center' });
    doc.fontSize(10).fillColor('#666666').text('SIMULATED DEMO DATA — INTERNAL COMPLAINT DOCUMENTATION', { align: 'center' });
    doc.moveDown();

    doc.strokeColor('#aaaaaa').lineWidth(1).moveTo(45, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();

    doc.fillColor('#000000').fontSize(11);
    doc.text('Case Reference:        VT-DEMO-2026');
    doc.text('Incident Category:     Cross-Platform Cyber Harassment & Coercion');
    doc.text('Date of Filing:        October 15, 2026');
    doc.text('Preservation Status:   Local Vault Cryptographically Verified (SHA-256)');
    doc.moveDown();

    doc.fontSize(12).text('1. Incident Overview');
    doc.fontSize(10).fillColor('#333333');
    doc.text('The complainant reported escalating, persistent unwanted communications originating across multiple communication channels including WhatsApp, Instagram, and ProtonMail.');
    doc.text('Despite an explicit refusal and subsequent number blocking on October 14, 2026, the sender migrated to secondary channels, creating burner accounts and issuing demands accompanied by threats of reputational harm.');
    doc.moveDown();

    doc.fontSize(12).fillColor('#000000').text('2. Observed Cross-Platform Identifiers');
    doc.fontSize(10).fillColor('#333333');
    doc.text('• Primary Sender Phone:      +91 98201 44892 (WhatsApp & SMS touchpoints)');
    doc.text('• Linked Instagram Handle:   @karan_archive_temp (Created following WhatsApp block)');
    doc.text('• Registered Sender Email:   karan.v.design@proton.me');
    doc.text('• Distinctive Threat Phrase: "project_starlight_leak"');
    doc.moveDown();

    doc.fontSize(12).fillColor('#000000').text('3. Chain of Custody & Statutory Certificate Draft');
    doc.fontSize(10).fillColor('#333333');
    doc.text('All electronic records referenced in this report have been intake-hashed with SHA-256 upon selection in the VeraTrace client-side vault. In accordance with Section 63 of Bharatiya Sakshya Adhiniyam, 2023 (BSA), this documentation is prepared for official reporting on cybercrime.gov.in.');
    doc.moveDown(2);

    doc.fontSize(9).fillColor('#888888');
    doc.text('LEGAL NOTICE: This document is a simulated training artifact created for VeraTrace demonstration purposes. No real individuals or active legal proceedings are represented.', { align: 'center' });

    doc.end();
  });
}

// -------------------------------------------------------------
// Main Generator Execution
// -------------------------------------------------------------
async function main() {
  console.log('Generating demo assets in:', DEMO_DIR);

  const png1 = generateWhatsAppScreenshot();
  const file1 = path.join(DEMO_DIR, 'chat-whatsapp-incident-1.png');
  fs.writeFileSync(file1, png1);
  const hash1 = crypto.createHash('sha256').update(png1).digest('hex');
  console.log('Generated chat-whatsapp-incident-1.png ->', hash1, png1.length, 'bytes');

  const png2 = generateInstagramScreenshot();
  const file2 = path.join(DEMO_DIR, 'chat-instagram-incident-2.png');
  fs.writeFileSync(file2, png2);
  const hash2 = crypto.createHash('sha256').update(png2).digest('hex');
  console.log('Generated chat-instagram-incident-2.png ->', hash2, png2.length, 'bytes');

  const png3 = generateSmsScreenshot();
  const file3 = path.join(DEMO_DIR, 'chat-sms-incident-3.png');
  fs.writeFileSync(file3, png3);
  const hash3 = crypto.createHash('sha256').update(png3).digest('hex');
  console.log('Generated chat-sms-incident-3.png ->', hash3, png3.length, 'bytes');

  const txt4 = Buffer.from(generateChatExportTxt(), 'utf-8');
  const file4 = path.join(DEMO_DIR, 'whatsapp-chat-export-oct2026.txt');
  fs.writeFileSync(file4, txt4);
  const hash4 = crypto.createHash('sha256').update(txt4).digest('hex');
  console.log('Generated whatsapp-chat-export-oct2026.txt ->', hash4, txt4.length, 'bytes');

  const pdf5 = await generateHrReportPdf();
  const file5 = path.join(DEMO_DIR, 'hr-incident-report-oct2026.pdf');
  fs.writeFileSync(file5, pdf5);
  const hash5 = crypto.createHash('sha256').update(pdf5).digest('hex');
  console.log('Generated hr-incident-report-oct2026.pdf ->', hash5, pdf5.length, 'bytes');

  // Also write manifest of assets for programmatic reference
  const manifest = {
    generatedAt: new Date().toISOString(),
    files: [
      { name: 'chat-whatsapp-incident-1.png', sha256: hash1, size: png1.length, mimeType: 'image/png' },
      { name: 'chat-instagram-incident-2.png', sha256: hash2, size: png2.length, mimeType: 'image/png' },
      { name: 'chat-sms-incident-3.png', sha256: hash3, size: png3.length, mimeType: 'image/png' },
      { name: 'whatsapp-chat-export-oct2026.txt', sha256: hash4, size: txt4.length, mimeType: 'text/plain' },
      { name: 'hr-incident-report-oct2026.pdf', sha256: hash5, size: pdf5.length, mimeType: 'application/pdf' },
    ]
  };
  fs.writeFileSync(path.join(DEMO_DIR, 'demo-assets-manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('Done! All demo assets generated.');
}

main().catch(console.error);
