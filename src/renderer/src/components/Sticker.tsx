import { AnimatePresence, motion } from 'motion/react'
import type { CSSProperties, ReactNode } from 'react'
import type { CardStatus } from '../../../protocol/index.ts'
import { useApp } from '../store/app'
import './sticker.css'

interface Props {
  /** Цвет бумаги, обычно player.color. */
  color: string
  /** Персонаж; null — скрыт («?»). */
  text: string | null
  /** Ширина в px; высота — квадрат. */
  w: number
  rot?: number
  category?: string | null
  status?: CardStatus
  /** Свой неотгаданный стикер: «?» с покачиванием. */
  wobble?: boolean
  /** Подпись внизу стикера («написал Петя», «1-е место»). */
  note?: ReactNode
  /** Своё содержимое вместо текста (поле ввода на этапе assign). */
  children?: ReactNode
  tape?: boolean
  className?: string
  style?: CSSProperties
}

/** Размер рукописного текста: длинные имена мельче, чтобы помещались на стикере. */
function fontFor(text: string, w: number): number {
  const n = text.length
  const k = n <= 6 ? 0.25 : n <= 10 ? 0.2 : n <= 16 ? 0.165 : n <= 24 ? 0.14 : 0.105
  return Math.round(w * k)
}

export function Sticker({ color, text, w, rot = 0, category, status = 'playing', wobble, note, children, tape, className, style }: Props) {
  const reduce = useApp((s) => s.settings.reduceMotion)
  const hidden = text === null && !children
  const face = children ? 'edit' : hidden ? 'q' : `t:${text}`

  return (
    <div
      className={`sticker-wrap ${className ?? ''}`}
      style={{ width: w, height: w, ['--rot' as string]: `${rot}deg`, ...style }}
      data-status={status}
    >
      <div className={`sticker-tilt ${wobble && hidden && !reduce ? 'is-wobble' : ''}`}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={face}
            className={`sticker ${hidden ? 'is-hidden' : ''}`}
            style={{ ['--paper' as string]: color, ['--w' as string]: `${w}px` }}
            initial={reduce ? { opacity: 0 } : { rotateY: -90, opacity: 0.6 }}
            animate={reduce ? { opacity: 1 } : { rotateY: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { rotateY: 90, opacity: 0.6 }}
            transition={reduce ? { duration: 0.15 } : { type: 'spring', stiffness: 260, damping: 22 }}
          >
            {tape && <span className="sticker__tape" aria-hidden="true" />}
            {category && !hidden && <span className="sticker__cat">{category}</span>}
            {children ? (
              children
            ) : hidden ? (
              <span className="sticker__q" style={{ fontSize: Math.round(w * 0.55) }} aria-label="Неизвестно">
                ?
              </span>
            ) : (
              <span className="sticker__text" style={{ fontSize: fontFor(text!, w) }}>
                {text}
              </span>
            )}
            {note && <span className="sticker__note">{note}</span>}
            {status === 'gaveup' && !hidden && <span className="sticker__stamp sticker__stamp--gaveup">сдаюсь</span>}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
