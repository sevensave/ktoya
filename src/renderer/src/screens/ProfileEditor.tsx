import { useRef, useState } from 'react'
import { Camera, Trash } from '@phosphor-icons/react'
import { LIMITS } from '../../../protocol/index.ts'
import { Avatar } from '../components/Avatar'
import { avatarFromFile } from '../lib/image'
import { PLAYER_COLORS, useApp } from '../store/app'

const COLOR_NAMES = ['Лимонный', 'Персиковый', 'Коралловый', 'Розовый', 'Сиреневый', 'Голубой', 'Мятный', 'Салатовый']

/** Имя, цвет стикера и картинка. Всё сохраняется сразу. */
export function ProfileEditor({ autoFocus, onSubmit, nameError }: { autoFocus?: boolean; onSubmit?: () => void; nameError?: string | null }) {
  const profile = useApp((s) => s.profile)
  const setProfile = useApp((s) => s.setProfile)
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const pick = async (file: File | undefined) => {
    if (!file) return
    try {
      setError(null)
      setProfile({ avatar: await avatarFromFile(file) })
    } catch {
      setError('Не получилось открыть картинку. Подойдёт PNG, JPG или WebP.')
    }
  }

  return (
    <div className="profile">
      <div className="profile__top">
        <button className="profile__avatar" onClick={() => fileRef.current?.click()} aria-label={profile.avatar ? 'Сменить картинку' : 'Поставить картинку'} title="Своя картинка">
          <Avatar name={profile.name || '?'} color={profile.color} src={profile.avatar} size={76} />
          <span className="profile__avatar-badge">
            <Camera size={15} weight="bold" />
          </span>
        </button>
        <label className="field profile__name">
          <span className="field__label">Как тебя зовут</span>
          <input
            id="profile-name"
            className="input input--lg"
            type="text"
            aria-invalid={nameError ? true : undefined}
            value={profile.name}
            maxLength={LIMITS.name}
            autoFocus={autoFocus}
            placeholder="Например, Лёша"
            onChange={(e) => setProfile({ name: e.target.value })}
            onKeyDown={(e) => e.key === 'Enter' && profile.name.trim() && onSubmit?.()}
          />
          {nameError && <span className="field__error">{nameError}</span>}
        </label>
      </div>
      <div className="field">
        <div className="row">
          <span className="field__label">Цвет твоего стикера</span>
          {profile.avatar && (
            <button className="btn btn--sm btn--ghost" onClick={() => setProfile({ avatar: null })}>
              <Trash size={15} /> Убрать картинку
            </button>
          )}
        </div>
        <div className="colors" role="radiogroup" aria-label="Цвет стикера">
          {PLAYER_COLORS.map((c, i) => (
            <button
              key={c}
              role="radio"
              className={`color ${profile.color === c ? 'is-on' : ''}`}
              style={{ background: c }}
              onClick={() => setProfile({ color: c })}
              aria-label={COLOR_NAMES[i]}
              aria-checked={profile.color === c}
              title={COLOR_NAMES[i]}
            />
          ))}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => void pick(e.target.files?.[0])} />
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}
