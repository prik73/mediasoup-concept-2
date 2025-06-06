const io = require('socket.io-client')
const mediasoupClient = require("mediasoup-client")

const roomName = window.location.pathname.split('/')[2]

const socket =  io("/mediasoup")

socket.on('connection-success', ({ socketId }) => {
  console.log(socketId)
  getLocalStream()
})

let device
let rtpCapabilities
let producerTransport
let consumerTransports = []
let audioProducer
let videoProducer
let producer
let consumer

let isProducer = false

let params = {
    //mediasoups' params
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

let audioParams;
let videoParams = { params };
let consumingTransports = [];


const streamSuccess = (stream) => {
  console.log('Stream success:', stream);

  // Ensure audio and video tracks exist
  const audioTrack = stream.getAudioTracks()[0];
  const videoTrack = stream.getVideoTracks()[0];

  if (!audioTrack) {
    console.error('No audio track found in the stream');
  }

  if (!videoTrack) {
    console.error('No video track found in the stream');
  }

  // Assign tracks to params
  audioParams = { track: audioTrack, ...audioParams };
  videoParams = { track: videoTrack, ...videoParams };

  // Set the local video element's source
  localVideo.srcObject = stream;

  // Join the room
  joinRoom();
};

const joinRoom = () =>{
    //emitting event to server side
    socket.emit('joinRoom', { roomName }, (data) =>{
          console.log(`router rtpCapabilities: ${ data.rtpCapabilities }`)
  rtpCapabilities = data.rtpCapabilities
  createDevice().then(() => {
    getProducers(); 
    })
})}

const stopVideoStream = () => {
  const stream = localVideo.srcObject;
  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
    localVideo.srcObject = null;
    console.log('Local video stopped');
  }

  if (producerTransport) {
    producerTransport.close();
    console.log('Producer transport closed');
  }
};

// const getLocalStream = () =>{ is older/depricated style
//     navigator.getUserMedia({
//         audio: false,
//         video: {
//             width: {
//                 min: 640,
//                 max: 1920
//             },
//             height: {
//                 min: 400,
//                 max: 1080
//             }
//         }
//     }, streamSuccess, error =>{
//         console.log(error.message)
//     })
// }
const getLocalStream = async () => {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: {
                width: { min: 640, max: 1920 },
                height: { min: 400, max: 1080 }
            }
        });
        console.log('Local stream obtained:', stream);

        streamSuccess(stream); // Your existing handler
    } catch (error) {
        console.error('getUserMedia error:', error);
    }
};

const Consume = () =>{

    goConnect(false)
}


const goConnect = (producerOrConsumer) =>{
    isProducer = producerOrConsumer
    
    device === undefined ? getRtpCapabilities() : goCreateTransport()
}

const goCreateTransport = ()=>{
    isProducer ? createSendTransport(): createRecvTransport()
} 



//this device is an endpoint, connecting to a router, on the server side
//  to  send and receive media stuff
const createDevice = async ()=>{
    try{
        device = new mediasoupClient.Device()

        await device.load({
            routerRtpCapabilities: rtpCapabilities
        })

        console.log(`device's RTP capabilities`, rtpCapabilities)

        //once all the devices are loaded, we do goCreateing trans
        // goCreateTransport()
        createSendTransport() // because everyone joining will be a producer    


    }catch(error){
        console.log(error)
        if(error.name === "unsupported error")
            console.warn("browser not supported")
    }
}

const createSendTransport = ()  =>{
    // doc -> https://mediasoup.org/documentation/v3/communication-between-client-and-server/
    socket.emit('createWebRtcTransport', { consumer: false }, ({ params }) =>{
        if(params.error){
            console.log(params.error)
            return
        }
        console.log(params)

        producerTransport = device.createSendTransport(params)


        producerTransport.on('connect', async({ dtlsParameters }, callback, errback) =>{
            try{
                //signaling local DTLS parameters to the server side transport
                await socket.emit('transport-connect', {
                    // transportId: producerTransport.id, (needed for robust backend, not now,(as we are just making demo))
                    dtlsParameters
                })
                //telling transport that the parameters were transmitted
                callback()

            }catch(error){
                errback 
            }
        })

        producerTransport.on('produce', async(parameters, callback, errback )=>{
            console.log(parameters)

            try{
                //telling server to create a producer, with 
                //following  parameters and produce
                //and expect back a server side producer id
                await socket.emit('transport-produce', {
                    kind: parameters.kind,
                    rtpParameters: parameters.rtpParameters,
                    appData: parameters.appData
                }, ({ id, producersExists }) => {
                    callback({ id })

                    //if producers exists , then join room
                    if(producersExists) getProducers()  
                })
            }catch(error){ 
                errback(error)
            }
        })

        connectSendTransport()
    })
}

