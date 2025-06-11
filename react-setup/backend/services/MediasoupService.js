import mediasoup from 'mediasoup'

export class MediasoupService {
  constructor() {
    this.worker = null
    this.rooms = {}
    this.peers = {}
    this.transports = []
    this.producers = []
    this.consumers = []
    
    this.mediaCodecs = [
      {
        kind: 'audio',
        mimeType: 'audio/opus',
        clockRate: 48000,
        channels: 2,
      },
      {
        kind: 'video',
        mimeType: 'video/VP8',
        clockRate: 90000,
        parameters: {
          'x-google-start-bitrate': 1000,
        },
      },
    ]
  }

  async initialize() {
    this.worker = await mediasoup.createWorker({
      rtcMinPort: 2000,
      rtcMaxPort: 3020
    })

    console.log(`Worker PID: ${this.worker.pid}`)

    this.worker.on('died', (error) => {
      console.error('Mediasoup worker died:', error)
      setTimeout(() => process.exit(1), 2000)
    })

    return this.worker
  }

  async createRoom(roomName, socketId) {
    let router
    let peers = []

    if (this.rooms[roomName]) {
      // Room already exists, just add the peer
      router = this.rooms[roomName].router
      peers = this.rooms[roomName].peers || []
      console.log(`📺 Joining existing room: ${roomName}`)
    } else {
      // Create new room
      router = await this.worker.createRouter({ mediaCodecs: this.mediaCodecs })
      console.log(`📺 Created new router for room: ${roomName}`)
    }

    console.log(`Router ID: ${router.id}, Peers: ${peers.length}`)

    this.rooms[roomName] = {
      router: router,
      peers: [...peers, socketId]
    }

    return router
  }

  async createWebRtcTransport(router) {
    const webRtcTransport_options = {
      listenIps: [{
        ip: '0.0.0.0',
        announcedIp: '127.0.0.1',
      }],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
    }

    const transport = await router.createWebRtcTransport(webRtcTransport_options)
    console.log(`🚛 Transport created: ${transport.id}`)

    transport.on('dtlsstatechange', (dtlsState) => {
      if (dtlsState === 'closed') {
        transport.close()
      }
    })

    transport.on('close', () => {
      console.log('🚛 Transport closed')
    })

    return transport
  }
    addTransport(socketId, transport, roomName, consumer) {
    this.transports.push({
      socketId,
      transport,
      roomName,
      consumer
    })

    // Initialize peer if doesn't exist
    if (!this.peers[socketId]) {
      this.peers[socketId] = { 
        transports: [], 
        producers: [], 
        consumers: [],
        roomName: roomName
      }
    }

    this.peers[socketId].transports.push(transport.id)
  }

  addProducer(socketId, producer, roomName) {
    this.producers.push({
      socketId,
      producer,
      roomName
    })

    // Initialize peer if doesn't exist
    if (!this.peers[socketId]) {
      this.peers[socketId] = { 
        transports: [], 
        producers: [], 
        consumers: [],
        roomName: roomName
      }
    }

    this.peers[socketId].producers.push(producer.id)
  }

  addConsumer(socketId, consumer, roomName) {
    this.consumers.push({
      socketId,
      consumer,
      roomName
    })

    // Initialize peer if doesn't exist
    if (!this.peers[socketId]) {
      this.peers[socketId] = { 
        transports: [], 
        producers: [], 
        consumers: [],
        roomName: roomName
      }
    }

    this.peers[socketId].consumers.push(consumer.id)
  }
    getProducersInRoom(roomName, excludeSocketId) {
    return this.producers
      .filter(p => p.roomName === roomName && p.socketId !== excludeSocketId)
      .map(p => p.producer.id)
  }

  getTransport(socketId, consumer = false) {
    const transportData = this.transports.find(
      t => t.socketId === socketId && t.consumer === consumer
    )
    return transportData ? transportData.transport : null
  }

  removeItems(items, socketId, type) {
    items.forEach(item => {
      if (item.socketId === socketId) {
        try {
          item[type].close()
        } catch (error) {
          console.log(`Error closing ${type}:`, error.message)
        }
      }
    })
    return items.filter(item => item.socketId !== socketId)
  }

  cleanupPeer(socketId) {
    console.log(`🧹 Cleaning up peer: ${socketId}`)
    
    // Remove from consumers, producers, transports
    this.consumers = this.removeItems(this.consumers, socketId, 'consumer')
    this.producers = this.removeItems(this.producers, socketId, 'producer')
    this.transports = this.removeItems(this.transports, socketId, 'transport')

    // Remove from rooms
    if (this.peers[socketId] && this.peers[socketId].roomName) {
      const roomName = this.peers[socketId].roomName
      if (this.rooms[roomName]) {
        this.rooms[roomName].peers = this.rooms[roomName].peers.filter(
          peerId => peerId !== socketId
        )
        
        // If room is empty, consider removing it (optional)
        if (this.rooms[roomName].peers.length === 0) {
          console.log(`🏠 Room ${roomName} is now empty`)
        }
      }
    }

    // Remove from peers
    delete this.peers[socketId]
  }
}