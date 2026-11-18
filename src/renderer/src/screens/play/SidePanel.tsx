import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Microphone, X } from '@phosphor-icons/react'
import type { GameView, LogEntry, RoomView } from '../../../../protocol/index.ts'
import { loadNotes, saveNotes, tally } from '../../lib/game'

interface Props {
  view: RoomView
  you: string | null
  tab: 'notes' | 'log'
  onTab(t: 'notes' | 'log'): void
  onClose?: () => void
}

export function SidePanel({ view, you, tab, onTab, onClose }: Props) {
  const g = view.game!
  const playing = !!you && g.order.includes(you)
  const active = playing ? tab : 'log'
  return (
    <aside className="side" aria-label="Заметки и лента">
      <div className="side__tabs" role="tablist">
        {playing && (
          <button role="tab" aria-selected={active === 'notes'} className={active === 'notes' ? 'is-on' : ''} onClick={() => onTab('notes')}>
            Мои заметки
          </button>
        )}
        <button role="tab" aria-selected={active === 'log'} className={active === 'log' ? 'is-on' : ''} onClick={() => onTab('log')}>
          Лента
        </button>
        {onClose && (
          <button className="icon-btn side__close" onClick={onClose} aria-label="Скрыть">
            <X size={18} />
          </button>
        )}
      </div>
      {active === 'notes' ? <Notes view={view} g={g} you={you!} /> : <Log view={view} g={g} you={you} />}
    </aside>
  )
}

function Notes({ view, g, you }: { view: RoomView; g: GameView; you: string }) {
  const [text, setText] = useState(() => loadNotes(view.code))
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    const onClear = (e: Event) => {
      if ((e as CustomEvent).detail === view.code) setText('')
    }
    window.addEventListener('ktoya:notes-cleared', onClear)
    return () => window.removeEventListener('ktoya:notes-cleared', onClear)
  }, [view.code])

  const change = (v: string) => {
    setText(v)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => saveNotes(view.code, v), 300)
  }

  const mine = g.log.filter((e) => e.by === you)
  const live = g.turn === you && g.phase === 'answers' && g.question ? g.question : null
  const total = mine.filter((e) => e.kind === 'q').length + (live ? 1 : 0)
  const sum = mine.reduce(
    (s, e) => (e.kind === 'q' ? { yes: s.yes + (e.no === 0 && e.yes > 0 ? 1 : 0), no: s.no + (e.no > 0 ? 1 : 0) } : s),
    { yes: 0, no: 0 },
  )

  return (
    <div className="notes">
      <label className="notes__pad">
        <span className="notes__label">Что я знаю о себе</span>
        <textarea
          value={text}
          onChange={(e) => change(e.target.value)}
          onBlur={() => saveNotes(view.code, text)}
          placeholder={'не человек\nживёт в воде?\nиз мультика…'}
          spellCheck={false}
        />
      </label>
      <div className="notes__qs">
        <span className="notes__label">
          Мои вопросы {total > 0 && <span className="num">· {total}</span>}
          {(sum.yes > 0 || sum.no > 0) && (
            <span className="notes__sum num">
              <i className="c-yes">да {sum.yes}</i> <i className="c-no">нет {sum.no}</i>
            </span>
          )}
        </span>
        {total === 0 ? (
          <p className="side__empty">Здесь соберутся твои вопросы и ответы на них — чтобы не держать в голове.</p>
        ) : (
          <ol className="myqs">
            {mine.map((e, i) =>
              e.kind === 'q' ? (
                <li key={i} className="myq">
                  <span className="myq__text">{e.text || <i className="voice"><Microphone size={12} weight="fill" /> вслух</i>}</span>
                  <Verdicts yes={e.yes} no={e.no} maybe={e.maybe} />
                </li>
              ) : e.kind === 'guess' ? (
                <li key={i} className="myq myq--guess">
                  <span className="myq__text">Я — {e.text}?</span>
                  <span className={`pill ${e.ok ? 'pill--yes' : 'pill--no'}`}>{e.ok ? 'верно' : 'мимо'}</span>
                </li>
              ) : null,
            )}
            {live && (
              <li className="myq is-live">
                <span className="myq__text">{live.text || <i className="voice"><Microphone size={12} weight="fill" /> вслух</i>}</span>
                <Verdicts {...tally(live.answers)} />
              </li>
            )}
          </ol>
        )}
      </div>
    </div>
  )
}

function Verdicts({ yes, no, maybe }: { yes: number; no: number; maybe: number }) {
  return (
    <span className="verdicts num">
      {yes > 0 && <span className="pill pill--yes">да ×{yes}</span>}
      {no > 0 && <span className="pill pill--no">нет ×{no}</span>}
      {maybe > 0 && <span className="pill pill--maybe">? ×{maybe}</span>}
      {yes + no + maybe === 0 && <span className="pill pill--maybe">…</span>}
    </span>
  )
}

function Log({ view, g, you }: { view: RoomView; g: GameView; you: string | null }) {
  const ref = useRef<HTMLOListElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (el) el.scrollTop = el.scrollHeight
  }, [g.log.length])
  if (g.log.length === 0) return <p className="side__empty side__empty--pad">Пока тихо. Здесь появятся вопросы и догадки.</p>
  return (
    <ol className="log" ref={ref}>
      {g.log.map((e, i) => (
        <LogRow key={i} e={e} view={view} you={you} />
      ))}
    </ol>
  )
}

function LogRow({ e, view, you }: { e: LogEntry; view: RoomView; you: string | null }) {
  const p = view.players.find((x) => x.id === e.by)
  const name = e.by === you ? 'Ты' : p?.name ?? 'Игрок'
  return (
    <li className={`logrow logrow--${e.kind}`}>
      <span className="logrow__dot" style={{ background: p?.color ?? 'var(--faint)' }} />
      <span className="logrow__who">{name}</span>
      {e.kind === 'q' && (
        <>
          <span className="logrow__text">{e.text || <i className="voice">вопрос вслух</i>}</span>
          <Verdicts yes={e.yes} no={e.no} maybe={e.maybe} />
        </>
      )}
      {e.kind === 'guess' && (
        <>
          <span className="logrow__text">«Я — {e.text}»</span>
          <span className={`pill ${e.ok ? 'pill--yes' : 'pill--no'}`}>{e.ok ? 'верно' : 'мимо'}</span>
        </>
      )}
      {e.kind === 'giveup' && <span className="logrow__text logrow__text--muted">сдаётся</span>}
    </li>
  )
}
