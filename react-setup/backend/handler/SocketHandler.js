export class SocketHandler {
  constructor(mediasoupService) {
    this.mediasoupService = mediasoupService
  }

  handleConnection(socket) {
    console.log(`🔌 New connection: ${socket.id}`)
    
    socket.emit('connection-success', { socketId: socket.id })

    // Set up all socket event handlers
    this.setupEventHandlers(socket)
  }

  setupEventHandlers(socket) {
    socket.on('disconnect', () => this.handleDisconnect(socket))
    socket.on('joinRoom', (data, callback) => this.handleJoinRoom(socket, data, callback))
    socket.on('createWebRtcTransport', (data, callback) => this.handleCreateTransport(socket, data, callback))
    socket.on('transport-connect', (data) => this.handleTransportConnect(socket, data))
    socket.on('transport-produce', (data, callback) => this.handleTransportProduce(socket, data, callback))
    socket.on('getProducers', (callback) => this.handleGetProducers(socket, callback))
    socket.on('transport-recv-connect', (data) => this.handleTransportRecvConnect(socket, data))
    socket.on('consume', (data, callback) => this.handleConsume(socket, data, callback))
    socket.on('consumer-resume', (data) => this.handleConsumerResume(socket, data))
  }

  handleDisconnect(socket) {
    console.log(`🔌 Peer disconnected: ${socket.id}`)
    this.mediasoupService.cleanupPeer(socket.id)
  }

  async handleJoinRoom(socket, { roomName }, callback) {
    try {
      // Check if peer already exists (prevent double joining)
      if (this.mediasoupService.peers[socket.id]) {
        console.log(`⚠️ Peer ${socket.id} already in a room`)
        const existingPeer = this.mediasoupService.peers[socket.id]
        if (existingPeer.roomName) {
          const router = this.mediasoupService.rooms[existingPeer.roomName].router
          callback({ rtpCapabilities: router.rtpCapabilities })
          return
        }
      }

      const router = await this.mediasoupService.createRoom(roomName, socket.id)
      
      // Store peer info
      this.mediasoupService.peers[socket.id] = {
        socket,
        roomName,
        transports: [],
        producers: [],
        consumers: [],
        peerDetails: {
          name: '',
          isAdmin: false,
        }
      }

      const rtpCapabilities = router.rtpCapabilities
      callback({ rtpCapabilities })
    } catch (error) {
      console.error('Error joining room:', error)
      callback({ error: error.message })
    }
  }

  async handleCreateTransport(socket, { consumer }, callback) {
    try {
      const peer = this.mediasoupService.peers[socket.id]
      if (!peer) {
        throw new Error('Peer not found')
      }

      const { roomName } = peer
      const router = this.mediasoupService.rooms[roomName].router
      
      const transport = await this.mediasoupService.createWebRtcTransport(router)
      
      callback({
        params: {
          id: transport.id,
          iceParameters: transport.iceParameters,
          iceCandidates: transport.iceCandidates,
          dtlsParameters: transport.dtlsParameters
        }
      })

      this.mediasoupService.addTransport(socket.id, transport, roomName, consumer)
    } catch (error) {
      console.error('Error creating transport:', error)
      callback({ params: { error: error.message } })
    }
  }
  handleTransportConnect(socket, { dtlsParameters }) {
    try {
      console.log('🔗 DTLS params received')
      const transport = this.mediasoupService.getTransport(socket.id, false)
      
      if (!transport) {
        console.error('Transport not found for socket:', socket.id)
        return
      }

      // Check if transport is already connected
      if (transport.connectionState === 'connected') {
        console.log('🔗 Transport already connected, skipping...')
        return
      }

      transport.connect({ dtlsParameters }).catch(error => {
        // Ignore if already connected
        if (!error.message.includes('already called')) {
          console.error('Transport connect error:', error)
        }
      })
    } catch (error) {
      console.error('Error in handleTransportConnect:', error)
    }
  }

  async handleTransportProduce(socket, { kind, rtpParameters, appData }, callback) {
    try {
      const transport = this.mediasoupService.getTransport(socket.id, false)
      
      if (!transport) {
        throw new Error('Producer transport not found')
      }

      const producer = await transport.produce({ kind, rtpParameters })

      const peer = this.mediasoupService.peers[socket.id]
      if (!peer) {
        throw new Error('Peer not found')
      }

      const { roomName } = peer
      this.mediasoupService.addProducer(socket.id, producer, roomName)
      
      this.informConsumers(roomName, socket.id, producer.id)

      console.log(`🎥 Producer created: ${producer.id}, kind: ${producer.kind}`)

      producer.on('transportclose', () => {
        console.log('🚛 Transport closed for producer')
        producer.close()
      })

      callback({
        id: producer.id,
        producersExist: this.mediasoupService.producers.length > 1
      })
    } catch (error) {
      console.error('Error creating producer:', error)
      callback({ error: error.message })
    }
  }

  handleGetProducers(socket, callback) {
    try {
      const peer = this.mediasoupService.peers[socket.id]
      if (!peer) {
        console.error('Peer not found for getProducers')
        callback([])
        return
      }

      const { roomName } = peer
      const producerList = this.mediasoupService.getProducersInRoom(roomName, socket.id)
      console.log(`📋 Available producers: ${producerList}`)
      callback(producerList)
    } catch (error) {
      console.error('Error getting producers:', error)
      callback([])
    }
  }

  async handleTransportRecvConnect(socket, { dtlsParameters, serverConsumerTransportId }) {
    try {
      console.log(`🔗 Consumer transport connect`)
      
      const consumerTransport = this.mediasoupService.transports.find(
        t => t.consumer && t.transport.id === serverConsumerTransportId
      )?.transport

      if (!consumerTransport) {
        console.error('Consumer transport not found:', serverConsumerTransportId)
        return
      }

      // Check if already connected
      if (consumerTransport.connectionState === 'connected') {
        console.log('🔗 Consumer transport already connected, skipping...')
        return
      }

      await consumerTransport.connect({ dtlsParameters })
    } catch (error) {
      if (!error.message.includes('already called')) {
        console.error('Consumer transport connect error:', error)
      }
    }
  }
  async handleConsume(socket, { rtpCapabilities, remoteProducerId, serverConsumerTransportId }, callback) {
    try {
      const peer = this.mediasoupService.peers[socket.id]
      if (!peer) {
        throw new Error('Peer not found')
      }

      const { roomName } = peer
      const router = this.mediasoupService.rooms[roomName].router

      const consumerTransport = this.mediasoupService.transports.find(
        t => t.consumer && t.transport.id === serverConsumerTransportId
      )?.transport

      if (!consumerTransport) {
        throw new Error('Consumer transport not found')
      }

      if (router.canConsume({ producerId: remoteProducerId, rtpCapabilities })) {
        const consumer = await consumerTransport.consume({
          producerId: remoteProducerId,
          rtpCapabilities,
          paused: true
        })

        consumer.on('transportclose', () => {
          console.log('🚛 Consumer transport closed')
        })

        consumer.on('producerclose', () => {
          console.log('🎥 Producer closed from consumer side')
          socket.emit('producer-closed', { remoteProducerId })
          
          // Clean up
          consumerTransport.close()
          consumer.close()
          
          this.mediasoupService.transports = this.mediasoupService.transports.filter(
            t => t.transport.id !== consumerTransport.id
          )
          this.mediasoupService.consumers = this.mediasoupService.consumers.filter(
            c => c.consumer.id !== consumer.id
          )
        })

        this.mediasoupService.addConsumer(socket.id, consumer, roomName)

        callback({
          params: {
            id: consumer.id,
            producerId: remoteProducerId,
            kind: consumer.kind,
            rtpParameters: consumer.rtpParameters,
            serverConsumerId: consumer.id,
          }
        })
      } else {
        callback({ params: { error: 'Cannot consume' } })
      }
    } catch (error) {
      console.error('Error consuming:', error)
      callback({ params: { error: error.message } })
    }
  }

  async handleConsumerResume(socket, { serverConsumerId }) {
    try {
      console.log('▶️ Consumer resume')
      const consumerData = this.mediasoupService.consumers.find(
        c => c.consumer.id === serverConsumerId
      )
      if (consumerData) {
        await consumerData.consumer.resume()
      }
    } catch (error) {
      console.error('Error resuming consumer:', error)
    }
  }

    informConsumers(roomName, socketId, producerId) {
    console.log(`📢 Informing all peers in room ${roomName} about new producer ${producerId}`)
    
    // Get the room object to access its list of peers
    const room = this.mediasoupService.rooms[roomName]
    if (!room) {
        console.error(`Room ${roomName} not found for informing consumers.`)
        return
    }

    // Get all peers in the room except the one who just produced
    const peersToInform = room.peers.filter(peerId => peerId !== socketId)
    console.log(`Informing ${peersToInform.length} peers:`, peersToInform)

    peersToInform.forEach(peerId => {
        const peer = this.mediasoupService.peers[peerId]
        if (peer && peer.socket && peer.socket.connected) {
        console.log(`Sending new-producer to peer ${peerId}`)
        peer.socket.emit('new-producer', { producerId })
        } else {
        console.warn(`Peer ${peerId} not found or socket not connected`)
        }
    })
    }
debugRoomState(roomName) {
  const room = this.mediasoupService.rooms[roomName]
  if (!room) {
    console.log(`Room ${roomName} does not exist`)
    return
  }

  console.log(`=== Room ${roomName} Debug Info ===`)
  console.log(`Peers in room:`, room.peers)
  console.log(`Total producers:`, this.mediasoupService.producers.length)
  console.log(`Producers in this room:`, 
    this.mediasoupService.producers.filter(p => p.roomName === roomName).map(p => ({
      socketId: p.socketId,
      producerId: p.producer.id,
      kind: p.producer.kind
    }))
  )
  console.log(`Total consumers:`, this.mediasoupService.consumers.length)
  console.log(`================================`)
}
}