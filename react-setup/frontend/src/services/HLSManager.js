import EventEmitter from './EventEmitter'

class HLSManager extends EventEmitter {
  constructor() {
    super()
    this.hls = null
    this.videoElement = null
    this.roomName = null
    this.socket = null
    this.isInitialized = false
  }

  async initialize() {
    try {
      // Dynamic import of HLS.js
      const { default: Hls } = await import('hls.js')
      
      if (!Hls.isSupported()) {
        throw new Error('HLS is not supported in this browser')
      }

      this.hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90
      })

      this.setupHLSListeners()
      this.setupSocketConnection()
      this.isInitialized = true
      
    } catch (error) {
      console.error('HLS initialization failed:', error)
      throw error
    }
  }

  setupSocketConnection() {
    // Connect to socket for viewer count and stream status
    this.socket = io('/hls-viewer', {
      path: '/socket.io',
      transports: ['websocket']
    })

    this.socket.on('viewer-count', (count) => {
      this.emit('viewerCount', count)
    })

    this.socket.on('stream-status', (status) => {
      if (status === 'ended') {
        this.emit('streamEnded')
      }
    })
  }
setupHLSListeners() {
    this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
      console.log('HLS manifest parsed')
      this.emit('streamReady')
    })

    this.hls.on(Hls.Events.ERROR, (event, data) => {
      console.error('HLS error:', data)
      
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            console.log('Network error, trying to recover...')
            this.hls.startLoad()
            break
          case Hls.ErrorTypes.MEDIA_ERROR:
            console.log('Media error, trying to recover...')
            this.hls.recoverMediaError()
            break
          default:
            this.emit('error', new Error(`Fatal HLS error: ${data.type}`))
            break
        }
      }
    })

    this.hls.on(Hls.Events.FRAG_LOADED, () => {
      // Fragment loaded successfully
      this.emit('fragmentLoaded')
    })
  }

  async watchRoom(roomName, videoElement) {
    if (!this.isInitialized) {
      throw new Error('HLS Manager not initialized')
    }

    this.roomName = roomName
    this.videoElement = videoElement

    // Notify server that we're watching this room
    if (this.socket) {
      this.socket.emit('join-viewer', { roomName })
    }

    // Construct HLS URL (this should match your backend HLS endpoint)
    const hlsUrl = `/hls/${roomName}/live.m3u8`
    
    try {
      this.hls.loadSource(hlsUrl)
      this.hls.attachMedia(videoElement)
      
      // Start playback when ready
      videoElement.addEventListener('loadedmetadata', () => {
        videoElement.play().catch(err => {
          console.log('Autoplay prevented:', err)
          // Show play button or handle autoplay restriction
        })
      })
      
    } catch (error) {
      console.error('Failed to start HLS playback:', error)
      this.emit('error', error)
    }
  }

  cleanup() {
    if (this.hls) {
      this.hls.destroy()
    }

    if (this.socket) {
      if (this.roomName) {
        this.socket.emit('leave-viewer', { roomName: this.roomName })
      }
      this.socket.disconnect()
    }

    if (this.videoElement) {
      this.videoElement.pause()
      this.videoElement.src = ''
    }
  }
}

export default HLSManager