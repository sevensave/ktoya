import { z } from 'zod'
import type { RoomView } from './view.ts'

/** Меняется при несовместимых правках протокола: сервер не пустит старый клиент. */
export const PROTOCOL_VERSION = 1

export const LIMITS = {
  name: 24,
  avatar: 48_000,
  /** Имя персонажа: и в колоде, и написанное игроком. */
  character: 40,
  question: 140,
  guess: 40,
  minPlayers: 2,
  maxPlayers: 10,
} as const

const color = z.string().regex(/^#[0-9a-f]{6}$/i)
const avatar = z.string().max(LIMITS.avatar).startsWith('data:image/').nullable()
const id = z.string().max(40)

/** deck — персонажей раздаёт колода; players — игроки пишут их друг другу. */
export const characterSource = z.enum(['deck', 'players'])
export type CharacterSource = z.infer<typeof characterSource>

/** first — партия до первого угадавшего; all — пока не отгадают все. */
export const finishMode = z.enum(['first', 'all'])
export type FinishMode = z.infer<typeof finishMode>

export const answer = z.enum(['yes', 'no', 'maybe'])
export type Answer = z.infer<typeof answer>

/** Быстрые реакции: событие без состояния. */
export const REACTIONS = ['laugh', 'fire', 'think', 'clap', 'cry', 'heart'] as const
export const reaction = z.enum(REACTIONS)
export type Reaction = z.infer<typeof reaction>

export const roomSettings = z.object({
  source: characterSource,
  /** id категорий колоды; пусто — все. */
  categories: z.array(z.string().max(24)).max(24),
  /** Секунд на ход; 0 — без таймера. */
  turnSeconds: z.number().int().min(0).max(600),
  finish: finishMode,
})
export type RoomSettings = z.infer<typeof roomSettings>
export const DEFAULT_SETTINGS: RoomSettings = { source: 'deck', categories: [], turnSeconds: 0, finish: 'all' }

export const clientMessage = z.discriminatedUnion('t', [
  z.object({
    t: z.literal('hello'),
    v: z.number(),
    name: z.string().min(1).max(LIMITS.name),
    color,
    avatar,
    token: z.string().min(16).max(80),
    appVersion: z.string().max(32),
  }),
  z.object({ t: z.literal('ping'), ts: z.number(), rtt: z.number().nullable() }),
  z.object({ t: z.literal('profile'), name: z.string().min(1).max(LIMITS.name), color, avatar }),
  // Хост комнаты
  z.object({ t: z.literal('settings'), settings: roomSettings }),
  z.object({ t: z.literal('start') }),
  z.object({ t: z.literal('kick'), id }),
  /** Вернуться в лобби тем же составом (после партии или прервать текущую). */
  z.object({ t: z.literal('lobby') }),
  /** Этап assign: не ждать тех, кто ещё не написал — им персонажа выдаст колода. */
  z.object({ t: z.literal('force') }),
  /** Этап play: пропустить ход зависшего игрока. */
  z.object({ t: z.literal('skip') }),
  // Этап assign: написать (или переписать) персонажа своему адресату
  z.object({ t: z.literal('assign'), name: z.string().min(1).max(LIMITS.character) }),
  // Игра. Ходящий:
  /** Задать вопрос. Пустой text — «спросил вслух». */
  z.object({ t: z.literal('ask'), text: z.string().max(LIMITS.question) }),
  z.object({ t: z.literal('pass') }),
  /** Назвать ответ: «Я — …». */
  z.object({ t: z.literal('guess'), text: z.string().min(1).max(LIMITS.guess) }),
  // Игра. Остальные:
  /** Ответить на открытый вопрос. Старые клиенты не передают его номер. */
  z.object({ t: z.literal('answer'), a: answer, question: z.object({ by: id, n: z.number().int().positive() }).optional() }),
  /** Засчитать ли названный ответ. */
  z.object({ t: z.literal('vote'), ok: z.boolean() }),
  // Игра. Любой, кто ещё не отгадал:
  z.object({ t: z.literal('giveup') }),
  z.object({ t: z.literal('react'), r: reaction }),
  z.object({ t: z.literal('leave') }),
])
export type ClientMessage = z.infer<typeof clientMessage>
export type HelloMessage = Extract<ClientMessage, { t: 'hello' }>

export function parseClientMessage(raw: unknown): ClientMessage | null {
  const r = clientMessage.safeParse(raw)
  return r.success ? r.data : null
}

export type RejectReason = 'version' | 'full' | 'kicked' | 'closed'

export type TurnReason = 'start' | 'pass' | 'wrong' | 'solved' | 'giveup' | 'timeout' | 'skip' | 'left'

/** Событие для звука и анимации. Состояние всегда приходит целиком во view. */
export type RoomEvent =
  | { e: 'assign' }
  | { e: 'start' }
  /** Ход перешёл к id. */
  | { e: 'turn'; id: string; reason: TurnReason }
  | { e: 'ask'; by: string; text: string }
  | { e: 'answer'; by: string; a: Answer }
  | { e: 'guess'; by: string; text: string }
  /** Итог попытки. character и place есть только при ok. */
  | { e: 'verdict'; by: string; ok: boolean; character?: string; place?: number }
  | { e: 'giveup'; id: string; character: string }
  | { e: 'over' }
  | { e: 'react'; by: string; r: Reaction }
  | { e: 'join'; id: string }
  | { e: 'leave'; id: string }

export type ServerMessage =
  | { t: 'welcome'; you: string; view: RoomView; avatars: Record<string, string> }
  | { t: 'view'; view: RoomView; events?: RoomEvent[] }
  | { t: 'avatar'; id: string; avatar: string | null }
  | { t: 'reject'; reason: RejectReason; serverVersion?: number }
  | { t: 'error'; code: string }
  | { t: 'pong'; ts: number }
