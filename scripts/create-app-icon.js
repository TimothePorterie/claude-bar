// Script to create app icon (icns) for Claude Bar
// Run with: node scripts/create-app-icon.js

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const assetsDir = path.join(__dirname, '..', 'assets');
const iconsetDir = path.join(assetsDir, 'app-icon.iconset');

// Ensure directories exist
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}
if (!fs.existsSync(iconsetDir)) {
  fs.mkdirSync(iconsetDir, { recursive: true });
}

// Create a simple PNG icon programmatically
function createPNG(width, height, pixels) {
  const zlib = require('zlib');

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

// Create app icon pattern - rounded square with "C" letter
function createAppIconPattern(size) {
  const pixels = new Array(size * size);
  const center = size / 2;
  const cornerRadius = size * 0.18;
  const padding = size * 0.08;

  // Background color: dark blue-purple gradient base
  const bgColor = [26, 26, 46, 255]; // #1a1a2e
  const accentColor = [233, 69, 96, 255]; // #e94560

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Check if inside rounded rectangle
      const inRoundedRect = isInRoundedRect(
        x, y,
        padding, padding,
        size - padding * 2, size - padding * 2,
        cornerRadius
      );

      if (inRoundedRect) {
        // Inside the rounded rect - draw background
        pixels[y * size + x] = [...bgColor];

        // Draw "C" letter
        const letterCenter = center;
        const outerRadius = size * 0.32;
        const innerRadius = size * 0.18;
        const dx = x - letterCenter;
        const dy = y - letterCenter;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist >= innerRadius && dist <= outerRadius) {
          const angle = Math.atan2(dy, dx);
          // Gap on the right side (-50 to +50 degrees)
          if (angle < -Math.PI / 3.5 || angle > Math.PI / 3.5) {
            pixels[y * size + x] = [255, 255, 255, 255]; // White letter
          }
        }
      } else {
        // Outside - transparent
        pixels[y * size + x] = [0, 0, 0, 0];
      }
    }
  }

  return pixels;
}

function isInRoundedRect(x, y, rx, ry, rw, rh, radius) {
  // Check if point is in rounded rectangle
  if (x < rx || x >= rx + rw || y < ry || y >= ry + rh) {
    return false;
  }

  // Check corners
  const corners = [
    { cx: rx + radius, cy: ry + radius }, // top-left
    { cx: rx + rw - radius, cy: ry + radius }, // top-right
    { cx: rx + radius, cy: ry + rh - radius }, // bottom-left
    { cx: rx + rw - radius, cy: ry + rh - radius } // bottom-right
  ];

  for (const corner of corners) {
    const inCornerRegion =
      (x < corner.cx && corner.cx === rx + radius || x >= corner.cx && corner.cx === rx + rw - radius) &&
      (y < corner.cy && corner.cy === ry + radius || y >= corner.cy && corner.cy === ry + rh - radius);

    if (inCornerRegion) {
      const dx = x - corner.cx;
      const dy = y - corner.cy;
      if (dx * dx + dy * dy > radius * radius) {
        return false;
      }
    }
  }

  return true;
}

// Generate icons at all required sizes for icns
const sizes = [16, 32, 64, 128, 256, 512, 1024];

for (const size of sizes) {
  const pixels = createAppIconPattern(size);
  const png = createPNG(size, size, pixels);

  // Write standard resolution
  if (size <= 512) {
    fs.writeFileSync(path.join(iconsetDir, `icon_${size}x${size}.png`), png);
  }

  // Write @2x resolution (for half the listed size)
  const halfSize = size / 2;
  if (halfSize >= 16 && halfSize <= 512) {
    fs.writeFileSync(path.join(iconsetDir, `icon_${halfSize}x${halfSize}@2x.png`), png);
  }
}

console.log('Icon PNGs created in', iconsetDir);

// Convert to icns using iconutil
try {
  execSync(`iconutil -c icns "${iconsetDir}" -o "${path.join(assetsDir, 'app-icon.icns')}"`, {
    stdio: 'inherit'
  });
  console.log('Created app-icon.icns successfully!');

  // Clean up iconset directory
  fs.rmSync(iconsetDir, { recursive: true });
} catch (error) {
  console.error('Failed to create icns file:', error.message);
  console.log('Iconset files are available in:', iconsetDir);
}
