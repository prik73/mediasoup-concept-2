import path from 'path'

export const routeHandler = (app, __dirname) => {
  const publicDir = path.join(__dirname, 'public')

  if (process.env.NODE_ENV === 'production') {
    // Production: serve static files
    app.use(express.static(publicDir))
    
    app.get('/sfu/:room', (req, res) => {
      res.sendFile(path.join(publicDir, 'index.html'))
    })

    app.get('/watch/:room', (req, res) => {
      res.sendFile(path.join(publicDir, 'index.html'))
    })

    app.get('/sfu/:room/*', (req, res) => {
      res.sendFile(path.join(publicDir, 'index.html'))
    })
  } else {
    // Development: simple status page
    app.get('/', (req, res) => {
      res.send(`
        <h1>🚀 Fermion Backend</h1>
        <p><strong>Status:</strong> Running in development mode</p>
        <p><strong>Frontend:</strong> <a href="http://localhost:5173">http://localhost:5173</a></p>
        <p><strong>Socket.IO:</strong> Ready for connections</p>
        <hr>
        <h3>Available Routes:</h3>
        <ul>
          <li><a href="http://localhost:5173/sfu/room123">Stream Mode</a></li>
          <li><a href="http://localhost:5173/watch/room123">Watch Mode</a></li>
        </ul>
      `)
    })
  }
}