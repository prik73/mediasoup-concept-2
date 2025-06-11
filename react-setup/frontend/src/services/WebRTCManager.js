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
      // Initialize socket connection - connect to your backend server
      this.socket = io('https://localhost:3000/mediasoup', {
        path: '/socket.io',
        transports: ['websocket'],
        upgrade: false,
        secure: false,
        rejectUnauthorized: false // For self-signed certificates
      })

      this.setupSocketListeners()
      await this.getLocalStream()

    } catch (error) {
      console.error('WebRTC initialization failed:', error)
      throw error
    }
  }
  setupSocketListeners() {
    this.socket.on('connection-success', ({ socketId }) => {
      console.log('Connected with socket ID:', socketId)
      this.emit('connected')
    })

    this.socket.on('new-producer', ({ producerId }) => {
      this.signalNewConsumerTransport(producerId)
    })

    this.socket.on('producer-closed', ({ remoteProducerId }) => {
      this.handleProducerClosed(remoteProducerId)
    })

    this.socket.on('disconnect', () => {
      console.log('Socket disconnected')
      this.emit('disconnected')
    })
  }

  async getLocalStream() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          width: { min: 640, max: 1920 },
          height: { min: 400, max: 1080 }
        }
      })

      this.localStream = stream
      this.emit('localStream', stream)

      return stream
    } catch (error) {
      console.error('getUserMedia error:', error)
      throw error
    }
  }

  async joinRoom(roomName) {
    this.roomName = roomName

    return new Promise((resolve, reject) => {
      this.socket.emit('joinRoom', { roomName }, async (data) => {
        try {
          console.log('Router rtpCapabilities:', data.rtpCapabilities)
          this.rtpCapabilities = data.rtpCapabilities

          await this.createDevice()
          await this.getProducers()

          resolve()
        } catch (error) {
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
      await this.createSendTransport()

    } catch (error) {
      console.error('Device creation failed:', error)
      if (error.name === "unsupported error") {
        throw new Error("Browser not supported")
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
          this.producerTransport = this.device.createSendTransport(params)
          this.setupProducerTransportListeners()
          await this.connectSendTransport()
          resolve()
        } catch (error) {
          reject(error)
        }
      })
    })
  }

  setupProducerTransportListeners() {
    this.producerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
      try {
        await this.socket.emit('transport-connect', { dtlsParameters })
        callback()
      } catch (error) {
        errback(error)
      }
    })

    this.producerTransport.on('produce', async (parameters, callback, errback) => {
      try {
        this.socket.emit('transport-produce', {
          kind: parameters.kind,
          rtpParameters: parameters.rtpParameters,
          appData: parameters.appData
        }, ({ id, producersExists }) => {
          callback({ id })
          if (producersExists) this.getProducers()
        })
      } catch (error) {
        errback(error)
      }
    })
  }
  async connectSendTransport() {
    const audioTrack = this.localStream.getAudioTracks()[0]
    const videoTrack = this.localStream.getVideoTracks()[0]

    if (audioTrack) {
      const audioParams = { track: audioTrack }
      this.audioProducer = await this.producerTransport.produce(audioParams)
      this.setupProducerListeners(this.audioProducer, 'audio')
    }

    if (videoTrack) {
      const videoParams = { track: videoTrack, ...this.params }
      this.videoProducer = await this.producerTransport.produce(videoParams)
      this.setupProducerListeners(this.videoProducer, 'video')
    }
  }

  setupProducerListeners(producer, type) {
    producer.on('trackended', () => {
      console.log(`${type} track ended`)
    })

    producer.on('transportclose', () => {
      console.log(`${type} transport closed`)
    })
  }

  async signalNewConsumerTransport(remoteProducerId) {
    if (this.consumingTransports.includes(remoteProducerId)) return
    this.consumingTransports.push(remoteProducerId)

    this.socket.emit('createWebRtcTransport', { consumer: true }, ({ params }) => {
      if (params.error) {
        console.error('Consumer transport creation failed:', params.error)
        return
      }

      let consumerTransport
      try {
        consumerTransport = this.device.createRecvTransport(params)
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
        await this.socket.emit('transport-recv-connect', {
          dtlsParameters,
          serverConsumerTransportId: transportId,
        })
        callback()
      } catch (error) {
        errback(error)
      }
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
        const consumer = await consumerTransport.consume({
          id: params.id,
          producerId: params.producerId,
          kind: params.kind,
          rtpParameters: params.rtpParameters
        })

        this.consumerTransports.push({
          consumerTransport,
          serverConsumerTransportId: params.id,
          producerId: remoteProducerId,
          consumer,
        })

        const stream = new MediaStream([consumer.track])
        this.emit('remoteStream', remoteProducerId, stream)

        this.socket.emit('consumer-resume', { serverConsumerId: params.serverConsumerId })
      } catch (error) {
        console.error('Consumer setup failed:', error)
      }
    })
  }

  getProducers() {
    this.socket.emit('getProducers', producerIds => {
      console.log('Available producers:', producerIds)
      producerIds.forEach(id => this.signalNewConsumerTransport(id))
    })
  }

  handleProducerClosed(remoteProducerId) {
    const producerToClose = this.consumerTransports.find(transportData =>
      transportData.producerId === remoteProducerId
    )

    if (producerToClose) {
      producerToClose.consumerTransport.close()
      producerToClose.consumer.close()

      this.consumerTransports = this.consumerTransports.filter(transportData =>
        transportData.producerId !== remoteProducerId
      )

      this.emit('streamRemoved', remoteProducerId)
    }
  }

  disconnect() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop())
    }

    if (this.socket) {
      this.socket.disconnect()
    }
    this.consumerTransports.forEach(({ consumerTransport, consumer }) => {
      consumerTransport.close()
      consumer.close()
    })

    if (this.producerTransport) {
      this.producerTransport.close()
    }
  }
}

export default WebRTCManager