// Script to create simple PNG icons for Claude Bar menu bar
// Run with: node scripts/create-icons.js

const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'assets');

// Ensure assets directory exists
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// Create a minimal 16x16 PNG with a "C" shape (black on transparent)
// PNG format: signature + IHDR + IDAT + IEND

function createPNG(width, height, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // color type (RGBA)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = createChunk('IHDR', ihdrData);

  // IDAT chunk (image data)
  const zlib = require('zlib');
  const rawData = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    rawData[y * (width * 4 + 1)] = 0; // filter byte
    for (let x = 0; x < width; x++) {
      const idx = y * (width * 4 + 1) + 1 + x * 4;
      const pixelIdx = y * width + x;
      const pixel = pixels[pixelIdx] || [0, 0, 0, 0];
      rawData[idx] = pixel[0];     // R
      rawData[idx + 1] = pixel[1]; // G
      rawData[idx + 2] = pixel[2]; // B
      rawData[idx + 3] = pixel[3]; // A
    }
  }
  const compressed = zlib.deflateSync(rawData);
  const idat = createChunk('IDAT', compressed);

  // IEND chunk
  const iend = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type);
  const crcData = Buffer.concat([typeBuffer, data]);
  const crc = crc32(crcData);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc >>> 0, 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

// CRC32 implementation
function crc32(data) {
  let crc = 0xFFFFFFFF;
  const table = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return crc ^ 0xFFFFFFFF;
}

// Create a "C" shape pattern for menu bar icon
function createCPattern(size) {
  const pixels = new Array(size * size).fill([0, 0, 0, 0]);
  const center = size / 2;
  const outerRadius = size * 0.4;
  const innerRadius = size * 0.25;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center + 0.5;
      const dy = y - center + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Create C shape (circle with gap on right side)
      if (dist >= innerRadius && dist <= outerRadius) {
        const angle = Math.atan2(dy, dx);
        // Gap on the right side (-45 to +45 degrees)
        if (angle < -Math.PI / 4 || angle > Math.PI / 4) {
          pixels[y * size + x] = [0, 0, 0, 255]; // Black pixel
        }
      }
    }
  }

  return pixels;
}

// Generate icons
const icon16 = createCPattern(16);
const icon32 = createCPattern(32);

// Write normal template icons
fs.writeFileSync(path.join(assetsDir, 'iconTemplate.png'), createPNG(16, 16, icon16));
fs.writeFileSync(path.join(assetsDir, 'iconTemplate@2x.png'), createPNG(32, 32, icon32));

// Write warning icons (same for now, color is handled differently in macOS)
fs.writeFileSync(path.join(assetsDir, 'icon-warning.png'), createPNG(16, 16, icon16));
fs.writeFileSync(path.join(assetsDir, 'icon-warning@2x.png'), createPNG(32, 32, icon32));

// Write critical icons
fs.writeFileSync(path.join(assetsDir, 'icon-critical.png'), createPNG(16, 16, icon16));
fs.writeFileSync(path.join(assetsDir, 'icon-critical@2x.png'), createPNG(32, 32, icon32));

console.log('Icons created successfully in', assetsDir);
