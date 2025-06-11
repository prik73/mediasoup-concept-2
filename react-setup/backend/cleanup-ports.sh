#!/bin/bash

echo "🧹 Cleaning up stuck ports and processes..."

# Function to kill processes on specific ports
kill_port() {
    local port=$1
    echo "Checking port $port..."
    
    # Find process using the port
    local pid=$(lsof -ti:$port 2>/dev/null)
    
    if [[ -n "$pid" ]]; then
        echo "  🔪 Killing process $pid on port $port"
        sudo kill -9 $pid 2>/dev/null || true
    else
        echo "  ✅ Port $port is free"
    fi
}

# Kill FFmpeg processes
echo "1. Killing FFmpeg processes..."
sudo pkill -f ffmpeg 2>/dev/null || echo "   No FFmpeg processes found"

# Kill Node.js processes on common ports
echo "2. Checking Node.js ports..."
kill_port 3000
kill_port 5173

# Kill processes on the problematic port range
echo "3. Checking RTP port range (40000-42000)..."
for port in {40000..42000..2}; do
    # Only check every 50th port to avoid spam
    if (( port % 100 == 0 )); then
        kill_port $port
    fi
done

# Specifically check the problematic port from your logs
echo "4. Checking specific problematic ports..."
kill_port 41176
kill_port 41178

# Clean up any mediasoup worker processes
echo "5. Cleaning up mediasoup workers..."
sudo pkill -f mediasoup 2>/dev/null || echo "   No mediasoup processes found"

# Show remaining processes on common ports
echo "6. Remaining processes on key ports:"
echo "   Port 3000 (backend):"
lsof -i :3000 2>/dev/null || echo "     None"
echo "   Port 5173 (frontend):"
lsof -i :5173 2>/dev/null || echo "     None"
echo "   Port 41176 (RTP):"
lsof -i :41176 2>/dev/null || echo "     None"

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "🚀 Now restart your application:"
echo "   Terminal 1: cd backend && npm run dev"
echo "   Terminal 2: cd frontend && npm run dev"
