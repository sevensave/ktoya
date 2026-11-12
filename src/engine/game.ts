// Правила «Кто я?». Чистые функции над состоянием партии, без сети и UI.
// Типы здесь свои (движок не импортирует протокол), по форме совпадают с src/protocol/view.ts.

export type RandomInt = (maxExclusive: number) => number
export type Answer = 'yes' | 'no' | 'maybe'
export type FinishMode = 'first' | 'all'
export type CardStatus = 'playing' | 'guessed' | 'gaveup'
export type Phase = 'ask' | 'answers' | 'verdict' | 'over'

/** Сколько записей ленты держим. */
export const LOG_MAX = 200

export type Card = {
  character: string
  /** Название категории колоды, null у написанных игроками. */
  category: string | null
  /** Кто написал (source: players). */
  by: string | null
  status: CardStatus
  place: number | null
  questions: number
  tries: number
}

export type Question = { by: string; n: number; text: string; answers: Record<string, Answer> }

export type Attempt = {
  by: string
  text: string
  /** Кто голосует: остальные игроки партии, бывшие онлайн в момент попытки. */
  voters: string[]
  votes: Record<string, boolean>
  need: number
}

export type LogEntry =
  | { kind: 'q'; by: string; text: string; yes: number; no: number; maybe: number }
  | { kind: 'guess'; by: string; text: string; ok: boolean }
  | { kind: 'giveup'; by: string }

export type GameState = {
  order: string[]
  cards: Record<string, Card>
  turn: string | null
  phase: Phase
  question: Question | null
  guess: Attempt | null
  log: LogEntry[]
  finish: FinishMode
}

export type Sticker = { character: string; category: string | null; by: string | null }

/** Итог попытки: character и place только при ok. */
export type Verdict = { by: string; ok: boolean; character?: string; place?: number }

export function cryptoRandomInt(max: number): number {
  const buf = new Uint32Array(1)
  // отбрасываем хвост, чтобы не было перекоса
  const limit = Math.floor(0x1_0000_0000 / max) * max
  do crypto.getRandomValues(buf)
  while (buf[0]! >= limit)
  return buf[0]! % max
}

export function seededRandomInt(seed: number): RandomInt {
  let s = seed >>> 0 || 1
  return (max) => {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return s % max
  }
}

export function shuffle<T>(arr: T[], rnd: RandomInt): T[] {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd(i + 1)
    ;[a[i], a[j]] = [a[j]!, a[i]!]
  }
  return a
}

/** Нормализация для сравнения имён: регистр, ё→е, только буквы и цифры, одиночные пробелы. */
export function normName(s: string): string {
  return s
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}

/** Чистит имя персонажа (из колоды или от игрока): пробелы, длина. null — пусто. */
export function cleanCharacter(s: string, max = 40): string | null {
  const w = s.replace(/\s+/g, ' ').trim().slice(0, max).trim()
  return normName(w) ? w : null
}

export class GameError extends Error {
  code: GameErrorCode
  constructor(code: GameErrorCode) {
    super(code)
    this.code = code
  }
}
export type GameErrorCode = 'not_your_turn' | 'wrong_phase' | 'not_in_game' | 'already_done' | 'not_voter' | 'bad_game'

/** Большинство от числа голосующих. */
export const majority = (n: number): number => Math.floor(n / 2) + 1

export function newGame(order: readonly string[], stickers: Record<string, Sticker>, finish: FinishMode): GameState {
  if (order.length === 0 || order.some((id) => !stickers[id])) throw new GameError('bad_game')
  const cards: Record<string, Card> = {}
  for (const id of order) {
    const s = stickers[id]!
    cards[id] = { character: s.character, category: s.category, by: s.by, status: 'playing', place: null, questions: 0, tries: 0 }
  }
  return { order: [...order], cards, turn: order[0]!, phase: 'ask', question: null, guess: null, log: [], finish }
}

const pushLog = (g: GameState, e: LogEntry) => {
  g.log.push(e)
  if (g.log.length > LOG_MAX) g.log.splice(0, g.log.length - LOG_MAX)
}

/** Текущий вопрос уходит в ленту с подсчётом ответов. */
function closeQuestion(g: GameState) {
  const q = g.question
  if (!q) return
  const n = { yes: 0, no: 0, maybe: 0 }
  for (const a of Object.values(q.answers)) n[a]++
  pushLog(g, { kind: 'q', by: q.by, text: q.text, ...n })
  g.question = null
}

function requireTurn(g: GameState, by: string) {
  if (g.phase === 'over') throw new GameError('wrong_phase')
  if (g.turn !== by) throw new GameError('not_your_turn')
  if (g.phase !== 'ask' && g.phase !== 'answers') throw new GameError('wrong_phase')
}

/** Ходящий задаёт вопрос; прежний уходит в ленту. */
export function ask(g: GameState, by: string, text: string): Question {
  requireTurn(g, by)
  closeQuestion(g)
  const card = g.cards[by]!
  card.questions++
  g.question = { by, n: card.questions, text: text.replace(/\s+/g, ' ').trim(), answers: {} }
  g.phase = 'answers'
  return g.question
}

/** Остальные игроки партии отвечают; передумать можно. */
export function answer(g: GameState, by: string, a: Answer): void {
  if (!g.cards[by]) throw new GameError('not_in_game')
  if (g.phase !== 'answers' || !g.question) throw new GameError('wrong_phase')
  if (by === g.turn) throw new GameError('not_your_turn')
  g.question.answers[by] = a
}

