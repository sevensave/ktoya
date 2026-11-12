import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { Check, Copy, GearSix, SignOut } from '@phosphor-icons/react'
import type { RoomView } from '../../../protocol/index.ts'
import { Confirm } from '../components/Confirm'
import { copyText } from '../lib/clipboard'
import { formatCode } from '../lib/format'
import { isMac, native } from '../lib/native'
import { me } from '../lib/players'
import { leaveRoom } from '../net/connection'
import { useApp } from '../store/app'
import { Assign } from './Assign'
import { Lobby } from './Lobby'
import { Play } from './Play'
import { Results } from './Results'
import { useRoomSounds } from './roomSounds'
import './room.css'

const STAGE_LABEL: Record<RoomView['stage'], string> = {
  lobby: 'Собираемся',
  assign: 'Пишем стикеры',
  play: 'Идёт партия',
  over: 'Итоги',
}

export function Room() {
  const view = useApp((s) => s.view)
  const you = useApp((s) => s.you)
  const reduce = useApp((s) => s.settings.reduceMotion)
  const [confirmLeave, setConfirmLeave] = useState(false)
  useRoomSounds()
  if (!view) return null

  const mine = me(view, you)
  const midGame = (view.stage === 'assign' || view.stage === 'play') && mine && !mine.spectator
  const leave = () => (midGame ? setConfirmLeave(true) : leaveRoom())

  const Stage = { lobby: Lobby, assign: Assign, play: Play, over: Results }[view.stage]

  return (
    <div className={`room ${isMac && native ? 'is-mac' : ''}`} data-stage={view.stage}>
      <header className="topbar">
        <div className="topbar__left">
          <span className="topbar__brand">
            Кто <span>я?</span>
          </span>
          <CodeButton code={view.code} />
          <span className="topbar__stage">{STAGE_LABEL[view.stage]}</span>
        </div>
        <div className="topbar__right">
          <ConnStatus />
          <button className="icon-btn" onClick={() => useApp.setState({ settingsOpen: true })} aria-label="Настройки" title="Настройки">
            <GearSix size={20} />
          </button>
          <button className="icon-btn" aria-label="Выйти из комнаты" title="Выйти из комнаты" onClick={leave}>
            <SignOut size={20} />
          </button>
        </div>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view.stage}
          className="room__stage"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.99 }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
        >
          <Stage view={view} you={you} />
        </motion.div>
      </AnimatePresence>

      <Confirm
        open={confirmLeave}
        title="Выйти посреди партии?"
        confirm="Выйти"
        cancel="Остаться"
        onConfirm={leaveRoom}
        onClose={() => setConfirmLeave(false)}
      >
        {view.stage === 'assign' ? 'Тебе уже пишут стикер, а ты пишешь кому-то. Без тебя придётся начинать заново.' : 'Друзья доиграют без тебя. Вернуться можно по тому же коду.'}
      </Confirm>
    </div>
  )
}

function CodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className={`topbar__code ${copied ? 'is-copied' : ''}`}
      title="Скопировать код комнаты"
      onClick={() => {
        void copyText(code).then((ok) => {
          if (!ok) return
          setCopied(true)
          setTimeout(() => setCopied(false), 1600)
        })
      }}
    >
      <span className="topbar__code-label">Код</span>
      <span className="num">{formatCode(code)}</span>
      {copied ? <Check size={15} weight="bold" /> : <Copy size={15} />}
    </button>
  )
}

function ConnStatus() {
  const conn = useApp((s) => s.conn)
  const bad = conn !== 'online'
  return (
    <span className={`conn ${bad ? 'is-bad' : ''}`} title={bad ? 'Связь пропала, переподключаемся' : 'На связи'} role="status">
      <span className={`pulse ${bad ? 'pulse--warn' : ''}`} />
      <span className="conn__text">{bad ? 'Переподключаемся…' : 'На связи'}</span>
    </span>
  )
}
