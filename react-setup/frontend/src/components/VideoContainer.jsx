import React, { useMemo } from 'react'
import RemoteVideo from './RemoteVideo'

const VideoContainer = ({ streams }) => {
  // Memoize streams array to prevent unnecessary re-renders
  const streamEntries = useMemo(() => {
    return Array.from(streams.entries())
  }, [streams])

  // Memoize grid layout class based on number of streams
  const gridClass = useMemo(() => {
    const count = streamEntries.length
    if (count === 0) return 'video-grid-empty'
    if (count === 1) return 'video-grid-single'
    if (count <= 4) return 'video-grid-quad'
    return 'video-grid-many'
  }, [streamEntries.length])

  if (streamEntries.length === 0) {
    return (
      <div className="no-streams">
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '200px',
          color: 'rgba(255, 255, 255, 0.7)',
          fontSize: '16px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '15px' }}>👥</div>
          <p style={{ margin: 0, marginBottom: '5px' }}>No other participants yet</p>
          <p style={{ 
            margin: 0, 
            fontSize: '14px', 
            opacity: 0.8 
          }}>
            Share this room to invite others
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={`video-grid ${gridClass}`} style={{
      display: 'grid',
      gap: '15px',
      maxHeight: '100%',
      overflow: 'auto',
      padding: '5px',
      ...getGridStyles(streamEntries.length)
    }}>
      {streamEntries.map(([producerId, stream]) => (
        <RemoteVideo 
          key={producerId} 
          producerId={producerId} 
          stream={stream} 
        />
      ))}
    </div>
  )
}

// Helper function to get responsive grid styles
const getGridStyles = (count) => {
  if (count === 1) {
    return {
      gridTemplateColumns: '1fr',
      justifyItems: 'center'
    }
  } else if (count === 2) {
    return {
      gridTemplateColumns: 'repeat(2, 1fr)'
    }
  } else if (count <= 4) {
    return {
      gridTemplateColumns: 'repeat(2, 1fr)',
      gridTemplateRows: 'repeat(2, 1fr)'
    }
  } else if (count <= 6) {
    return {
      gridTemplateColumns: 'repeat(3, 1fr)',
      gridTemplateRows: 'repeat(2, 1fr)'
    }
  } else {
    return {
      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))'
    }
  }
}

// Add responsive grid styles
const GridStyles = () => (
  <style jsx global>{`
    .video-grid {
      scrollbar-width: thin;
      scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
    }

    .video-grid::-webkit-scrollbar {
      width: 6px;
    }

    .video-grid::-webkit-scrollbar-track {
      background: transparent;
    }

    .video-grid::-webkit-scrollbar-thumb {
      background-color: rgba(255, 255, 255, 0.3);
      border-radius: 3px;
    }

    .video-grid::-webkit-scrollbar-thumb:hover {
      background-color: rgba(255, 255, 255, 0.5);
    }

    /* Responsive adjustments */
    @media (max-width: 768px) {
      .video-grid {
        grid-template-columns: 1fr !important;
        gap: 10px;
      }
    }

    @media (max-width: 480px) {
      .video-grid {
        gap: 8px;
        padding: 2px;
      }
    }

    /* Animation for new participants */
    .remote-video-container {
      animation: fadeInScale 0.3s ease-out;
    }

    @keyframes fadeInScale {
      from {
        opacity: 0;
        transform: scale(0.8);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }

    /* Hover effects for better UX */
    .video-grid:hover .remote-video-container {
      transition: transform 0.2s ease;
    }

    .video-grid .remote-video-container:hover {
      transform: scale(1.02);
      z-index: 1;
    }
  `}</style>
)

export default React.memo(VideoContainer)