// Тот же интерфейс в обычном браузере и в компактной сборке Tauri.
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, 'package.json'), 'utf8')) as { version: string }

export default defineConfig(({ command, mode }) => {
  // Vite добавляет inline-скрипт React Refresh только при разработке.
  const nonce = command === 'serve' ? randomBytes(18).toString('base64') : undefined

  return {
    root: resolve(import.meta.dirname, 'src/renderer'),
    plugins: [
      react(),
      {
        name: 'ktoya-csp',
        transformIndexHtml(html) {
          if (nonce) html = html.replace("script-src 'self'", `script-src 'self' 'nonce-${nonce}'`)
          if (mode === 'light') {
            html = html.replace("connect-src 'self' ", "connect-src 'self' ipc: http://ipc.localhost ")
          }
          return html
        },
      },
    ],
    html: { cspNonce: nonce },
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    server: { port: 5199, strictPort: true },
  }
})
