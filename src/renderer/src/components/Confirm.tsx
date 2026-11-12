import type { ReactNode } from 'react'
import { Modal } from './Modal'

interface Props {
  open: boolean
  title: string
  children?: ReactNode
  /** Текст кнопки действия. */
  confirm: string
  cancel?: string
  /** danger — красная кнопка (выйти, убрать игрока); иначе кремовая. */
  tone?: 'danger' | 'primary'
  onConfirm(): void
  onClose(): void
}

/** Подтверждение вместо системного confirm(). */
export function Confirm({ open, title, children, confirm, cancel = 'Отмена', tone = 'danger', onConfirm, onClose }: Props) {
  return (
    <Modal open={open} title={title} onClose={onClose} width={420}>
      {children && <p className="modal__lede">{children}</p>}
      <div className="modal__actions">
        <button className="btn btn--ghost" onClick={onClose}>
          {cancel}
        </button>
        <button
          className={`btn ${tone === 'danger' ? 'btn--danger' : 'btn--primary'}`}
          autoFocus
          onClick={() => {
            onConfirm()
            onClose()
          }}
        >
          {confirm}
        </button>
      </div>
    </Modal>
  )
}
