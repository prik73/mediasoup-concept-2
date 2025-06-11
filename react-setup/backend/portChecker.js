// portChecker.js - Utility to check and manage ports
import { exec } from 'child_process'
import { promisify } from 'util'
import net from 'net'

const execAsync = promisify(exec)

// Check if a port is in use using TCP/UDP test
export const isPortInUse = (port, host = '127.0.0.1') => {
  return new Promise((resolve) => {
    const server = net.createServer()
    
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(true)
      } else {
        resolve(false)
      }
    })
    
    server.once('listening', () => {
      server.close()
      resolve(false)
    })
    
    server.listen(port, host)
  })
}

// Find what process is using a port
export const findProcessUsingPort = async (port) => {
  try {
    const { stdout } = await execAsync(`lsof -i :${port} -P -n | grep LISTEN || true`)
    if (stdout) {
      const lines = stdout.trim().split('\n')
      const processes = lines.map(line => {
        const parts = line.split(/\s+/)
        return {
          command: parts[0],
          pid: parts[1],
          user: parts[2],
          port: port
        }
      })
      return processes
    }
    return []
  } catch (error) {
    console.error('Error finding process:', error)
    return []
  }
}

// Kill process using a specific port
export const killProcessOnPort = async (port) => {
  try {
    const { stdout } = await execAsync(`lsof -t -i:${port} | xargs -r kill -9`)
    console.log(`Killed processes on port ${port}`)
    return true
  } catch (error) {
    console.error(`Failed to kill process on port ${port}:`, error.message)
    return false
  }
}

// Find available port in range
export const findAvailablePort = async (startPort = 10000, endPort = 20000) => {
  for (let port = startPort; port <= endPort; port++) {
    const inUse = await isPortInUse(port)
    if (!inUse) {
      return port
    }
  }
  throw new Error(`No available ports in range ${startPort}-${endPort}`)
}

// Check mediasoup/FFmpeg specific ports
export const checkMediaPorts = async () => {
  console.log('🔍 Checking media-related ports...\n')
  
  const portsToCheck = [
    10000, 10001, 10002, 10003, 10004, 10005,
    40000, 40001, 40002, 40003, 40004, 40005
  ]
  
  for (const port of portsToCheck) {
    const inUse = await isPortInUse(port)
    if (inUse) {
      console.log(`❌ Port ${port} is IN USE`)
      const processes = await findProcessUsingPort(port)
      processes.forEach(proc => {
        console.log(`   └─ ${proc.command} (PID: ${proc.pid}, User: ${proc.user})`)
      })
    } else {
      console.log(`✅ Port ${port} is available`)
    }
  }
}

// Clean up all media-related processes
export const cleanupMediaProcesses = async () => {
  console.log('🧹 Cleaning up media processes...\n')
  
  try {
    // Kill FFmpeg processes
    await execAsync('pkill -9 ffmpeg || true')
    console.log('✅ Killed all FFmpeg processes')
  } catch (e) {
    console.log('⚠️  No FFmpeg processes to kill')
  }
  
  // Check for specific node processes holding ports
  const portsToClean = [10000, 10002, 10004, 40000, 40002]
  for (const port of portsToClean) {
    await killProcessOnPort(port)
  }
  
  console.log('✅ Cleanup complete')
}

// Debug function to show all UDP listeners
export const showUDPListeners = async () => {
  try {
    const { stdout } = await execAsync('ss -ulnp | grep -E "node|ffmpeg" || true')
    console.log('📡 UDP Listeners (node/ffmpeg):\n')
    console.log(stdout || 'No UDP listeners found')
  } catch (error) {
    console.error('Error checking UDP listeners:', error)
  }
}

// If run directly, execute checks
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🚀 Port Checker Utility\n')
  
  const command = process.argv[2]
  
  switch(command) {
    case 'check':
      await checkMediaPorts()
      break
    case 'clean':
      await cleanupMediaProcesses()
      break
    case 'udp':
      await showUDPListeners()
      break
    default:
      console.log('Usage:')
      console.log('  node portChecker.js check  - Check media ports')
      console.log('  node portChecker.js clean  - Clean up processes')
      console.log('  node portChecker.js udp    - Show UDP listeners')
  }
}