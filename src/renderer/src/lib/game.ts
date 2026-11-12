import { useEffect, useMemo, useState } from 'react'
import type { Answer, GameView, PlayerView, Reaction, RoomView } from '../../../protocol/index.ts'
import { load, save } from './storage'

/** Детерминированный «случайный» поворот стикера от id: ±2–4°. */
export function tilt(id: string, min = 2, max = 4): number {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619)
  const u = ((h >>> 0) % 1000) / 1000
  const mag = min + u * (max - min)
  return (h & 1 ? 1 : -1) * Math.round(mag * 10) / 10
}

/** Смещение часов сервера: серверное время = Date.now() + offset. */
export function useServerOffset(serverNow: number): number {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => serverNow - Date.now(), [serverNow])
}

/** Сколько осталось до дедлайна (мс), тикает 4 раза в секунду. null — без таймера. */
export function useCountdown(deadline: number | null, offset: number): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (deadline === null) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [deadline])
  if (deadline === null) return null
  return Math.max(0, deadline - (now + offset))
}

export const ANSWER_LABEL: Record<Answer, string> = { yes: 'Да', no: 'Нет', maybe: 'Не знаю' }

export const REACTION_EMOJI: Record<Reaction, string> = {
  laugh: '😂',
  fire: '🔥',
  think: '🤔',
  clap: '👏',
  cry: '😭',
  heart: '❤️',
}

export const REACTION_LABEL: Record<Reaction, string> = {
  laugh: 'Смешно',
  fire: 'Огонь',
  think: 'Хм',
  clap: 'Браво',
  cry: 'Эх',
  heart: 'Люблю',
}

export function tally(answers: Record<string, Answer>) {
  const t = { yes: 0, no: 0, maybe: 0 }
  for (const a of Object.values(answers)) t[a]++
  return t
}

/** Кто отвечает на вопросы и голосует: все из партии, кроме ходящего. */
export function responders(view: RoomView, g: GameView): PlayerView[] {
  return g.order
    .filter((id) => id !== g.turn)
    .map((id) => view.players.find((p) => p.id === id))
    .filter((p): p is PlayerView => !!p)
}

export function inGame(g: GameView | null, you: string | null): boolean {
  return !!g && !!you && g.order.includes(you)
}

// ——— личные заметки «что я знаю о себе» ———

const notesKey = (code: string) => `notes.${code}`

export function loadNotes(code: string): string {
  return load<{ text: string }>(notesKey(code), { text: '' }).text
}

export function saveNotes(code: string, text: string) {
  save(notesKey(code), text ? { text } : null)
}

export function clearNotes(code: string) {
  save(notesKey(code), null)
  window.dispatchEvent(new CustomEvent('ktoya:notes-cleared', { detail: code }))
}
