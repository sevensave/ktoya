import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { Sticker } from '../../components/Sticker'
import { useApp } from '../../store/app'

const COLORS = ['#ffd95a', '#ffb072', '#ff8a7a', '#f58fb8', '#c3a2f5', '#8ec5ff', '#7fe0c0', '#c5e26a', '#f3ecdf']

/** Бумажное конфетти на canvas: один залп на каждое изменение burst. */
export function Confetti({ burst, power = 1 }: { burst: number; power?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const reduce = useApp((s) => s.settings.reduceMotion)

  useEffect(() => {
    if (!burst || reduce) return
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const W = window.innerWidth
    const H = window.innerHeight
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)
    const N = Math.round(150 * power)
    const parts = Array.from({ length: N }, (_, i) => {
      const fromLeft = i % 2 === 0
      const a = (fromLeft ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.9
      const v = (9 + Math.random() * 9) * Math.min(1.3, H / 700)
      return {
        x: fromLeft ? W * 0.08 : W * 0.92,
        y: H * 0.85,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v * 1.25,
        w: 6 + Math.random() * 8,
        h: 4 + Math.random() * 6,
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.35,
        c: COLORS[i % COLORS.length]!,
        flip: Math.random() * Math.PI,
      }
    })
    let raf = 0
    const t0 = performance.now()
    const tick = (t: number) => {
      const el = t - t0
      ctx.clearRect(0, 0, W, H)
      const fade = Math.max(0, 1 - Math.max(0, el - 1800) / 900)
      for (const p of parts) {
        p.vy += 0.32
        p.vx *= 0.985
        p.vy *= 0.985
        p.x += p.vx
        p.y += p.vy
        p.r += p.vr
        p.flip += 0.12
        ctx.save()
        ctx.globalAlpha = fade
        ctx.translate(p.x, p.y)
        ctx.rotate(p.r)
        ctx.scale(1, Math.cos(p.flip))
        ctx.fillStyle = p.c
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        ctx.restore()
      }
      if (fade > 0) raf = requestAnimationFrame(tick)
      else ctx.clearRect(0, 0, W, H)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [burst, power, reduce])

  return <canvas ref={ref} className="confetti" aria-hidden="true" />
}

export interface Moment {
  key: number
  /** mine — это я отгадал; other — кто-то другой; giveup — кто-то сдался. */
  kind: 'mine' | 'other' | 'giveup' | 'mine-giveup'
  name: string
  color: string
  character: string
  place?: number
}

/** Большой момент «Ты — …!» и плашка про чужую разгадку. */
export function MomentLayer({ moment, onDone }: { moment: Moment | null; onDone(): void }) {
  useEffect(() => {
    if (!moment) return
    const t = setTimeout(onDone, moment.kind === 'mine' ? 4200 : 3400)
    return () => clearTimeout(t)
  }, [moment, onDone])

  const big = moment && (moment.kind === 'mine' || moment.kind === 'mine-giveup')
  return (
    <AnimatePresence>
      {moment && big && (
        <motion.div
          key={moment.key}
          className="moment"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onDone}
        >
          <motion.div
            className="moment__card"
            initial={{ scale: 0.6, y: 40, rotate: -6 }}
            animate={{ scale: 1, y: 0, rotate: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 200, damping: 16 }}
          >
            <span className="eyebrow">{moment.kind === 'mine' ? (moment.place === 1 ? 'Первое место!' : `${moment.place}-е место`) : 'Ничего, бывает'}</span>
            <Sticker color={moment.color} text={moment.character} w={260} rot={-3} tape />
            <h2 className="moment__title">
              Ты — <span>{moment.character}</span>
              {moment.kind === 'mine' ? '!' : ''}
            </h2>
            <p className="moment__sub">{moment.kind === 'mine' ? 'Теперь отвечай остальным' : 'Отвечай остальным — им ещё угадывать'}</p>
          </motion.div>
        </motion.div>
      )}
      {moment && !big && (
        <motion.div
          key={moment.key}
          className={`banner banner--${moment.kind}`}
          initial={{ opacity: 0, y: -24, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ type: 'spring', stiffness: 360, damping: 26 }}
          onClick={onDone}
        >
          <span className="banner__swatch" style={{ background: moment.color }} />
          {moment.kind === 'other' ? (
            <span>
              <b>{moment.name}</b> угадывает себя: «{moment.character}»
              {moment.place ? <em className="num"> · {moment.place}-е место</em> : null}
            </span>
          ) : (
            <span>
              <b>{moment.name}</b> сдаётся. Это был «{moment.character}»
            </span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
