import React from 'react'
import ReactDOM from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import App from './App'
import { PrivacyProvider } from './components/PrivacyProvider'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PrivacyProvider>
      <App />
    </PrivacyProvider>
  </React.StrictMode>,
)

// App instalable desde Chrome: el service worker guarda sólo la carcasa (public/sw.js).
// No en desarrollo (taparía los cambios) ni en el APK (ya es una app instalada).
if (import.meta.env.PROD && 'serviceWorker' in navigator && !Capacitor.isNativePlatform()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('No se pudo registrar el service worker:', err)
    })
  })
}
