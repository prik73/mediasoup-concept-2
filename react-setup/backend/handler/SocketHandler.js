export class SocketHandler {
  constructor(mediasoupService) {
    this.mediasoupService = mediasoupService
  }

  handleConnection(socket) {
    console.log(`🔌 New connection: ${socket.id}`)
    socket.emit('connection-success', { socketId: socket.id })
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
    
    // Notify other peers before cleanup
    const peer = this.mediasoupService.peers[socket.id]
    if (peer && peer.roomName) {
      const room = this.mediasoupService.rooms[peer.roomName]
      if (room) {
        room.peers.forEach(peerId => {
          if (peerId !== socket.id) {
            const otherPeer = this.mediasoupService.peers[peerId]
            if (otherPeer && otherPeer.socket) {
              // Notify about all producers being closed
              peer.producers.forEach(producerId => {
                otherPeer.socket.emit('producer-closed', { remoteProducerId: producerId })
              })
            }
          }
        })
      }
    }
    
    this.mediasoupService.cleanupPeer(socket.id)
  }

  async handleJoinRoom(socket, { roomName }, callback) {
    try {
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
      
      this.mediasoupService.peers[socket.id] = {
        socket,
        roomName,
        transports: [],
        producers: [],
        consumers: []
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

      if (transport.connectionState === 'connected') {
        console.log('🔗 Transport already connected, skipping...')
        return
      }

      transport.connect({ dtlsParameters }).catch(error => {
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
      
      // Inform all other peers in the room about this new producer
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
      console.log(`📋 Available producers for ${socket.id}: ${producerList}`)
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
    
    const room = this.mediasoupService.rooms[roomName]
    if (!room) {
      console.error(`Room ${roomName} not found`)
      return
    }

    // Send new-producer event to all other peers in the room
    room.peers.forEach(peerId => {
      if (peerId !== socketId) {
        const peer = this.mediasoupService.peers[peerId]
        if (peer && peer.socket && peer.socket.connected) {
          console.log(`Sending new-producer to ${peerId}`)
          peer.socket.emit('new-producer', { producerId })
        }
      }
    })
  }
}