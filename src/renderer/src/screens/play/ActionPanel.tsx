import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowRight, ArrowUUpRight, Check, Lightbulb, Microphone, Question, X } from '@phosphor-icons/react'
import { LIMITS, type Answer, type GameView, type PlayerView, type RoomView } from '../../../../protocol/index.ts'
import { Avatar } from '../../components/Avatar'
import { Sticker } from '../../components/Sticker'
import { inGame, responders, tally, tilt } from '../../lib/game'
import { send } from '../../net/connection'
import { useApp } from '../../store/app'

interface Props {
  view: RoomView
  you: string | null
  /** Меняется, когда ход пришёл ко мне: панель коротко «вздрагивает». */
  pulse: number
}

const spring = { type: 'spring', stiffness: 320, damping: 28 } as const

export function ActionPanel({ view, you, pulse }: Props) {
  const g = view.game!
  const turnP = view.players.find((p) => p.id === g.turn) ?? null
  const isTurn = !!you && g.turn === you
  const playing = inGame(g, you)
  const canRespond = playing && !isTurn
  const reduce = useApp((s) => s.settings.reduceMotion)

  let body: ReactNode = null
  let key = `${g.phase}:${g.turn}`
  if (!turnP) body = <p className="panel-muted">Ждём следующий ход…</p>
  else if (isTurn) body = <MyTurn view={view} g={g} />
  else if (g.phase === 'verdict') body = <Verdict view={view} g={g} you={you} turnP={turnP} canVote={canRespond} />
  else body = <TheirTurn view={view} g={g} you={you} turnP={turnP} canAnswer={canRespond} />
  if (isTurn) key = `mine:${g.phase === 'verdict' ? 'v' : 'q'}`

  return (
    <motion.section
      className={`action ${isTurn ? 'is-mine' : ''}`}
      key={`pulse${pulse}`}
      initial={pulse && !reduce ? { scale: 0.97, boxShadow: '0 0 0 3px var(--lamp)' } : false}
      animate={{ scale: 1, boxShadow: '0 0 0 0px rgba(0,0,0,0)' }}
      transition={{ type: 'spring', stiffness: 300, damping: 18 }}
      aria-live="polite"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={key}
          className="action__inner"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={spring}
        >
          {body}
        </motion.div>
      </AnimatePresence>
    </motion.section>
  )
}

// ——— мой ход ———

