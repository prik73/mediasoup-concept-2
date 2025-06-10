import React, { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import HLSManager from '../services/HLSManager'

const WatchPage = () => {
  const { roomId } = useParams()
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isLive, setIsLive] = useState(false)
  const videoRef = useRef(null)
  const hlsRef = useRef(null)

  useEffect(() => {
    const init = async () => {
      try {
        hlsRef.current = new HLSManager()
        
        hlsRef.current.on('streamReady', () => {
          setIsLoading(false)
          setIsLive(true)
        })
        hlsRef.current.on('error', (err) => {
          setError(err.message)
          setIsLoading(false)
        })

        await hlsRef.current.initialize()
        await hlsRef.current.watchRoom(roomId, videoRef.current)
      } catch (error) {
        setError(error.message)
        setIsLoading(false)
      }
    }

    init()
    return () => hlsRef.current?.cleanup()
  }, [roomId])

  return (
    <div className="watch-page">
      <div className="watch-header">
        <h2>Watching: {roomId}</h2>
        <div className={`status ${isLive ? 'live' : 'offline'}`}>
          {isLoading ? 'Loading...' : isLive ? 'LIVE' : 'Offline'}
        </div>
      </div>
      
      <div className="video-player">
        {isLoading && (
          <div className="loading-overlay">
            <div className="spinner"></div>
            <p>Loading stream...</p>
          </div>
        )}
        
        {error && (
          <div className="error-overlay">
            <p>Error: {error}</p>
            <button onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        )}
        
        <video
          ref={videoRef}
          controls
          autoPlay
          muted
          className="hls-video"
          style={{ display: isLoading || error ? 'none' : 'block' }}
        />
      </div>
    </div>
  )
}

export default WatchPage