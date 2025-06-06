import express from 'express'
import https from 'httpolyglot' 
import fs from 'fs'

import path from 'path'
const __dirname = path.resolve()
const app = express()

import { Server } from 'socket.io'
import mediasoup from 'mediasoup'

const publicDir = path.join(__dirname, 'public')
app.use(express.static(publicDir))

// Handle SPA routing - these patterns work with Express 4
app.get('/sfu/:room', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'))
})

app.get('/sfu/:room/*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'))
})

app.get('*', (req, res) => {
  res.status(404).send('Not found')
})

const options = {
key: fs.readFileSync('./ssl/key.pem', 'utf-8'),
cert: fs.readFileSync('./ssl/cert.pem', 'utf-8')
}

const httpsServer = https.createServer(options, app)
httpsServer.listen(3000, () => {
console.log('listening on port: ' + 3000)
})

const io = new Server(httpsServer)

const connections = io.of('/mediasoup')

let worker
let rooms = {}
let peers = {}
let transports = []
let producers = []
let consumers = []

const createWorker = async () =>{
	worker = await mediasoup.createWorker({
		rtcMinPort: 2000,
		rtcMaxPort: 3020
})
console.log(`worker's pid == ${worker.pid}`)

worker.on('died', error => {
	console.log('mediasoup worker has died')
	setTimeout(()=>{
		process.exit(1)
	}, 2000)
})

return worker
}

worker = createWorker()

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

