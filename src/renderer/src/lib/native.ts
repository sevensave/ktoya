import { tauri } from './tauri'

/** Electron bridge for the updater and the custom title bar. */
export const native = typeof window !== 'undefined' ? window.ktoya : undefined

export const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)
export const isWindows = typeof navigator !== 'undefined' && /Win/.test(navigator.platform)

export function flash(on: boolean) {
  if (tauri) void tauri.invoke('flash', { on }).catch(console.error)
  else native?.flash(on)
}
