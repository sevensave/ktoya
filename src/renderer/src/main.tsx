import { tauri } from './lib/tauri'

const imported = 'ktoya.electronImport.v1'

async function boot() {
  if (tauri) {
    const inserted: string[] = []
    try {
      // The store initializes the player ID at import time, so restore saves first.
      if (localStorage.getItem(imported) === null) {
        const saves = await tauri.invoke<Record<string, string>>('electron_saves')
        for (const [key, value] of Object.entries(saves)) {
          if (localStorage.getItem(key) !== null) continue
          localStorage.setItem(key, value)
          inserted.push(key)
        }
        localStorage.setItem(imported, '1')
      }
    } catch (error) {
      console.error('Could not import Electron saves', error)
      for (const key of inserted) localStorage.removeItem(key)
      const root = document.getElementById('root')!
      const retry = document.createElement('button')
      retry.textContent = 'Повторить'
      retry.onclick = () => location.reload()
      root.append('Не удалось перенести профиль. Закрой предыдущую версию игры и повтори попытку. ', retry)
      return
    }

    const desktop = tauri
    window.addEventListener('keydown', (event) => {
      if (event.key === 'F11') {
        event.preventDefault()
        void desktop.invoke('toggle_fullscreen').catch(console.error)
      } else if (import.meta.env.PROD && (event.key === 'F5' ||
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r'))) {
        event.preventDefault()
      }
    })
  }
  await import('./render')
}

void boot()
