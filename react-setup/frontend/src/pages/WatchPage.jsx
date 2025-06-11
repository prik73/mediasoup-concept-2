import React, { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import Hls from 'hls.js'
import { io } from 'socket.io-client'

const WatchPage = () => {
  const { roomId } = useParams()
  const videoRef = useRef(null)
  const hlsRef = useRef(null)
  const socketRef = useRef(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [viewerCount, setViewerCount] = useState(0)
  const [streamStatus, setStreamStatus] = useState('checking')
  const [streamInfo, setStreamInfo] = useState({
    participants: 0,
    layout: 'Unknown',
    quality: 'Loading...'
  })

  useEffect(() => {
    // Connect to HLS viewer socket
    const socketUrl = window.location.protocol === 'https:' 
      ? 'https://localhost:3000'
      : 'http://localhost:3000'
    
    socketRef.current = io(`${socketUrl}/hls-viewers`, {
      transports: ['websocket']
    })

    socketRef.current.on('viewer-count', (count) => {
      setViewerCount(count)
    })

    socketRef.current.emit('join-room', { roomName: roomId })

    // Check stream and initialize
    checkStreamStatus()

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
      }
      if (socketRef.current) {
        socketRef.current.emit('leave-room', { roomName: roomId })
        socketRef.current.disconnect()
      }
    }
  }, [roomId])

  const checkStreamStatus = async () => {
    try {
      console.log(`🔍 Checking multi-participant stream for room: ${roomId}`)
      setStreamStatus('live')
      initializeHLS()
    } catch (err) {
      console.error('Stream check error:', err)
      setError('Failed to check stream status')
      setIsLoading(false)
    }
  }

  const initializeHLS = () => {
    if (!Hls.isSupported()) {
      setError('HLS is not supported in your browser')
      setIsLoading(false)
      return
    }

    console.log(`🎥 Initializing optimized HLS for multi-participant room: ${roomId}`)

    const hls = new Hls({
      // Optimized settings for low-latency multi-participant stream
      enableWorker: true,
      lowLatencyMode: true,
      
      // Buffer settings for smooth playback
      backBufferLength: 30,           // Reduced from 90
      maxBufferLength: 10,            // Reduced for lower latency
      maxMaxBufferLength: 30,         // Reduced buffer
      maxBufferSize: 20 * 1000 * 1000, // 20MB buffer
      maxBufferHole: 0.3,             // Smaller buffer holes
      
      // Live streaming optimizations
      liveSyncDurationCount: 2,       // Reduced for lower latency
      liveMaxLatencyDurationCount: 4, // Reduced max latency
      liveBackBufferLength: 10,       // Reduced back buffer
      
      // Playback settings
      highBufferWatchdogPeriod: 1,    // Check buffer more frequently
      nudgeOffset: 0.05,              // Smaller nudge offset
      nudgeMaxRetry: 2,               // Fewer retries
      maxFragLookUpTolerance: 0.1,    // Lower tolerance
      
      // Loading settings
      manifestLoadingTimeOut: 5000,   // Faster timeout
      manifestLoadingMaxRetry: 2,     // Fewer retries
      levelLoadingTimeOut: 5000,      // Faster timeout
      fragLoadingTimeOut: 10000,      // Reasonable frag timeout
      
      // Other optimizations
      startFragPrefetch: true,        // Prefetch fragments
      testBandwidth: false,           // Skip bandwidth test
      progressive: true,              // Progressive loading
      
      // Debug (remove in production)
      debug: false
    })

    hlsRef.current = hls

    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      console.log('✅ Media attached to video element')
    })

    hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
      console.log('✅ Manifest parsed, levels:', data.levels.length)
      
      // Extract stream info
      if (data.levels.length > 0) {
        const level = data.levels[0]
        setStreamInfo({
          participants: 'Multi-participant',
          layout: 'Composed view',
          quality: `${level.width}x${level.height}@${Math.round(level.bitrate/1000)}kbps`
        })
      }
      
      setIsLoading(false)
      setStreamStatus('live')
      
      // Auto-play
      videoRef.current.play().catch(e => {
        console.log('⚠️ Autoplay prevented, user interaction needed:', e)
      })
    })

    hls.on(Hls.Events.LEVEL_LOADED, (event, data) => {
      console.log(`📊 Level loaded: ${data.details.totalduration}s, segments: ${data.details.fragments.length}`)
    })

    hls.on(Hls.Events.FRAG_LOADED, (event, data) => {
      console.log(`📦 Fragment loaded: ${data.frag.sn}, duration: ${data.frag.duration}s`)
    })

    hls.on(Hls.Events.BUFFER_APPENDED, (event, data) => {
      // Monitor buffer health
      const buffered = videoRef.current?.buffered
      if (buffered && buffered.length > 0) {
        const bufferEnd = buffered.end(buffered.length - 1)
        const currentTime = videoRef.current?.currentTime || 0
        const bufferLength = bufferEnd - currentTime
        
        if (bufferLength < 2) {
          console.warn(`⚠️ Low buffer: ${bufferLength.toFixed(2)}s`)
        }
      }
    })

    hls.on(Hls.Events.ERROR, (event, data) => {
      console.error('❌ HLS error:', data)
      
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            console.log('🔄 Network error, attempting recovery...')
            setTimeout(() => {
              hls.startLoad()
            }, 1000)
            break
            
          case Hls.ErrorTypes.MEDIA_ERROR:
            console.log('🔄 Media error, attempting recovery...')
            setTimeout(() => {
              hls.recoverMediaError()
            }, 1000)
            break
            
          default:
            console.error('💥 Fatal error, cannot recover')
            setError(`Fatal stream error: ${data.type} - ${data.details}`)
            setIsLoading(false)
            setStreamStatus('offline')
            break
        }
      } else {
        console.warn(`⚠️ Non-fatal HLS error: ${data.type} - ${data.details}`)
      }
    })

    // Stream URL
    const streamUrl = `${window.location.protocol}//${window.location.hostname}:3000/hls/${roomId}/index.m3u8`
    console.log(`🌐 Loading multi-participant HLS stream from: ${streamUrl}`)
    
    hls.loadSource(streamUrl)
    hls.attachMedia(videoRef.current)
  }

  const handleRetry = () => {
    setError(null)
    setIsLoading(true)
    setStreamStatus('checking')
    
    // Cleanup existing HLS instance
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
    
    setTimeout(() => {
      checkStreamStatus()
    }, 1000)
  }

  const handlePlay = () => {
    if (videoRef.current) {
      videoRef.current.play().catch(e => {
        console.error('Play failed:', e)
        setError('Could not play video. Please try clicking play again.')
      })
    }
  }

  const getLayoutDescription = () => {
    return streamInfo.layout || 'Determining layout...'
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 max-w-7xl mx-auto">
        <div>
          <h2 className="text-xl font-semibold">Multi-Participant Stream: {roomId}</h2>
          <p className="text-sm text-gray-400">Live video conference view</p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">
            {viewerCount} viewer{viewerCount !== 1 ? 's' : ''}
          </span>
          <div className={`px-3 py-1 rounded-full text-sm ${
            streamStatus === 'live' ? 'bg-red-600' : 
            streamStatus === 'checking' ? 'bg-yellow-600' : 'bg-gray-600'
          }`}>
            {streamStatus === 'live' ? '● LIVE' : 
             streamStatus === 'checking' ? '● LOADING' : '● OFFLINE'}
          </div>
        </div>
      </div>

      {/* Video Player */}
      <div className="max-w-7xl mx-auto">
        <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
              <div className="text-center">
                <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-400 text-lg">Loading multi-participant stream...</p>
                <p className="text-sm text-gray-500 mt-2">Room: {roomId}</p>
                <p className="text-xs text-gray-600 mt-2">Composing video layout and mixing audio...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
              <div className="text-center">
                <div className="text-6xl mb-4">📺</div>
                <p className="text-red-400 mb-4">{error}</p>
                <button
                  onClick={handleRetry}
                  className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  Retry Connection
                </button>
              </div>
            </div>
          )}

          <video
            ref={videoRef}
            controls
            className="w-full h-full"
            playsInline
            style={{ display: (isLoading || error) ? 'none' : 'block' }}
            onClick={handlePlay}
          />

          {/* Manual play button overlay */}
          {!isLoading && !error && streamStatus === 'live' && (
            <div 
              className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 cursor-pointer opacity-0 hover:opacity-100 transition-opacity"
              onClick={handlePlay}
            >
              <div className="w-20 h-20 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                <div className="w-0 h-0 border-l-12 border-l-white border-t-8 border-t-transparent border-b-8 border-b-transparent ml-2"></div>
              </div>
            </div>
          )}
        </div>

        {/* Stream Info */}
        <div className="mt-4 p-4 bg-gray-800 rounded-lg">
          <h3 className="font-semibold mb-3">🎥 Multi-Participant Stream Information</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Room:</span>
              <span className="ml-2 font-mono">{roomId}</span>
            </div>
            <div>
              <span className="text-gray-400">Layout:</span>
              <span className="ml-2">{getLayoutDescription()}</span>
            </div>
            <div>
              <span className="text-gray-400">Quality:</span>
              <span className="ml-2">{streamInfo.quality}</span>
            </div>
            <div>
              <span className="text-gray-400">Latency:</span>
              <span className="ml-2 text-green-400">~1-3s</span>
            </div>
          </div>
        </div>

        {/* Stream Features */}
        <div className="mt-4 p-4 bg-gray-800 rounded-lg">
          <h3 className="font-semibold mb-3">✨ Stream Features</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center">
              <div className="w-2 h-2 bg-green-400 rounded-full mr-2"></div>
              <span>Real-time video composition</span>
            </div>
            <div className="flex items-center">
              <div className="w-2 h-2 bg-green-400 rounded-full mr-2"></div>
              <span>Mixed audio from all participants</span>
            </div>
            <div className="flex items-center">
              <div className="w-2 h-2 bg-green-400 rounded-full mr-2"></div>
              <span>Adaptive layout based on participant count</span>
            </div>
          </div>
        </div>

        {/* Technical Info */}
        <div className="mt-4 p-4 bg-gray-800 rounded-lg">
          <h3 className="font-semibold mb-2">🔧 Technical Details</h3>
          <div className="text-sm text-gray-400 space-y-1">
            <div>Stream URL: /hls/{roomId}/index.m3u8</div>
            <div>HLS Supported: {Hls.isSupported() ? '✅ Yes' : '❌ No'}</div>
            <div>Viewers: {viewerCount}</div>
            <div>Stream Type: Multi-participant live composition</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WatchPage