import { useEffect, useRef } from 'react'
import { sound } from '../audio/sound'
import { clearNotes } from '../lib/game'
import { flash } from '../lib/native'
import { useApp } from '../store/app'

const unfocused = () => typeof document !== 'undefined' && (!document.hasFocus() || document.hidden)

/** Звуки и мигание значка по событиям комнаты. Вызывается один раз в Room.tsx. Сигнатуру не менять. */
export function useRoomSounds(): void {
  const events = useApp((s) => s.events)
  const stage = useApp((s) => s.view?.stage)
  const code = useApp((s) => s.view?.code)
  const seen = useRef(events.seq)

  // Новая партия — чистый блокнот.
  useEffect(() => {
    if (code && (stage === 'lobby' || stage === 'assign')) clearNotes(code)
  }, [stage, code])

  useEffect(() => {
    if (events.seq === seen.current) return
    seen.current = events.seq
    const { view, you, settings } = useApp.getState()
    const g = view?.game ?? null
    const playing = !!you && !!g && g.order.includes(you)
    for (const e of events.list) {
      switch (e.e) {
        case 'assign':
          sound.play('level', { volume: 0.45 })
          if (unfocused()) flash(true)
          break
        case 'start':
          if (view?.code) clearNotes(view.code)
          sound.play('level', { volume: 0.5 })
          break
        case 'turn':
          if (e.id === you) {
            if (settings.turnSound) sound.play('turn', { volume: 0.6, delay: 150 })
            if (unfocused()) flash(true)
          } else {
            sound.play('tick', { volume: 0.25 })
          }
          break
        case 'ask':
          if (e.by !== you) {
            sound.play('message', { volume: 0.45 })
            if (playing && unfocused()) flash(true)
          }
          break
        case 'answer':
          if (e.by !== you) sound.play('click', { volume: 0.3, rate: e.a === 'yes' ? 1.12 : e.a === 'no' ? 0.9 : 1 })
          break
        case 'guess':
          sound.play('chime', { volume: 0.55 })
          if (e.by !== you && playing && unfocused()) flash(true)
          break
        case 'verdict':
          if (e.ok) sound.play('win', { volume: e.by === you ? 0.75 : 0.4 })
          else sound.play('leave', { volume: 0.5, rate: 0.8 })
          break
        case 'giveup':
          sound.play('toggle', { volume: 0.5, rate: 0.85 })
          break
        case 'over':
          sound.play('level', { volume: 0.6, delay: 600 })
          break
        case 'react':
          if (e.by !== you) sound.play('select', { volume: 0.2, rate: 1.3 })
          break
        case 'join':
          if (e.id !== you) sound.play('join', { volume: 0.3 })
          break
        case 'leave':
          sound.play('leave', { volume: 0.2 })
          break
      }
    }
  }, [events])
}
