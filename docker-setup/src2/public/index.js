const io = require('socket.io-client')
const mediasoupClient = require("mediasoup-client")

const socket =  io("/mediasoup")

socket.on('connection-success', ( data, existsProducer ) => {
    console.log('socket id : ' + data.socketId, existsProducer) 
})

let device
let rtpCapabilities
let producer
let consumer
let consumerTransport
let producerTransport
let isProducer = false

let params = {
    //mediasoups' params
    encoding: [
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


const streamSuccess = (stream)=>{
    localVideo.srcObject = stream
    const track = stream.getVideoTracks()[0]

    //once we get video tracks from the stream, we add to the params object
    params={
        track,
        ...params
    }

    goConnect(true)
}

const stopVideoStream = () => {
    const stream = localVideo.srcObject
    if (stream) {
        stream.getTracks().forEach(track => track.stop())
        localVideo.srcObject = null
        console.log('Local video stopped')
    }
}


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
            audio: false,
            video: {
                width: { min: 640, max: 1920 },
                height: { min: 400, max: 1080 }
            }
        });

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
        goCreateTransport()


    }catch(error){
        console.log(error)
        if(error.name === "unsupported error")
            console.warn("browser not supported")
    }
}


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

const createSendTransport = ()  =>{
    // doc -> https://mediasoup.org/documentation/v3/communication-between-client-and-server/
    socket.emit('createWebRtcTransport', { sender: true }, ({ params }) =>{
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
                    dtlsParameters: dtlsParameters,
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
                    transportId: producerTransport.id,
                    kind: parameters.kind,
                    rtpParameters: parameters.rtpParameters,
                    appData: parameters.appData
                }, ({ id }) => {
                    callback({ id })
                })
            }catch(error){ 
                errback(error)
            }
        })

        connectSendTransport()
    })
}
const connectSendTransport = async () =>{
        //when we do .produce, here line 118 gets triggered, then from there we emit transport connect to the server
        producer = await producerTransport.produce(params)

        producer.on('trackended', () => {
            console.log('trackended'); 
        })

        producer.on('transportclose', ()=>{
             console.log('transport ended')
        })

}


const createRecvTransport = async ()=>{
    await socket.emit('createWebRtcTransport', {sender: false}, ({ params }) =>{
        if(params.error){
            console.log(params.error)
            return
        }
        console.log(params)

        //now creating/below code is for creating of consumer transport aka receiver transport
        consumerTransport = device.createRecvTransport(params)
        consumerTransport.on('connect', async ({ dtlsParameters }, callback, errback)=>{
            try{
                //signalling local dtls parameters to the server side transport
                await socket.emit('transport-recv-connect', {
                    // transportId: consumerTransport.id,
                    dtlsParameters
                })

                //telling the transport that the params were transmitted by giving callvack
                callback()

            }catch(error){

                //telling the transport that , there is something fisshy , also note to self, to learn callbacks in deep
                callback(error)
            }
        })

        connectRecvTransport()
    })
}

const connectRecvTransport = async () =>{
    await socket.emit('consume', {
        rtpCapabilities: device.rtpCapabilities,

        //to note, this async thingy is a callback, obv :)
    },async({ params }) =>{
        if(params.error){
            console.log('cannot consume');
            return
        }
        console.log(params);
        consumer = await consumerTransport.consume({
            id: params.id,
            producerId: params.producerId,
            kind: params.kind,
            rtpParameters: params.rtpParameters
        })

        const { track } = consumer
        remoteVideo.srcObject = new MediaStream([track])

        socket.emit('consume-resume')
    })
}

btnLocalVideo.addEventListener('click', getLocalStream)
btnRecvSendTransport.addEventListener('click', Consume)
// btnStopVideo.addEventListener('click', stopVideoStream);
// btnRtpCapabilities.addEventListener('click', getRtpCapabilities)
// btnDevice.addEventListener('click', createDevice)
// btnCreateSendTransport.addEventListener('click', createSendTransport)
// btnConnectSendTransport.addEventListener('click', connectSendTransport)
// btnConnectRecvTransport.addEventListener('click', connectRecvTransport)