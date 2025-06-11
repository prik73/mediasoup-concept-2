#!/bin/bash

echo "🔍 WebRTC Streaming App Debug Script"
echo "===================================="

# Check FFmpeg installation
echo "1. Checking FFmpeg installation..."
if command -v ffmpeg &> /dev/null; then
    echo "✅ FFmpeg is installed:"
    ffmpeg -version | head -1
else
    echo "❌ FFmpeg is not installed or not in PATH"
    echo "   Install with: sudo apt install ffmpeg (Ubuntu/Debian)"
    echo "   Install with: brew install ffmpeg (macOS)"
fi

echo ""

# Check Node.js and npm
echo "2. Checking Node.js installation..."
if command -v node &> /dev/null; then
    echo "✅ Node.js version: $(node --version)"
else
    echo "❌ Node.js not found"
fi

if command -v npm &> /dev/null; then
    echo "✅ npm version: $(npm --version)"
else
    echo "❌ npm not found"
fi

echo ""

# Check SSL certificates
echo "3. Checking SSL certificates..."
if [[ -f "ssl/key.pem" && -f "ssl/cert.pem" ]]; then
    echo "✅ SSL certificates found"
else
    echo "❌ SSL certificates missing"
    echo "   Generate with:"
    echo "   mkdir -p ssl"
    echo "   openssl genrsa -out ssl/key.pem 2048"
    echo "   openssl req -new -x509 -key ssl/key.pem -out ssl/cert.pem -days 365"
fi

echo ""

# Check directories
echo "4. Checking required directories..."
directories=("public" "public/hls")
for dir in "${directories[@]}"; do
    if [[ -d "$dir" ]]; then
        echo "✅ Directory exists: $dir"
    else
        echo "⚠️  Creating directory: $dir"
        mkdir -p "$dir"
        echo "✅ Created: $dir"
    fi
done

echo ""

# Check ports
echo "5. Checking port availability..."
ports=(3000 5173)
for port in "${ports[@]}"; do
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo "⚠️  Port $port is in use"
        echo "   Process using port $port:"
        lsof -i :$port | grep LISTEN
    else
        echo "✅ Port $port is available"
    fi
done

echo ""

# Check package.json dependencies
echo "6. Checking dependencies..."
if [[ -f "package.json" ]]; then
    echo "✅ package.json found"
    if [[ -d "node_modules" ]]; then
        echo "✅ node_modules directory exists"
    else
        echo "⚠️  node_modules not found. Run: npm install"
    fi
else
    echo "❌ package.json not found"
fi

echo ""

# Test FFmpeg with sample data
echo "7. Testing FFmpeg functionality..."
echo "Creating test video stream..."
timeout 5s ffmpeg -f lavfi -i testsrc=duration=3:size=320x240:rate=30 -f lavfi -i sine=frequency=1000:duration=3 -c:v libx264 -preset ultrafast -c:a aac -f null - 2>/dev/null
if [[ $? -eq 0 || $? -eq 124 ]]; then  # 124 is timeout exit code
    echo "✅ FFmpeg test successful"
else
    echo "❌ FFmpeg test failed"
fi

echo ""

# Check network configuration
echo "8. Network configuration..."
echo "Local IP addresses:"
ip addr show | grep -E 'inet [0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | grep -v '127.0.0.1' | awk '{print "   " $2}' 2>/dev/null || \
ifconfig | grep -E 'inet [0-9]+\.[0-9]+\.[0-9]+\.[0-9]+' | grep -v '127.0.0.1' | awk '{print "   " $2}' 2>/dev/null || \
echo "   Could not determine network interfaces"

echo ""

# Test RTP port binding
echo "9. Testing RTP port availability (40000-40010)..."
for port in {40000..40010}; do
    if nc -z 127.0.0.1 $port 2>/dev/null; then
        echo "⚠️  Port $port is in use"
    else
        echo "✅ Port $port is available"
        break  # Only test first few available ports
    fi
done

echo ""

echo "🔧 Quick fixes for common issues:"
echo "================================"
echo ""
echo "1. If FFmpeg fails with 'Address already in use':"
echo "   - The new code uses dynamic port allocation (40000+)"
echo "   - Restart the server to clear any stuck processes"
echo ""
echo "2. If SSL certificate errors occur:"
echo "   - Navigate to https://localhost:3000 in browser"
echo "   - Accept the security warning for self-signed cert"
echo ""
echo "3. If CORS errors occur:"
echo "   - Ensure frontend runs on localhost:5173"
echo "   - Check that CORS origins match in app.js"
echo ""
echo "4. If no video in HLS stream:"
echo "   - Check that camera permissions are granted"
echo "   - Look for 'Producer created' messages in logs"
echo "   - Verify HLS files exist in public/hls/[roomname]/"
echo ""
echo "5. If transport connection fails:"
echo "   - Check firewall settings for ports 2000-3020"
echo "   - Ensure WebRTC transports can bind to 127.0.0.1"
echo ""
echo "🚀 To start the application:"
echo "1. Backend: npm run dev (in server directory)"
echo "2. Frontend: npm run dev (in client directory)"
echo "3. Open: https://localhost:5173"
echo ""
echo "📊 Monitor logs for:"
echo "- 'Producer created' (camera/mic working)"
echo "- 'HLS stream started' (streaming working)"
echo "- 'FFmpeg' messages (encoding status)"