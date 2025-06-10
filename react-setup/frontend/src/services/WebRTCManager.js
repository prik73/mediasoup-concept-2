import { io } from 'socket.io-client'
import * as mediasoupClient from 'mediasoup-client'
import EventEmitter from './EventEmitter'

class WebRTCManager extends EventEmitter {
  constructor() {
    super()
    this.socket = null
    this.device = null
    this.producerTransport = null
    this.consumerTransports = []
    this.audioProducer = null
    this.videoProducer = null
    this.consumingTransports = []
    this.rtpCapabilities = null
    this.roomName = null
    this.localStream = null
    this.isConnected = false
    
    this.params = {
      encodings: [
        {
          rid: 'r0',
          maxBitrate: 100000,
          scalabilityMode: 'S1T3',
        },
        {
          rid: 'r1',
          maxBitrate: 300000,
          scalabilityMode: 'S1T3',
        },
        {
          rid: 'r2',
          maxBitrate: 900000,
          scalabilityMode: 'S1T3',
        }
      ],
      codecOptions: {
        videoGoogleStartBitrate: 1000
      }
    }
  }

  async initialize() {
    try {
      // Get local stream first
      await this.getLocalStream()
      
      // Initialize socket connection with proper URL detection
      const socketUrl = window.location.protocol === 'https:' 
        ? `${window.location.protocol}//${window.location.hostname}:3000`
        : 'https://localhost:3000'
      
      console.log('Connecting to:', socketUrl)
      
      this.socket = io(`${socketUrl}/mediasoup`, {
        path: '/socket.io',
        transports: ['websocket'],
        upgrade: false,
        secure: true,
        rejectUnauthorized: false
      })

      this.setupSocketListeners()
      
      // Wait for socket connection
      return new Promise((resolve, reject) => {
        this.socket.on('connection-success', ({ socketId }) => {
          console.log('Connected with socket ID:', socketId)
          this.isConnected = true
          this.emit('connected')
          resolve()
        })
        
        this.socket.on('connect_error', (error) => {
          console.error('Socket connection error:', error)
          reject(error)
        })
        
        // Timeout after 10 seconds
        setTimeout(() => {
          if (!this.isConnected) {
            reject(new Error('Socket connection timeout'))
          }
        }, 10000)
      })
      
    } catch (error) {
      console.error('WebRTC initialization failed:', error)
      throw error
    }
  }

