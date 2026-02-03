#!/bin/bash
# Script to generate menu bar icons for Claude Bar
# Requires ImageMagick: brew install imagemagick

ASSETS_DIR="$(dirname "$0")/../assets"

# Create a simple C icon for the menu bar (Template images for macOS)
# Template images should be black with alpha channel

# Normal icon (16x16) - simple "C" character
convert -size 16x16 xc:transparent \
  -font "SF-Pro-Display-Bold" -pointsize 14 \
  -fill black -gravity center -annotate +0+1 "C" \
  "$ASSETS_DIR/iconTemplate.png"

# Retina icon (32x32)
convert -size 32x32 xc:transparent \
  -font "SF-Pro-Display-Bold" -pointsize 28 \
  -fill black -gravity center -annotate +0+2 "C" \
  "$ASSETS_DIR/iconTemplate@2x.png"

# Warning icon (orange tint - but still black for template)
convert -size 16x16 xc:transparent \
  -font "SF-Pro-Display-Bold" -pointsize 14 \
  -fill black -gravity center -annotate +0+1 "C" \
  "$ASSETS_DIR/icon-warning.png"

convert -size 32x32 xc:transparent \
  -font "SF-Pro-Display-Bold" -pointsize 28 \
  -fill black -gravity center -annotate +0+2 "C" \
  "$ASSETS_DIR/icon-warning@2x.png"

# Critical icon (red tint - but still black for template)
convert -size 16x16 xc:transparent \
  -font "SF-Pro-Display-Bold" -pointsize 14 \
  -fill black -gravity center -annotate +0+1 "C" \
  "$ASSETS_DIR/icon-critical.png"

convert -size 32x32 xc:transparent \
  -font "SF-Pro-Display-Bold" -pointsize 28 \
  -fill black -gravity center -annotate +0+2 "C" \
  "$ASSETS_DIR/icon-critical@2x.png"

# App icon (1024x1024 for icns)
convert -size 1024x1024 xc:'#1a1a2e' \
  -fill '#e94560' -draw "roundrectangle 100,100 924,924 100,100" \
  -font "SF-Pro-Display-Bold" -pointsize 600 \
  -fill white -gravity center -annotate +0+0 "C" \
  "$ASSETS_DIR/app-icon.png"

# Create icns from PNG (requires iconutil)
mkdir -p "$ASSETS_DIR/app-icon.iconset"
for size in 16 32 64 128 256 512; do
  convert "$ASSETS_DIR/app-icon.png" -resize ${size}x${size} "$ASSETS_DIR/app-icon.iconset/icon_${size}x${size}.png"
  double=$((size * 2))
  convert "$ASSETS_DIR/app-icon.png" -resize ${double}x${double} "$ASSETS_DIR/app-icon.iconset/icon_${size}x${size}@2x.png"
done
iconutil -c icns "$ASSETS_DIR/app-icon.iconset" -o "$ASSETS_DIR/app-icon.icns"
rm -rf "$ASSETS_DIR/app-icon.iconset"

echo "Icons generated successfully!"