/**
 * Ходящий называет ответ. voters — кто может голосовать (сервер передаёт онлайн-игроков партии).
 * Вернёт вердикт, если всё решилось сразу (точное совпадение или голосовать некому), иначе null — фаза verdict.
 */
export function startGuess(g: GameState, by: string, text: string, voters: readonly string[]): Verdict | null {
  requireTurn(g, by)
  closeQuestion(g)
  const card = g.cards[by]!
  card.tries++
  const t = text.replace(/\s+/g, ' ').trim()
  const vs = voters.filter((id, i) => id !== by && !!g.cards[id] && voters.indexOf(id) === i)
  g.guess = { by, text: t, voters: vs, votes: {}, need: majority(vs.length) }
  if (normName(t) && normName(t) === normName(card.character)) return resolve(g, true)
  if (vs.length === 0) return resolve(g, false)
  g.phase = 'verdict'
  return null
}

/** Голос за или против названного ответа (можно передумать, пока не решено). */
export function vote(g: GameState, by: string, ok: boolean): Verdict | null {
  const a = g.guess
  if (g.phase !== 'verdict' || !a) throw new GameError('wrong_phase')
  if (!a.voters.includes(by)) throw new GameError('not_voter')
  a.votes[by] = ok
  return tally(g)
}

/** Голосующий выбыл из комнаты: пересчитываем, сколько нужно. */
export function dropVoter(g: GameState, id: string): Verdict | null {
  const a = g.guess
  if (g.phase !== 'verdict' || !a || !a.voters.includes(id)) return null
  a.voters = a.voters.filter((x) => x !== id)
  delete a.votes[id]
  a.need = majority(a.voters.length)
  if (a.voters.length === 0) return resolve(g, false)
  return tally(g)
}

/** Время голосования вышло: решаем по набранным голосам, ничья или пусто — не засчитано. */
export function closeVote(g: GameState): Verdict {
  const a = g.guess
  if (g.phase !== 'verdict' || !a) throw new GameError('wrong_phase')
  const { yes, no } = count(a)
  return resolve(g, yes > no)
}

function count(a: Attempt) {
  let yes = 0
  let no = 0
  for (const id of a.voters) {
    const v = a.votes[id]
    if (v === true) yes++
    else if (v === false) no++
  }
  return { yes, no }
}

function tally(g: GameState): Verdict | null {
  const a = g.guess!
  const { yes, no } = count(a)
  if (yes >= a.need) return resolve(g, true)
  if (no >= a.need) return resolve(g, false)
  if (yes + no >= a.voters.length) return resolve(g, false) // все проголосовали, ничья
  return null
}

/** Закрывает попытку. Ход не передаёт — это делает advance(). */
function resolve(g: GameState, ok: boolean): Verdict {
  const a = g.guess!
  const card = g.cards[a.by]!
  pushLog(g, { kind: 'guess', by: a.by, text: a.text, ok })
  g.guess = null
  g.phase = 'ask'
  if (!ok) return { by: a.by, ok: false }
  card.status = 'guessed'
  card.place = Object.values(g.cards).filter((c) => c.status === 'guessed').length
  return { by: a.by, ok: true, character: card.character, place: card.place }
}

/** Сдаться может любой неотгадавший игрок партии в любой фазе. Вернёт его персонажа. */
export function giveup(g: GameState, id: string): string {
  const card = g.cards[id]
  if (!card) throw new GameError('not_in_game')
  if (g.phase === 'over') throw new GameError('wrong_phase')
  if (card.status !== 'playing') throw new GameError('already_done')
  card.status = 'gaveup'
  if (g.turn === id) {
    closeQuestion(g)
    g.guess = null
    g.phase = 'ask'
  }
  pushLog(g, { kind: 'giveup', by: id })
  return card.character
}

/** Пора ли заканчивать партию. */
export function isFinished(g: GameState): boolean {
  const cards = Object.values(g.cards)
  if (g.finish === 'first' && cards.some((c) => c.status === 'guessed')) return true
  return !cards.some((c) => c.status === 'playing')
}

/**
 * Передаёт ход следующему по кругу со статусом playing. prefer — кого предпочесть (онлайн):
 * если такой есть, остальных пропускаем. Вернёт новый ход или null, если партия кончилась.
 */
export function advance(g: GameState, prefer?: (id: string) => boolean): string | null {
  if (g.phase === 'over') return null
  closeQuestion(g)
  g.guess = null
  if (isFinished(g)) {
    g.phase = 'over'
    g.turn = null
    return null
  }
  const n = g.order.length
  const start = g.turn ? g.order.indexOf(g.turn) : -1
  const ring: string[] = []
  for (let i = 1; i <= n; i++) ring.push(g.order[(start + i + n) % n]!)
  const playing = ring.filter((id) => g.cards[id]!.status === 'playing')
  const next = (prefer && playing.find(prefer)) || playing[0]!
  g.turn = next
  g.phase = 'ask'
  return next
}

/** Ходящий передаёт ход. */
export function pass(g: GameState, by: string, prefer?: (id: string) => boolean): string | null {
  requireTurn(g, by)
  return advance(g, prefer)
}
