import type { CSSProperties } from 'react'
import { SpeakerHigh, SpeakerSlash } from '@phosphor-icons/react'
import { Modal } from '../components/Modal'
import { Switch } from '../components/Switch'
import { sound } from '../audio/sound'
import { native } from '../lib/native'
import { useApp, type Settings } from '../store/app'
import { ProfileEditor } from './ProfileEditor'

const TOGGLES: { key: keyof Settings; title: string; hint: string }[] = [
  { key: 'turnSound', title: 'Звук, когда твой ход', hint: 'Чтобы не прозевать очередь, даже если окно свёрнуто.' },
  { key: 'reduceMotion', title: 'Меньше анимации', hint: 'Стикеры появляются без прыжков и поворотов.' },
]

export function SettingsModal() {
  const open = useApp((s) => s.settingsOpen)
  const s = useApp((st) => st.settings)
  const set = useApp((st) => st.setSettings)
  const version = useApp((st) => st.appVersion)
  const update = useApp((st) => st.update)
  const inRoom = useApp((st) => st.screen === 'room')
  const close = () => useApp.setState({ settingsOpen: false })
  const vol = s.muted ? 0 : s.volume

  return (
    <Modal open={open} title="Настройки" onClose={close} width={500}>
      {inRoom && <ProfileEditor />}
      <div className={inRoom ? 'settings__group' : 'field'}>
        <span className="field__label">Громкость</span>
        <div className="row">
          <button className="icon-btn icon-btn--sm" onClick={() => set({ muted: !s.muted })} aria-label={s.muted ? 'Включить звук' : 'Выключить звук'}>
            {vol === 0 ? <SpeakerSlash size={18} /> : <SpeakerHigh size={18} />}
          </button>
          <input
            type="range"
            className="range"
            min={0}
            max={1}
            step={0.05}
            value={vol}
            style={{ '--fill': `${vol * 100}%` } as CSSProperties}
            onChange={(e) => set({ volume: Number(e.target.value), muted: false })}
            onPointerUp={() => sound.play('select', { volume: 0.8 })}
            aria-label="Громкость"
          />
          <span className="num" style={{ minWidth: 28, textAlign: 'right', color: 'var(--muted)' }}>
            {Math.round(vol * 100)}
          </span>
        </div>
      </div>
      {TOGGLES.map((t) => (
        <div key={t.key} className="row">
          <div className="row__text">
            <span>{t.title}</span>
            <span className="row__hint">{t.hint}</span>
          </div>
          <Switch checked={!!s[t.key]} onChange={(v) => set({ [t.key]: v } as Partial<Settings>)} label={t.title} />
        </div>
      ))}
      <div className="settings__foot">
        <button className="link-btn" onClick={() => useApp.setState({ notes: { seen: null, all: true }, settingsOpen: false })}>
          Что нового в версии <span className="num">{version}</span>
        </button>
        {update.state === 'ready' && (
          <button className="btn btn--sm btn--primary" onClick={() => native?.update.install()}>
            Обновить до {update.version}
          </button>
        )}
      </div>
    </Modal>
  )
}
