import type { Answer, RoomSettings } from './messages.ts'

export interface PlayerView {
  id: string
  name: string
  color: string
  online: boolean
  /** Вошёл посреди партии: смотрит, видит всех персонажей, в следующей партии играет. */
  spectator: boolean
}

export interface CategoryView {
  id: string
  title: string
  /** Сколько персонажей в категории. */
  count: number
}

export type CardStatus = 'playing' | 'guessed' | 'gaveup'

/** «Стикер на лбу» одного игрока. */
export interface CardView {
  /**
   * Персонаж. null — это твой стикер и ты его ещё не отгадал.
   * Всем остальным, зрителям, а после разгадки/сдачи/конца партии и тебе — виден.
   */
  character: string | null
  /** Название категории колоды («Кино»), null у написанных игроками. Скрыта вместе с персонажем. */
  category: string | null
  /** id игрока, который написал персонажа (source: players). Скрыт от владельца вместе с персонажем. */
  by: string | null
  status: CardStatus
  /** Каким по счёту отгадал (1 — первый), null пока не отгадал. */
  place: number | null
  /** Сколько вопросов задал. */
  questions: number
  /** Сколько раз называл ответ. */
  tries: number
}

export interface QuestionView {
  /** Порядковый номер вопроса этого игрока в партии, с 1. */
  n: number
  /** Пусто — спросил вслух. */
  text: string
  answers: Record<string, Answer>
}

export interface GuessView {
  text: string
  /** Голоса остальных: id → засчитать. */
  votes: Record<string, boolean>
  /** Сколько голосов нужно для решения в любую сторону. */
  need: number
}

/** Запись в ленте партии, по порядку. */
export type LogEntry =
  | { kind: 'q'; by: string; text: string; yes: number; no: number; maybe: number }
  | { kind: 'guess'; by: string; text: string; ok: boolean }
  | { kind: 'giveup'; by: string }

export interface GameView {
  /** Порядок хода по кругу: id игроков партии. */
  order: string[]
  cards: Record<string, CardView>
  /** Чей ход; null после конца. */
  turn: string | null
  /**
   * ask — ходящий думает: спросить, назвать ответ или передать ход.
   * answers — вопрос задан, остальные отвечают; ходящий может спросить ещё, назвать ответ или передать ход.
   * verdict — ответ назван, остальные голосуют.
   */
  phase: 'ask' | 'answers' | 'verdict' | 'over'
  question: QuestionView | null
  guess: GuessView | null
  /** Лента партии (сервер держит не больше 200 последних записей). */
  log: LogEntry[]
  /** Когда истечёт таймер хода (мс эпохи сервера), null — без таймера. */
  deadline: number | null
}

/** Этап, когда игроки пишут персонажей друг другу. */
export interface AssignView {
  /** Кому пишешь ты; null у зрителя. */
  target: string | null
  /** Что ты уже написал. */
  mine: string | null
  /** Кто уже написал. */
  done: string[]
}

export interface RoomView {
  code: string
  hostId: string
  stage: 'lobby' | 'assign' | 'play' | 'over'
  players: PlayerView[]
  settings: RoomSettings
  /** Категории колоды: для настроек в лобби. */
  categories: CategoryView[]
  assign: AssignView | null
  game: GameView | null
  /** Победы (первые места) в этой комнате: id → число. */
  score: Record<string, number>
  /** Почему нельзя начать (для подсказки хосту), null — можно. */
  blocker: string | null
  serverNow: number
}
