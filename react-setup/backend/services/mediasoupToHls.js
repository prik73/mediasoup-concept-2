import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ffmpegProcesses = new Map()
const streamingSessions = new Map()

// Configuration for FFmpeg logging
const FFMPEG_LOG_CONFIG = {
  // Option 1: Suppress all FFmpeg logs
  SILENT: 'silent',
  
  // Option 2: Only important logs
  MINIMAL: 'minimal', 
  
  // Option 3: Save to file
  FILE: 'file',
  
  // Option 4: Show all (current behavior)
  VERBOSE: 'verbose'
}

// Choose your preferred option here:
const CURRENT_LOG_MODE = FFMPEG_LOG_CONFIG.MINIMAL  // Change this as needed

export const startRoomStream = async (mediasoupService, roomName) => {
  try {
    console.log(`🎬 Starting multi-participant HLS stream for room: ${roomName}`)
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

    // Find ALL producers (not just first ones)
    const producers = mediasoupService.producers.filter(p => p.roomName === roomName)
    if (producers.length === 0) {
      throw new Error(`No producers found in room ${roomName}`)
    }

    console.log(`👥 Found ${producers.length} producers in room ${roomName}`)

    // Separate video and audio producers
    const videoProducers = []
    const audioProducers = []

    producers.forEach(({ producer }) => {
      if (producer.kind === 'video') {
        videoProducers.push(producer)
        console.log(`📹 Found video producer: ${producer.id}`)
      } else if (producer.kind === 'audio') {
        audioProducers.push(producer)
        console.log(`🎵 Found audio producer: ${producer.id}`)
      }
    })

    if (videoProducers.length === 0) {
      throw new Error('No video producers found')
    }

    console.log(`👥 Will compose ${videoProducers.length} video streams and mix ${audioProducers.length} audio streams`)

    // Create Plain RTP transports for each producer
    const videoTransports = []
    const audioTransports = []
    const videoConsumers = []
    const audioConsumers = []
    const videoPorts = []
    const audioPorts = []

    // Create transports for video producers
    for (let i = 0; i < videoProducers.length; i++) {
      const producer = videoProducers[i]
      console.log(`🚛 Creating video transport ${i + 1}/${videoProducers.length}...`)
      
      const transport = await room.router.createPlainTransport({
        listenIp: { ip: '127.0.0.1', announcedIp: null },
        rtcpMux: false,
        comedia: false
      })
      
      const port = transport.tuple.localPort
      videoPorts.push(port)
      videoTransports.push(transport)
      
      console.log(`📡 Video transport ${i + 1} created on port ${port}`)
      
      // Create consumer
      const consumer = await transport.consume({
        producerId: producer.id,
        rtpCapabilities: room.router.rtpCapabilities,
        paused: true
      })
      
      videoConsumers.push(consumer)
      console.log(`✅ Video consumer ${i + 1} created: ${consumer.id} (paused)`)
    }

    // Create transports for audio producers
    for (let i = 0; i < audioProducers.length; i++) {
      const producer = audioProducers[i]
      console.log(`🚛 Creating audio transport ${i + 1}/${audioProducers.length}...`)
      
      const transport = await room.router.createPlainTransport({
        listenIp: { ip: '127.0.0.1', announcedIp: null },
        rtcpMux: false,
        comedia: false
      })
      
      const port = transport.tuple.localPort
      audioPorts.push(port)
      audioTransports.push(transport)
      
      console.log(`📡 Audio transport ${i + 1} created on port ${port}`)
      
      // Create consumer
      const consumer = await transport.consume({
        producerId: producer.id,
        rtpCapabilities: room.router.rtpCapabilities,
        paused: true
      })
      
      audioConsumers.push(consumer)
      console.log(`✅ Audio consumer ${i + 1} created: ${consumer.id} (paused)`)
    }

    // Connect all transports
    const ffmpegVideoPorts = []
    const ffmpegAudioPorts = []

    for (let i = 0; i < videoTransports.length; i++) {
      const ffmpegPort = videoPorts[i] + 1000
      const rtcpPort = ffmpegPort + 1
      ffmpegVideoPorts.push(ffmpegPort)
      
      await videoTransports[i].connect({
        ip: '127.0.0.1',
        port: ffmpegPort,
        rtcpPort: rtcpPort
      })
      
      console.log(`🔗 Video transport ${i + 1} will send to FFmpeg port ${ffmpegPort} (RTCP: ${rtcpPort})`)
    }

    for (let i = 0; i < audioTransports.length; i++) {
      const ffmpegPort = audioPorts[i] + 1000
      const rtcpPort = ffmpegPort + 1
      ffmpegAudioPorts.push(ffmpegPort)
      
      await audioTransports[i].connect({
        ip: '127.0.0.1',
        port: ffmpegPort,
        rtcpPort: rtcpPort
      })
      
      console.log(`🔗 Audio transport ${i + 1} will send to FFmpeg port ${ffmpegPort} (RTCP: ${rtcpPort})`)
    }

    // Ensure HLS output directory exists
    const hlsDir = path.join(__dirname, '../public/hls', roomName)
    console.log(`📁 HLS directory: ${hlsDir}`)
    if (!fs.existsSync(hlsDir)) {
      fs.mkdirSync(hlsDir, { recursive: true })
      console.log(`📁 Created HLS directory: ${hlsDir}`)
    } else {
      console.log(`📁 HLS directory already exists`)
    }

    // Create SDP files for each stream
    const sdpPaths = []
    
    for (let i = 0; i < videoConsumers.length; i++) {
      const videoRtp = videoConsumers[i].rtpParameters
      const audioRtp = i < audioConsumers.length ? audioConsumers[i].rtpParameters : null
      
      const sdp = generateSDP(
        videoRtp,
        audioRtp,
        ffmpegVideoPorts[i],
        audioRtp ? ffmpegAudioPorts[i] : null
      )
      
      const sdpPath = path.join(__dirname, '../temp', `${roomName}_stream${i}.sdp`)
      const tempDir = path.dirname(sdpPath)
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true })
      }
      
      fs.writeFileSync(sdpPath, sdp)
      sdpPaths.push(sdpPath)
      console.log(`💾 SDP file ${i + 1} saved to: ${sdpPath}`)
    }

    // Create FFmpeg command with video composition and audio mixing
    const ffmpegArgs = [
      '-y', // Overwrite output files
      '-protocol_whitelist', 'file,rtp,udp'
    ]

    // Add quiet flag based on log mode
    if (CURRENT_LOG_MODE === FFMPEG_LOG_CONFIG.SILENT) {
      ffmpegArgs.push('-loglevel', 'quiet')
    } else if (CURRENT_LOG_MODE === FFMPEG_LOG_CONFIG.MINIMAL) {
      ffmpegArgs.push('-loglevel', 'error')  // Only show errors
    }

    // Add input streams
    for (let i = 0; i < sdpPaths.length; i++) {
      ffmpegArgs.push('-i', sdpPaths[i])
    }

    // Video composition filter - create a grid layout
    let videoFilter = ''
    const numVideos = videoConsumers.length
    
    if (numVideos === 1) {
      videoFilter = '[0:v]scale=1280:720[v]'
    } else if (numVideos === 2) {
      // Side by side layout
      videoFilter = '[0:v]scale=640:720[v0];[1:v]scale=640:720[v1];[v0][v1]hstack=inputs=2[v]'
    } else if (numVideos <= 4) {
      // 2x2 grid layout
      videoFilter = `
        [0:v]scale=640:360[v0];
        [1:v]scale=640:360[v1];
        ${numVideos > 2 ? '[2:v]scale=640:360[v2];' : ''}
        ${numVideos > 3 ? '[3:v]scale=640:360[v3];' : ''}
        [v0][v1]hstack=inputs=2[top];
        ${numVideos > 2 ? 
          `[v2]${numVideos > 3 ? '[v3]hstack=inputs=2' : 'scale=1280:360'}[bottom];[top][bottom]vstack=inputs=2[v]` : 
          '[top]scale=1280:720[v]'
        }
      `.replace(/\s+/g, '')
    } else {
      // For more than 4, use a dynamic grid (simplified)
      const cols = Math.ceil(Math.sqrt(numVideos))
      const rows = Math.ceil(numVideos / cols)
      const w = Math.floor(1280 / cols)
      const h = Math.floor(720 / rows)
      
      let filter = ''
      for (let i = 0; i < numVideos; i++) {
        filter += `[${i}:v]scale=${w}:${h}[v${i}];`
      }
      
      // Create grid (simplified - you might want to enhance this)
      filter += `[v0][v1]hstack=inputs=2[row0];`
      if (numVideos > 2) {
        filter += `[v2]${numVideos > 3 ? '[v3]hstack=inputs=2' : `scale=${w*2}:${h}`}[row1];[row0][row1]vstack=inputs=2[v]`
      } else {
        filter += `[row0]scale=1280:720[v]`
      }
      
      videoFilter = filter
    }

    // Audio mixing filter
    let audioFilter = ''
    if (audioConsumers.length === 1) {
      audioFilter = '[0:a]volume=1.0[a]'
    } else if (audioConsumers.length > 1) {
      const audioInputs = audioConsumers.map((_, i) => `[${i}:a]`).join('')
      audioFilter = `${audioInputs}amix=inputs=${audioConsumers.length}:duration=longest[a]`
    }

    // Add filters
    if (videoFilter && audioFilter) {
      ffmpegArgs.push('-filter_complex', `${videoFilter};${audioFilter}`)
      ffmpegArgs.push('-map', '[v]', '-map', '[a]')
    } else if (videoFilter) {
      ffmpegArgs.push('-filter_complex', videoFilter)
      ffmpegArgs.push('-map', '[v]')
    } else {
      ffmpegArgs.push('-map', '0:v')
      if (audioConsumers.length > 0) {
        ffmpegArgs.push('-map', '0:a')
      }
    }

    // Optimized encoding settings for better performance
    ffmpegArgs.push(
      // Video encoding - OPTIMIZED for smooth playback
      '-c:v', 'libx264',
      '-preset', 'veryfast',  // Changed from ultrafast for better quality
      '-tune', 'zerolatency',
      '-profile:v', 'high',    // Changed from baseline for better compression
      '-level', '4.0',         // Higher level for better features
      '-b:v', '2000k',         // Increased bitrate for better quality
      '-maxrate', '2500k',     // Increased maxrate
      '-bufsize', '5000k',     // Increased buffer size
      '-pix_fmt', 'yuv420p',
      '-g', '15',              // Smaller GOP for lower latency (was 30)
      '-keyint_min', '15',     // Match GOP size
      '-sc_threshold', '0',
      '-avoid_negative_ts', 'make_zero',
      '-r', '30'               // Force 30fps output
    )

    if (audioConsumers.length > 0) {
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
      // HLS settings - OPTIMIZED for low latency
      '-f', 'hls',
      '-hls_time', '1',                    // Reduced from 2 to 1 second
      '-hls_list_size', '6',               // Reduced list size for lower latency
      '-hls_flags', 'delete_segments+independent_segments',
      '-hls_segment_type', 'mpegts',
      '-hls_delete_threshold', '3',        // Keep fewer old segments
      '-hls_segment_filename', path.join(hlsDir, 'segment_%03d.ts'),
      path.join(hlsDir, 'index.m3u8')
    )

    console.log('🎬 Starting FFmpeg with multi-participant composition...')
    
    // Only show command in verbose mode
    if (CURRENT_LOG_MODE === FFMPEG_LOG_CONFIG.VERBOSE) {
      console.log(`Command: ffmpeg ${ffmpegArgs.join(' ')}`)
    } else {
      console.log(`🔧 FFmpeg configured with ${videoConsumers.length} video inputs and ${audioConsumers.length} audio inputs`)
    }

    // Create log file if FILE mode is selected
    let logFile = null
    if (CURRENT_LOG_MODE === FFMPEG_LOG_CONFIG.FILE) {
      const logDir = path.join(__dirname, '../logs')
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true })
      }
      logFile = fs.createWriteStream(path.join(logDir, `ffmpeg_${roomName}_${Date.now()}.log`))
      console.log(`📝 FFmpeg logs will be saved to: ${logFile.path}`)
    }

    const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    let streamStarted = false
    let ffmpegReady = false
    let resumeTimeout = null

    // Handle stdout based on log mode
    ffmpeg.stdout.on('data', (data) => {
      const message = data.toString()
      
      if (CURRENT_LOG_MODE === FFMPEG_LOG_CONFIG.FILE && logFile) {
        logFile.write(`STDOUT: ${message}`)
      } else if (CURRENT_LOG_MODE === FFMPEG_LOG_CONFIG.VERBOSE) {
        console.log(`FFmpeg stdout: ${message.trim()}`)
      }
      // Silent and minimal modes ignore stdout
    })

    // Handle stderr based on log mode
    ffmpeg.stderr.on('data', (data) => {
      const message = data.toString()
      
      // Always check for stream start
      if (message.includes('frame=') && !streamStarted) {
        console.log(`🎉 Multi-participant HLS stream started for room ${roomName}`)
        streamStarted = true
      }
      
      // Handle different log modes
      if (CURRENT_LOG_MODE === FFMPEG_LOG_CONFIG.SILENT) {
        // Show nothing except errors and stream start
        if (message.includes('Error') || message.includes('error') || message.includes('failed')) {
          console.error(`FFmpeg Error: ${message.trim()}`)
        }
      } else if (CURRENT_LOG_MODE === FFMPEG_LOG_CONFIG.MINIMAL) {
        // Show only important messages
        if (message.includes('frame=') || 
            message.includes('Input #') || 
            message.includes('Stream #') ||
            message.includes('Output #') ||
            message.includes('Error') || 
            message.includes('error')) {
          console.log(`FFmpeg: ${message.trim()}`)
        }
      } else if (CURRENT_LOG_MODE === FFMPEG_LOG_CONFIG.FILE && logFile) {
        // Write to file
        logFile.write(`STDERR: ${message}`)
        
        // Still show important messages in console
        if (message.includes('frame=') || 
            message.includes('Error') || 
            message.includes('error')) {
          console.log(`FFmpeg: ${message.trim()}`)
        }
      } else if (CURRENT_LOG_MODE === FFMPEG_LOG_CONFIG.VERBOSE) {
        // Show everything (original behavior)
        console.log(`FFmpeg: ${message.trim()}`)
      }
    })

    // Resume consumers after FFmpeg starts
    resumeTimeout = setTimeout(async () => {
      if (!ffmpegReady) {
        console.log(`🎯 Auto-resuming all consumers after 2 seconds...`)
        ffmpegReady = true
        
        try {
          // Resume all video consumers
          for (let i = 0; i < videoConsumers.length; i++) {
            if (videoConsumers[i] && !videoConsumers[i].closed) {
              console.log(`▶️ Resuming video consumer ${i + 1}...`)
              await videoConsumers[i].resume()
              console.log(`✅ Video consumer ${i + 1} resumed`)
            }
          }
          
          // Resume all audio consumers
          for (let i = 0; i < audioConsumers.length; i++) {
            if (audioConsumers[i] && !audioConsumers[i].closed) {
              console.log(`▶️ Resuming audio consumer ${i + 1}...`)
              await audioConsumers[i].resume()
              console.log(`✅ Audio consumer ${i + 1} resumed`)
            }
          }
          
          console.log(`🎉 All consumers resumed - multi-participant RTP data should start flowing`)
        } catch (error) {
          console.error(`❌ Error resuming consumers:`, error)
        }
      }
    }, 2000)

    // Add timeout to check if FFmpeg is stuck
    setTimeout(() => {
      if (!streamStarted) {
        console.log(`⚠️ FFmpeg hasn't started processing after 10 seconds`)
        console.log(`🔍 Check FFmpeg logs in: ${CURRENT_LOG_MODE === FFMPEG_LOG_CONFIG.FILE ? logFile?.path : 'console'}`)
      }
    }, 10000)

    ffmpeg.on('error', (error) => {
      console.error('❌ FFmpeg spawn error:', error)
      if (logFile) logFile.end()
      stopRoomStream(roomName)
    })

    ffmpeg.on('close', (code) => {
      console.log(`📺 FFmpeg process exited with code ${code}`)
      if (code !== 0) {
        console.error(`❌ FFmpeg failed with exit code ${code}`)
      }
      if (logFile) logFile.end()
      stopRoomStream(roomName)
    })

    // Store session data
    streamingSessions.set(roomName, {
      ffmpeg,
      sdpPaths,
      videoTransports,
      audioTransports,
      videoConsumers,
      audioConsumers,
      videoPorts,
      audioPorts,
      resumeTimeout,
      logFile
    })

    ffmpegProcesses.set(roomName, ffmpeg)

    console.log(`🎉 Multi-participant HLS stream setup complete for room ${roomName}`)
    console.log(`📊 Composition: ${videoConsumers.length} video streams, ${audioConsumers.length} audio streams`)
    console.log(`📊 Video layout: ${getLayoutDescription(videoConsumers.length)}`)
    console.log(`📝 Logging mode: ${CURRENT_LOG_MODE}`)
    console.log(`⏳ All consumers paused, will resume in 2 seconds...`)
    
    return true

  } catch (error) {
    console.error(`❌ Failed to start multi-participant stream for ${roomName}:`, error)
    console.error(`Stack trace:`, error.stack)
    
    // Cleanup on error
    await cleanupStreamData(roomName)
    return false
  }
}

