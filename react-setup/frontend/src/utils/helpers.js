export const generateRoomId = () => {
  return Math.random().toString(36).substring(2, 15) + 
         Math.random().toString(36).substring(2, 15)
}

export const formatDuration = (seconds) => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`
}

export const getErrorMessage = (error) => {
  if (error.name === 'NotAllowedError') {
    return 'Camera/microphone access denied. Please allow permissions and try again.'
  }
  if (error.name === 'NotFoundError') {
    return 'No camera or microphone found. Please check your devices.'
  }
  if (error.name === 'NotReadableError') {
    return 'Camera or microphone is already in use by another application.'
  }
  return error.message || 'An unknown error occurred'
}

export const validateRoomName = (roomName) => {
  if (!roomName) return false
  if (roomName.length < 3 || roomName.length > 50) return false
  return /^[a-zA-Z0-9-_]+$/.test(roomName)
}
