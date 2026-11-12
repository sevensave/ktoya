import { AnimatePresence, motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { Copy, Crown, Plus, Trophy, WifiSlash, X } from '@phosphor-icons/react'
import { LIMITS, type CharacterSource, type FinishMode, type PlayerView, type RoomSettings, type RoomView } from '../../../protocol/index.ts'
import { Avatar } from '../components/Avatar'
import { Confirm } from '../components/Confirm'
import { Segmented } from '../components/Segmented'
import { copyText } from '../lib/clipboard'
import { formatCode, plural } from '../lib/format'
import { playerById } from '../lib/players'
import { send } from '../net/connection'
import { useApp } from '../store/app'
import './lobby.css'

/** Наклон стикера: стабильный для игрока, от −4° до 4°. */
export function tiltOf(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return ((Math.abs(h) % 9) - 4) * 0.9
}

export function Lobby({ view, you }: { view: RoomView; you: string | null }) {
  const isHost = view.hostId === you
  const host = playerById(view, view.hostId)
  const reduce = useApp((s) => s.settings.reduceMotion)
  const [kick, setKick] = useState<PlayerView | null>(null)
  const players = view.players
  const free = Math.max(0, LIMITS.maxPlayers - players.length)

  return (
    <div className="lobby">
      <section className="lobby__people">
        <header className="lobby__invite">
          <div>
            <h1 className="lobby__title">Позови друзей</h1>
            <p className="lobby__sub">Пусть откроют «Кто я?» и введут код. Играть можно от {LIMITS.minPlayers} до {LIMITS.maxPlayers} человек.</p>
          </div>
          <button className="bigcode" onClick={() => void copyText(view.code)} title="Скопировать код">
            <span className="bigcode__digits num">{formatCode(view.code)}</span>
            <span className="bigcode__action">
              <Copy size={16} weight="bold" /> Скопировать
            </span>
          </button>
        </header>

        <div className="lobby__count">
          <span>
            {players.length} {plural(players.length, 'игрок', 'игрока', 'игроков')} в комнате
          </span>
          <ScoreLine view={view} />
        </div>

        <ul className="pgrid">
          <AnimatePresence initial={false}>
            {players.map((p) => (
              <motion.li
                key={p.id}
                layout={!reduce}
                initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6, rotate: tiltOf(p.id) * 4, y: 20 }}
                animate={{ opacity: 1, scale: 1, rotate: tiltOf(p.id), y: 0 }}
                exit={{ opacity: 0, scale: 0.7, transition: { duration: 0.18 } }}
                whileHover={reduce ? undefined : { rotate: 0, y: -4 }}
                transition={{ type: 'spring', stiffness: 320, damping: 18 }}
              >
                <PlayerSticker p={p} you={you} hostId={view.hostId} wins={view.score[p.id] ?? 0} onKick={isHost && p.id !== you ? () => setKick(p) : undefined} />
              </motion.li>
            ))}
          </AnimatePresence>
          {free > 0 && (
            <li>
              <button className="pslot" onClick={() => void copyText(view.code)}>
                <Plus size={22} />
                <span>Ещё {free} {plural(free, 'место', 'места', 'мест')}</span>
              </button>
            </li>
          )}
        </ul>
      </section>

      <aside className="lobby__side panel">
        <RoomSettingsPanel view={view} isHost={isHost} />
        <div className="lobby__start">
          {isHost ? (
            <>
              <button className="btn btn--primary btn--lg btn--block" disabled={!!view.blocker} onClick={() => send({ t: 'start' })}>
                Начать игру
              </button>
              <p className={`lobby__hint ${view.blocker ? 'is-blocked' : ''}`} aria-live="polite">
                {view.blocker ?? 'Все готовы. Поехали!'}
              </p>
            </>
          ) : (
            <div className="lobby__wait">
              <span className="dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>
                Ждём, когда <b>{host?.name ?? 'хост'}</b> начнёт
              </span>
            </div>
          )}
        </div>
      </aside>

      <Confirm
        open={kick !== null}
        title={`Убрать ${kick?.name ?? ''}?`}
        confirm="Убрать"
        onConfirm={() => kick && send({ t: 'kick', id: kick.id })}
        onClose={() => setKick(null)}
      >
        С этого профиля по коду больше не войти. Чтобы начать с чистого листа, создай новую комнату.
      </Confirm>
    </div>
  )
}

function ScoreLine({ view }: { view: RoomView }) {
  const leaders = Object.entries(view.score)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
  if (!leaders.length) return null
  return (
    <span className="lobby__score" title="Сколько раз угадывал первым">
      <Trophy size={15} weight="fill" />
      {leaders.map(([id, n]) => (
        <span key={id}>
          {playerById(view, id)?.name ?? '—'} <b className="num">{n}</b>
        </span>
      ))}
    </span>
  )
}

