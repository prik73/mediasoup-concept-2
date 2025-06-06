import { useEffect, useRef } from 'react'
import { Device } from 'mediasoup-client'

export default function VideoRoom({ socket, roomName }) {
  const localVideoRef = useRef(null)
  const deviceRef = useRef(null)
  const producerTransportRef = useRef(null)
  const consumed = useRef(new Set())

  // 1) Get local media and join room
  useEffect(() => {
    async function init() {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: { width: 640, height: 480 }
        })
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }
      socket.emit(
        'joinRoom',
        { roomName },
        ({ rtpCapabilities }) => {
          loadDevice(rtpCapabilities)
        }
      )
    }
    init()
  }, [socket, roomName])

  // 2) Load Mediasoup Device
  async function loadDevice(rtpCapabilities) {
    const device = new Device()
    await device.load({ routerRtpCapabilities: rtpCapabilities })
    deviceRef.current = device
    createSendTransport()
  }

  // 3) Create send transport & produce
  function createSendTransport() {
    socket.emit(
      'createWebRtcTransport',
      { consumer: false },
      ({ params }) => {
        const device = deviceRef.current
        const sendTransport =
          device.createSendTransport(params)
        producerTransportRef.current = sendTransport

        sendTransport.on(
          'connect',
          ({ dtlsParameters }, callback) => {
            socket.emit('transport-connect', {
              dtlsParameters
            })
            callback()
          }
        )

        sendTransport.on(
          'produce',
          (parameters, callback) => {
            socket.emit(
              'transport-produce',
              {
                kind: parameters.kind,
                rtpParameters: parameters.rtpParameters,
                appData: parameters.appData
              },
              ({ id }) => {
                callback({ id })
              }
            )
          }
        )

        // produce tracks
        const stream = localVideoRef.current.srcObject
        if (stream) {
          const [audioTrack] =
            stream.getAudioTracks()
          const [videoTrack] =
            stream.getVideoTracks()
          if (audioTrack)
            sendTransport.produce({ track: audioTrack })
          if (videoTrack)
            sendTransport.produce({ track: videoTrack })
        }
      }
    )
  }

  // 4) Handle new producers → consume
  useEffect(() => {
    if (!deviceRef.current) return

    socket.on('new-producer', ({ producerId }) => {
      if (consumed.current.has(producerId)) return
      consumed.current.add(producerId)
      createConsumer(producerId)
    })
  }, [socket])

  function createConsumer(remoteProducerId) {
    socket.emit(
      'createWebRtcTransport',
      { consumer: true },
      ({ params }) => {
        const device = deviceRef.current
        const recvTransport =
          device.createRecvTransport(params)

        recvTransport.on(
          'connect',
          ({ dtlsParameters }, callback) => {
            socket.emit('transport-recv-connect', {
              dtlsParameters,
              serverConsumerTransportId: params.id
            })
            callback()
          }
        )

        // ask server to consume
        socket.emit(
          'consume',
          {
            rtpCapabilities:
              device.rtpCapabilities,
            remoteProducerId,
            serverConsumerTransportId: params.id
          },
          async ({ params: consumerParams }) => {
            const consumer =
              await recvTransport.consume(
                consumerParams
              )
            const stream = new MediaStream([
              consumer.track
            ])
            // inject <video> or <audio>
            const el =
              consumer.kind === 'video'
                ? document.createElement('video')
                : document.createElement('audio')
            el.autoplay = true
            el.srcObject = stream
            if (consumer.kind === 'video')
              el.className = 'video remoteVideo'
            document
              .getElementById('videoContainer')
              .append(el)

            // resume
            socket.emit('consumer-resume', {
              serverConsumerId:
                consumerParams.serverConsumerId
            })
          }
        )
      }
    )
  }

  return (
    <div id="video">
      <table className="mainTable">
        <tbody>
          <tr>
            <td className="localColumn">
              <div className="videoWrap">
                <video
                  id="localVideo"
                  ref={localVideoRef}
                  autoPlay
                  muted
                  className="video"
                />
              </div>
            </td>
            <td className="remoteColumn">
              <div id="videoContainer" />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}