import { motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { ArrowCounterClockwise, Crown, HourglassMedium } from '@phosphor-icons/react'
import type { CardView, PlayerView, RoomView } from '../../../protocol/index.ts'
import { Avatar } from '../components/Avatar'
import { Sticker } from '../components/Sticker'
import { plural } from '../lib/format'
import { tilt } from '../lib/game'
import { playerById } from '../lib/players'
import { send } from '../net/connection'
import { useApp } from '../store/app'
import { Confetti } from './play/Celebrate'
import './play.css'

interface Row {
  p: PlayerView
  card: CardView
}

function awards(rows: Row[]): Map<string, string> {
  const out = new Map<string, string>()
  const give = (id: string | undefined, label: string) => {
    if (id && !out.has(id)) out.set(id, label)
  }
  const guessed = rows.filter((r) => r.card.status === 'guessed')
  if (guessed.length > 1) {
    const fast = [...guessed].sort((a, b) => a.card.questions - b.card.questions)[0]
    give(fast?.p.id, 'Меньше всех вопросов')
  }
  const sharp = guessed.find((r) => r.card.tries === 1 && r.card.place !== 1)
  give(sharp?.p.id, 'С первой попытки')
  const asked = [...rows].sort((a, b) => b.card.questions - a.card.questions)
  if (asked[0] && asked[0].card.questions > 0 && asked[0].card.questions !== asked[1]?.card.questions) give(asked[0].p.id, 'Больше всех вопросов')
  const stubborn = [...rows].sort((a, b) => b.card.tries - a.card.tries)[0]
  if (stubborn && stubborn.card.tries >= 3) give(stubborn.p.id, 'Самый упорный')
  return out
}

export function Results({ view, you }: { view: RoomView; you: string | null }) {
  const g = view.game
  const avatars = useApp((s) => s.avatars)
  const isHost = view.hostId === you
  const [burst, setBurst] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setBurst(1), 350)
    return () => clearTimeout(t)
  }, [])

  if (!g) return null
  const rows: Row[] = g.order
    .map((id) => ({ p: playerById(view, id)!, card: g.cards[id]! }))
    .filter((r) => r.p && r.card)
  const placed = rows.filter((r) => r.card.place !== null).sort((a, b) => a.card.place! - b.card.place!)
  const rest = rows.filter((r) => r.card.place === null)
  const podium = placed.slice(0, 3)
  const others = [...placed.slice(3), ...rest]
  const badge = awards(rows)
  const host = playerById(view, view.hostId)
  const scores = Object.entries(view.score)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => ({ p: playerById(view, id), n }))
    .filter((s): s is { p: PlayerView; n: number } => !!s.p)
    .sort((a, b) => b.n - a.n)
  const winner = placed[0]

  const byLine = (c: CardView) => {
    const by = playerById(view, c.by)
    return by ? `написал(а) ${by.id === you ? 'ты' : by.name}` : undefined
  }

  // порядок на пьедестале: 2 — 1 — 3
  const podiumOrder = podium.length === 3 ? [podium[1]!, podium[0]!, podium[2]!] : podium.length === 2 ? [podium[1]!, podium[0]!] : podium

  return (
    <div className="results">
      <Confetti burst={burst} power={0.8} />
      <header className="results__head">
        <span className="eyebrow">Партия окончена</span>
        <h1 className="results__title">
          {winner ? (
            <>
              {winner.p.id === you ? 'Первое место — твоё!' : `Первое место — ${winner.p.name}`}
            </>
          ) : (
            'Никто не угадал'
          )}
        </h1>
      </header>

      {podium.length > 0 && (
        <div className="podium">
          {podiumOrder.map((r, i) => {
            const place = r.card.place!
            return (
              <motion.div
                key={r.p.id}
                className={`podium__col podium__col--${place}`}
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.15 + (place === 1 ? 0.3 : i * 0.12) }}
              >
                <Sticker color={r.p.color} text={r.card.character} w={place === 1 ? 170 : 140} rot={tilt(r.p.id)} category={r.card.category} note={byLine(r.card)} tape={place === 1} />
                <div className="podium__who">
                  <Avatar name={r.p.name} color={r.p.color} src={avatars[r.p.id]} size={place === 1 ? 44 : 36} />
                  <b>
                    {r.p.id === you ? 'Ты' : r.p.name}
                    {place === 1 && <Crown size={16} weight="fill" className="crown" />}
                  </b>
                  <span className="podium__stats num">
                    {r.card.questions} {plural(r.card.questions, 'вопрос', 'вопроса', 'вопросов')} · {r.card.tries} {plural(r.card.tries, 'попытка', 'попытки', 'попыток')}
                  </span>
                  {badge.get(r.p.id) && <span className="award">{badge.get(r.p.id)}</span>}
                </div>
                <div className="podium__step">
                  <span className="num">{place}</span>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {others.length > 0 && (
        <ul className="results__rest">
          {others.map((r, i) => (
            <motion.li
              key={r.p.id}
              className={`rest-row is-${r.card.status}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 + i * 0.06 }}
            >
              <span className="rest-row__place num">{r.card.place ?? '—'}</span>
              <Avatar name={r.p.name} color={r.p.color} src={avatars[r.p.id]} size={32} dim={r.card.status !== 'guessed'} />
              <span className="rest-row__name">{r.p.id === you ? 'Ты' : r.p.name}</span>
              <Sticker color={r.p.color} text={r.card.character} w={64} rot={tilt(r.p.id)} status={r.card.status} />
              <span className="rest-row__char">
                {r.card.character}
                <small>
                  {r.card.status === 'gaveup' ? 'сдаётся' : r.card.status === 'playing' ? 'не успел(а)' : ''}
                  {byLine(r.card) ? ` · ${byLine(r.card)}` : ''}
                </small>
              </span>
              <span className="rest-row__stats num">
                {r.card.questions} вопр. · {r.card.tries} попыт.
              </span>
              {badge.get(r.p.id) && <span className="award">{badge.get(r.p.id)}</span>}
            </motion.li>
          ))}
        </ul>
      )}

      <footer className="results__foot">
        {scores.length > 0 && (
          <div className="score" aria-label="Счёт серии">
            <span className="score__title">Победы в комнате</span>
            {scores.map((s) => (
              <span key={s.p.id} className="score__item">
                <span className="score__dot" style={{ background: s.p.color }} />
                {s.p.id === you ? 'Ты' : s.p.name} <b className="num">{s.n}</b>
              </span>
            ))}
          </div>
        )}
        {isHost ? (
          <button className="btn btn--primary btn--lg" onClick={() => send({ t: 'lobby' })}>
            <ArrowCounterClockwise size={20} weight="bold" /> Ещё партию
          </button>
        ) : (
          <span className="results__wait">
            <HourglassMedium size={18} /> Ждём, когда {host?.name ?? 'хост'} начнёт новую партию
          </span>
        )}
      </footer>
    </div>
  )
}