function PlayerSticker({ p, you, hostId, wins, onKick }: { p: PlayerView; you: string | null; hostId: string; wins: number; onKick?: () => void }) {
  const avatar = useApp((s) => s.avatars[p.id])
  const isMe = p.id === you
  return (
    <div className={`pstick paper ${p.online ? '' : 'is-offline'} ${isMe ? 'is-me' : ''}`} style={{ ['--st' as string]: p.color }} title={p.online ? undefined : 'Нет связи'}>
      {avatar && <Avatar name={p.name} color={p.color} src={avatar} size={44} className="pstick__pic" />}
      <span className="pstick__name hand">{p.name}</span>
      <span className="pstick__tags">
        {p.id === hostId && (
          <span className="pstick__tag">
            <Crown size={12} weight="fill" /> хост
          </span>
        )}
        {isMe && <span className="pstick__tag">ты</span>}
        {!p.online && (
          <span className="pstick__tag">
            <WifiSlash size={12} /> нет связи
          </span>
        )}
        {wins > 0 && (
          <span className="pstick__tag">
            <Trophy size={12} weight="fill" /> {wins}
          </span>
        )}
      </span>
      {onKick && (
        <button className="pstick__kick" aria-label={`Убрать ${p.name} из комнаты`} title="Убрать из комнаты" onClick={onKick}>
          <X size={14} weight="bold" />
        </button>
      )}
    </div>
  )
}

const SOURCES: { id: CharacterSource; label: string; hint: string }[] = [
  { id: 'deck', label: 'Из колоды', hint: 'Игра сама раздаст персонажей из выбранных категорий.' },
  { id: 'players', label: 'Пишем друг другу', hint: 'Каждый тайком придумает персонажа соседу.' },
]
const TIMES = [0, 60, 90, 120]
const FINISH: { id: FinishMode; label: string }[] = [
  { id: 'all', label: 'Пока не отгадают все' },
  { id: 'first', label: 'До первого угадавшего' },
]

function RoomSettingsPanel({ view, isHost }: { view: RoomView; isHost: boolean }) {
  const s = view.settings
  const set = (patch: Partial<RoomSettings>) => isHost && send({ t: 'settings', settings: { ...s, ...patch } })
  const all = s.categories.length === 0
  const toggleCat = (id: string) => {
    const on = s.categories.includes(id)
    const next = on ? s.categories.filter((c) => c !== id) : [...s.categories, id]
    set({ categories: next.length === view.categories.length ? [] : next })
  }
  const total = view.categories.reduce((n, c) => n + (all || s.categories.includes(c.id) ? c.count : 0), 0)

  return (
    <div className="lsettings">
      <div className="lsettings__head">
        <h2>Правила</h2>
        {!isHost && <span className="tag">меняет хост</span>}
      </div>

      <Setting label="Откуда персонажи" hint={SOURCES.find((o) => o.id === s.source)?.hint}>
        <Segmented value={s.source} options={SOURCES} onChange={(source) => set({ source })} readOnly={!isHost} block />
      </Setting>

      <AnimatePresence initial={false}>
        {s.source === 'deck' && view.categories.length > 0 && (
          <motion.div
            key="cats"
            className="lsettings__collapse"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          >
            <Setting label="Категории" aside={<span className="num">{total} {plural(total, 'персонаж', 'персонажа', 'персонажей')}</span>}>
              <div className="chips">
                <button className="chip" aria-pressed={all} disabled={!isHost} onClick={() => set({ categories: [] })}>
                  Все
                </button>
                {view.categories.map((c) => (
                  <button key={c.id} className="chip" aria-pressed={!all && s.categories.includes(c.id)} disabled={!isHost} onClick={() => toggleCat(c.id)}>
                    {c.title} <span className="chip__count">{c.count}</span>
                  </button>
                ))}
              </div>
            </Setting>
          </motion.div>
        )}
      </AnimatePresence>

      <Setting label="Время на ход">
        <Segmented value={s.turnSeconds} options={TIMES.map((t) => ({ id: t, label: t ? `${t} с` : 'Без таймера' }))} onChange={(turnSeconds) => set({ turnSeconds })} readOnly={!isHost} block />
      </Setting>

      <Setting label="Когда конец">
        <Segmented value={s.finish} options={FINISH} onChange={(finish) => set({ finish })} readOnly={!isHost} block />
      </Setting>
    </div>
  )
}

function Setting({ label, hint, aside, children }: { label: string; hint?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="lsetting">
      <div className="lsetting__top">
        <span className="field__label">{label}</span>
        {aside && <span className="lsetting__aside">{aside}</span>}
      </div>
      {children}
      {hint && <p className="lsetting__hint">{hint}</p>}
    </div>
  )
}
