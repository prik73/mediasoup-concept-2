	import express from 'express'
	const app = express()

	import https from 'httpolyglot' 
	import fs from 'fs'
	import path, { resolve } from 'path'
	const __dirname = path.resolve()

	import { Server } from 'socket.io'
	import mediasoup from 'mediasoup'


	/*
	app.get('*', (req, res, next) => {
		const path = '/sfu/'
		if ( req.path.indexOf(path) == 0 && req.path.length > path.length) return next()
		res.send(`very much need to specify a room name in the path i.e.  'https://127.0.0.1/sfu/room'`)
	})

	app.use('/sfu/:room', (req, res, next) => {
		express.static(path.join(__dirname, 'public'))(req, res, next);
	});
	*/

	app.get('/*splat', (req, res, next) => {
		const pathPrefix = '/sfu/'
		
		if (req.path.indexOf(pathPrefix) == 0 && req.path.length > pathPrefix.length) return next()
		
		res.send('Please specify a room name in the path i.e. "https://127.0.0.1/sfu/room"')
	})

app.use('/sfu/:room', express.static(path.join(__dirname, 'public')))

app.get('/sfu/:room/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})




	const options = {
	key: fs.readFileSync('./server/ssl/key.pem', 'utf-8'),
	cert: fs.readFileSync('./server/ssl/cert.pem', 'utf-8')
	}


	const httpsServer = https.createServer(options, app)
	httpsServer.listen(3000, () => {
	console.log('listening on port: ' + 3000)
	})

	const io = new Server(httpsServer);

	// const peers = io.of('/mediasoup')
	const connections = io.of('/mediasoup') // because peers will be/ is a seperate object, that will have multiple socket ids and related data

	let worker
	let rooms = {}
	let peers = {}
	let transports = []
	let producers = []
	let consumers = []
	// let producerTransport
	// let consumerTransport

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
		//now, for returnning to client side , that if we have a producer or not
		// existsProducer: producer ? true : false
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

		//room cleanup
		rooms[roomName] = {
			router: rooms[roomName].router,
			peers: rooms[roomName].peers.filter(socketId => socketId !== socket.id)
		}
	})

	//for n to n 
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

	//creating meeting rooom or joining it, if it already exists
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


	//now no need of this
	//   socket.on('createRoom', async (callback) => {
	// 	if ( router == undefined ){
	// 		router = await worker.createRouter({ mediaCodecs })
	// 		console.log(`Router id: ${router.id}`)
	// 	}

	// 	getRtpCapabilities(callback)
	//   })

	//   const getRtpCapabilities = (callback) =>{
	// 	const rtpCapabilities = router.rtpCapabilities

	// 	callback({ rtpCapabilities })
	//   }

	
		//this is/was for version 1 
	//   socket.on('getRtpCapabilities', (callback)=>{
	// 	const rtpCapabilities = router.rtpCapabilities;
	// 	console.log('rtp capabilites: ', rtpCapabilities)

	// 	callback({rtpCapabilities})
	//   })

	socket.on('createWebRtcTransport', async({ consumer }, callback) => {
		//we'll need to get room name from peer's properties
		const roomName = peers[socket.id].roomName   

		//then getting router obj
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

				//now adding transport to Peer's properties
				addTransport(transport, roomName, consumer)
			}, 
			error =>{
				console.log(error)
			})
		
		//earlier version , we had to check whether it was sender or not
		// console.log(`is this sender's req:  ${sender}`)
		// if(sender)
		// 	producerTransport = await createWebRtcTransport(callback)
		// else
		// 	consumerTransport = await createWebRtcTransport(callback)
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
		// adding the consumer to the consumers list
		consumers = [
			...consumers,
			{ socketId: socket.id, consumer, roomName, }
		]

		// adding the consumer id to the peers list
		peers[socket.id] = {
		...peers[socket.id],
		consumers: [
			...peers[socket.id].consumers,
			consumer.id,
		]
		}
	}

	//creating getProducers-
	// if you see, at client side, createSend transport( at the very end, calls "getProducers", getProducers function gives
	// a socket call of 'getProducers, so here it is)
	socket.on('getProducers', callback => {
		//returning all producer transports
		const { roomName } = peers[socket.id]


		let producerList = []
		producers.forEach(producerData => {
		if (producerData.socketId !== socket.id && producerData.roomName === roomName) {
			producerList = [...producerList, producerData.producer.id]
		}
		})

		// return the producer list back to the client
		callback(producerList)
	})


	const informConsumers = (roomName, socketId, id) =>{
		//new producer joined, let other be informed that
		//they can consume 
		console.log(` just joined id ${id} ${ roomName }, ${socketId}`)

		producers.forEach(producerData => {
			if (producerData.socketId !== socketId && producerData.roomName === roomName){
				const producerSocket = peers[producerData.socketId].socket

				//using socket to send producer id to producer
				//basically new producer is sending it's "id" to all other folks
				producerSocket.emit('new-producer', { producerId: id })
			}
		})
	}

	const getTransport = (socketId) =>{
		//checking if the socket id in tansportID is same as socketId 
		const [producerTransport] = transports.filter(transport => transport.socketId === socketId && !transport.consumer)
		return producerTransport.transport
	}
	//first was initialised on the client side
	socket.on('transport-connect', ({ dtlsParameters}) => { //async({ transportId, dtlsParameters}, callback) => { (will use full, when making robust backend, fine for now)
		console.log('DTLS params ....' , {dtlsParameters})
		// await producerTransport.connect({ dtlsParameters})
		getTransport(socket.id).connect({ dtlsParameters})
	})

	socket.on('transport-produce', async({ kind, rtpParameters, appData}, callback) =>{
		const producer = await getTransport(socket.id).produce({
			kind,
			rtpParameters
		})

		//adding producers to the producers array waaaali list
		const { roomName } = peers[socket.id]

		addProducer( producer, roomName )

		//now we'll have to inform other clients, that someone joined as producer, so they can
		// consume their media

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

				// checking if the router can consume the specified producer
				if(router.canConsume({
					producerId: remoteProducerId,
					rtpCapabilities
				})) {
					const consumer = await consumerTransport.consume({
						producerId: remoteProducerId,
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
			//need to get consumer object from the consumer list
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

			// callback({
			// 	params: {
			// 		id: transport.id,
			// 		iceParameters: transport.iceParameters,                   // now doind outside of this
			// 		iceCandidates: transport.iceCandidates,
			// 		dtlsParameters: transport.dtlsParameters
			// 	}
			// })

			resolve(transport)	

		}catch(error){
			console.error('Error creating WebRTC transport:', error);
      		reject(error);
		}
		})
		
	}