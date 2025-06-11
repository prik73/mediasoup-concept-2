import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ffmpegProcesses = new Map()
const streamingSessions = new Map()

export const startRoomStream = async (mediasoupService, roomName) => {
  try {
    console.log(`🎬 Starting HLS stream for room: ${roomName}`)
    console.log(`📍 Current __dirname: ${__dirname}`)
    
    // Debug: Check current sessions
    console.log(`🔍 Current active sessions: [${Array.from(streamingSessions.keys()).join(', ')}]`)
    console.log(`🔍 Checking if room "${roomName}" already exists: ${streamingSessions.has(roomName)}`)
    
    // Check if already streaming
    if (streamingSessions.has(roomName)) {
      console.log(`⚠️ Stream already active for room: ${roomName}`)
      console.log(`🧹 Force cleaning up existing session first...`)
      await cleanupStreamData(roomName)
      // Continue with new stream setup after cleanup
    }

    const room = mediasoupService.rooms[roomName]
    if (!room || !room.router) {
      throw new Error(`Room ${roomName} not found or has no router`)
    }

    // Find producers
    const producers = mediasoupService.producers.filter(p => p.roomName === roomName)
    if (producers.length === 0) {
      throw new Error(`No producers found in room ${roomName}`)
    }

    let videoProducer = null
    let audioProducer = null

    producers.forEach(({ producer }) => {
      if (producer.kind === 'video' && !videoProducer) {
        videoProducer = producer
        console.log(`📹 Found video producer: ${videoProducer.id}`)
      } else if (producer.kind === 'audio' && !audioProducer) {
        audioProducer = producer
        console.log(`🎵 Found audio producer: ${audioProducer.id}`)
      }
    })

    if (!videoProducer) {
      throw new Error('No video producer found')
    }

    // Create Plain RTP transports with comedia=false (mediasoup sends directly to FFmpeg)
    const transportOptions = {
      listenIp: {
        ip: '127.0.0.1',
        announcedIp: null
      },
      rtcpMux: false,
      comedia: false  // CHANGED: mediasoup will actively send to FFmpeg
    }

    console.log(`🚛 Creating video transport...`)
    const videoTransport = await room.router.createPlainTransport(transportOptions)
    const videoPort = videoTransport.tuple.localPort
    console.log(`📡 Video transport created on port ${videoPort}`)

    let audioTransport = null
    let audioPort = null
    
    if (audioProducer) {
      console.log(`🚛 Creating audio transport...`)
      audioTransport = await room.router.createPlainTransport(transportOptions)
      audioPort = audioTransport.tuple.localPort
      console.log(`📡 Audio transport created on port ${audioPort}`)
    }

    // Create consumers - START PAUSED
    console.log(`🎥 Creating video consumer...`)
    const videoConsumer = await videoTransport.consume({
      producerId: videoProducer.id,
      rtpCapabilities: room.router.rtpCapabilities,
      paused: true  // Start paused - will resume after FFmpeg connects
    })
    console.log(`✅ Video consumer created: ${videoConsumer.id} (paused)`)

    let audioConsumer = null
    if (audioProducer && audioTransport) {
      console.log(`🔊 Creating audio consumer...`)
      audioConsumer = await audioTransport.consume({
        producerId: audioProducer.id,
        rtpCapabilities: room.router.rtpCapabilities,
        paused: true  // Start paused - will resume after FFmpeg connects
      })
      console.log(`✅ Audio consumer created: ${audioConsumer.id} (paused)`)
    }

    // Connect transports to tell mediasoup where to send RTP and RTCP
    // With comedia=false, mediasoup will actively send to these ports
    const ffmpegVideoPort = videoPort + 1000
    const ffmpegVideoRtcpPort = ffmpegVideoPort + 1  // RTCP uses next port
    await videoTransport.connect({
      ip: '127.0.0.1',
      port: ffmpegVideoPort,
      rtcpPort: ffmpegVideoRtcpPort  // Required when rtcpMux is disabled
    })
    console.log(`🔗 Video transport will send RTP to FFmpeg port ${ffmpegVideoPort} (RTCP: ${ffmpegVideoRtcpPort})`)

    let ffmpegAudioPort = null
    let ffmpegAudioRtcpPort = null
    if (audioTransport) {
      ffmpegAudioPort = audioPort + 1000
      ffmpegAudioRtcpPort = ffmpegAudioPort + 1  // RTCP uses next port
      await audioTransport.connect({
        ip: '127.0.0.1',
        port: ffmpegAudioPort,
        rtcpPort: ffmpegAudioRtcpPort  // Required when rtcpMux is disabled
      })
      console.log(`🔗 Audio transport will send RTP to FFmpeg port ${ffmpegAudioPort} (RTCP: ${ffmpegAudioRtcpPort})`)
    }

    // Ensure HLS output directory exists
    const hlsDir = path.join(__dirname, '../public/hls', roomName)  // FIXED: ../public instead of ../../public
    console.log(`📁 HLS directory: ${hlsDir}`)
    if (!fs.existsSync(hlsDir)) {
      fs.mkdirSync(hlsDir, { recursive: true })
      console.log(`📁 Created HLS directory: ${hlsDir}`)
    } else {
      console.log(`📁 HLS directory already exists`)
    }

    console.log(`🔍 About to create SDP file...`)
    
    // Get RTP parameters to create SDP file
    const videoRtpParameters = videoConsumer.rtpParameters
    const audioRtpParameters = audioConsumer ? audioConsumer.rtpParameters : null

    console.log(`📋 Video RTP Parameters:`)
    console.log(`   Codec: ${videoRtpParameters.codecs[0].mimeType}`)
    console.log(`   Payload Type: ${videoRtpParameters.codecs[0].payloadType}`)
    console.log(`   Clock Rate: ${videoRtpParameters.codecs[0].clockRate}`)

    if (audioRtpParameters) {
      console.log(`📋 Audio RTP Parameters:`)
      console.log(`   Codec: ${audioRtpParameters.codecs[0].mimeType}`)
      console.log(`   Payload Type: ${audioRtpParameters.codecs[0].payloadType}`)
      console.log(`   Clock Rate: ${audioRtpParameters.codecs[0].clockRate}`)
      console.log(`   Channels: ${audioRtpParameters.codecs[0].channels}`)
    }

    console.log(`🔍 Creating SDP content with ports: Video=${ffmpegVideoPort}, Audio=${ffmpegAudioPort}`)
    
    // Create SDP file for FFmpeg (it needs this to understand payload types)
    const sdp = generateSDP(
      videoRtpParameters,
      audioRtpParameters,
      ffmpegVideoPort,
      ffmpegAudioPort
    )

    console.log(`🔍 SDP content generated, length: ${sdp.length} characters`)

    // Save SDP file
    const sdpPath = path.join(__dirname, '../temp', `${roomName}.sdp`)
    console.log(`🔍 Attempting to save SDP to: ${sdpPath}`)
    
    // Ensure temp directory exists
    const tempDir = path.dirname(sdpPath)
    console.log(`🔍 Temp directory: ${tempDir}`)
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
      console.log(`📁 Created temp directory: ${tempDir}`)
    } else {
      console.log(`📁 Temp directory already exists`)
    }
    
    try {
      fs.writeFileSync(sdpPath, sdp)
      console.log(`💾 SDP file saved successfully to: ${sdpPath}`)
      
      // Verify file was created
      if (fs.existsSync(sdpPath)) {
        const fileSize = fs.statSync(sdpPath).size
        console.log(`✅ SDP file verified: ${fileSize} bytes`)
      } else {
        console.error(`❌ SDP file was not created despite no error`)
      }
      
      console.log(`📄 SDP content:`)
      console.log(sdp)
    } catch (error) {
      console.error(`❌ Failed to write SDP file:`, error)
      throw error
    }

    // FFmpeg command - NOW we can use sdpPath since it's defined above
    const ffmpegArgs = [
      '-y', // Overwrite output files
      '-protocol_whitelist', 'file,rtp,udp',
      '-i', sdpPath  // Use SDP file - now properly defined
    ]

    ffmpegArgs.push(
      // Video encoding
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-profile:v', 'baseline',
      '-level', '3.0',
      '-b:v', '1000k',
      '-maxrate', '1200k',
      '-bufsize', '2000k',
      '-pix_fmt', 'yuv420p',
      '-g', '30',
      '-keyint_min', '30',
      '-sc_threshold', '0',
      '-avoid_negative_ts', 'make_zero'
    )

    if (audioConsumer) {
      ffmpegArgs.push(
        // Audio encoding
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '48000',
        '-ac', '2'
      )
    } else {
      ffmpegArgs.push('-an') // No audio
    }

    ffmpegArgs.push(
      // HLS settings
      '-f', 'hls',
      '-hls_time', '2',
      '-hls_list_size', '10',
      '-hls_flags', 'delete_segments+independent_segments',
      '-hls_segment_type', 'mpegts',
      '-hls_segment_filename', path.join(hlsDir, 'segment_%03d.ts'),
      path.join(hlsDir, 'index.m3u8')
    )

    console.log('🎬 Starting FFmpeg...')
    console.log(`Command: ffmpeg ${ffmpegArgs.join(' ')}`)

    const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let streamStarted = false
    let ffmpegReady = false
    let resumeTimeout = null

    ffmpeg.stdout.on('data', (data) => {
      const message = data.toString()
      console.log(`FFmpeg stdout: ${message.trim()}`)
    })

    // Resume consumers after FFmpeg starts (reduced delay since we're using comedia=false)
    resumeTimeout = setTimeout(async () => {
      if (!ffmpegReady) {
        console.log(`🎯 Auto-resuming consumers after 2 seconds...`)
        ffmpegReady = true
        
        try {
          // Check if consumer is still valid before resuming
          if (videoConsumer && !videoConsumer.closed) {
            console.log(`▶️ Resuming video consumer...`)
            await videoConsumer.resume()
            console.log(`✅ Video consumer resumed - RTP data should start flowing`)
          } else {
            console.log(`⚠️ Video consumer is closed, skipping resume`)
          }
          
          if (audioConsumer && !audioConsumer.closed) {
            console.log(`▶️ Resuming audio consumer...`)
            await audioConsumer.resume()
            console.log(`✅ Audio consumer resumed - RTP data should start flowing`)
          } else if (audioConsumer) {
            console.log(`⚠️ Audio consumer is closed, skipping resume`)
          }
        } catch (error) {
          console.error(`❌ Error resuming consumers:`, error)
        }
      }
    }, 2000) // Resume after 2 seconds (reduced from 3)

    ffmpeg.stderr.on('data', (data) => {
      const message = data.toString()
      
      if (message.includes('frame=') && !streamStarted) {
        console.log(`🎉 HLS stream started for room ${roomName}`)
        streamStarted = true
      }
      
      // Log ALL FFmpeg messages for debugging
      console.log(`FFmpeg: ${message.trim()}`)
    })

    // Add timeout to check if FFmpeg is stuck
    setTimeout(() => {
      if (!streamStarted) {
        console.log(`⚠️ FFmpeg hasn't started processing after 10 seconds`)
        console.log(`🔍 Checking if FFmpeg process is still running...`)
        if (!ffmpeg.killed) {
          console.log(`✅ FFmpeg process is still alive, but not processing data`)
          console.log(`💡 This suggests RTP data isn't flowing from mediasoup to FFmpeg`)
        }
      }
    }, 10000)

    ffmpeg.on('error', (error) => {
      console.error('❌ FFmpeg spawn error:', error)
      stopRoomStream(roomName)
    })

    ffmpeg.on('close', (code) => {
      console.log(`📺 FFmpeg process exited with code ${code}`)
      if (code !== 0) {
        console.error(`❌ FFmpeg failed with exit code ${code}`)
      }
      stopRoomStream(roomName)
    })

    // Store session data
    streamingSessions.set(roomName, {
      ffmpeg,
      sdpPath,
      videoTransport,
      audioTransport,
      videoConsumer,
      audioConsumer,
      videoPort,
      audioPort,
      resumeTimeout // Store timeout so we can clear it during cleanup
    })

    ffmpegProcesses.set(roomName, ffmpeg)

    console.log(`🎉 HLS stream setup complete for room ${roomName}`)
    console.log(`📊 RTP Flow: Mediasoup → FFmpeg`)
    console.log(`📊 Video: Port ${videoPort} → Port ${ffmpegVideoPort} (RTCP: ${ffmpegVideoRtcpPort})`)
    console.log(`📊 Audio: Port ${audioPort || 'none'} → Port ${ffmpegAudioPort || 'none'}${ffmpegAudioRtcpPort ? ` (RTCP: ${ffmpegAudioRtcpPort})` : ''}`)
    console.log(`⏳ Consumers paused, will resume in 2 seconds...`)
    
    return true

  } catch (error) {
    console.error(`❌ Failed to start stream for ${roomName}:`, error)
    console.error(`Stack trace:`, error.stack)
    
    // Cleanup on error
    await cleanupStreamData(roomName)
    return false
  }
}