  setupSocketListeners() {
    this.socket.on('connection-success', ({ socketId }) => {
      console.log('Connected with socket ID:', socketId)
      this.isConnected = true
      this.emit('connected')
    })

    this.socket.on('new-producer', ({ producerId }) => {
      console.log('New producer available:', producerId)
      this.signalNewConsumerTransport(producerId)
    })

    this.socket.on('producer-closed', ({ remoteProducerId }) => {
      console.log('Producer closed:', remoteProducerId)
      this.handleProducerClosed(remoteProducerId)
    })

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected')
      this.isConnected = false
      this.emit('disconnected')
    })

    this.socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error)
      this.emit('error', error)
    })
  }

  async getLocalStream() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: {
          width: { min: 640, ideal: 1280, max: 1920 },
          height: { min: 480, ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 }
        }
      })
      
      this.localStream = stream
      console.log('Local stream obtained:', stream.getTracks().map(t => t.kind))
      this.emit('localStream', stream)
      
      return stream
    } catch (error) {
      console.error('getUserMedia error:', error)
      throw new Error(`Camera/Microphone access denied: ${error.message}`)
    }
  }

  async joinRoom(roomName) {
    if (!this.isConnected) {
      throw new Error('Socket not connected')
    }
    
    this.roomName = roomName
    console.log('Joining room:', roomName)
    
    return new Promise((resolve, reject) => {
      this.socket.emit('joinRoom', { roomName }, async (data) => {
        try {
          if (data.error) {
            throw new Error(data.error)
          }
          
          console.log('Router rtpCapabilities received')
          this.rtpCapabilities = data.rtpCapabilities
          
          await this.createDevice()
          
          // Get existing producers after joining
          setTimeout(() => {
            this.getProducers()
          }, 1000)
          
          resolve()
        } catch (error) {
          console.error('Error in joinRoom callback:', error)
          reject(error)
        }
      })
    })
  }

  async createDevice() {
    try {
      this.device = new mediasoupClient.Device()
      
      await this.device.load({
        routerRtpCapabilities: this.rtpCapabilities
      })
      
      console.log('Device RTP capabilities loaded')
      console.log('Can produce audio:', this.device.canProduce('audio'))
      console.log('Can produce video:', this.device.canProduce('video'))
      
      await this.createSendTransport()
      
    } catch (error) {
      console.error('Device creation failed:', error)
      if (error.name === "UnsupportedError") {
        throw new Error("Browser not supported for WebRTC")
      }
      throw error
    }
  }

  async createSendTransport() {
    return new Promise((resolve, reject) => {
      this.socket.emit('createWebRtcTransport', { consumer: false }, async ({ params }) => {
        if (params.error) {
          reject(new Error(params.error))
          return
        }

        try {
          console.log('Creating send transport with params:', params)
          this.producerTransport = this.device.createSendTransport(params)
          
          this.setupProducerTransportListeners()
          await this.connectSendTransport()
          
          resolve()
        } catch (error) {
          console.error('Send transport creation failed:', error)
          reject(error)
        }
      })
    })
  }

  setupProducerTransportListeners() {
    this.producerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        console.log('Producer transport connecting...')
        this.socket.emit('transport-connect', { dtlsParameters })
        callback()
      } catch (error) {
        console.error('Producer transport connect error:', error)
        errback(error)
      }
    })

    this.producerTransport.on('produce', async (parameters, callback, errback) => {
      try {
        console.log('Producing:', parameters.kind)
        this.socket.emit('transport-produce', {
          kind: parameters.kind,
          rtpParameters: parameters.rtpParameters,
          appData: parameters.appData
        }, ({ id, producersExist }) => {
          callback({ id })
          
          // Request existing producers when we start producing
          if (producersExist) {
            setTimeout(() => {
              this.getProducers()
            }, 500)
          }
        })
      } catch (error) {
        console.error('Producer transport produce error:', error)
        errback(error)
      }
    })

    this.producerTransport.on('connectionstatechange', (state) => {
      console.log('Producer transport connection state:', state)
    })
  }

  async connectSendTransport() {
    if (!this.localStream) {
      throw new Error('No local stream available')
    }

    const audioTrack = this.localStream.getAudioTracks()[0]
    const videoTrack = this.localStream.getVideoTracks()[0]

    console.log('Available tracks:', {
      audio: !!audioTrack,
      video: !!videoTrack
    })

    try {
      if (audioTrack && this.device.canProduce('audio')) {
        const audioParams = { track: audioTrack }
        this.audioProducer = await this.producerTransport.produce(audioParams)
        this.setupProducerListeners(this.audioProducer, 'audio')
        console.log('Audio producer created:', this.audioProducer.id)
      }

      if (videoTrack && this.device.canProduce('video')) {
        const videoParams = { 
          track: videoTrack, 
          ...this.params,
          appData: { source: 'webcam' }
        }
        this.videoProducer = await this.producerTransport.produce(videoParams)
        this.setupProducerListeners(this.videoProducer, 'video')
        console.log('Video producer created:', this.videoProducer.id)
      }
    } catch (error) {
      console.error('Error creating producers:', error)
      throw error
    }
  }

  setupProducerListeners(producer, type) {
    producer.on('trackended', () => {
      console.log(`${type} track ended`)
    })

    producer.on('transportclose', () => {
      console.log(`${type} transport closed`)
    })

    producer.on('close', () => {
      console.log(`${type} producer closed`)
    })
  }

  async signalNewConsumerTransport(remoteProducerId) {
    if (this.consumingTransports.includes(remoteProducerId)) {
      console.log('Already consuming producer:', remoteProducerId)
      return
    }
    
    this.consumingTransports.push(remoteProducerId)
    console.log('Creating consumer transport for producer:', remoteProducerId)

    this.socket.emit('createWebRtcTransport', { consumer: true }, ({ params }) => {
      if (params.error) {
        console.error('Consumer transport creation failed:', params.error)
        return
      }

      let consumerTransport
      try {
        consumerTransport = this.device.createRecvTransport(params)
        this.consumerTransports.push(consumerTransport)
        
        this.setupConsumerTransportListeners(consumerTransport, params.id)
        this.connectRecvTransport(consumerTransport, remoteProducerId, params.id)
      } catch (error) {
        console.error('Consumer transport setup failed:', error)
      }
    })
  }

  setupConsumerTransportListeners(consumerTransport, transportId) {
    consumerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        console.log('Consumer transport connecting...')
        this.socket.emit('transport-recv-connect', {
          dtlsParameters,
          serverConsumerTransportId: transportId,
        })
        callback()
      } catch (error) {
        console.error('Consumer transport connect error:', error)
        errback(error)
      }
    })

    consumerTransport.on('connectionstatechange', (state) => {
      console.log('Consumer transport connection state:', state)
    })
  }

  async connectRecvTransport(consumerTransport, remoteProducerId, serverConsumerTransportId) {
    this.socket.emit('consume', {
      rtpCapabilities: this.device.rtpCapabilities,
      remoteProducerId,
      serverConsumerTransportId
    }, async ({ params }) => {
      if (params.error) {
        console.error('Cannot consume:', params.error)
        return
      }

      try {
        console.log('Creating consumer for producer:', remoteProducerId)
        const consumer = await consumerTransport.consume({
          id: params.id,
          producerId: params.producerId,
          kind: params.kind,
          rtpParameters: params.rtpParameters
        })

        const stream = new MediaStream([consumer.track])
        console.log('Remote stream created:', stream.id, 'for producer:', remoteProducerId)
        
        this.emit('remoteStream', remoteProducerId, stream)

        // Resume the consumer
        this.socket.emit('consumer-resume', { 
          serverConsumerId: params.serverConsumerId 
        })

        consumer.on('close', () => {
          console.log('Consumer closed:', consumer.id)
        })

        consumer.on('trackended', () => {
          console.log('Consumer track ended:', consumer.id)
        })

      } catch (error) {
        console.error('Consumer setup failed:', error)
      }
    })
  }

  getProducers() {
    console.log('Requesting available producers...')
    this.socket.emit('getProducers', producerIds => {
      console.log('Available producers:', producerIds)
      producerIds.forEach(id => {
        if (!this.consumingTransports.includes(id)) {
          this.signalNewConsumerTransport(id)
        }
      })
    })
  }

  handleProducerClosed(remoteProducerId) {
    console.log('Handling producer closed:', remoteProducerId)
    
    // Remove from consuming transports
    this.consumingTransports = this.consumingTransports.filter(id => id !== remoteProducerId)
    
    // Find and close related consumer transport
    const relatedTransport = this.consumerTransports.find(transport => {
      // You might need a better way to match this
      return transport.appData?.producerId === remoteProducerId
    })

    if (relatedTransport) {
      relatedTransport.close()
      this.consumerTransports = this.consumerTransports.filter(t => t !== relatedTransport)
    }

    this.emit('streamRemoved', remoteProducerId)
  }

  disconnect() {
    console.log('Disconnecting WebRTC manager...')
    
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        track.stop()
        console.log('Stopped track:', track.kind)
      })
    }

    if (this.audioProducer) {
      this.audioProducer.close()
    }

    if (this.videoProducer) {
      this.videoProducer.close()
    }

    this.consumerTransports.forEach(transport => {
      transport.close()
    })

    if (this.producerTransport) {
      this.producerTransport.close()
    }

    if (this.socket) {
      this.socket.disconnect()
    }

    // Reset state
    this.isConnected = false
    this.localStream = null
    this.consumerTransports = []
    this.consumingTransports = []
  }
}

export default WebRTCManager