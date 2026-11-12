import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Check, PencilSimple } from '@phosphor-icons/react'
import { LIMITS, type RoomView } from '../../../protocol/index.ts'
import { Avatar } from '../components/Avatar'
import { Sticker } from '../components/Sticker'
import { tilt } from '../lib/game'
import { playerById } from '../lib/players'
import { send } from '../net/connection'
import { useApp } from '../store/app'
import './play.css'

const IDEAS = ['Герой кино', 'Животное', 'Кто-то из нас', 'Мультяшка', 'Историческая личность', 'Предмет', 'Певец']

export function Assign({ view, you }: { view: RoomView; you: string | null }) {
  const a = view.assign
  const avatars = useApp((s) => s.avatars)
  const target = a ? playerById(view, a.target) : null
  const writers = view.players.filter((p) => !p.spectator)
  const isHost = view.hostId === you
  const [editing, setEditing] = useState(!a?.mine)
  const [text, setText] = useState(a?.mine ?? '')
  const [hint, setHint] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const submit = () => {
    const name = text.trim().replace(/\s+/g, ' ')
    if (!name) return
    send({ t: 'assign', name: name.slice(0, LIMITS.character) })
    setEditing(false)
  }

  const doneCount = a?.done.length ?? 0
  const allDone = doneCount >= writers.length

  return (
    <div className="assign">
      {target ? (
        <>
          <header className="assign__head">
            <span className="eyebrow">Пишем стикеры</span>
            <h1 className="assign__title">
              Придумай, кем будет
              <span className="assign__who">
                <Avatar name={target.name} color={target.color} src={avatars[target.id]} size={44} />
                {target.name}
              </span>
            </h1>
            <p className="assign__sub">{target.name} надпись не увидит — остальные увидят.</p>
          </header>

          <motion.div
            className="assign__stage"
            initial={{ opacity: 0, y: 24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 220, damping: 22 }}
          >
            {editing ? (
              <Sticker color={target.color} text={null} w={240} rot={tilt(target.id, 1.5, 2.5)} tape>
                <textarea
                  ref={inputRef}
                  className="assign__input"
                  value={text}
                  maxLength={LIMITS.character}
                  rows={3}
                  placeholder={hint ? `${hint}…` : 'Кто это?'}
                  spellCheck={false}
                  onChange={(e) => setText(e.target.value.replace(/\n/g, ''))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      submit()
                    }
                  }}
                  aria-label={`Персонаж для ${target.name}`}
                />
              </Sticker>
            ) : (
              <Sticker color={target.color} text={a!.mine} w={240} rot={tilt(target.id, 1.5, 2.5)} tape note={`для ${target.name}`} />
            )}
          </motion.div>

          <div className="assign__actions">
            {editing ? (
              <>
                <div className="chips" aria-label="Идеи">
                  {IDEAS.map((i) => (
                    <button
                      key={i}
                      className={`chip ${hint === i ? 'is-on' : ''}`}
                      onClick={() => {
                        setHint(hint === i ? null : i)
                        inputRef.current?.focus()
                      }}
                    >
                      {i}
                    </button>
                  ))}
                </div>
                <div className="assign__row">
                  <button className="btn btn--primary btn--lg" disabled={!text.trim()} onClick={submit}>
                    <Check size={20} weight="bold" /> Готово
                  </button>
                  {a?.mine && (
                    <button
                      className="btn btn--ghost"
                      onClick={() => {
                        setText(a.mine ?? '')
                        setEditing(false)
                      }}
                    >
                      Отмена
                    </button>
                  )}
                </div>
                <span className="assign__count num">
                  {text.length}/{LIMITS.character} · Enter — готово
                </span>
              </>
            ) : (
              <div className="assign__row">
                <span className="assign__ok">
                  <Check size={18} weight="bold" /> Записано
                </span>
                <button className="btn" onClick={() => setEditing(true)}>
                  <PencilSimple size={18} /> Можно переписать
                </button>
              </div>
            )}
          </div>
        </>
      ) : (
        <header className="assign__head assign__head--wait">
          <span className="eyebrow">Пишем стикеры</span>
          <h1 className="assign__title">Игроки придумывают персонажей</h1>
          <p className="assign__sub">В этой партии ты смотришь. Как только все напишут — начнём.</p>
        </header>
      )}

      <footer className="assign__progress">
        <div className="assign__avatars">
          {writers.map((p) => {
            const done = a?.done.includes(p.id)
            return (
              <div key={p.id} className={`assign__writer ${done ? 'is-done' : ''}`} title={p.name}>
                <Avatar name={p.name} color={p.color} src={avatars[p.id]} size={36} dim={!done} />
                {done && (
                  <motion.span
                    className="assign__tick"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                  >
                    <Check size={11} weight="bold" />
                  </motion.span>
                )}
              </div>
            )
          })}
        </div>
        <span className="assign__progress-text num">{allDone ? 'Все написали' : `Написали ${doneCount} из ${writers.length}`}</span>
        {isHost && !allDone && (
          <button className="btn btn--ghost btn--sm" onClick={() => send({ t: 'force' })} title="Тем, кто не успел, персонажа выдаст колода">
            Начать, не дожидаясь
          </button>
        )}
      </footer>
    </div>
  )
}
