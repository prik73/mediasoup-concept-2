import express from 'express'
import https from 'httpolyglot'
import fs from 'fs'
import cors from 'cors'
import path from 'path'
import { Server } from 'socket.io'
import { MediasoupService } from './services/MediasoupService.js'
import { SocketHandler } from './handler/SocketHandler.js'
import * as mediasoupFFmpeg from './services/mediasoupToHls.js'

const __dirname = path.resolve()
const app = express()

// CORS
app.use(cors({
  origin: [
    'http://localhost:5173', 
    'https://localhost:5173',
    'http://127.0.0.1:5173',
    'https://127.0.0.1:5173'
  ],
  credentials: true
}))

// Serve HLS files
app.use('/hls', express.static(path.join(__dirname, 'public/hls'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.m3u8')) {
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl')
    } else if (path.endsWith('.ts')) {
      res.setHeader('Content-Type', 'video/mp2t')
    }
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization')
  }
}))

// API Routes
app.get('/api/rooms/:roomName/stream', (req, res) => {
  const { roomName } = req.params
  const isStreaming = mediasoupFFmpeg.isRoomStreaming(roomName)
  res.json({ streaming: isStreaming })
})

app.post('/api/rooms/:roomName/start-stream', async (req, res) => {
  const { roomName } = req.params
  const success = await mediasoupFFmpeg.startRoomStream(mediasoupService, roomName)
  res.json({ success })
})

app.post('/api/rooms/:roomName/stop-stream', async (req, res) => {
  const { roomName } = req.params
  mediasoupFFmpeg.stopRoomStream(roomName)
  res.json({ success: true })
})

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    activeStreams: mediasoupFFmpeg.getAllActiveStreams()
  })
})

// SSL
const options = {
  key: fs.readFileSync('./ssl/key.pem', 'utf-8'),
  cert: fs.readFileSync('./ssl/cert.pem', 'utf-8')
}

const httpsServer = https.createServer(options, app)

// Socket.IO
const io = new Server(httpsServer, {
  cors: {
    origin: [
      'http://localhost:5173', 
      'https://localhost:5173',
      'http://127.0.0.1:5173',
      'https://127.0.0.1:5173'
    ],
    credentials: true
  }
})

// Services
const mediasoupService = new MediasoupService()
const socketHandler = new SocketHandler(mediasoupService, mediasoupFFmpeg)

// WebRTC sockets
const connections = io.of('/mediasoup')
connections.on('connection', (socket) => {
  socketHandler.handleConnection(socket)
})

// HLS viewer sockets
const hlsViewers = io.of('/hls-viewers')
const roomViewers = new Map()

hlsViewers.on('connection', (socket) => {
  socket.on('join-room', ({ roomName }) => {
    socket.join(roomName)
    
    if (!roomViewers.has(roomName)) {
      roomViewers.set(roomName, new Set())
    }
    roomViewers.get(roomName).add(socket.id)
    
    const viewerCount = roomViewers.get(roomName).size
    hlsViewers.to(roomName).emit('viewer-count', viewerCount)
  })

  socket.on('leave-room', ({ roomName }) => {
    socket.leave(roomName)
    
    if (roomViewers.has(roomName)) {
      roomViewers.get(roomName).delete(socket.id)
      const viewerCount = roomViewers.get(roomName).size
      hlsViewers.to(roomName).emit('viewer-count', viewerCount)
      
      if (viewerCount === 0) {
        roomViewers.delete(roomName)
      }
    }
  })

  socket.on('disconnect', () => {
    // Clean up from all rooms
    roomViewers.forEach((viewers, roomName) => {
      if (viewers.has(socket.id)) {
        viewers.delete(socket.id)
        const viewerCount = viewers.size
        hlsViewers.to(roomName).emit('viewer-count', viewerCount)
        
        if (viewerCount === 0) {
          roomViewers.delete(roomName)
        }
      }
    })
  })
})

// Graceful shutdown handlers
const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`)
  
  try {
    // Close HTTP server
    httpsServer.close(() => {
      console.log('✅ HTTP server closed')
    })
    
    // Cleanup all HLS streams
    console.log('🧹 Cleaning up HLS streams...')
    await mediasoupFFmpeg.cleanup()
    
    // Close socket connections
    io.close(() => {
      console.log('✅ Socket.IO server closed')
    })
    
    console.log('✅ Graceful shutdown complete')
    process.exit(0)
  } catch (error) {
    console.error('❌ Error during shutdown:', error)
    process.exit(1)
  }
}

// Handle different shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error)
  gracefulShutdown('uncaughtException')
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason)
  gracefulShutdown('unhandledRejection')
})

// Start server
const PORT = process.env.PORT || 3000
httpsServer.listen(PORT, async () => {
  console.log(`🚀 Server running on port: ${PORT}`)
  console.log(`📡 WebRTC endpoint: wss://localhost:${PORT}/socket.io/`)
  console.log(`📺 HLS endpoint: https://localhost:${PORT}/hls/`)
  
  try {
    await mediasoupService.initialize()
    console.log('✅ Mediasoup ready')
    
    // Ensure HLS directory exists
    const hlsDir = path.join(__dirname, 'public/hls')
    if (!fs.existsSync(hlsDir)) {
      fs.mkdirSync(hlsDir, { recursive: true })
      console.log('📁 Created HLS directory')
    }
    
    console.log('🎉 Server fully initialized and ready for connections')
  } catch (error) {
    console.error('❌ Failed to initialize Mediasoup:', error)
    process.exit(1)
  }
})