connections.on('connection', async socket=>{
console.log(socket.id)
socket.emit('connection-success', {
	socketId: socket.id,
})

	const removeItems = (items, socketId, type) => {
	items.forEach(item => {
	if (item.socketId === socket.id) {
		item[type].close()
	}
	})
	items = items.filter(item => item.socketId !== socket.id)

	return items
}

socket.on('disconnect', ()=>{

	console.log('peer disconnected')

	consumers = removeItems(consumers, socket.id, 'consumer')
	producers = removeItems(producers, socket.id, 'producer')
	transports = removeItems(transports, socket.id, 'transport')

	const { roomName } = peers[socket.id]
    //deleting now the peers, and then deleting rooms
	delete peers[socket.id]

	rooms[roomName] = {
		router: rooms[roomName].router,
		peers: rooms[roomName].peers.filter(socketId => socketId !== socket.id)
	}
})

socket.on('joinRoom', async({ roomName }, callback) =>{
		const router1 = await createRoom(roomName, socket.id)

		peers[socket.id] = {
			socket,
			roomName, 
			transports: [],
			producers: [],
			consumers: [],
			peerDetails: {
				name: '',
				isAdmin: false,
			}
		}


        //getting router's rtp capa, before joinign rooom and sending to the client
		const rtpCapabilities = router1.rtpCapabilities
		callback({rtpCapabilities})
})

const createRoom = async(roomName, socketId) =>{
	let router1;
	let peers = [];
	if (rooms[roomName]){
		router1 = rooms[roomName].router;
		peers = rooms[roomName].peers || [];
	}else{
		router1 = await worker.createRouter({ mediaCodecs });
		console.log(`Created new router for room: ${roomName}`);
	}

	console.log(`Router ID: ${router1.id}, Peers: ${peers.length}`);

	rooms[roomName] = {
		router: router1,
		peers: [...peers, socketId]
	};

	return router1;
}

socket.on('createWebRtcTransport', async({ consumer }, callback) => {
	const roomName = peers[socket.id].roomName   
	const router = rooms[roomName].router

	createWebRtcTransport(router).then(
		transport => {
			callback({
				params: {
					id: transport.id,
					iceParameters: transport.iceParameters,
					iceCandidates: transport.iceCandidates,
					dtlsParameters: transport.dtlsParameters
				}
			})

			addTransport(transport, roomName, consumer)
		}, 
		error =>{
			console.log(error)
		})
})

const addTransport =  (transport, roomName, consumer) =>{
	transports = [
		...transports, 
		{socketId: socket.id, transport, roomName, consumer}
	]

	peers[socket.id] = {
		...peers[socket.id],
		transports: [
			...peers[socket.id].transports,
			transport.id
		]
	}
}

const addProducer = ( producer, roomName ) =>{
	producers = [
		...producers,
		{ socketId: socket.id,producer, roomName }
	]

	peers[socket.id] = {
		...peers[socket.id],
		producers: [
			...peers[socket.id].producers,
			producer.id
		]
	}
}

const addConsumer = (consumer, roomName) => {
	consumers = [
		...consumers,
		{ socketId: socket.id, consumer, roomName, }
	]

	peers[socket.id] = {
	...peers[socket.id],
	consumers: [
		...peers[socket.id].consumers,
		consumer.id,
	]
	}
}

socket.on('getProducers', callback => {
	const { roomName } = peers[socket.id]

	let producerList = []
	producers.forEach(producerData => {
	if (producerData.socketId !== socket.id && producerData.roomName === roomName) {
		producerList = [...producerList, producerData.producer.id]
	}
	})

	callback(producerList)
})

const informConsumers = (roomName, socketId, id) =>{
	console.log(` just joined id ${id} ${ roomName }, ${socketId}`)

	producers.forEach(producerData => {
		if (producerData.socketId !== socketId && producerData.roomName === roomName){
			const producerSocket = peers[producerData.socketId].socket
			producerSocket.emit('new-producer', { producerId: id })
		}
	})
}

const getTransport = (socketId) =>{
	const [producerTransport] = transports.filter(transport => transport.socketId === socketId && !transport.consumer)
	return producerTransport.transport
}

socket.on('transport-connect', ({ dtlsParameters}) => {
	console.log('DTLS params ....' , {dtlsParameters})
	getTransport(socket.id).connect({ dtlsParameters})
})

socket.on('transport-produce', async({ kind, rtpParameters, appData}, callback) =>{
	const producer = await getTransport(socket.id).produce({
		kind,
		rtpParameters
	})

	const { roomName } = peers[socket.id]
	addProducer( producer, roomName )
	informConsumers (roomName, socket.id, producer.id)

	console.log('producer ID: ', producer.id, producer.kind);
	
	producer.on('transportclose', ()=>{
		console.log('transport for this producer is closed');
		producer.close();
	} )

	callback({
		id: producer.id,
		producersExist: producers.length > 1 ? true : false
	});
})

socket.on('transport-recv-connect', async ({ dtlsParameters, serverConsumerTransportId }) =>{
	console.log(`dtls parameters: ${dtlsParameters}`)
		
	const consumerTransport = transports.find(transportData => (
		transportData.consumer && transportData.transport.id == serverConsumerTransportId
	)).transport

	await consumerTransport.connect({dtlsParameters})
	})

	socket.on('consume', async({ rtpCapabilities, remoteProducerId, serverConsumerTransportId }, callback) =>{
		try{
			const { roomName } = peers[socket.id];
			const router = rooms[roomName].router;

			let consumerTransport = transports.find(transportData => (
				transportData.consumer && transportData.transport.id == serverConsumerTransportId
			)).transport

			if(router.canConsume({
				producerId: remoteProducerId,
				rtpCapabilities
			})) {
				const consumer = await consumerTransport.consume({
					producerId: remoteProducerId,
					rtpCapabilities,
					paused: true 
				})
				consumer.on('transportclose', () =>{
					console.log(`transport close from consumer's side`)
				})

				consumer.on('producerclose', () =>{
					console.log(`producer of consumer closed`)
					socket.emit('producer-closed', { remoteProducerId })

					consumerTransport.close([])
					transports = transports.filter(transportData => transportData.transport.id !== consumerTransport.id)
					consumer.close()
					consumers = consumers.filter(consumerData => consumerData.consumer.id !== consumer.id)
				})
				
				addConsumer(consumer, roomName)

				const params = {
					id: consumer.id,
					producerId: remoteProducerId,
					kind: consumer.kind,
					rtpParameters: consumer.rtpParameters,
					serverConsumerId: consumer.id,
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

	socket.on('consumer-resume', async( {serverConsumerId} ) => {
		console.log('consumer resume')
		const { consumer } = consumers.find(consumerData => consumerData.consumer.id === serverConsumerId)
		await consumer.resume()
	})
})

const createWebRtcTransport = async (router) => {
	return new Promise(async(resolve, reject) => {
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

		transport.on('dtlsstatechange', (dtlsState) =>{
			if(dtlsState === 'closed'){
				transport.close()
			}
		})

		transport.on('close', () =>{
			console.log('transport closed ')
		})

		resolve(transport)	

	}catch(error){
		console.error('Error creating WebRTC transport:', error);
  		reject(error);
	}
	})
}