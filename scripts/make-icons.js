'use strict';
// Generates assets/icon.png (512px app icon) and assets/tray.png (32px tray icon)
// with no dependencies: a tiny PNG encoder plus a supersampled droplet drawing.
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) { raw[y * stride] = 0; rgba.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))
  ]);
}

// shape helpers in normalized coords (-1..1)
function inRoundedSquare(x, y, half, r) {
  const ax = Math.abs(x), ay = Math.abs(y);
  if (ax > half || ay > half) return false;
  if (ax < half - r || ay < half - r) return true;
  const dx = ax - (half - r), dy = ay - (half - r);
  return dx * dx + dy * dy <= r * r;
}
function inDroplet(x, y) {
  const cy = 0.22, r = 0.42, top = -0.72;
  if (x * x + (y - cy) * (y - cy) <= r * r) return true;
  // triangle from the apex to the two tangent points on the circle, so the join is smooth
  const d = cy - top;
  const yt = cy - (r * r) / d;
  const xt = r * Math.sqrt(d * d - r * r) / d;
  if (y < top || y > yt) return false;
  return Math.abs(x) <= xt * (y - top) / (yt - top);
}

function render(size, { background }) {
  const out = Buffer.alloc(size * size * 4);
  const SS = 4;
  const bgCol = [15, 23, 42];
  const dropCol = [34, 197, 94];
  const shineCol = [255, 255, 255];
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const x = ((px + (sx + 0.5) / SS) / size) * 2 - 1;
          const y = ((py + (sy + 0.5) / SS) / size) * 2 - 1;
          let col = null;
          if (background && inRoundedSquare(x, y, 0.96, 0.22)) col = bgCol;
          const scale = background ? 0.78 : 1.0;
          if (inDroplet(x / scale, y / scale)) col = dropCol;
          // small highlight
          const hx = x / scale + 0.15, hy = y / scale - 0.08;
          if (hx * hx + hy * hy <= 0.11 * 0.11) col = shineCol;
          if (col) { r += col[0]; g += col[1]; b += col[2]; a += 255; }
        }
      }
      const n = SS * SS;
      const i = (py * size + px) * 4;
      if (a > 0) {
        const cov = a / n / 255;
        out[i] = Math.round(r / (a / 255)); out[i + 1] = Math.round(g / (a / 255)); out[i + 2] = Math.round(b / (a / 255));
        out[i + 3] = Math.round(cov * 255);
      }
    }
  }
  return encodePNG(size, size, out);
}

const assets = path.join(__dirname, '..', 'assets');
fs.mkdirSync(assets, { recursive: true });
fs.writeFileSync(path.join(assets, 'icon.png'), render(512, { background: true }));
fs.writeFileSync(path.join(assets, 'tray.png'), render(32, { background: false }));
fs.writeFileSync(path.join(assets, 'tray@2x.png'), render(64, { background: false }));
console.log('wrote assets/icon.png, assets/tray.png, assets/tray@2x.png');
