import { create } from 'zustand'
import type { RoomEvent, RoomView } from '../../../protocol/index.ts'
import type { UpdateState } from '../../../preload/api'
import { load, save } from '../lib/storage'
import { randomToken } from '../lib/id'

export const PLAYER_COLORS = ['#ffd95a', '#ffb072', '#ff8a7a', '#f58fb8', '#c3a2f5', '#8ec5ff', '#7fe0c0', '#c5e26a']

export interface ProfileState {
  name: string
  color: string
  avatar: string | null
  token: string
}

export interface Settings {
  volume: number
  muted: boolean
  reduceMotion: boolean
  /** Звук, когда наступает твой ход. */
  turnSound: boolean
}

export type ConnState = 'idle' | 'connecting' | 'online' | 'reconnecting'

export interface Toast {
  id: number
  text: string
  tone: 'info' | 'error'
}

interface AppState {
  profile: ProfileState
  settings: Settings
  screen: 'home' | 'room'
  code: string | null
  conn: ConnState
  homeError: string | null
  you: string | null
  view: RoomView | null
  /** Последняя пачка событий: по ней играют звук и анимация. */
  events: { seq: number; list: RoomEvent[] }
  avatars: Record<string, string>
  toasts: Toast[]
  update: UpdateState
  appVersion: string
  notes: { seen: string | null; all: boolean } | null
  settingsOpen: boolean
  setProfile(p: Partial<ProfileState>): void
  setSettings(s: Partial<Settings>): void
  toast(text: string, tone?: Toast['tone']): void
  dismissToast(id: number): void
}

const randomColor = () => PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)]!
const defaultProfile = (): ProfileState => ({ name: '', color: randomColor(), avatar: null, token: '' })

const defaultSettings: Settings = {
  volume: 0.7,
  muted: false,
  reduceMotion: typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  turnSound: true,
}

function initialProfile(): ProfileState {
  const p = load('profile', defaultProfile())
  // Цвет из старой палитры или чужой — заменяем на стикер.
  const fresh = !p.token || !PLAYER_COLORS.includes(p.color)
  if (!PLAYER_COLORS.includes(p.color)) p.color = randomColor()
  if (!p.token) p.token = randomToken()
  if (fresh) save('profile', p)
  return p
}

let toastSeq = 0

export const useApp = create<AppState>((set, get) => ({
  profile: initialProfile(),
  settings: (({ volume, muted, reduceMotion, turnSound }) => ({ volume, muted, reduceMotion, turnSound }))(load('settings', defaultSettings)),
  screen: 'home',
  code: null,
  conn: 'idle',
  homeError: null,
  you: null,
  view: null,
  events: { seq: 0, list: [] },
  avatars: {},
  toasts: [],
  update: { state: 'idle' },
  appVersion: '0.0.0',
  notes: null,
  settingsOpen: false,
  setProfile(p) {
    const profile = { ...get().profile, ...p }
    save('profile', profile)
    set({ profile })
  },
  setSettings(s) {
    const settings = { ...get().settings, ...s }
    save('settings', settings)
    set({ settings })
  },
  toast(text, tone = 'info') {
    const id = ++toastSeq
    set({ toasts: [...get().toasts, { id, text, tone }].slice(-3) })
    setTimeout(() => get().dismissToast(id), tone === 'error' ? 5000 : 3200)
  },
  dismissToast(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  },
}))
