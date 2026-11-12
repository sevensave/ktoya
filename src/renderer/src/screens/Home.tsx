import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type Ref } from 'react'
import { ArrowCounterClockwise, ArrowRight, CaretDown, ClipboardText, GearSix } from '@phosphor-icons/react'
import { formatCode } from '../lib/format'
import { isMac, native } from '../lib/native'
import { cancelJoin, createRoom, joinByCode, lastRoom } from '../net/connection'
import { useApp } from '../store/app'
import { ProfileEditor } from './ProfileEditor'
import './home.css'

const digitsOf = (s: string) => s.replace(/\D/g, '').slice(0, 6)

export function Home() {
  const profile = useApp((s) => s.profile)
  const conn = useApp((s) => s.conn)
  const code = useApp((s) => s.code)
  const error = useApp((s) => s.homeError)
  const reduce = useApp((s) => s.settings.reduceMotion)
  const [digits, setDigits] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const recent = lastRoom()
  const busy = conn === 'connecting'
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (profile.name.trim()) setNameError(null)
  }, [profile.name])

  /** Без имени не пускаем: подсвечиваем поле рядом. */
  const withName = (fn: () => void) => {
    if (profile.name.trim()) return fn()
    setNameError('Сначала напиши имя — его увидят друзья')
    document.getElementById('profile-name')?.focus()
  }
  const join = (c = digits) => {
    if (c.length !== 6) return codeRef.current?.focus()
    withName(() => void joinByCode(c))
  }

  // Код в буфере: Ctrl+V где угодно на экране вставляет его в поле.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return
      const d = digitsOf(e.clipboardData?.getData('text') ?? '')
      if (d.length === 6) {
        setDigits(d)
        codeRef.current?.focus()
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  const pasteFromClipboard = async () => {
    try {
      const d = digitsOf(await navigator.clipboard.readText())
      if (d.length) setDigits(d)
      if (d.length !== 6) useApp.getState().toast('В буфере нет кода из шести цифр')
      codeRef.current?.focus()
    } catch {
      codeRef.current?.focus()
    }
  }

  return (
    <div className={`home ${isMac && native ? 'is-mac' : ''}`}>
      <div className="home__drag" />
      <button className="icon-btn home__settings" onClick={() => useApp.setState({ settingsOpen: true })} aria-label="Настройки" title="Настройки">
        <GearSix size={22} />
      </button>

      <section className="home__hero">
        <motion.div
          className="home__headline"
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <h1 className="home__title">
            Кто <span className="home__title-mark">я?</span>
          </h1>
          <p className="home__lede">У каждого на лбу стикер с персонажем. Его видят все, кроме тебя. Спрашивай «да или нет» и угадай, кто ты.</p>
        </motion.div>
        <HeroStickers reduce={reduce} />
      </section>

      <motion.main
        className="home__panel"
        initial={reduce ? false : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="home__card panel">
          <ProfileEditor nameError={nameError} />

          <button className={`btn btn--primary btn--lg btn--block ${busy && !code ? 'is-loading' : ''}`} onClick={() => withName(() => void createRoom())} disabled={busy}>
            Создать комнату
          </button>

          <div className="home__or">
            <span>или войди по коду от друзей</span>
          </div>

          <div className="home__join">
            <CodeInput ref={codeRef} value={digits} onChange={setDigits} onSubmit={() => join()} disabled={busy} />
            <button className={`btn btn--lg home__join-btn ${busy && code ? 'is-loading' : ''}`} onClick={() => join()} disabled={busy || digits.length !== 6}>
              Войти {!(busy && code) && <ArrowRight size={18} weight="bold" />}
            </button>
          </div>

          <div className="home__under">
            <AnimatePresence mode="wait" initial={false}>
              {busy ? (
                <motion.div key="busy" className="home__status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <span className="pulse pulse--warn" />
                  {code ? `Ищем комнату ${formatCode(code)}…` : 'Создаём комнату…'}
                  <button className="link-btn" onClick={cancelJoin}>
                    Отмена
                  </button>
                </motion.div>
              ) : error ? (
                <motion.p key="err" className="form-error" role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  {error}
                </motion.p>
              ) : (
                <motion.div key="tools" className="home__tools" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {recent ? (
                    <button className="link-btn" onClick={() => join(recent)}>
                      <ArrowCounterClockwise size={15} /> Вернуться в <span className="num">{formatCode(recent)}</span>
                    </button>
                  ) : (
                    <span />
                  )}
                  <button className="link-btn" onClick={() => void pasteFromClipboard()}>
                    <ClipboardText size={15} /> Вставить код
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <HowTo />
      </motion.main>

      <Footer />
    </div>
  )
}

function CodeInput({
  ref,
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  ref: Ref<HTMLInputElement>
  value: string
  onChange(v: string): void
  onSubmit(): void
  disabled?: boolean
}) {
  // Одно настоящее поле под шестью ячейками: быстрый ввод и вставка «490 379» не теряют цифры.
  const [focused, setFocused] = useState(false)
  return (
    <label className={`code ${focused ? 'is-focused' : ''} ${value.length === 6 ? 'is-full' : ''}`}>
      <input
        ref={ref}
        className="code__input"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        value={value}
        disabled={disabled}
        aria-label="Код комнаты из шести цифр"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(digitsOf(e.target.value))}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
      />
      {Array.from({ length: 6 }, (_, i) => (
        <span
          key={i}
          className={`code__cell num ${i === 3 ? 'is-gap' : ''} ${value[i] ? 'is-filled' : ''} ${focused && i === Math.min(value.length, 5) ? 'is-active' : ''}`}
          aria-hidden="true"
        >
          {value[i] ?? ''}
        </span>
      ))}
    </label>
  )
}

const STEPS = [
  { t: 'Создай комнату', d: 'и отправь друзьям шесть цифр кода.' },
  { t: 'Получи стикер', d: 'Персонажа выберет колода или напишут друзья.' },
  { t: 'Спрашивай', d: '«Я живой?», «Я из кино?» — пока не угадаешь, кто ты.' },
]

function HowTo() {
  const [open, setOpen] = useState(false)
  return (
    <div className={`howto ${open ? 'is-open' : ''}`}>
      <button className="howto__toggle" onClick={() => setOpen(!open)} aria-expanded={open}>
        Как играть
        <CaretDown size={14} weight="bold" className="howto__caret" />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ol
            className="howto__steps"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            {STEPS.map((s, i) => (
              <li key={s.t}>
                <span className="howto__n hand">{i + 1}</span>
                <span>
                  <b>{s.t}</b> {s.d}
                </span>
              </li>
            ))}
          </motion.ol>
        )}
      </AnimatePresence>
    </div>
  )
}