function MyTurn({ view, g }: { view: RoomView; g: GameView }) {
  const [guessing, setGuessing] = useState(false)
  const q = g.phase === 'answers' ? g.question : null

  if (g.phase === 'verdict' && g.guess) {
    const votes = Object.values(g.guess.votes)
    const ok = votes.filter(Boolean).length
    const no = votes.length - ok
    return (
      <div className="mine-verdict">
        <span className="eyebrow">Твой ответ</span>
        <p className="say">
          «Я — <b>{g.guess.text}</b>»
        </p>
        <div className="suspense" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p className="panel-muted">Остальные сверяют со стикером…</p>
        <VoteMeter ok={ok} no={no} need={g.guess.need} />
      </div>
    )
  }

  return (
    <div className="mine">
      <div className="mine__top">
        {q ? (
          <QuestionLive view={view} g={g} you />
        ) : (
          <>
            <span className="eyebrow eyebrow--accent">Твой ход</span>
            <h2 className="mine__title">Спроси про себя — остальные ответят «да» или «нет»</h2>
          </>
        )}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {guessing ? (
          <motion.div key="g" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={spring}>
            <GuessForm onCancel={() => setGuessing(false)} />
          </motion.div>
        ) : (
          <motion.div key="a" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={spring}>
            <AskForm again={!!q} />
            <div className="mine__secondary">
              <button className="btn btn--accent" onClick={() => setGuessing(true)}>
                <Lightbulb size={18} weight="fill" /> Я знаю, кто я!
              </button>
              <button className="btn btn--ghost" onClick={() => send({ t: 'pass' })}>
                <ArrowUUpRight size={18} /> Передать ход
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function AskForm({ again }: { again: boolean }) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  const ask = (t: string) => {
    send({ t: 'ask', text: t.trim().slice(0, LIMITS.question) })
    setText('')
  }
  return (
    <form
      className="ask"
      onSubmit={(e) => {
        e.preventDefault()
        if (text.trim()) ask(text)
      }}
    >
      <div className="ask__field">
        <Question size={20} className="ask__icon" />
        <input
          ref={ref}
          className="ask__input"
          value={text}
          maxLength={LIMITS.question}
          placeholder={again ? 'Спросить ещё…' : 'Спроси что-нибудь: «Я человек?»'}
          onChange={(e) => setText(e.target.value)}
          aria-label="Вопрос"
        />
        <button type="submit" className="btn btn--primary" disabled={!text.trim()}>
          Спросить <ArrowRight size={16} weight="bold" />
        </button>
      </div>
      <button type="button" className="btn ask__voice" onClick={() => ask('')} title="Если спросил голосом в чате">
        <Microphone size={18} /> Спросил вслух
      </button>
    </form>
  )
}

function GuessForm({ onCancel }: { onCancel(): void }) {
  const [text, setText] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return (
    <form
      className="guess"
      onSubmit={(e) => {
        e.preventDefault()
        const t = text.trim()
        if (t) send({ t: 'guess', text: t.slice(0, LIMITS.guess) })
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onCancel()
      }}
    >
      <span className="guess__lead">Я —</span>
      <input
        ref={ref}
        className="guess__input"
        value={text}
        maxLength={LIMITS.guess}
        placeholder="кто?"
        onChange={(e) => setText(e.target.value)}
        aria-label="Кто ты"
      />
      <button type="submit" className="btn btn--primary btn--lg" disabled={!text.trim()}>
        Назвать
      </button>
      <button type="button" className="btn btn--ghost" onClick={onCancel}>
        Пока нет
      </button>
    </form>
  )
}

// ——— чужой ход ———

function TheirTurn({ view, g, you, turnP, canAnswer }: { view: RoomView; g: GameView; you: string | null; turnP: PlayerView; canAnswer: boolean }) {
  const card = g.cards[turnP.id]
  const q = g.phase === 'answers' ? g.question : null
  const mine = q && you ? q.answers[you] : undefined

  useEffect(() => {
    if (!q || !canAnswer) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return
      const map: Record<string, Answer> = { Digit1: 'yes', Digit2: 'no', Digit3: 'maybe', KeyL: 'yes', KeyY: 'no', Numpad1: 'yes', Numpad2: 'no', Numpad3: 'maybe' }
      const a = map[e.code]
      if (a) {
        e.preventDefault()
        send({ t: 'answer', a })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [q, canAnswer])

  return (
    <div className="their">
      <TurnSticker p={turnP} text={card?.character ?? null} category={card?.category ?? null} />
      <div className="their__body">
        {q ? (
          <>
            <QuestionLive view={view} g={g} />
            {canAnswer ? (
              <div className="answers" role="group" aria-label="Твой ответ">
                {(['yes', 'no', 'maybe'] as const).map((a, i) => (
                  <motion.button
                    key={a}
                    className={`answer answer--${a} ${mine === a ? 'is-on' : ''} ${mine && mine !== a ? 'is-off' : ''}`}
                    onClick={() => send({ t: 'answer', a })}
                    whileTap={{ scale: 0.95 }}
                    aria-pressed={mine === a}
                  >
                    {mine === a && <Check size={20} weight="bold" />}
                    {a === 'yes' ? 'Да' : a === 'no' ? 'Нет' : 'Не знаю'}
                    <kbd className="kbd">{i + 1}</kbd>
                  </motion.button>
                ))}
              </div>
            ) : (
              <p className="panel-muted">Ты смотришь эту партию</p>
            )}
            {canAnswer && mine && <p className="panel-hint">Можно передумать, пока {turnP.name} не спросит дальше</p>}
          </>
        ) : (
          <>
            <span className="eyebrow">Ходит {turnP.name}</span>
            <h2 className="their__title">
              Думает над вопросом
              <span className="dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </h2>
            <p className="panel-muted">Посмотри на стикер — чтобы отвечать без раздумий.</p>
          </>
        )}
      </div>
    </div>
  )
}

function TurnSticker({ p, text, category }: { p: PlayerView; text: string | null; category: string | null }) {
  return (
    <div className="turn-sticker">
      <Sticker color={p.color} text={text} w={168} rot={tilt(p.id)} category={category} tape />
      <span className="turn-sticker__cap">Стикер {p.name}</span>
    </div>
  )
}

/** Вопрос ходящего и живая сводка ответов. */
function QuestionLive({ view, g, you: self }: { view: RoomView; g: GameView; you?: boolean }) {
  const q = g.question!
  const turnP = view.players.find((p) => p.id === g.turn)
  const t = tally(q.answers)
  const total = responders(view, g).length
  const answered = t.yes + t.no + t.maybe
  const manyNo = self && answered >= Math.max(1, Math.ceil(total / 2)) && t.no > t.yes
  return (
    <div className="qlive">
      <span className="eyebrow">
        {self ? `Твой вопрос №${q.n}` : `${turnP?.name ?? 'Игрок'} спрашивает · №${q.n}`}
      </span>
      {q.text ? (
        <p className="qlive__text">{q.text}</p>
      ) : (
        <p className="qlive__text qlive__text--voice">
          <Microphone size={26} weight="fill" /> {self ? 'Вопрос вслух — все услышали' : 'Спрашивает вслух — слушай'}
        </p>
      )}
      <div className="tally" aria-label="Ответы">
        <TallyChip kind="yes" n={t.yes} label="да" />
        <TallyChip kind="no" n={t.no} label="нет" />
        <TallyChip kind="maybe" n={t.maybe} label="не знаю" />
        <span className="tally__left num">{answered < total ? `ждём ${total - answered}` : 'все ответили'}</span>
      </div>
      {manyNo && <p className="panel-hint">Больше «нет», чем «да» — обычно в этот момент передают ход</p>}
    </div>
  )
}

function TallyChip({ kind, n, label }: { kind: Answer; n: number; label: string }) {
  return (
    <span className={`tally__chip tally__chip--${kind} ${n ? 'is-on' : ''}`}>
      <motion.b key={n} className="num" initial={{ scale: 1.5 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 15 }}>
        {n}
      </motion.b>
      {label}
    </span>
  )
}

// ——— проверка догадки ———

function Verdict({ view, g, you, turnP, canVote }: { view: RoomView; g: GameView; you: string | null; turnP: PlayerView; canVote: boolean }) {
  const guess = g.guess
  const card = g.cards[turnP.id]
  const avatars = useApp((s) => s.avatars)
  const myVote = guess && you ? guess.votes[you] : undefined

  useEffect(() => {
    if (!canVote) return
    // Те же клавиши только что отвечали на вопрос: первую секунду голосования их не слушаем,
    // чтобы запоздавшее «Нет» не стало голосом «Не то».
    const armedAt = Date.now() + 1000
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (Date.now() < armedAt || e.repeat) return
      if (el.closest('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.code === 'Digit1' || e.code === 'KeyL') send({ t: 'vote', ok: true })
      else if (e.code === 'Digit2' || e.code === 'KeyY') send({ t: 'vote', ok: false })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canVote])

  if (!guess) return null
  const votes = Object.values(guess.votes)
  const ok = votes.filter(Boolean).length

  return (
    <div className="verdict">
      <div className="verdict__pair">
        <div className="verdict__said">
          <span className="eyebrow">
            <Avatar name={turnP.name} color={turnP.color} src={avatars[turnP.id]} size={22} /> {turnP.name} говорит
          </span>
          <p className="say">
            «Я — <b>{guess.text}</b>»
          </p>
        </div>
        <span className="verdict__vs" aria-hidden="true">
          =?
        </span>
        <Sticker color={turnP.color} text={card?.character ?? null} w={140} rot={tilt(turnP.id)} category={card?.category} tape />
      </div>
      {canVote ? (
        <div className="answers answers--two" role="group" aria-label="Засчитать?">
          <motion.button whileTap={{ scale: 0.95 }} className={`answer answer--yes ${myVote === true ? 'is-on' : ''} ${myVote === false ? 'is-off' : ''}`} onClick={() => send({ t: 'vote', ok: true })} aria-pressed={myVote === true}>
            <Check size={20} weight="bold" /> Верно <kbd className="kbd">1</kbd>
          </motion.button>
          <motion.button whileTap={{ scale: 0.95 }} className={`answer answer--no ${myVote === false ? 'is-on' : ''} ${myVote === true ? 'is-off' : ''}`} onClick={() => send({ t: 'vote', ok: false })} aria-pressed={myVote === false}>
            <X size={20} weight="bold" /> Не то <kbd className="kbd">2</kbd>
          </motion.button>
        </div>
      ) : (
        <p className="panel-muted">Игроки решают, засчитать ли</p>
      )}
      <VoteMeter ok={ok} no={votes.length - ok} need={guess.need} />
    </div>
  )
}

function VoteMeter({ ok, no, need }: { ok: number; no: number; need: number }) {
  return (
    <div className="vmeter" aria-label={`Верно ${ok}, не то ${no}, нужно ${need}`}>
      <div className="vmeter__row">
        {Array.from({ length: need }, (_, i) => (
          <span key={i} className={`vmeter__dot ${i < ok ? 'is-yes' : ''}`} />
        ))}
        <span className="vmeter__label num">верно {ok}/{need}</span>
      </div>
      {no > 0 && (
        <div className="vmeter__row">
          {Array.from({ length: need }, (_, i) => (
            <span key={i} className={`vmeter__dot ${i < no ? 'is-no' : ''}`} />
          ))}
          <span className="vmeter__label num">не то {no}/{need}</span>
        </div>
      )}
    </div>
  )
}
