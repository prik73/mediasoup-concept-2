import React, { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import WebRTCManager from '../services/WebRTCManager'

const StreamPage = () => {
  const { roomId } = useParams()
  const [localStream, setLocalStream] = useState(null)
  const [remoteUsers, setRemoteUsers] = useState(new Map())
  const [isConnected, setIsConnected] = useState(false)
  const webrtcRef = useRef(null)
  const userStreamsRef = useRef(new Map()) // Track streams per user

  useEffect(() => {
    const init = async () => {
      try {
        webrtcRef.current = new WebRTCManager()
        
        webrtcRef.current.on('localStream', setLocalStream)
        
        webrtcRef.current.on('remoteStream', (producerId, stream) => {
          // Extract socketId from producerId
          const socketId = producerId.split('-')[0]
          
          // Store this stream
          const tracks = stream.getTracks()
          const trackType = tracks[0]?.kind || 'unknown'
          
          if (!userStreamsRef.current.has(socketId)) {
            userStreamsRef.current.set(socketId, {
              audio: null,
              video: null,
              stream: new MediaStream()
            })
          }
          
          const userInfo = userStreamsRef.current.get(socketId)
          
          // Add track to user's stream
          tracks.forEach(track => {
            if (track.kind === 'audio') {
              if (userInfo.audio) userInfo.stream.removeTrack(userInfo.audio)
              userInfo.audio = track
            } else if (track.kind === 'video') {
              if (userInfo.video) userInfo.stream.removeTrack(userInfo.video)
              userInfo.video = track
            }
            userInfo.stream.addTrack(track)
          })
          
          // Update state only if we have at least video
          if (userInfo.video) {
            setRemoteUsers(prev => new Map(prev).set(socketId, userInfo.stream))
          }
        })
        
        webrtcRef.current.on('streamRemoved', (producerId) => {
          const socketId = producerId.split('-')[0]
          
          // Check if this user has any remaining tracks
          const userInfo = userStreamsRef.current.get(socketId)
          if (userInfo) {
            const tracks = producerId.includes('audio') ? 'audio' : 'video'
            userInfo[tracks] = null
            
            // Remove user if no tracks remain
            if (!userInfo.audio && !userInfo.video) {
              userStreamsRef.current.delete(socketId)
              setRemoteUsers(prev => {
                const newMap = new Map(prev)
                newMap.delete(socketId)
                return newMap
              })
            }
          }
        })
        
        webrtcRef.current.on('connected', () => setIsConnected(true))

        await webrtcRef.current.initialize()
        await webrtcRef.current.joinRoom(roomId)
      } catch (error) {
        console.error('Failed:', error)
      }
    }

    init()
    return () => {
      webrtcRef.current?.disconnect()
      userStreamsRef.current.clear()
    }
  }, [roomId])

  return (
    <div className="stream-page">
      <div className="stream-header">
        <h2>Room: {roomId}</h2>
        <div className={`status ${isConnected ? 'connected' : 'disconnected'}`}>
          {isConnected ? '🟢 Connected' : '🔴 Connecting...'}
        </div>
      </div>
      
      <div className="video-layout">
        <div className="local-section">
          <h3>Your Video</h3>
          <LocalVideo stream={localStream} />
        </div>

        <div className="remote-section">
          <h3>Remote Participants ({remoteUsers.size})</h3>
          {remoteUsers.size === 0 ? (
            <div className="no-streams">No other participants</div>
          ) : (
            <div className="video-grid">
              {Array.from(remoteUsers.entries()).map(([userId, stream]) => (
                <RemoteVideo key={userId} userId={userId} stream={stream} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const LocalVideo = ({ stream }) => {
  const videoRef = useRef(null)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  return (
    <video
      ref={videoRef}
      autoPlay
      muted
      className="local-video"
    />
  )
}

const RemoteVideo = ({ userId, stream }) => {
  const videoRef = useRef(null)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  return (
    <div className="remote-video-container">
      <video
        ref={videoRef}
        autoPlay
        className="remote-video"
      />
      <div className="video-label">
        User {userId.slice(-6)}
      </div>
    </div>
  )
}

export default StreamPage