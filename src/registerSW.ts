import { registerSW } from 'virtual:pwa-register'

const updateSW = registerSW({
  onNeedRefresh() {
    // Show a prompt to user to refresh the app
    if (confirm('Neue Version verfügbar! App neu laden?')) {
      updateSW(true)
    }
  },
  onOfflineReady() {
    console.log('App bereit für Offline-Nutzung!')
    // Show a message that the app is ready to work offline
    const toast = document.createElement('div')
    toast.textContent = '✅ App ist offline verfügbar!'
    toast.style.cssText = 'position:fixed;top:20px;right:20px;background:#4caf50;color:white;padding:12px;border-radius:4px;z-index:9999;'
    document.body.appendChild(toast)
    setTimeout(() => document.body.removeChild(toast), 3000)
  },
})