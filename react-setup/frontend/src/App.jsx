// src/App.jsx
import React from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import StreamPage from './pages/StreamPage'
import WatchPage from './pages/WatchPage'

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/sfu/:roomId" element={<StreamPage />} />
        <Route path="/watch/:roomId" element={<WatchPage />} />
      </Routes>
    </Router>
  )
}

export default App