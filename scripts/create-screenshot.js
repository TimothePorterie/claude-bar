// Script to create a mock screenshot for README
// Run with: node scripts/create-screenshot.js

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const assetsDir = path.join(__dirname, '..', 'assets');

function createPNG(width, height, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;
  ihdrData[9] = 6;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = createChunk('IHDR', ihdrData);

  const rawData = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    rawData[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const idx = y * (width * 4 + 1) + 1 + x * 4;
      const pixelIdx = y * width + x;
      const pixel = pixels[pixelIdx] || [0, 0, 0, 0];
      rawData[idx] = pixel[0];
      rawData[idx + 1] = pixel[1];
      rawData[idx + 2] = pixel[2];
      rawData[idx + 3] = pixel[3];
    }
  }
  const compressed = zlib.deflateSync(rawData, { level: 9 });
  const idat = createChunk('IDAT', compressed);
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

// Drawing helpers
function setPixel(pixels, width, x, y, color) {
  if (x >= 0 && x < width && y >= 0) {
    pixels[y * width + x] = color;
  }
}

function fillRect(pixels, width, x, y, w, h, color) {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      setPixel(pixels, width, Math.floor(px), Math.floor(py), color);
    }
  }
}

function fillRoundedRect(pixels, width, x, y, w, h, radius, color) {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      let inside = true;
      // Check corners
      if (px < x + radius && py < y + radius) {
        const dx = px - (x + radius);
        const dy = py - (y + radius);
        inside = dx * dx + dy * dy <= radius * radius;
      } else if (px >= x + w - radius && py < y + radius) {
        const dx = px - (x + w - radius);
        const dy = py - (y + radius);
        inside = dx * dx + dy * dy <= radius * radius;
      } else if (px < x + radius && py >= y + h - radius) {
        const dx = px - (x + radius);
        const dy = py - (y + h - radius);
        inside = dx * dx + dy * dy <= radius * radius;
      } else if (px >= x + w - radius && py >= y + h - radius) {
        const dx = px - (x + w - radius);
        const dy = py - (y + h - radius);
        inside = dx * dx + dy * dy <= radius * radius;
      }
      if (inside) {
        setPixel(pixels, width, Math.floor(px), Math.floor(py), color);
      }
    }
  }
}

// Simple bitmap font (5x7 pixels per char)
const font = {
  '0': [0x7C, 0x82, 0x82, 0x82, 0x7C],
  '1': [0x00, 0x84, 0xFE, 0x80, 0x00],
  '2': [0xC4, 0xA2, 0x92, 0x92, 0x8C],
  '3': [0x44, 0x82, 0x92, 0x92, 0x6C],
  '4': [0x30, 0x28, 0x24, 0xFE, 0x20],
  '5': [0x4E, 0x8A, 0x8A, 0x8A, 0x72],
  '6': [0x78, 0x94, 0x92, 0x92, 0x60],
  '7': [0x02, 0xE2, 0x12, 0x0A, 0x06],
  '8': [0x6C, 0x92, 0x92, 0x92, 0x6C],
  '9': [0x0C, 0x92, 0x92, 0x52, 0x3C],
  '%': [0x46, 0x26, 0x10, 0xC8, 0xC4],
  '/': [0x40, 0x20, 0x10, 0x08, 0x04],
  ' ': [0x00, 0x00, 0x00, 0x00, 0x00],
  ':': [0x00, 0x6C, 0x6C, 0x00, 0x00],
  '.': [0x00, 0xC0, 0xC0, 0x00, 0x00],
  '-': [0x10, 0x10, 0x10, 0x10, 0x10],
  'S': [0x4C, 0x92, 0x92, 0x92, 0x64],
  'e': [0x70, 0xA8, 0xA8, 0xA8, 0x30],
  's': [0x00, 0x90, 0xA8, 0xA8, 0x48],
  'i': [0x00, 0x88, 0xFA, 0x80, 0x00],
  'o': [0x70, 0x88, 0x88, 0x88, 0x70],
  'n': [0xF8, 0x10, 0x08, 0x08, 0xF0],
  'W': [0x7E, 0x80, 0x70, 0x80, 0x7E],
  'k': [0xFE, 0x20, 0x50, 0x88, 0x00],
  'l': [0x00, 0x82, 0xFE, 0x80, 0x00],
  'y': [0x18, 0xA0, 0xA0, 0xA0, 0x78],
  '5': [0x4E, 0x8A, 0x8A, 0x8A, 0x72],
  'h': [0xFE, 0x10, 0x08, 0x08, 0xF0],
  '7': [0x02, 0xE2, 0x12, 0x0A, 0x06],
  'd': [0x70, 0x88, 0x88, 0x48, 0xFE],
  'R': [0xFE, 0x12, 0x32, 0x52, 0x8C],
  't': [0x08, 0x7E, 0x88, 0x80, 0x40],
  'C': [0x7C, 0x82, 0x82, 0x82, 0x44],
  'a': [0x40, 0xA8, 0xA8, 0xA8, 0xF0],
  'u': [0x78, 0x80, 0x80, 0x40, 0xF8],
  'U': [0x7E, 0x80, 0x80, 0x80, 0x7E],
  'r': [0xF8, 0x10, 0x08, 0x08, 0x10],
  'P': [0xFE, 0x12, 0x12, 0x12, 0x0C],
  'm': [0xF8, 0x10, 0x60, 0x10, 0xF0],
  '(': [0x00, 0x38, 0x44, 0x82, 0x00],
  ')': [0x00, 0x82, 0x44, 0x38, 0x00],
  'L': [0xFE, 0x80, 0x80, 0x80, 0x80],
  'p': [0xF8, 0x28, 0x28, 0x28, 0x10],
  'c': [0x70, 0x88, 0x88, 0x88, 0x50],
  'f': [0x10, 0xFC, 0x12, 0x02, 0x04],
  'g': [0x10, 0xA8, 0xA8, 0xA8, 0x78],
  'v': [0x38, 0x40, 0x80, 0x40, 0x38],
  'b': [0xFE, 0x88, 0x88, 0x88, 0x70],
};