function Footer() {
  const version = useApp((s) => s.appVersion)
  const update = useApp((s) => s.update)
  return (
    <footer className="home__foot">
      <button className="home__link" onClick={() => useApp.setState({ notes: { seen: null, all: true } })}>
        Что нового
      </button>
      <span className="home__dot" aria-hidden="true" />
      <span className="num">v{version}</span>
      {update.state === 'downloading' && (
        <span className="home__update">
          <span className="spinner" style={{ width: 11, height: 11 }} /> Качаем {update.version}
        </span>
      )}
      {update.state === 'ready' && <span className="home__update is-ready">Версия {update.version} встанет после перезапуска</span>}
      {update.state === 'available' && (
        <a className="home__update is-ready" href={update.url} target="_blank" rel="noreferrer">
          Вышла версия {update.version}
        </a>
      )}
    </footer>
  )
}

/** Декоративная сцена: стикеры с персонажами и главный — со знаком вопроса. */
const HERO = [
  { text: 'Шерлок Холмс', color: 'var(--st-sky)', x: '4%', y: '8%', r: -6, w: '27%', delay: 0.15 },
  { text: 'Чебурашка', color: 'var(--st-mint)', x: '68%', y: '2%', r: 5, w: '25%', delay: 0.25 },
  { text: 'Наполеон', color: 'var(--st-peach)', x: '76%', y: '60%', r: -4, w: '23%', delay: 0.35 },
  { text: 'Гарри Поттер', color: 'var(--st-lilac)', x: '2%', y: '66%', r: 4, w: '26%', delay: 0.45 },
]

function HeroStickers({ reduce }: { reduce: boolean }) {
  return (
    <div className="hero" aria-hidden="true">
      {HERO.map((s) => (
        <motion.div
          key={s.text}
          className="hero__sticker paper paper--tape"
          style={{ left: s.x, top: s.y, width: s.w, ['--st' as string]: s.color }}
          initial={reduce ? { rotate: s.r } : { opacity: 0, scale: 0.6, rotate: s.r * 3, y: 30 }}
          animate={{ opacity: 1, scale: 1, rotate: s.r, y: 0 }}
          whileHover={reduce ? undefined : { rotate: 0, scale: 1.06, y: -4 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16, delay: reduce ? 0 : s.delay }}
        >
          <span className="hand">{s.text}</span>
        </motion.div>
      ))}
      <motion.div
        className="hero__main paper paper--curl"
        style={{ ['--st' as string]: 'var(--st-lemon)' }}
        initial={reduce ? { rotate: -3 } : { opacity: 0, scale: 0.5, rotate: -18 }}
        animate={{ opacity: 1, scale: 1, rotate: -3 }}
        whileHover={reduce ? undefined : { rotate: 2, scale: 1.03 }}
        transition={{ type: 'spring', stiffness: 220, damping: 14, delay: reduce ? 0 : 0.05 }}
      >
        <span className="hero__q hand">?</span>
      </motion.div>
    </div>
  )
}
