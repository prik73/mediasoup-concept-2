import { useState, useEffect, useRef, useCallback } from 'react'
import WebRTCManager from '../services/WebRTCManager'

/**
 * Custom hook for managing WebRTC connections
 * @param {string} roomId - The room identifier
 * @returns {Object} WebRTC state and methods
 */
export const useWebRTC = (roomId) => {
  // State management
  const [localStream, setLocalStream] = useState(null)
  const [remoteStreams, setRemoteStreams] = useState(new Map())
  const [isConnected, setIsConnected] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [error, setError] = useState(null)
  const [connectionState, setConnectionState] = useState('disconnected')
  const [stats, setStats] = useState({
    participantCount: 1,
    audioEnabled: true,
    videoEnabled: true,
    networkQuality: 'unknown'
  })

  // Refs for stable references
  const webrtcManagerRef = useRef(null)
  const mountedRef = useRef(true)
  const initializationRef = useRef(false)

  // Memoized event handlers to prevent re-renders
  const handleLocalStream = useCallback((stream) => {
    if (!mountedRef.current) return
    console.log('Local stream received')
    setLocalStream(stream)
    
    // Update audio/video enabled status
    const audioTrack = stream.getAudioTracks()[0]
    const videoTrack = stream.getVideoTracks()[0]
    
    setStats(prev => ({
      ...prev,
      audioEnabled: audioTrack?.enabled ?? false,
      videoEnabled: videoTrack?.enabled ?? false
    }))
  }, [])

  const handleRemoteStream = useCallback((producerId, stream) => {
    if (!mountedRef.current) return
    console.log('Remote stream received:', producerId)
    
    setRemoteStreams(prev => new Map(prev).set(producerId, stream))
    setStats(prev => ({
      ...prev,
      participantCount: prev.participantCount + 1
    }))
  }, [])

  const handleStreamRemoved = useCallback((producerId) => {
    if (!mountedRef.current) return
    console.log('Stream removed:', producerId)
    
    setRemoteStreams(prev => {
      const newMap = new Map(prev)
      newMap.delete(producerId)
      return newMap
    })
    
    setStats(prev => ({
      ...prev,
      participantCount: Math.max(1, prev.participantCount - 1)
    }))
  }, [])

  const handleConnected = useCallback(() => {
    if (!mountedRef.current) return
    console.log('WebRTC connected')
    setIsConnected(true)
    setConnectionState('connected')
    setError(null)
  }, [])

  const handleDisconnected = useCallback(() => {
    if (!mountedRef.current) return
    console.log('WebRTC disconnected')
    setIsConnected(false)
    setConnectionState('disconnected')
  }, [])

  const handleError = useCallback((err) => {
    if (!mountedRef.current) return
    console.error('WebRTC error:', err)
    setError(err.message || 'Unknown error occurred')
    setConnectionState('error')
  }, [])

  // Initialize WebRTC connection
  const initializeWebRTC = useCallback(async () => {
    if (initializationRef.current || !mountedRef.current || !roomId) return
    initializationRef.current = true

    try {
      setIsInitializing(true)
      setError(null)
      setConnectionState('connecting')
      
      console.log('Initializing WebRTC for room:', roomId)
      
      // Create new manager if needed
      if (!webrtcManagerRef.current) {
        webrtcManagerRef.current = new WebRTCManager()
      }

      const manager = webrtcManagerRef.current

      // Clean up existing listeners and set up new ones
      manager.removeAllListeners()
      manager.on('localStream', handleLocalStream)
      manager.on('remoteStream', handleRemoteStream)
      manager.on('streamRemoved', handleStreamRemoved)
      manager.on('connected', handleConnected)
      manager.on('disconnected', handleDisconnected)
      manager.on('error', handleError)

      // Initialize and join room
      await manager.initialize()
      await manager.joinRoom(roomId)
      
      console.log('WebRTC initialization complete')
      
    } catch (error) {
      console.error('Failed to initialize WebRTC:', error)
      if (mountedRef.current) {
        setError(error.message || 'Failed to initialize connection')
        setConnectionState('error')
      }
    } finally {
      if (mountedRef.current) {
        setIsInitializing(false)
        initializationRef.current = false
      }
    }
  }, [roomId, handleLocalStream, handleRemoteStream, handleStreamRemoved, 
      handleConnected, handleDisconnected, handleError])

  // Media control functions
  const toggleAudio = useCallback(() => {
    if (!localStream) return false
    
    const audioTrack = localStream.getAudioTracks()[0]
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled
      setStats(prev => ({ ...prev, audioEnabled: audioTrack.enabled }))
      return audioTrack.enabled
    }
    return false
  }, [localStream])

  const toggleVideo = useCallback(() => {
    if (!localStream) return false
    
    const videoTrack = localStream.getVideoTracks()[0]
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled
      setStats(prev => ({ ...prev, videoEnabled: videoTrack.enabled }))
      return videoTrack.enabled
    }
    return false
  }, [localStream])

  // Connection management
  const reconnect = useCallback(async () => {
    console.log('Attempting to reconnect...')
    
    if (webrtcManagerRef.current) {
      webrtcManagerRef.current.disconnect()
    }
    
    // Reset states
    setError(null)
    setIsConnected(false)
    setConnectionState('connecting')
    initializationRef.current = false
    
    // Retry after a brief delay
    setTimeout(() => {
      initializeWebRTC()
    }, 1000)
  }, [initializeWebRTC])

  const disconnect = useCallback(() => {
    console.log('Manually disconnecting...')
    
    if (webrtcManagerRef.current) {
      webrtcManagerRef.current.disconnect()
    }
    
    // Reset all states
    setLocalStream(null)
    setRemoteStreams(new Map())
    setIsConnected(false)
    setConnectionState('disconnected')
    setError(null)
    setStats({
      participantCount: 1,
      audioEnabled: true,
      videoEnabled: true,
      networkQuality: 'unknown'
    })
  }, [])

  // Get connection quality info
  const getConnectionInfo = useCallback(() => {
    return {
      state: connectionState,
      isConnected,
      participantCount: stats.participantCount,
      hasAudio: stats.audioEnabled,
      hasVideo: stats.videoEnabled,
      quality: stats.networkQuality
    }
  }, [connectionState, isConnected, stats])

  // Effect for initialization and cleanup
  useEffect(() => {
    mountedRef.current = true
    
    if (roomId) {
      initializeWebRTC()
    }

    return () => {
      mountedRef.current = false
      console.log('Cleaning up WebRTC connection...')
      
      if (webrtcManagerRef.current) {
        webrtcManagerRef.current.disconnect()
        webrtcManagerRef.current = null
      }
      
      initializationRef.current = false
    }
  }, [roomId, initializeWebRTC])

  // Monitor connection quality (simplified)
  useEffect(() => {
    if (!isConnected) return

    const checkConnectionQuality = () => {
      // Simple quality assessment based on number of streams and errors
      let quality = 'good'
      
      if (error) {
        quality = 'poor'
      } else if (remoteStreams.size === 0 && stats.participantCount > 1) {
        quality = 'fair'
      }
      
      setStats(prev => ({ ...prev, networkQuality: quality }))
    }

    const interval = setInterval(checkConnectionQuality, 5000)
    return () => clearInterval(interval)
  }, [isConnected, error, remoteStreams.size, stats.participantCount])

  // Return hook interface
  return {
    // Stream data
    localStream,
    remoteStreams,
    
    // Connection state
    isConnected,
    isInitializing,
    connectionState,
    error,
    
    // Statistics
    stats,
    
    // Media controls
    toggleAudio,
    toggleVideo,
    
    // Connection management
    reconnect,
    disconnect,
    
    // Utility functions
    getConnectionInfo,
    
    // Computed values
    hasRemoteStreams: remoteStreams.size > 0,
    isReady: isConnected && localStream && !isInitializing,
    participantCount: stats.participantCount
  }
}

export default useWebRTC