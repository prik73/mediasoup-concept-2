import express from 'express'
const app = express()

import https from 'httpolyglot' 
import fs from 'fs'
import path from 'path'
const __dirname = path.resolve()

import { Server } from 'socket.io'
import mediasoup from 'mediasoup'


app.get('/', (req, res) => {
  res.send('Hello from mediasoup app!')
})

app.use('/sfu',express.static(path.join(__dirname, 'public')) )


const options = {
  key: fs.readFileSync('./server/ssl/key.pem', 'utf-8'),
  cert: fs.readFileSync('./server/ssl/cert.pem', 'utf-8')
}


const httpsServer = https.createServer(options, app)
httpsServer.listen(3000, () => {
  console.log('listening on port: ' + 3000)
})

const io = new Server(httpsServer);

const peers = io.of('/mediasoup')


let worker
let router
let producerTransport
let consumerTransport
let producer
let consumer

//we have reserved ports from 2000 to 2020
const createWorker = async () =>{
	worker = await mediasoup.createWorker({
		rtcMinPort: 2000,
		rtcMaxPort: 2020
  })
  console.log(`worker's pid == ${worker.pid}`)

  worker.on('died', error => {
	console.log('mediasoup worker has died')
	setTimeout(()=>{
		proecess.exit(1), 2000
	})
  })

  return worker
}

worker = await createWorker()

const mediaCodecs = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,
    },
  },
]

peers.on('connection', async (socket)=>{
  console.log(socket.id)
  socket.emit('connection-success', {
    socketId: socket.id
  })

  socket.on('disconnect', ()=>{

	console.log('peer disconnected')
  })

  router = await worker.createRouter({ mediaCodecs })
  
  socket.on('getRtpCapabilities', (callback)=>{
	const rtpCapabilities = router.rtpCapabilities;
	console.log('rtp capabilites: ', rtpCapabilities)

	callback({rtpCapabilities})
  })

  socket.on('createWebRtcTransport', async({ sender }, callback) => {
	console.log(`is this sender's req:  ${sender}`)
	if(sender)
		producerTransport = await createWebRtcTransport(callback)
	else
		consumerTransport = await createWebRtcTransport(callback)
  })
  //first was initialised on the client side
  socket.on('transport-connect', async({ dtlsParameters}) => { //async({ transportId, dtlsParameters}, callback) => { (will use full, when making robust backend, fine for now)
	console.log('DTLS params ....' , {dtlsParameters})
	await producerTransport.connect({ dtlsParameters})
  })

  socket.on('transport-produce', async({ kind, rtpParameters, appData}, callback) =>{
	producer = await producerTransport.produce({
		kind,
		rtpParameters
	})

	console.log('producer ID: ', producer.id, producer.kind);
	

	producer.on('transportclose', ()=>{
		console.log('transport for this producer is closed');
		producer.close();
	} )

	callback({
		id: producer.id
	});

  })

  socket.on('transport-recv-connect', async ({ dtlsParameters }) =>{
	console.log(`dtls parameters: ${dtlsParameters}`)
	await consumerTransport.connect({dtlsParameters})
	})

	socket.on('consume', async({ rtpCapabilities }, callback) =>{
		try{
			if(router.canConsume({
				producerId: producer.id,
				rtpCapabilities
			})) {
				consumer = await consumerTransport.consume({
					producerId: producer.id,
          			rtpCapabilities,
//As explained in the transport.consume() documentation, it's strongly recommended 
//to create
//the server side consumer with paused: true and resume it once created in the remote endpoint.
//https://mediasoup.org/documentation/v3/communication-between-client-and-server/
					paused: true 
				})
				consumer.on('transportclose', () =>{
					console.log(`transport close from consumer's side`)
				})

				consumer.on('producerclose', () =>{
					console.log(`producer of consumer closed`)
				})

				const params = {
					id: consumer.id,
					producerId: producer.id,
					kind: consumer.kind,
					rtpParameters: consumer.rtpParameters
				}

				callback({ params })
			}
		}catch(error){
			console.log(error.message)
			callback({
				params: {
					error: error
				}
			})
		}
	})

	socket.on('consume-resume', async() => {
		console.log('consumer resume');
		await consumer.resume()
		
	})
})


const createWebRtcTransport = async (callback) => {
	try{
		const webRtcTransport_options = {
			listenIps: [{
				ip: '0.0.0.0',
				announcedIp: '127.0.0.1',
			}
			],
			enableUdp: true,
			enableTcp: true,
			preferUdp: true,
		}

		let transport = await router.createWebRtcTransport(webRtcTransport_options)
		console.log(`transport id: ${transport.id}`)


		transport.on('dtlsstatechange', dtlsState =>{
			if(dtlsState === 'closed'){
				transport.close()
			}
		})

		transport.on('close', () =>{
			console.log('transport closed ')
		})

		callback({
			params: {
				id: transport.id,
				iceParameters: transport.iceParameters,
				iceCandidates: transport.iceCandidates,
				dtlsParameters: transport.dtlsParameters
			}
		})

		return transport

	}catch(error){
		console.log(error)
		callback({
			params: {
				error: error
			}
		})
	}
}