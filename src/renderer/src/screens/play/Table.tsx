import { AnimatePresence, motion, useAnimationControls } from 'motion/react'
import { memo, useEffect } from 'react'
import { WifiSlash } from '@phosphor-icons/react'
import type { Answer, CardView, PlayerView, Reaction, RoomView } from '../../../../protocol/index.ts'
import { Avatar } from '../../components/Avatar'
import { Sticker } from '../../components/Sticker'
import { ANSWER_LABEL, REACTION_EMOJI, tilt } from '../../lib/game'
import { useApp } from '../../store/app'

export interface Floater {
  key: number
  by: string
  r: Reaction
}

interface Props {
  view: RoomView
  you: string | null
  /** Доля оставшегося времени хода 0..1, null — без таймера. */
  timeLeft: number | null
  floaters: Floater[]
  shakes: Record<string, number>
}

function stickerSize(n: number): number {
  if (n <= 3) return 132
  if (n <= 5) return 116
  if (n <= 7) return 100
  return 86
}

export function Table({ view, you, timeLeft, floaters, shakes }: Props) {
  const g = view.game!
  const avatars = useApp((s) => s.avatars)
  const n = g.order.length
  const size = stickerSize(n)
  const mid = (n - 1) / 2

  return (
    <div className="table" style={{ ['--n' as string]: n }}>
      <div className="table__felt" aria-hidden="true" />
      <ol className="table__seats">
        {g.order.map((id, i) => {
          const p = view.players.find((x) => x.id === id)
          const card = g.cards[id]
          if (!p || !card) return null
          const norm = mid === 0 ? 0 : (i - mid) / mid
          const answer = g.phase === 'answers' ? g.question?.answers[id] ?? null : null
          const vote = g.phase === 'verdict' ? g.guess?.votes[id] : undefined
          return (
            <Seat
              key={id}
              p={p}
              card={card}
              avatar={avatars[id]}
              isMe={id === you}
              isTurn={g.turn === id}
              lift={-Math.round(norm * norm * 26)}
              size={size}
              answer={answer}
              vote={vote}
              timeLeft={g.turn === id ? timeLeft : null}
              floaters={floaters.filter((f) => f.by === id)}
              shake={shakes[id] ?? 0}
            />
          )
        })}
      </ol>
    </div>
  )
}

interface SeatProps {
  p: PlayerView
  card: CardView
  avatar: string | undefined
  isMe: boolean
  isTurn: boolean
  lift: number
  size: number
  answer: Answer | null
  vote: boolean | undefined
  timeLeft: number | null
  floaters: Floater[]
  shake: number
}

const Seat = memo(function Seat({ p, card, avatar, isMe, isTurn, lift, size, answer, vote, timeLeft, floaters, shake }: SeatProps) {
  const reduce = useApp((s) => s.settings.reduceMotion)
  const controls = useAnimationControls()

  useEffect(() => {
    if (!shake || reduce) return
    void controls.start({ x: [0, -12, 11, -8, 6, -3, 0], transition: { duration: 0.55 } })
  }, [shake, controls, reduce])

  const hiddenMine = card.character === null
  const status = card.status
  const label = isMe ? 'Ты' : p.name
  const avSize = 44

  return (
    <motion.li
      className={`seat ${isTurn ? 'is-turn' : ''} ${isMe ? 'is-me' : ''} is-${status} ${p.online ? '' : 'is-offline'}`}
      initial={reduce ? false : { opacity: 0, y: 30, scale: 0.8 }}
      animate={{ opacity: 1, y: lift + (isTurn ? -10 : 0), scale: isTurn ? 1.1 : 1 }}
      transition={{ type: 'spring', stiffness: 240, damping: 22 }}
    >
      <motion.div className="seat__stack" animate={controls}>
        <div className="seat__sticker">
          <Sticker
            color={p.color}
            text={card.character}
            w={size}
            rot={tilt(p.id)}
            category={card.category}
            status={status}
            wobble={isMe && hiddenMine}
          />
          {status === 'guessed' && card.place !== null && (
            <motion.span
              className="seat__place"
              initial={reduce ? false : { scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: -8 }}
              transition={{ type: 'spring', stiffness: 380, damping: 14, delay: 0.25 }}
            >
              <b className="num">{card.place}</b>
              <small>место</small>
            </motion.span>
          )}
        </div>

        <div className="seat__person">
          <div className="seat__avatar">
            {timeLeft !== null && <TimerRing frac={timeLeft} size={avSize + 12} />}
            {isTurn && timeLeft === null && <span className="seat__halo" aria-hidden="true" />}
            <Avatar name={p.name} color={p.color} src={avatar} size={avSize} dim={!p.online || status === 'gaveup'} />
            {!p.online && (
              <span className="seat__offline" title="Не в сети">
                <WifiSlash size={12} weight="bold" />
              </span>
            )}
            <AnimatePresence>
              {answer && (
                <motion.span
                  key={answer}
                  className={`badge badge--${answer}`}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.3 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.15 } }}
                  transition={{ type: 'spring', stiffness: 520, damping: 17 }}
                >
                  {ANSWER_LABEL[answer]}
                </motion.span>
              )}
              {vote !== undefined && (
                <motion.span
                  key={`v${vote}`}
                  className={`badge badge--${vote ? 'yes' : 'no'}`}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.3 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6, transition: { duration: 0.15 } }}
                  transition={{ type: 'spring', stiffness: 520, damping: 17 }}
                >
                  {vote ? 'Верно' : 'Не то'}
                </motion.span>
              )}
            </AnimatePresence>
            <AnimatePresence>
              {floaters.map((f) => (
                <motion.span
                  key={f.key}
                  className="floater"
                  initial={{ opacity: 0, y: 0, scale: 0.4 }}
                  animate={{ opacity: [0, 1, 1, 0], y: -90, scale: [0.4, 1.25, 1, 0.9], x: [0, 6, -6, 2] }}
                  transition={{ duration: reduce ? 1.2 : 2, ease: 'easeOut' }}
                >
                  {REACTION_EMOJI[f.r]}
                </motion.span>
              ))}
            </AnimatePresence>
          </div>
          <span className="seat__name" title={p.name}>
            {label}
          </span>
          <span className="seat__stats num">
            {card.questions > 0 || card.tries > 0 ? (
              <>
                {card.questions} вопр.{card.tries > 0 && <> · {card.tries} попыт.</>}
              </>
            ) : (
              ' '
            )}
          </span>
        </div>
      </motion.div>
    </motion.li>
  )
})

function TimerRing({ frac, size }: { frac: number; size: number }) {
  const r = size / 2 - 2.5
  const c = 2 * Math.PI * r
  const low = frac < 0.2
  return (
    <svg className={`timer-ring ${low ? 'is-low' : ''}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} className="timer-ring__track" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        className="timer-ring__bar"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - frac)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  )
}
