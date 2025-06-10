
import express from 'express'
import https from 'httpolyglot'
import fs from 'fs'
import cors from 'cors'
import path from 'path'
import { Server } from 'socket.io'
import { MediasoupService } from './function-ailty/MediasoupService.js'
import { SocketHandler } from './handler/SocketHandler.js'
import { routeHandler } from './routes/index.js'

const __dirname = path.resolve()
const app = express()

// CORS configuration
if (process.env.NODE_ENV !== 'production') {
  app.use(cors({
    origin: ['http://localhost:5173', 'https://localhost:5173'],
    credentials: true
  }))
}

// Static files and routing
routeHandler(app, __dirname)

// SSL configuration
const options = {
  key: fs.readFileSync('./ssl/key.pem', 'utf-8'),
  cert: fs.readFileSync('./ssl/cert.pem', 'utf-8')
}

const httpsServer = https.createServer(options, app)

// Socket.IO setup
const io = new Server(httpsServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? false 
      : ['http://localhost:5173', 'https://localhost:5173'],
    credentials: true
  }
})
const mediasoupService = new MediasoupService()
const socketHandler = new SocketHandler(mediasoupService)

// Setup socket connections
const connections = io.of('/mediasoup')
connections.on('connection', (socket) => {
  socketHandler.handleConnection(socket)
})

// Start server
const PORT = process.env.PORT || 3000
httpsServer.listen(PORT, async () => {
  console.log(`🚀 Server listening on port: ${PORT}`)
  console.log(`📱 Frontend dev server: http://localhost:5173`)
  
  // Initialize mediasoup worker
  await mediasoupService.initialize()
  console.log('✅ Mediasoup worker initialized')
})