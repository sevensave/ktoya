import { memo } from 'react'
import { initials } from '../lib/format'

interface Props {
  name: string
  color: string
  src?: string | null
  size: number
  dim?: boolean
  className?: string
}

/** Квадратный стикер цвета игрока: картинка или инициалы «от руки». */
export const Avatar = memo(function Avatar({ name, color, src, size, dim, className }: Props) {
  return (
    <div
      className={`avatar ${className ?? ''}`}
      style={{
        width: size,
        height: size,
        background: src
          ? `center / cover no-repeat url(${src}), ${color}`
          : `linear-gradient(160deg, rgb(255 255 255 / 0.3), transparent 45%), ${color}`,
        fontSize: size * 0.5,
        opacity: dim ? 0.4 : 1,
        filter: dim ? 'grayscale(0.6)' : undefined,
      }}
      aria-hidden="true"
    >
      {!src && <span>{initials(name)}</span>}
    </div>
  )
})
