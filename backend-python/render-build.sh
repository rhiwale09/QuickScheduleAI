#!/bin/bash
# Render build script — installs system tools then Python packages

# System tools for file extraction
apt-get install -y \
  antiword \
  catdoc \
  poppler-utils \
  tesseract-ocr \
  libreoffice-calc \
  2>/dev/null || true

# Python packages
pip install -r requirements.txt
