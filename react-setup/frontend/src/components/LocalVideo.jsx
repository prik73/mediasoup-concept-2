import React, { useEffect, useRef, useState, useCallback } from 'react'

const LocalVideo = ({ stream }) => {
  const videoRef = useRef(null)
  const [isVideoEnabled, setIsVideoEnabled] = useState(true)
  const [isAudioEnabled, setIsAudioEnabled] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Set video stream when available
  useEffect(() => {
    const videoElement = videoRef.current
    if (videoElement && stream) {
      videoElement.srcObject = stream
      
      // Update track states
      const videoTrack = stream.getVideoTracks()[0]
      const audioTrack = stream.getAudioTracks()[0]
      
      if (videoTrack) {
        setIsVideoEnabled(videoTrack.enabled)
      }
      if (audioTrack) {
        setIsAudioEnabled(audioTrack.enabled)
      }
    }
  }, [stream])

  // Toggle video
  const toggleVideo = useCallback(() => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
        setIsVideoEnabled(videoTrack.enabled)
      }
    }
  }, [stream])

  // Toggle audio
  const toggleAudio = useCallback(() => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setIsAudioEnabled(audioTrack.enabled)
      }
    }
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
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange)
    document.addEventListener('mozfullscreenchange', handleFullscreenChange)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange)
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange)
    }
  }, [])

  return (
    <div className="local-video-container" style={{ position: 'relative' }}>
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="local-video"
        style={{ 
          width: '100%', 
          maxWidth: '400px',
          border: '2px solid #4CAF50',
          borderRadius: '8px',
          backgroundColor: '#000'
        }}
      />
      
      {/* Video disabled overlay */}
      {!isVideoEnabled && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: '#2c3e50',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '8px',
          color: 'white'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '10px' }}>📹</div>
            <div>Camera off</div>
          </div>
        </div>
      )}

      {/* Control buttons */}
      <div className="video-controls" style={{
        position: 'absolute',
        bottom: '10px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: '8px',
        opacity: 0,
        transition: 'opacity 0.3s ease'
      }}
      onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
      onMouseLeave={(e) => e.currentTarget.style.opacity = '0'}>
        
        <ControlButton
          onClick={toggleVideo}
          active={isVideoEnabled}
          icon={isVideoEnabled ? '📹' : '📹'}
          title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
        />
        
        <ControlButton
          onClick={toggleAudio}
          active={isAudioEnabled}
          icon={isAudioEnabled ? '🎤' : '🎤'}
          title={isAudioEnabled ? 'Mute microphone' : 'Unmute microphone'}
        />
        
        <ControlButton
          onClick={toggleFullscreen}
          active={false}
          icon="⛶"
          title="Toggle fullscreen"
        />
      </div>

      {/* Hover effect for controls */}
      <style jsx>{`
        .local-video-container:hover .video-controls {
          opacity: 1 !important;
        }
      `}</style>
    </div>
  )
}

// Reusable control button component
const ControlButton = React.memo(({ onClick, active, icon, title }) => (
  <button
    onClick={onClick}
    title={title}
    style={{
      background: active ? 'rgba(76, 175, 80, 0.8)' : 'rgba(244, 67, 54, 0.8)',
      border: 'none',
      borderRadius: '50%',
      width: '36px',
      height: '36px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
      fontSize: '16px',
      transition: 'all 0.2s ease',
      backdropFilter: 'blur(10px)'
    }}
    onMouseEnter={(e) => {
      e.target.style.transform = 'scale(1.1)'
    }}
    onMouseLeave={(e) => {
      e.target.style.transform = 'scale(1)'
    }}
  >
    {icon}
  </button>
))

export default LocalVideo