export const stopRoomStream = (roomName) => {
  console.log(`🛑 Stopping HLS stream for room: ${roomName}`)
  cleanupStreamData(roomName)
}

const cleanupStreamData = async (roomName) => {
  const session = streamingSessions.get(roomName)
  if (!session) return

  // Clear resume timeout to prevent race conditions
  if (session.resumeTimeout) {
    clearTimeout(session.resumeTimeout)
    console.log(`⏰ Cleared resume timeout for ${roomName}`)
  }

  // Kill FFmpeg
  if (session.ffmpeg && !session.ffmpeg.killed) {
    console.log(`🔪 Killing FFmpeg process for ${roomName}`)
    session.ffmpeg.kill('SIGTERM')
    
    // Force kill after 3 seconds
    setTimeout(() => {
      if (session.ffmpeg && !session.ffmpeg.killed) {
        console.log(`🔪 Force killing FFmpeg for ${roomName}`)
        session.ffmpeg.kill('SIGKILL')
      }
    }, 3000)
  }

  // Close consumers and transports
  try {
    if (session.videoConsumer) {
      console.log(`🗑️ Closing video consumer for ${roomName}`)
      session.videoConsumer.close()
    }
    if (session.audioConsumer) {
      console.log(`🗑️ Closing audio consumer for ${roomName}`)
      session.audioConsumer.close()
    }
    if (session.videoTransport) {
      console.log(`🗑️ Closing video transport for ${roomName}`)
      session.videoTransport.close()
    }
    if (session.audioTransport) {
      console.log(`🗑️ Closing audio transport for ${roomName}`)
      session.audioTransport.close()
    }
  } catch (e) {
    console.error('Error closing mediasoup resources:', e.message)
  }

  // Remove SDP file
  if (session.sdpPath && fs.existsSync(session.sdpPath)) {
    try {
      fs.unlinkSync(session.sdpPath)
      console.log(`🗑️ Removed SDP file: ${session.sdpPath}`)
    } catch (e) {
      console.error('Error removing SDP file:', e.message)
    }
  }

  // Clean up HLS files
  const hlsDir = path.join(__dirname, '../public/hls', roomName)  // FIXED: ../public instead of ../../public
  if (fs.existsSync(hlsDir)) {
    try {
      fs.rmSync(hlsDir, { recursive: true, force: true })
      console.log(`🗑️ Cleaned up HLS directory: ${hlsDir}`)
    } catch (e) {
      console.error('Error cleaning HLS directory:', e.message)
    }
  }

  streamingSessions.delete(roomName)
  ffmpegProcesses.delete(roomName)
}

