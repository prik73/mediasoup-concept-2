import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'

const LandingPage = () => {
  const navigate = useNavigate()
  const [roomName, setRoomName] = useState('')

  const joinStream = () => {
    const room = roomName.trim() || 'room123'
    navigate(`/sfu/${room}`)
  }

  const joinWatch = () => {
    const room = roomName.trim() || 'room123'
    navigate(`/watch/${room}`)
  }

  return (
    <div style={{ 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        background: 'white',
        padding: '40px',
        borderRadius: '15px',
        boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
        textAlign: 'center',
        maxWidth: '400px',
        width: '100%'
      }}>
        <h1 style={{ color: '#2c3e50', marginBottom: '30px' }}>
          🎥 Fermion WebRTC
        </h1>

        <input
          type="text"
          placeholder="Room name (optional)"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          style={{
            width: '100%',
            padding: '12px',
            border: '2px solid #ecf0f1',
            borderRadius: '8px',
            fontSize: '16px',
            marginBottom: '20px',
            boxSizing: 'border-box'
          }}
        />

        <div style={{ display: 'flex', gap: '15px' }}>
          <button
            onClick={joinStream}
            style={{
              flex: 1,
              background: '#3498db',
              color: 'white',
              border: 'none',
              padding: '15px',
              borderRadius: '8px',
              fontSize: '16px',
              cursor: 'pointer'
            }}
          >
            🎬 Stream
          </button>

          <button
            onClick={joinWatch}
            style={{
              flex: 1,
              background: '#e74c3c',
              color: 'white',
              border: 'none',
              padding: '15px',
              borderRadius: '8px',
              fontSize: '16px',
              cursor: 'pointer'
            }}
          >
            📺 Watch
          </button>
        </div>

        <p style={{ 
          color: '#7f8c8d', 
          marginTop: '20px', 
          fontSize: '14px' 
        }}>
          Stream: WebRTC peer-to-peer<br />
          Watch: HLS live stream
        </p>
      </div>
    </div>
  )
}

export default LandingPage