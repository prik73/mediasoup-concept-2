import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const ffmpegProcesses = new Map()
const hlsOutputDir = path.join(__dirname, '../../public/hls')

// Ensure HLS directory exists
if (!fs.existsSync(hlsOutputDir)) {
  fs.mkdirSync(hlsOutputDir, { recursive: true })
}

export const startHLSStream = (roomName, rtmpUrl) => {
  if (ffmpegProcesses.has(roomName)) {
    console.log(`HLS stream already running for room: ${roomName}`)
    return
  }

  const roomDir = path.join(hlsOutputDir, roomName)
  if (!fs.existsSync(roomDir)) {
    fs.mkdirSync(roomDir, { recursive: true })
  }

  const ffmpegArgs = [
    '-i', rtmpUrl,
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-preset', 'veryfast',
    '-tune', 'zerolatency',
    '-f', 'hls',
    '-hls_time', '2',
    '-hls_list_size', '5',
    '-hls_flags', 'delete_segments+append_list',
    '-hls_segment_filename', path.join(roomDir, 'segment_%03d.ts'),
    path.join(roomDir, 'index.m3u8')
  ]

  const ffmpeg = spawn('ffmpeg', ffmpegArgs)
  
  ffmpeg.stderr.on('data', (data) => {
    console.log(`FFmpeg: ${data}`)
  })

  ffmpeg.on('error', (error) => {
    console.error(`FFmpeg error for room ${roomName}:`, error)
    stopHLSStream(roomName)
  })

  ffmpeg.on('close', (code) => {
    console.log(`FFmpeg process for room ${roomName} exited with code ${code}`)
    cleanupRoom(roomName)
  })

  ffmpegProcesses.set(roomName, ffmpeg)
  console.log(`🎬 HLS stream started for room: ${roomName}`)
}

export const stopHLSStream = (roomName) => {
  const ffmpeg = ffmpegProcesses.get(roomName)
  if (ffmpeg) {
    ffmpeg.kill('SIGTERM')
    ffmpegProcesses.delete(roomName)
    console.log(`🛑 HLS stream stopped for room: ${roomName}`)
  }
  cleanupRoom(roomName)
}

const cleanupRoom = (roomName) => {
  const roomDir = path.join(hlsOutputDir, roomName)
  if (fs.existsSync(roomDir)) {
    fs.rmSync(roomDir, { recursive: true, force: true })
  }
}

export const isStreamActive = (roomName) => {
  return ffmpegProcesses.has(roomName)
}

export const getAllActiveStreams = () => {
  return Array.from(ffmpegProcesses.keys())
}