function drawChar(pixels, width, x, y, char, color, scale = 1) {
  const bitmap = font[char];
  if (!bitmap) return 5 * scale;

  for (let col = 0; col < 5; col++) {
    const bits = bitmap[col];
    for (let row = 0; row < 8; row++) {
      if (bits & (1 << row)) {
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            setPixel(pixels, width, x + col * scale + sx, y + row * scale + sy, color);
          }
        }
      }
    }
  }
  return 6 * scale;
}

function drawText(pixels, width, x, y, text, color, scale = 1) {
  let curX = x;
  for (const char of text) {
    curX += drawChar(pixels, width, curX, y, char, color, scale);
  }
}

// Create the screenshot
const WIDTH = 320;
const HEIGHT = 380;
const pixels = new Array(WIDTH * HEIGHT);

// Colors
const bgColor = [245, 245, 247, 255];
const cardBg = [255, 255, 255, 255];
const textDark = [30, 30, 46, 255];
const textGray = [120, 120, 130, 255];
const textLight = [180, 180, 190, 255];
const greenBar = [34, 197, 94, 255];
const orangeBar = [245, 158, 11, 255];
const progressBg = [230, 230, 235, 255];
const badgeBg = [102, 126, 234, 255];
const white = [255, 255, 255, 255];
const borderColor = [220, 220, 225, 255];

// Fill background
fillRoundedRect(pixels, WIDTH, 0, 0, WIDTH, HEIGHT, 12, bgColor);

// Header area
fillRect(pixels, WIDTH, 16, 16, WIDTH - 32, 40, bgColor);
drawText(pixels, WIDTH, 20, 24, 'Claude User', textDark, 2);

// Pro badge
fillRoundedRect(pixels, WIDTH, 200, 22, 40, 20, 8, badgeBg);
drawText(pixels, WIDTH, 208, 28, 'Pro', white, 1);

// Refresh icon (simple circle)
fillRoundedRect(pixels, WIDTH, WIDTH - 40, 20, 24, 24, 12, [235, 235, 240, 255]);

// Separator line
fillRect(pixels, WIDTH, 16, 60, WIDTH - 32, 1, borderColor);

// Session card (5h)
const card1Y = 75;
fillRoundedRect(pixels, WIDTH, 16, card1Y, WIDTH - 32, 90, 10, cardBg);

// Card 1 header
drawText(pixels, WIDTH, 28, card1Y + 14, 'Session (5h)', textGray, 1);
drawText(pixels, WIDTH, WIDTH - 70, card1Y + 10, '23%', textDark, 2);

// Progress bar 1
fillRoundedRect(pixels, WIDTH, 28, card1Y + 40, WIDTH - 56, 10, 5, progressBg);
fillRoundedRect(pixels, WIDTH, 28, card1Y + 40, Math.floor((WIDTH - 56) * 0.23), 10, 5, greenBar);

// Reset time 1
drawText(pixels, WIDTH, 28, card1Y + 62, 'Resets in', textLight, 1);
drawText(pixels, WIDTH, WIDTH - 80, card1Y + 62, '4h 32m', textGray, 1);

// Weekly card (7d)
const card2Y = 180;
fillRoundedRect(pixels, WIDTH, 16, card2Y, WIDTH - 32, 90, 10, cardBg);

// Card 2 header
drawText(pixels, WIDTH, 28, card2Y + 14, 'Weekly (7d)', textGray, 1);
drawText(pixels, WIDTH, WIDTH - 70, card2Y + 10, '67%', textDark, 2);

// Progress bar 2
fillRoundedRect(pixels, WIDTH, 28, card2Y + 40, WIDTH - 56, 10, 5, progressBg);
fillRoundedRect(pixels, WIDTH, 28, card2Y + 40, Math.floor((WIDTH - 56) * 0.67), 10, 5, orangeBar);

// Reset time 2
drawText(pixels, WIDTH, 28, card2Y + 62, 'Resets in', textLight, 1);
drawText(pixels, WIDTH, WIDTH - 90, card2Y + 62, '5d 12h', textGray, 1);

// Footer separator
fillRect(pixels, WIDTH, 16, HEIGHT - 50, WIDTH - 32, 1, borderColor);

// Footer text
drawText(pixels, WIDTH, 80, HEIGHT - 35, 'Last updated: 12:34', textLight, 1);

// Add menu bar mockup at top
const menuBarY = -5;
// Menu bar background (dark)
fillRect(pixels, WIDTH, 0, 0, WIDTH, 28, [30, 30, 30, 255]);

// Menu bar text "23% / 67%"
drawText(pixels, WIDTH, WIDTH / 2 - 40, 10, '23% / 67%', [220, 220, 220, 255], 1);

// Small C icon in menu bar
fillRoundedRect(pixels, WIDTH, WIDTH / 2 - 55, 8, 12, 12, 3, [60, 60, 60, 255]);

// Write the PNG
const png = createPNG(WIDTH, HEIGHT, pixels);
fs.writeFileSync(path.join(assetsDir, 'screenshot.png'), png);

console.log('Screenshot created:', path.join(assetsDir, 'screenshot.png'));
