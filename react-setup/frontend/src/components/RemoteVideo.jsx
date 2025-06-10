import React, { useEffect, useRef, useState, useCallback } from 'react'

const RemoteVideo = ({ producerId, stream }) => {
  const videoRef = useRef(null)
  const [isVideoVisible, setIsVideoVisible] = useState(false)
  const [connectionQuality, setConnectionQuality] = useState('good')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [participantName, setParticipantName] = useState('')

  // Set video stream and monitor its state
  useEffect(() => {
    const videoElement = videoRef.current
    if (videoElement && stream) {
      videoElement.srcObject = stream
      
      // Monitor video track state
      const videoTrack = stream.getVideoTracks()[0]
      if (videoTrack) {
        setIsVideoVisible(videoTrack.enabled && videoTrack.readyState === 'live')
        
        // Listen for track changes
        const handleTrackEnded = () => setIsVideoVisible(false)
        const handleTrackMuted = () => setIsVideoVisible(false)
        const handleTrackUnmuted = () => setIsVideoVisible(true)
        
        videoTrack.addEventListener('ended', handleTrackEnded)
        videoTrack.addEventListener('mute', handleTrackMuted)
        videoTrack.addEventListener('unmute', handleTrackUnmuted)
        
        return () => {
          videoTrack.removeEventListener('ended', handleTrackEnded)
          videoTrack.removeEventListener('mute', handleTrackMuted)
          videoTrack.removeEventListener('unmute', handleTrackUnmuted)
        }
      }
    }
  }, [stream])

  // Generate participant name from producer ID
  useEffect(() => {
    const shortId = producerId.slice(-8)
    setParticipantName(`User ${shortId}`)
  }, [producerId])

  // Monitor connection quality (simplified)
  useEffect(() => {
    if (!stream) return

    const videoTrack = stream.getVideoTracks()[0]
    if (!videoTrack) return

    const checkQuality = () => {
      // Simple quality check based on track state
      if (videoTrack.readyState === 'live' && videoTrack.enabled) {
        setConnectionQuality('good')
      } else if (videoTrack.readyState === 'live') {
        setConnectionQuality('fair')
      } else {
        setConnectionQuality('poor')
      }
    }

    const interval = setInterval(checkQuality, 2000)
    return () => clearInterval(interval)
  }, [stream])

  // Toggle fullscreen
  const toggleFullscreen = useCallback(() => {
    const videoElement = videoRef.current
    if (!videoElement) return

    if (!isFullscreen) {
      if (videoElement.requestFullscreen) {
        videoElement.requestFullscreen()
      } else if (videoElement.webkitRequestFullscreen) {
        videoElement.webkitRequestFullscreen()
      } else if (videoElement.mozRequestFullScreen) {
        videoElement.mozRequestFullScreen()
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen()
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen()
      } else if (document.mozCancelFullScreen) {
        document.mozCancelFullScreen()
      }
    }
  }, [isFullscreen])

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  const getConnectionIcon = () => {
    switch (connectionQuality) {
      case 'good': return '🟢'
      case 'fair': return '🟡'
      case 'poor': return '🔴'
      default: return '⚪'
    }
  }

  return (
    <div className="remote-video-container" style={{ position: 'relative' }}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="remote-video"
        style={{ 
          width: '100%', 
          maxWidth: '300px',
          border: '2px solid #2196F3',
          borderRadius: '8px',
          backgroundColor: '#000',
          cursor: 'pointer'
        }}
        onClick={toggleFullscreen}
      />
      
      {/* Video disabled overlay */}
      {!isVideoVisible && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: '#34495e',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '8px',
          color: 'white'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '10px' }}>👤</div>
            <div>{participantName}</div>
            <div style={{ fontSize: '12px', opacity: 0.7 }}>Camera off</div>
          </div>
        </div>
      )}

      {/* Participant info */}
      <div className="video-label" style={{
        position: 'absolute',
        bottom: '10px',
        left: '10px',
        background: 'rgba(0, 0, 0, 0.7)',
        color: 'white',
        padding: '4px 8px',
        borderRadius: '4px',
        fontSize: '12px',
        display: 'flex',
        alignItems: 'center',
        gap: '4px',
        backdropFilter: 'blur(5px)'
      }}>
        <span>{getConnectionIcon()}</span>
        <span>{participantName}</span>
      </div>

      {/* Fullscreen hint */}
      <div style={{
        position: 'absolute',
        top: '10px',
        right: '10px',
        background: 'rgba(0, 0, 0, 0.5)',
        color: 'white',
        padding: '4px 8px',
        borderRadius: '4px',
        fontSize: '10px',
        opacity: 0,
        transition: 'opacity 0.3s ease',
        pointerEvents: 'none'
      }}
      className="fullscreen-hint">
        Click to fullscreen
      </div>

      {/* Connection status indicator */}
      {connectionQuality === 'poor' && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(244, 67, 54, 0.9)',
          color: 'white',
          padding: '8px 12px',
          borderRadius: '6px',
          fontSize: '12px',
          textAlign: 'center'
        }}>
          Connection issues
        </div>
      )}

      {/* Hover effects */}
      <style jsx>{`
        .remote-video-container:hover .fullscreen-hint {
          opacity: 1 !important;
        }
        .remote-video-container:hover .remote-video {
          border-color: #1976D2 !important;
        }
      `}</style>
    </div>
  )
}

export default React.memo(RemoteVideo)