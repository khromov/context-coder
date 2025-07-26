#!/bin/sh

# Build script for Coco, Coco Mini, and Coco Edit

echo "🥥 Building Coco Docker images..."

# Build regular version
echo "\n📦 Building regular Coco image..."
docker build -t context-coder:latest -t context-coder:regular .

# Build mini version
echo "\n📦 Building Coco Mini image..."
docker build --build-arg BUILD_TYPE=mini -t context-coder:mini .

echo "\n📦 Building Coco Edit image..."
docker build --build-arg BUILD_TYPE=edit -t context-coder:edit .

echo "\n✅ Build complete!"
echo "\nAvailable images:"
docker images | grep -E "^context-coder\s" | head -4

echo "\nTo run:"
echo "  Regular: docker run -it --rm -p 3001:3001 -v ./:/app -w /app context-coder:latest"
echo "  Mini:    docker run -it --rm -p 3001:3001 -v ./:/app -w /app context-coder:mini"
echo "  Edit:    docker run -it --rm -p 3001:3001 -v ./:/app -w /app context-coder:edit"

echo "\nVariant descriptions:"
echo "  Regular: Full mode with all tools including write_file (complete file rewrites)"
echo "  Mini:    Core analysis tools only (get_codebase_size, get_codebase, get_codebase_top_largest_files)"
echo "  Edit:    Full mode with edit_file tool for partial file edits instead of write_file"