function getLayoutDescription(numVideos) {
  if (numVideos === 1) return 'Single view (1280x720)'
  if (numVideos === 2) return 'Side-by-side (640x720 each)'
  if (numVideos <= 4) return '2x2 grid (640x360 each)'
  return `Dynamic grid (${Math.ceil(Math.sqrt(numVideos))}x${Math.ceil(numVideos / Math.ceil(Math.sqrt(numVideos)))})`
}

export const stopRoomStream = (roomName) => {
  console.log(`🛑 Stopping multi-participant HLS stream for room: ${roomName}`)
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

  // Close log file
  if (session.logFile) {
    session.logFile.end()
    console.log(`📝 Closed log file for ${roomName}`)
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

  // Close all consumers and transports
  try {
    if (session.videoConsumers) {
      session.videoConsumers.forEach((consumer, i) => {
        if (consumer) {
          console.log(`🗑️ Closing video consumer ${i + 1} for ${roomName}`)
          consumer.close()
        }
      })
    }
    
    if (session.audioConsumers) {
      session.audioConsumers.forEach((consumer, i) => {
        if (consumer) {
          console.log(`🗑️ Closing audio consumer ${i + 1} for ${roomName}`)
          consumer.close()
        }
      })
    }
    
    if (session.videoTransports) {
      session.videoTransports.forEach((transport, i) => {
        if (transport) {
          console.log(`🗑️ Closing video transport ${i + 1} for ${roomName}`)
          transport.close()
        }
      })
    }
    
    if (session.audioTransports) {
      session.audioTransports.forEach((transport, i) => {
        if (transport) {
          console.log(`🗑️ Closing audio transport ${i + 1} for ${roomName}`)
          transport.close()
        }
      })
    }
  } catch (e) {
    console.error('Error closing mediasoup resources:', e.message)
  }

  // Remove SDP files
  if (session.sdpPaths) {
    session.sdpPaths.forEach((sdpPath, i) => {
      if (fs.existsSync(sdpPath)) {
        try {
          fs.unlinkSync(sdpPath)
          console.log(`🗑️ Removed SDP file ${i + 1}: ${sdpPath}`)
        } catch (e) {
          console.error(`Error removing SDP file ${i + 1}:`, e.message)
        }
      }
    })
  }

  // Clean up HLS files
  const hlsDir = path.join(__dirname, '../public/hls', roomName)
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