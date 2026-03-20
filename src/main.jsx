import React from 'react'
import ReactDOM from 'react-dom/client'
import Apinflow from './App.jsx'

// Register the service worker so the app works offline (PWA)
// This runs after the page loads so it doesn't slow down the first paint
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('SW registered:', reg.scope))
      .catch(err => console.log('SW failed:', err))
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
      <Apinflow />
  </React.StrictMode>
)