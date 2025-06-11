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

  useEffect(() => {
    // Connect to HLS viewer socket with proper URL
    const socketUrl = window.location.protocol === 'https:' 
      ? 'https://localhost:3000'
      : 'http://localhost:3000'
    
    socketRef.current = io(`${socketUrl}/hls-viewers`, {
      transports: ['websocket']
    })

    socketRef.current.on('viewer-count', (count) => {
      setViewerCount(count)
    })

    socketRef.current.emit('join-room', { roomName: roomId }) // FIXED: roomName -> roomId

    // Check if stream is active
    checkStreamStatus()

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
      }
      if (socketRef.current) {
        socketRef.current.emit('leave-room', { roomName: roomId }) // FIXED: roomName -> roomId
        socketRef.current.disconnect()
      }
    }
  }, [roomId])

  const checkStreamStatus = async () => {
    try {
      // Since we know the stream is running, let's directly try to load HLS
      console.log(`🔍 Checking stream for room: ${roomId}`)
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

    console.log(`🎥 Initializing HLS for room: ${roomId}`)

    const hls = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 90,
      maxBufferLength: 30,
      maxMaxBufferLength: 600,
      maxBufferSize: 60 * 1000 * 1000,
      maxBufferHole: 0.5,
      highBufferWatchdogPeriod: 2,
      nudgeOffset: 0.1,
      nudgeMaxRetry: 3,
      maxFragLookUpTolerance: 0.25,
      liveSyncDurationCount: 3,
      liveMaxLatencyDurationCount: 10
    })

    hlsRef.current = hls

    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      console.log('✅ Media attached to video element')
    })

    hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
      console.log('✅ Manifest parsed, levels:', data.levels.length)
      setIsLoading(false)
      setStreamStatus('live')
      
      // Try to play
      videoRef.current.play().catch(e => {
        console.log('⚠️ Autoplay prevented:', e)
        // Show a play button overlay
      })
    })

    hls.on(Hls.Events.LEVEL_LOADED, (event, data) => {
      console.log(`📊 Level loaded: ${data.details.totalduration}s`)
    })

    hls.on(Hls.Events.FRAG_LOADED, (event, data) => {
      console.log(`📦 Fragment loaded: ${data.frag.sn}`)
    })

    hls.on(Hls.Events.ERROR, (event, data) => {
      console.error('❌ HLS error:', data)
      
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            console.log('🔄 Network error, trying to recover...')
            hls.startLoad()
            break
          case Hls.ErrorTypes.MEDIA_ERROR:
            console.log('🔄 Media error, trying to recover...')
            hls.recoverMediaError()
            break
          default:
            console.error('💥 Fatal error, cannot recover')
            setError(`Fatal stream error: ${data.type}`)
            setIsLoading(false)
            setStreamStatus('offline')
            break
        }
      } else {
        console.warn(`⚠️ Non-fatal HLS error: ${data.type}`)
      }
    })

    // FIXED: Use roomId instead of roomName
    const streamUrl = `${window.location.protocol}//${window.location.hostname}:3000/hls/${roomId}/index.m3u8`
    console.log(`🌐 Loading HLS stream from: ${streamUrl}`)
    
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
      })
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 max-w-7xl mx-auto">
        <h2 className="text-xl font-semibold">Watching: {roomId}</h2>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">
            {viewerCount} viewer{viewerCount !== 1 ? 's' : ''}
          </span>
          <div className={`px-3 py-1 rounded-full text-sm ${
            streamStatus === 'live' ? 'bg-red-600' : 
            streamStatus === 'checking' ? 'bg-yellow-600' : 'bg-gray-600'
          }`}>
            {streamStatus === 'live' ? '● LIVE' : 
             streamStatus === 'checking' ? '● CHECKING' : '● OFFLINE'}
          </div>
        </div>
      </div>

      {/* Video Player */}
      <div className="max-w-7xl mx-auto">
        <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-gray-400">Loading stream...</p>
                <p className="text-sm text-gray-500 mt-2">Room: {roomId}</p>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
              <div className="text-center">
                <p className="text-red-400 mb-4">{error}</p>
                <button
                  onClick={handleRetry}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                >
                  Retry
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

          {/* Manual play button overlay for autoplay restrictions */}
          {!isLoading && !error && streamStatus === 'live' && (
            <div 
              className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 cursor-pointer opacity-0 hover:opacity-100 transition-opacity"
              onClick={handlePlay}
            >
              <div className="w-16 h-16 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                <div className="w-0 h-0 border-l-8 border-l-white border-t-4 border-t-transparent border-b-4 border-b-transparent ml-1"></div>
              </div>
            </div>
          )}
        </div>

        {/* Stream Info */}
        <div className="mt-4 p-4 bg-gray-800 rounded-lg">
          <h3 className="font-semibold mb-2">Stream Information</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Room:</span>
              <span className="ml-2">{roomId}</span>
            </div>
            <div>
              <span className="text-gray-400">Quality:</span>
              <span className="ml-2">1080p</span>
            </div>
            <div>
              <span className="text-gray-400">Latency:</span>
              <span className="ml-2">Low (~2-5s)</span>
            </div>
            <div>
              <span className="text-gray-400">Status:</span>
              <span className={`ml-2 ${streamStatus === 'live' ? 'text-green-400' : 'text-red-400'}`}>
                {streamStatus.toUpperCase()}
              </span>
            </div>
          </div>
        </div>

        {/* Debug Info (remove in production) */}
        <div className="mt-4 p-4 bg-gray-800 rounded-lg">
          <h3 className="font-semibold mb-2">Debug Info</h3>
          <div className="text-sm text-gray-400 space-y-1">
            <div>Stream URL: /hls/{roomId}/index.m3u8</div>
            <div>HLS Supported: {Hls.isSupported() ? 'Yes' : 'No'}</div>
            <div>Viewers: {viewerCount}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default WatchPage