const connectSendTransport = async () => {
  audioProducer = await producerTransport.produce(audioParams);
  videoProducer = await producerTransport.produce(videoParams);

  audioProducer.on('trackended', () => {
    console.log('Audio track ended');
  });

  audioProducer.on('transportclose', () => {
    console.log('Audio transport closed');
  });

  videoProducer.on('trackended', () => {
    console.log('Video track ended');
  });

  videoProducer.on('transportclose', () => {
    console.log('Video transport closed');
  });
};

//earlier createRecvTransport
const signalNewConsumerTransport = async (remoteProducerId)=>{

     //check if we are already consuming the remoteProducerId
    if (consumingTransports.includes(remoteProducerId)) return;
    consumingTransports.push(remoteProducerId);


    await socket.emit('createWebRtcTransport', { consumer: true }, ({ params }) =>{
        if(params.error){
            console.log(params.error)
            return
        }
        console.log(`Params... ${params}`)


        let consumerTransport
        try{             //now creating/below code is for creating of consumer transport aka receiver transport
            consumerTransport = device.createRecvTransport(params)
        }catch(error){
            console.log(error)
      return
        }
       
        consumerTransport.on('connect', async ({ dtlsParameters }, callback, errback)=>{
            try{
                //signalling local dtls parameters to the server side transport
                await socket.emit('transport-recv-connect', {
                    // transportId: consumerTransport.id,
                    dtlsParameters,
                    serverConsumerTransportId: params.id,
                })

                //telling the transport that the params were transmitted by giving callvack
                callback()

            }catch(error){

                //telling the transport that , there is something fisshy , also note to self, to learn callbacks in deep
                errback(error)
            }
        })

        connectRecvTransport(consumerTransport, remoteProducerId, params.id)
    })
}

socket.on('new-producer', ({ producerId }) => signalNewConsumerTransport(producerId))

const getProducers = () =>{
    socket.emit('getProducers', producerIds =>{
        //for each one of the producers create a consumer
        console.log(`producer id ${producerIds}`)

        producerIds.forEach(signalNewConsumerTransport)

        // or this below( both does the same thingy)
        //producerIds.forEach(id => signalNewConsumerTransport(id))
    })
}

const connectRecvTransport = async (consumerTransport, remoteProducerId, serverConsumerTransportId) =>{
    await socket.emit('consume', {
        rtpCapabilities: device.rtpCapabilities,
        remoteProducerId, 
        serverConsumerTransportId

        //to note, this async thingy is a callback, obv :)
    },async({ params }) =>{
        if(params.error){
            console.log('cannot consume');
            return
        }
        console.log(`Consumer Params ${params}`)

        const consumer = await consumerTransport.consume({
            id: params.id,
            producerId: params.producerId,
            kind: params.kind,
            rtpParameters: params.rtpParameters
        })

        consumerTransports   = [
            ...consumerTransports,
            {
                consumerTransport,
                serverConsumerTransportId: params.id,
                producerId: remoteProducerId,
                consumer, //this is consumer object
            }            
        ]
//---------------------------------------------------------------------------------------------//
//                now we we'll create a new, brandnew div for the new video element            //
//---------------------------------------------------------------------------------------------//


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

videoContainer.appendChild(newElement)


document.getElementById(safeId).srcObject = new MediaStream([track])

        // socket.emit('consume-resume') -> this was from 1 to t connection (we'll need to let server know which consumer id to resume)
        socket.emit('consumer-resume', {serverConsumerId: params.serverConsumerId })
    })
}

socket.on('producer-closed', ({ remoteProducerId }) => {
    const ProducerToClose = consumerTransports.find(transportData => 
        transportData.producerId === remoteProducerId
    )

    if (ProducerToClose) {
        ProducerToClose.consumerTransport.close()
        ProducerToClose.consumer.close()

        // Remove from array
        consumerTransports = consumerTransports.filter(transportData => 
            transportData.producerId !== remoteProducerId
        )

        // Remove video element
        const videoElement = document.getElementById(`td-${remoteProducerId}`)
        if (videoElement) {
            videoContainer.removeChild(videoElement)
        }
    }
})


//now rtp capabilities
const getRtpCapabilities = () =>{
    //make request to the server for rtp capabilities

    socket.emit('createRoom', (data)=>{
        console.log(`router RTP capabilities... ${data.rtpCapabilities}`)

        rtpCapabilities = data.rtpCapabilities

        //once we have rtp capa
        createDevice()
        //once device os created
        // -> next step-> client side transport
        //            -> but we'll have to choose , send or receive  transport
    })
}










// btnLocalVideo.addEventListener('click', getLocalStream)
// btnRecvSendTransport.addEventListener('click', Consume)
// btnStopVideo.addEventListener('click', stopVideoStream);

// btnRtpCapabilities.addEventListener('click', getRtpCapabilities)
// btnDevice.addEventListener('click', createDevice)
// btnCreateSendTransport.addEventListener('click', createSendTransport)
// btnConnectSendTransport.addEventListener('click', connectSendTransport)
// btnConnectRecvTransport.addEventListener('click', connectRecvTransport)  

