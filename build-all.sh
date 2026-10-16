#!/usr/bin/env bash

# Build script for Coco, Coco Mini, and Coco Edit

# Exit on any error, unset variable or pipe failure
set -euo pipefail

echo "🥥 Building Coco Docker images..."

# Build regular version
printf '\n📦 Building regular Coco image...\n'
docker build -t context-coder:latest -t context-coder:regular .

# Build mini version
printf '\n📦 Building Coco Mini image...\n'
docker build --build-arg BUILD_TYPE=mini -t context-coder:mini .

printf '\n📦 Building Coco Edit image...\n'
docker build --build-arg BUILD_TYPE=edit -t context-coder:edit .

printf '\n✅ Build complete!\n'
printf '\nAvailable images:\n'
docker images | grep -E "^context-coder\s" | head -4 || true

printf '\nTo run:\n'
printf '  Regular: docker run -it --rm -p 127.0.0.1:3001:3001 -v ./:/app -w /app context-coder:latest\n'
printf '  Mini:    docker run -it --rm -p 127.0.0.1:3001:3001 -v ./:/app -w /app context-coder:mini\n'
printf '  Edit:    docker run -it --rm -p 127.0.0.1:3001:3001 -v ./:/app -w /app context-coder:edit\n'

printf '\nVariant descriptions:\n'
printf '  Regular: Full mode with all tools including write_file (complete file rewrites)\n'
printf '  Mini:    Core analysis tools only (get_codebase_size, get_codebase, get_codebase_top_largest_files)\n'
printf '  Edit:    Full mode with edit_file tool for partial file edits instead of write_file\n'
