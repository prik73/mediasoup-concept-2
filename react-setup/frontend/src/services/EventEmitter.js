class EventEmitter {
  constructor() {
    this.events = {}
  }

  on(event, listener) {
    if (!this.events[event]) {
      this.events[event] = []
    }
    this.events[event].push(listener)
  }

  off(event, listenerToRemove) {
    if (!this.events[event]) return

    this.events[event] = this.events[event].filter(listener => 
      listener !== listenerToRemove
    )
  }

  emit(event, ...args) {
    if (!this.events[event]) return

    this.events[event].forEach(listener => {
      try {
        listener(...args)
      } catch (error) {
        console.error('Error in event listener:', error)
      }
    })
  }

  removeAllListeners(event) {
    if (event) {
      delete this.events[event]
    } else {
      this.events = {}
    }
  }
}

export default EventEmitter