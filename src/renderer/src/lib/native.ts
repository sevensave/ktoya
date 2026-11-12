import type { KtoyaApi } from '../../../preload/api'

/** API Electron, если мы в приложении; в обычном браузере его нет. */
export const native: KtoyaApi | null = typeof window !== 'undefined' && window.ktoya ? window.ktoya : null

export const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)
export const isWindows = typeof navigator !== 'undefined' && /Win/.test(navigator.platform)
