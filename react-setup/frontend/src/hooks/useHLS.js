import { useState, useEffect, useRef } from 'react'
import HLSManager from '../services/HLSManager'

export const useHLS = (roomId) => {
  const [hlsManager] = useState(() => new HLSManager())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [viewerCount, setViewerCount] = useState(0)
  const [isLive, setIsLive] = useState(false)
  const videoRef = useRef(null)

  useEffect(() => {
    const initializeHLS = async () => {
      try {
        setIsLoading(true)
        setError(null)
        
        // Initialize HLS manager
        await hlsManager.initialize()
        
        // Set up event listeners
        hlsManager.on('streamReady', () => {
          setIsLoading(false)
          setIsLive(true)
        })

        hlsManager.on('error', (err) => {
          setError(err.message)
          setIsLoading(false)
          setIsLive(false)
        })

        hlsManager.on('viewerCount', (count) => {
          setViewerCount(count)
        })

        hlsManager.on('streamEnded', () => {
          setIsLive(false)
        })

        // Start watching room if roomId is provided
        if (roomId && videoRef.current) {
          await hlsManager.watchRoom(roomId, videoRef.current)
        }
        
      } catch (error) {
        console.error('Failed to initialize HLS:', error)
        setError(error.message)
        setIsLoading(false)
      }
    }

    initializeHLS()

    return () => {
      hlsManager.cleanup()
    }
  }, [roomId, hlsManager])

  const watchRoom = async (newRoomId) => {
    try {
      setError(null)
      setIsLoading(true)
      if (videoRef.current) {
        await hlsManager.watchRoom(newRoomId, videoRef.current)
      }
    } catch (error) {
      setError(error.message)
      setIsLoading(false)
    }
  }

  const stopWatching = () => {
    hlsManager.cleanup()
    setIsLive(false)
    setViewerCount(0)
  }

  return {
    videoRef,
    isLoading,
    error,
    viewerCount,
    isLive,
    watchRoom,
    stopWatching
  }
}