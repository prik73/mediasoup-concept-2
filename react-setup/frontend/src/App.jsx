import React, { useEffect, useRef, useState } from 'react'
import {io} from 'socket.io-client'
import * as mediasoupClient from "mediasoup-client"
import './App.css'

function App() {
  const localVideoRef = useRef(null)
  const videoContainerRef = useRef(null)
  const socketRef = useRef(null)
  const deviceRef = useRef(null)
  const producerTransportRef = useRef(null)
  const consumerTransportsRef = useRef([])
  const audioProducerRef = useRef(null)
  const videoProducerRef = useRef(null)
  const consumingTransportsRef = useRef([])
  const rtpCapabilitiesRef = useRef(null)
  
  const [roomName] = useState(() => {
    return window.location.pathname.split('/')[2]
  })

  const params = {
    encodings: [
      {
        rid: 'r0',
        maxBitrate: 100000,
        scalabilityMode: 'S1T3',
      },
      {
        rid: 'r1',
        maxBitrate: 300000,
        scalabilityMode: 'S1T3',
      },
      {
        rid: 'r2',
        maxBitrate: 900000,
        scalabilityMode: 'S1T3',
      }
    ],
    codecOptions: {
      videoGoogleStartBitrate: 1000
    }
  }

  const audioParamsRef = useRef({})
  const videoParamsRef = useRef({ params })

  useEffect(() => {
    // Initialize socket connection
    const socket = io('/mediasoup', {
    path: '/socket.io',
    transports: ['websocket'],
    upgrade: false,
    secure: false
  })
    socketRef.current = socket
    
    socketRef.current.on('connection-success', ({ socketId }) => {
      console.log(socketId)
      getLocalStream()
    })

    socketRef.current.on('new-producer', ({ producerId }) => {
      signalNewConsumerTransport(producerId)
    })

    socketRef.current.on('producer-closed', ({ remoteProducerId }) => {
      const producerToClose = consumerTransportsRef.current.find(transportData => 
        transportData.producerId === remoteProducerId
      )

      if (producerToClose) {
        producerToClose.consumerTransport.close()
        producerToClose.consumer.close()

        consumerTransportsRef.current = consumerTransportsRef.current.filter(transportData => 
          transportData.producerId !== remoteProducerId
        )

        const safeId = remoteProducerId.replace(/[^a-zA-Z0-9_-]/g, '_')
        const videoElement = document.getElementById(`td-${safeId}`)
        if (videoElement && videoContainerRef.current) {
          videoContainerRef.current.removeChild(videoElement)
        }
      }
    })

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
      }
    }
  }, [])

  const streamSuccess = (stream) => {
    console.log('Stream success:', stream)

    const audioTrack = stream.getAudioTracks()[0]
    const videoTrack = stream.getVideoTracks()[0]

    if (!audioTrack) {
      console.error('No audio track found in the stream')
    }

    if (!videoTrack) {
      console.error('No video track found in the stream')
    }

    audioParamsRef.current = { track: audioTrack, ...audioParamsRef.current }
    videoParamsRef.current = { track: videoTrack, ...videoParamsRef.current }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream
    }

    joinRoom()
  }

  const joinRoom = () => {
    socketRef.current.emit('joinRoom', { roomName }, (data) => {
      console.log(`router rtpCapabilities: ${data.rtpCapabilities}`)
      rtpCapabilitiesRef.current = data.rtpCapabilities
      createDevice().then(() => {
        getProducers()
      })
    })
  }

  const getLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          width: { min: 640, max: 1920 },
          height: { min: 400, max: 1080 }
        }
      })
      console.log('Local stream obtained:', stream)
      streamSuccess(stream)
    } catch (error) {
      console.error('getUserMedia error:', error)
    }
  }

  const createDevice = async () => {
    try {
      deviceRef.current = new mediasoupClient.Device()

      await deviceRef.current.load({
        routerRtpCapabilities: rtpCapabilitiesRef.current
      })

      console.log(`device's RTP capabilities`, rtpCapabilitiesRef.current)
      createSendTransport()

    } catch (error) {
      console.log(error)
      if (error.name === "unsupported error") {
        console.warn("browser not supported")
      }
    }
  }

  const createSendTransport = () => {
    socketRef.current.emit('createWebRtcTransport', { consumer: false }, ({ params }) => {
      if (params.error) {
        console.log(params.error)
        return
      }
      console.log(params)

      producerTransportRef.current = deviceRef.current.createSendTransport(params)

      producerTransportRef.current.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          await socketRef.current.emit('transport-connect', {
            dtlsParameters
          })
          callback()
        } catch (error) {
          errback(error)
        }
      })

      producerTransportRef.current.on('produce', async (parameters, callback, errback) => {
        console.log(parameters)

        try {
          await socketRef.current.emit('transport-produce', {
            kind: parameters.kind,
            rtpParameters: parameters.rtpParameters,
            appData: parameters.appData
          }, ({ id, producersExists }) => {
            callback({ id })
            if (producersExists) getProducers()
          })
        } catch (error) {
          errback(error)
        }
      })

      connectSendTransport()
    })
  }

  const connectSendTransport = async () => {
    audioProducerRef.current = await producerTransportRef.current.produce(audioParamsRef.current)
    videoProducerRef.current = await producerTransportRef.current.produce(videoParamsRef.current)

    audioProducerRef.current.on('trackended', () => {
      console.log('Audio track ended')
    })

    audioProducerRef.current.on('transportclose', () => {
      console.log('Audio transport closed')
    })

    videoProducerRef.current.on('trackended', () => {
      console.log('Video track ended')
    })

    videoProducerRef.current.on('transportclose', () => {
      console.log('Video transport closed')
    })
  }

  const signalNewConsumerTransport = async (remoteProducerId) => {
    if (consumingTransportsRef.current.includes(remoteProducerId)) return
    consumingTransportsRef.current.push(remoteProducerId)

    await socketRef.current.emit('createWebRtcTransport', { consumer: true }, ({ params }) => {
      if (params.error) {
        console.log(params.error)
        return
      }
      console.log(`Params... ${params}`)

      let consumerTransport
      try {
        consumerTransport = deviceRef.current.createRecvTransport(params)
      } catch (error) {
        console.log(error)
        return
      }

      consumerTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          await socketRef.current.emit('transport-recv-connect', {
            dtlsParameters,
            serverConsumerTransportId: params.id,
          })
          callback()
        } catch (error) {
          errback(error)
        }
      })

      connectRecvTransport(consumerTransport, remoteProducerId, params.id)
    })
  }

  const getProducers = () => {
    socketRef.current.emit('getProducers', producerIds => {
      console.log(`producer id ${producerIds}`)
      producerIds.forEach(signalNewConsumerTransport)
    })
  }

  const connectRecvTransport = async (consumerTransport, remoteProducerId, serverConsumerTransportId) => {
    await socketRef.current.emit('consume', {
      rtpCapabilities: deviceRef.current.rtpCapabilities,
      remoteProducerId,
      serverConsumerTransportId
    }, async ({ params }) => {
      if (params.error) {
        console.log('cannot consume')
        return
      }
      console.log(`Consumer Params ${params}`)

      const consumer = await consumerTransport.consume({
        id: params.id,
        producerId: params.producerId,
        kind: params.kind,
        rtpParameters: params.rtpParameters
      })

      consumerTransportsRef.current = [
        ...consumerTransportsRef.current,
        {
          consumerTransport,
          serverConsumerTransportId: params.id,
          producerId: remoteProducerId,
          consumer,
        }
      ]

      const track = consumer.track
      const safeId = remoteProducerId.replace(/[^a-zA-Z0-9_-]/g, '_')

      const newElement = document.createElement('div')
      newElement.setAttribute('id', `td-${safeId}`)

      if (params.kind === 'audio') {
        newElement.innerHTML = `<audio id="${safeId}" autoplay></audio>`
      } else {
        newElement.setAttribute('class', 'remoteVideo')
        newElement.innerHTML = `<video id="${safeId}" autoplay class="video"></video>`
      }

      if (videoContainerRef.current) {
        videoContainerRef.current.appendChild(newElement)
      }

      document.getElementById(safeId).srcObject = new MediaStream([track])

      socketRef.current.emit('consumer-resume', { serverConsumerId: params.serverConsumerId })
    })
  }

  return (
    <div id="video">
      <table className="mainTable">
        <tbody>
          <tr>
            <td className="localColumn">
              <video 
                ref={localVideoRef}
                id="localVideo" 
                autoPlay 
                className="video" 
                muted 
              />
            </td>
            <td className="remoteColumn">
              <div 
                ref={videoContainerRef}
                id="videoContainer"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export default App