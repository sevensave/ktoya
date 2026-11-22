interface TauriIpc {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>
}

export const tauri = import.meta.env.MODE === 'light'
  ? (window as Window & { __TAURI_INTERNALS__?: TauriIpc }).__TAURI_INTERNALS__
  : undefined