export const isRoomStreaming = (roomName) => {
  return streamingSessions.has(roomName)
}

export const getAllActiveStreams = () => {
  return Array.from(streamingSessions.keys())
}

// Generate SDP file for FFmpeg
function generateSDP(videoRtpParameters, audioRtpParameters, videoPort, audioPort) {
  const videoCodec = videoRtpParameters.codecs[0]
  const videoPayloadType = videoCodec.payloadType

  let sdp = `v=0\r\n`
  sdp += `o=- 0 0 IN IP4 127.0.0.1\r\n`
  sdp += `s=FFmpeg\r\n`
  sdp += `c=IN IP4 127.0.0.1\r\n`
  sdp += `t=0 0\r\n`

  // Video media line
  sdp += `m=video ${videoPort} RTP/AVP ${videoPayloadType}\r\n`
  sdp += `a=rtpmap:${videoPayloadType} ${videoCodec.mimeType.split('/')[1].toUpperCase()}/90000\r\n`
  
  // Add video codec parameters if any
  if (videoCodec.parameters) {
    const fmtpParams = Object.entries(videoCodec.parameters)
      .map(([key, value]) => `${key}=${value}`)
      .join(';')
    if (fmtpParams) {
      sdp += `a=fmtp:${videoPayloadType} ${fmtpParams}\r\n`
    }
  }

  sdp += `a=sendonly\r\n`

  // Audio media line
  if (audioRtpParameters && audioPort) {
    const audioCodec = audioRtpParameters.codecs[0]
    const audioPayloadType = audioCodec.payloadType
    
    sdp += `m=audio ${audioPort} RTP/AVP ${audioPayloadType}\r\n`
    sdp += `a=rtpmap:${audioPayloadType} ${audioCodec.mimeType.split('/')[1].toUpperCase()}/${audioCodec.clockRate}`
    
    if (audioCodec.channels > 1) {
      sdp += `/${audioCodec.channels}`
    }
    sdp += `\r\n`
    
    // Add audio codec parameters if any
    if (audioCodec.parameters) {
      const fmtpParams = Object.entries(audioCodec.parameters)
        .map(([key, value]) => `${key}=${value}`)
        .join(';')
      if (fmtpParams) {
        sdp += `a=fmtp:${audioPayloadType} ${fmtpParams}\r\n`
      }
    }
    
    sdp += `a=sendonly\r\n`
  }

  return sdp
}

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('🧹 Cleaning up all streams on SIGINT...')
  streamingSessions.forEach((_, roomName) => stopRoomStream(roomName))
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('🧹 Cleaning up all streams on SIGTERM...')
  streamingSessions.forEach((_, roomName) => stopRoomStream(roomName))
  process.exit(0)
})