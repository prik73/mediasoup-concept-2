import React, { useEffect, useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import WebRTCManager from '../services/WebRTCManager'

const StreamPage = () => {
  const { roomId } = useParams()
  const [localStream, setLocalStream] = useState(null)
  const [remoteUsers, setRemoteUsers] = useState(new Map())
  const [isConnected, setIsConnected] = useState(false)
  const webrtcRef = useRef(null)
  const userStreamsRef = useRef(new Map())

  useEffect(() => {
    const init = async () => {
      try {
        webrtcRef.current = new WebRTCManager()
        
        webrtcRef.current.on('localStream', setLocalStream)
        
        webrtcRef.current.on('remoteStream', (producerId, stream) => {
          const socketId = producerId.split('-')[0]
          
          if (!userStreamsRef.current.has(socketId)) {
            userStreamsRef.current.set(socketId, {
              audio: null,
              video: null,
              stream: new MediaStream()
            })
          }
          
          const userInfo = userStreamsRef.current.get(socketId)
          const tracks = stream.getTracks()
          
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
          
          if (userInfo.video) {
            setRemoteUsers(prev => new Map(prev).set(socketId, userInfo.stream))
          }
        })
        
        webrtcRef.current.on('streamRemoved', (producerId) => {
          const socketId = producerId.split('-')[0]
          const userInfo = userStreamsRef.current.get(socketId)
          
          if (userInfo) {
            const tracks = producerId.includes('audio') ? 'audio' : 'video'
            userInfo[tracks] = null
            
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
    <div className="min-h-screen bg-gray-900 text-white p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Room: {roomId}</h2>
        <div className={`px-3 py-1 rounded-full text-sm ${
          isConnected ? 'bg-green-600' : 'bg-red-600'
        }`}>
          {isConnected ? '● Connected' : '● Connecting...'}
        </div>
      </div>

      {/* Video Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-7xl mx-auto">
        {/* Local Video */}
        <div className="space-y-2">
          <h3 className="text-sm text-gray-400">You</h3>
          <div className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video">
            {localStream ? (
              <video
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
                ref={el => el && (el.srcObject = localStream)}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-gray-500">Camera starting...</div>
              </div>
            )}
          </div>
        </div>

        {/* Remote Videos */}
        <div className="space-y-2">
          <h3 className="text-sm text-gray-400">
            Remote Participants ({remoteUsers.size})
          </h3>
          {remoteUsers.size === 0 ? (
            <div className="bg-gray-800 rounded-lg aspect-video flex items-center justify-center">
              <p className="text-gray-500">Waiting for others to join...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {Array.from(remoteUsers.entries()).map(([userId, stream]) => (
                <div key={userId} className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video">
                  <video
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                    ref={el => el && (el.srcObject = stream)}
                  />
                  <div className="absolute bottom-2 left-2 bg-black/70 px-2 py-1 rounded text-xs">
                    User {userId.slice(-6)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default StreamPage