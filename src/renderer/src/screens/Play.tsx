import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { DotsThree, Flag, NotePencil, SignOut, SkipForward, Timer } from '@phosphor-icons/react'
import { REACTIONS, type RoomView } from '../../../protocol/index.ts'
import { Modal } from '../components/Modal'
import { clock } from '../lib/format'
import { inGame, REACTION_EMOJI, REACTION_LABEL, useCountdown, useServerOffset } from '../lib/game'
import { load, save } from '../lib/storage'
import { send } from '../net/connection'
import { useApp } from '../store/app'
import { ActionPanel } from './play/ActionPanel'
import { Confetti, MomentLayer, type Moment } from './play/Celebrate'
import { SidePanel } from './play/SidePanel'
import { Table, type Floater } from './play/Table'
import './play.css'

type Confirm = 'giveup' | 'skip' | 'lobby' | null

export function Play({ view, you }: { view: RoomView; you: string | null }) {
  const g = view.game!
  const events = useApp((s) => s.events)
  const isHost = view.hostId === you
  const playing = inGame(g, you)
  const myCard = you ? g.cards[you] : undefined
  const turnP = view.players.find((p) => p.id === g.turn) ?? null
  const isTurn = !!you && g.turn === you

  const offset = useServerOffset(view.serverNow)
  const left = useCountdown(g.deadline, offset)
  const total = view.settings.turnSeconds * 1000
  const frac = left === null || !total ? null : Math.min(1, left / total)

  const [floaters, setFloaters] = useState<Floater[]>([])
  const [shakes, setShakes] = useState<Record<string, number>>({})
  const [moment, setMoment] = useState<Moment | null>(null)
  const [burst, setBurst] = useState({ n: 0, power: 1 })
  const [pulse, setPulse] = useState(0)
  const [menu, setMenu] = useState(false)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [sideOpen, setSideOpen] = useState(() => load('playSide', { open: true }).open && !matchMedia('(max-width: 1180px)').matches)
  const [tab, setTab] = useState<'notes' | 'log'>('notes')
  const seen = useRef(events.seq)
  const floatSeq = useRef(0)

  const toggleSide = (open: boolean) => {
    setSideOpen(open)
    save('playSide', { open })
  }

  // события партии → анимации
  useEffect(() => {
    if (events.seq === seen.current) return
    seen.current = events.seq
    const { view: v } = useApp.getState()
    const name = (id: string) => v?.players.find((p) => p.id === id)
    for (const e of events.list) {
      if (e.e === 'react') {
        const key = ++floatSeq.current
        setFloaters((f) => [...f.slice(-12), { key, by: e.by, r: e.r }])
        setTimeout(() => setFloaters((f) => f.filter((x) => x.key !== key)), 2200)
      } else if (e.e === 'verdict') {
        const p = name(e.by)
        if (e.ok && p) {
          setBurst((b) => ({ n: b.n + 1, power: e.by === you ? 1.2 : 0.55 }))
          setMoment({ key: events.seq, kind: e.by === you ? 'mine' : 'other', name: p.name, color: p.color, character: e.character ?? '', place: e.place })
        } else if (!e.ok) {
          setShakes((s) => ({ ...s, [e.by]: (s[e.by] ?? 0) + 1 }))
        }
      } else if (e.e === 'giveup') {
        const p = name(e.id)
        if (p) setMoment({ key: events.seq, kind: e.id === you ? 'mine-giveup' : 'giveup', name: p.name, color: p.color, character: e.character })
      } else if (e.e === 'turn' && e.id === you) {
        setPulse((n) => n + 1)
      }
    }
  }, [events, you])

  const closeMoment = useCallback(() => setMoment(null), [])

  const doConfirm = () => {
    if (confirm === 'giveup') send({ t: 'giveup' })
    else if (confirm === 'skip') send({ t: 'skip' })
    else if (confirm === 'lobby') send({ t: 'lobby' })
    setConfirm(null)
  }

  const canGiveUp = playing && myCard?.status === 'playing'
  const hasMenu = canGiveUp || isHost

  return (
    <div className={`play ${sideOpen ? 'has-side' : ''}`}>
      <div className="play__main">
        <div className="play__bar">
          <div className="play__status">
            {turnP ? (
              isTurn ? (
                <span className="status status--mine">Твой ход</span>
              ) : (
                <span className="status">
                  Ходит <b style={{ color: turnP.color }}>{turnP.name}</b>
                </span>
              )
            ) : null}
            {left !== null && (
              <span className={`status__timer num ${left < 10_000 ? 'is-low' : ''}`}>
                <Timer size={15} weight="bold" /> {clock(left)}
              </span>
            )}
          </div>
          <div className="play__tools">
            <div className="reactions" role="group" aria-label="Реакции">
              {REACTIONS.map((r) => (
                <motion.button key={r} className="reaction" whileTap={{ scale: 0.8 }} whileHover={{ y: -2 }} onClick={() => send({ t: 'react', r })} title={REACTION_LABEL[r]} aria-label={REACTION_LABEL[r]}>
                  {REACTION_EMOJI[r]}
                </motion.button>
              ))}
            </div>
            {!sideOpen && (
              <button className="btn btn--sm" onClick={() => toggleSide(true)}>
                <NotePencil size={16} /> {playing ? 'Заметки' : 'Лента'}
              </button>
            )}
            {hasMenu && (
              <div className="menu-anchor">
                <button className="icon-btn" aria-label="Ещё" aria-expanded={menu} onClick={() => setMenu((m) => !m)}>
                  <DotsThree size={22} weight="bold" />
                </button>
                <AnimatePresence>
                  {menu && (
                    <>
                      <div className="menu-scrim" onClick={() => setMenu(false)} />
                      <motion.div
                        className="menu"
                        role="menu"
                        initial={{ opacity: 0, y: -6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -4, scale: 0.98 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 34 }}
                      >
                        {canGiveUp && (
                          <button role="menuitem" onClick={() => { setMenu(false); setConfirm('giveup') }}>
                            <Flag size={18} /> Сдаюсь
                          </button>
                        )}
                        {isHost && g.turn && (
                          <button role="menuitem" onClick={() => { setMenu(false); setConfirm('skip') }}>
                            <SkipForward size={18} /> Пропустить ход
                          </button>
                        )}
                        {isHost && (
                          <button role="menuitem" onClick={() => { setMenu(false); setConfirm('lobby') }}>
                            <SignOut size={18} /> Прервать — в лобби
                          </button>
                        )}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>

        <Table view={view} you={you} timeLeft={frac} floaters={floaters} shakes={shakes} />
        <ActionPanel view={view} you={you} pulse={pulse} />
      </div>

      <AnimatePresence initial={false}>
        {sideOpen && <div className="play__scrim" key="scrim" onClick={() => toggleSide(false)} />}
        {sideOpen && (
          <motion.div
            key="side"
            className="play__side"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          >
            <SidePanel view={view} you={you} tab={tab} onTab={setTab} onClose={() => toggleSide(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <Confetti burst={burst.n} power={burst.power} />
      <MomentLayer moment={moment} onDone={closeMoment} />

      <Modal open={confirm !== null} title={confirm === 'giveup' ? 'Сдаться?' : confirm === 'skip' ? 'Пропустить ход?' : 'Вернуться в лобби?'} onClose={() => setConfirm(null)} width={400}>
        <p className="confirm__text">
          {confirm === 'giveup' && 'Стикер откроется, и ты узнаешь, кто ты. Дальше — только отвечать другим.'}
          {confirm === 'skip' && `Ход ${turnP?.name ?? 'игрока'} закончится, очередь перейдёт дальше.`}
          {confirm === 'lobby' && 'Партия прервётся для всех. Состав комнаты сохранится.'}
        </p>
        <div className="confirm__row">
          <button className="btn btn--ghost" onClick={() => setConfirm(null)}>
            Отмена
          </button>
          <button className="btn btn--primary" onClick={doConfirm} autoFocus>
            {confirm === 'giveup' ? 'Сдаюсь' : confirm === 'skip' ? 'Пропустить' : 'В лобби'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
