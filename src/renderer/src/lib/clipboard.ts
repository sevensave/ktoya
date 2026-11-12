import { useApp } from '../store/app'

/** Копирует текст и говорит об этом тостом. false — браузер не дал. */
export async function copyText(text: string, done = 'Код скопирован — отправь друзьям'): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    useApp.getState().toast(done)
    return true
  } catch {
    useApp.getState().toast('Не получилось скопировать', 'error')
    return false
  }
}
