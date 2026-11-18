// Комната «Кто я?»: участники, раздача персонажей и партия. Сервер авторитетен — правила считаются здесь,
// клиенту уходит только его вид (свой персонаж владельцу не уходит, пока он его не отгадал). Транспорт не важен:
// attach(link) подключает любое соединение, тесты гоняют комнату без сети.
import {
  GameError, advance, answer, ask, cleanCharacter, closeVote, cryptoRandomInt, dropVoter, giveup, isFinished,
  newGame, normName, pass, shuffle, startGuess, vote,
  type GameState, type RandomInt, type Sticker, type Verdict,
} from '../src/engine/index.ts'
import {
  DEFAULT_SETTINGS, LIMITS, PROTOCOL_VERSION, parseClientMessage,
  type ClientMessage, type GameView, type RoomEvent, type RoomSettings, type RoomView, type ServerMessage,
  type TurnReason, type AssignView,
} from '../src/protocol/index.ts'
import { makeDeck, type Deck } from './deck.ts'

export const ROOM_LIMITS = {
  /** Всего участников (с офлайн и зрителями). */
  members: LIMITS.maxPlayers,
  /** Хост пропал: через столько права переходят другому. */
  hostGraceMs: 20_000,
  /** Никого нет онлайн столько времени — комнату закрываем. */
  emptyTtlMs: 30 * 60_000,
  /** Сколько длится голосование за названный ответ. */
  voteMs: 30_000,
  /** Сколько уже сыгранных персонажей помним, чтобы не повторяться. */
  played: 2000,
}

export interface Link {
  send(msg: ServerMessage): void
  close(): void
}

export interface Session {
  receive(raw: unknown): void
  detach(): void
}

export interface Clock {
  now(): number
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(h: unknown): void
}

export const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
}

interface Member {
  id: string
  token: string
  name: string
  color: string
  avatar: string | null
  link: Link | null
  joinedAt: number
}

/** Этап assign: кольцо игроков, каждый пишет следующему. */
interface AssignState {
  ring: string[]
  /** writer → что написал и кому (запись годна, только пока адресат тот же). */
  written: Record<string, { target: string; name: string }>
}

export interface RoomDeps {
  code: string
  deck?: Deck
  clock?: Clock
  rnd?: RandomInt
  /** Комната опустела надолго — её можно удалить. */
  onEmpty?: () => void
  log?: (s: string) => void
}

export interface RoomSnapshot {
  v: 2
  code: string
  hostId: string | null
  nextId: number
  members: Omit<Member, 'link'>[]
  banned: string[]
  settings: RoomSettings
  stage: RoomView['stage']
  assign: AssignState | null
  game: GameState | null
  score: Record<string, number>
  played: string[]
}

const EMPTY_DECK = makeDeck([])

export class Room {
  readonly code: string
  private members = new Map<string, Member>()
  private banned = new Set<string>()
  private hostId: string | null = null
  private nextId = 1
  private settings: RoomSettings = { ...DEFAULT_SETTINGS }
  private stage: RoomView['stage'] = 'lobby'
  private assign: AssignState | null = null
  private game: GameState | null = null
  private score: Record<string, number> = {}
  /** Нормализованные имена уже сыгранных в комнате персонажей. */
  private played: string[] = []
  private deadline: number | null = null
  private turnTimer: unknown = null
  private hostTimer: unknown = null
  private emptyTimer: unknown = null
  private clock: Clock
  private rnd: RandomInt
  private deck: Deck
  private log: (s: string) => void

  private deps: RoomDeps

  constructor(deps: RoomDeps, snap?: RoomSnapshot) {
    this.deps = deps
    this.code = deps.code
    this.clock = deps.clock ?? realClock
    this.rnd = deps.rnd ?? cryptoRandomInt
    this.deck = deps.deck ?? EMPTY_DECK
    this.log = deps.log ?? (() => {})
    if (snap) this.restore(snap)
    this.armEmpty()
  }

  get online(): number {
    let n = 0
    for (const m of this.members.values()) if (m.link) n++
    return n
  }

  get size(): number {
    return this.members.size
  }

  attach(link: Link): Session {
    let me: Member | null = null
    const session: Session = {
      receive: (raw) => {
        const msg = parseClientMessage(raw)
        if (!msg) return link.send({ t: 'error', code: 'bad_message' })
        if (!me) {
          if (msg.t !== 'hello') return
          me = this.hello(link, msg)
          return
        }
        if (me.link !== link) return // соединение уже заменено новым
        this.handle(me, msg, link)
      },
      detach: () => {
        if (me && me.link === link) this.drop(me)
      },
    }
    return session
  }

  // ——— вход и выход ———

  private hello(link: Link, msg: Extract<ClientMessage, { t: 'hello' }>): Member | null {
    if (msg.v !== PROTOCOL_VERSION) {
      link.send({ t: 'reject', reason: 'version', serverVersion: PROTOCOL_VERSION })
      link.close()
      return null
    }
    if (this.banned.has(msg.token)) {
      link.send({ t: 'reject', reason: 'kicked' })
      link.close()
      return null
    }
    let m = [...this.members.values()].find((x) => x.token === msg.token) ?? null
    if (m) {
      // Тот же игрок вернулся (или открыл вторую вкладку): старое соединение закрываем.
      const old = m.link
      m.link = link
      if (old) old.close()
    } else {
      if (this.members.size >= ROOM_LIMITS.members) {
        // место занимает давно ушедший, не участвующий в партии — освобождаем
        const party = this.party()
        const gone = [...this.members.values()]
          .filter((x) => !x.link && x.id !== this.hostId && !party.includes(x.id))
          .sort((a, b) => a.joinedAt - b.joinedAt)[0]
        if (!gone) {
          link.send({ t: 'reject', reason: 'full' })
          link.close()
          return null
        }
        this.members.delete(gone.id)
        this.sendAll({ t: 'avatar', id: gone.id, avatar: null })
      }
      m = {
        id: `p${this.nextId++}`,
        token: msg.token,
        name: msg.name.trim().slice(0, LIMITS.name) || 'Игрок',
        color: msg.color,
        avatar: msg.avatar,
        link,
        joinedAt: this.clock.now(),
      }
      this.members.set(m.id, m)
    }
    m.name = msg.name.trim() || m.name
    m.color = msg.color
    const avatarChanged = m.avatar !== msg.avatar
    m.avatar = msg.avatar
    if (!this.hostId || !this.members.has(this.hostId)) this.hostId = m.id
    if (this.hostId === m.id && this.hostTimer !== null) {
      this.clock.clearTimeout(this.hostTimer)
      this.hostTimer = null
    }
    if (this.emptyTimer !== null) {
      this.clock.clearTimeout(this.emptyTimer)
      this.emptyTimer = null
    }
    const avatars: Record<string, string> = {}
    for (const x of this.members.values()) if (x.avatar) avatars[x.id] = x.avatar
    link.send({ t: 'welcome', you: m.id, view: this.viewFor(m), avatars })
    if (avatarChanged) this.sendAll({ t: 'avatar', id: m.id, avatar: m.avatar }, m)
    this.broadcast([{ e: 'join', id: m.id }], m)
    return m
  }

  private drop(m: Member) {
    m.link = null
    if (m.id === this.hostId && this.hostTimer === null) {
      this.hostTimer = this.clock.setTimeout(() => {
        this.hostTimer = null
        const cur = this.hostId ? this.members.get(this.hostId) : null
        if (cur?.link) return
        this.passHost()
      }, ROOM_LIMITS.hostGraceMs)
    }
    this.broadcast([{ e: 'leave', id: m.id }])
    this.armEmpty()
  }

  /** Ушёл совсем (leave или кик): посреди партии его карточка считается сданной. */
  private remove(m: Member) {
    this.members.delete(m.id)
    const events: RoomEvent[] = [...this.leaveParty(m.id), { e: 'leave', id: m.id }]
    if (m.id === this.hostId) this.pickHost()
    this.sendAll({ t: 'avatar', id: m.id, avatar: null })
    this.broadcast(events)
    this.armEmpty()
  }

  private leaveParty(id: string): RoomEvent[] {
    const a = this.assign
    if (this.stage === 'assign' && a && a.ring.includes(id)) {
      a.ring = a.ring.filter((x) => x !== id)
      delete a.written[id]
      if (a.ring.length < LIMITS.minPlayers) {
        this.toLobby()
        return []
      }
      return this.allWritten() ? this.beginPlay() : []
    }
    const g = this.playing()
    if (!g || !g.cards[id]) return []
    const events: RoomEvent[] = []
    const v = dropVoter(g, id)
    if (v) events.push(...this.afterVerdict(v))
    if (g.phase !== 'over' && g.cards[id]!.status === 'playing') {
      const wasTurn = g.turn === id
      events.push({ e: 'giveup', id, character: giveup(g, id) })
      if (wasTurn) events.push(...this.nextTurn('left'))
      else if (isFinished(g)) events.push(...this.nextTurn('left'))
    }
    return events
  }

  private passHost() {
    this.pickHost()
    this.broadcast()
  }

  private pickHost() {
    const next = [...this.members.values()].filter((x) => x.link).sort((a, b) => a.joinedAt - b.joinedAt)[0]
    this.hostId = next?.id ?? [...this.members.keys()][0] ?? null
  }

  private armEmpty() {
    if (this.online > 0 || this.emptyTimer !== null) return
    this.emptyTimer = this.clock.setTimeout(() => {
      this.emptyTimer = null
      if (this.online === 0) this.deps.onEmpty?.()
    }, ROOM_LIMITS.emptyTtlMs)
  }

  /** Сервер выключается: всех предупреждать не нужно, клиенты переподключатся сами. */
  dispose() {
    for (const t of [this.turnTimer, this.hostTimer, this.emptyTimer]) if (t !== null) this.clock.clearTimeout(t)
    this.turnTimer = this.hostTimer = this.emptyTimer = null
    for (const m of this.members.values()) {
      const l = m.link
      m.link = null
      l?.close()
    }
  }

  // ——— сообщения ———

  private handle(me: Member, msg: ClientMessage, link: Link) {
    const isHost = me.id === this.hostId
    const fail = (code: string) => link.send({ t: 'error', code })
    try {
      switch (msg.t) {
        case 'hello':
          return
        case 'ping':
          return link.send({ t: 'pong', ts: msg.ts })
        case 'profile': {
          me.name = msg.name.trim() || me.name
          me.color = msg.color
          if (me.avatar !== msg.avatar) {
            me.avatar = msg.avatar
            this.sendAll({ t: 'avatar', id: me.id, avatar: me.avatar })
          }
          return this.broadcast()
        }
        case 'settings': {
          if (!isHost) return fail('not_host')
          // правило конца партии и раздача применяются со следующей партии, таймер — сразу
          this.settings = { ...msg.settings, categories: [...new Set(msg.settings.categories)] }
          if (this.playing()) this.armTurn()
          return this.broadcast()
        }
        case 'start': {
          if (!isHost) return fail('not_host')
          if (this.stage === 'assign' || this.stage === 'play') return fail('in_game')
          if (this.blocker()) return fail('cannot_start')
          return this.start()
        }
        case 'lobby': {
          if (!isHost) return fail('not_host')
          this.toLobby()
          return this.broadcast()
        }
        case 'force': {
          if (!isHost) return fail('not_host')
          if (this.stage !== 'assign' || !this.assign) return fail('wrong_stage')
          return this.broadcast(this.beginPlay())
        }
        case 'skip': {
          if (!isHost) return fail('not_host')
          const g = this.playing()
          if (!g) return fail('wrong_stage')
          if (g.phase === 'verdict') return fail('wrong_phase') // голосование само закончится
          return this.broadcast(this.nextTurn('skip'))
        }
        case 'kick': {
          if (!isHost) return fail('not_host')
          const who = this.members.get(msg.id)
          if (!who || who === me) return fail('no_player')
          this.banned.add(who.token)
          const l = who.link
          who.link = null
          l?.send({ t: 'reject', reason: 'kicked' })
          l?.close()
          return this.remove(who)
        }
        case 'leave': {
          me.link = null
          link.close()
          return this.remove(me)
        }
        case 'assign': {
          const a = this.assign
          if (this.stage !== 'assign' || !a || !a.ring.includes(me.id)) return fail('wrong_stage')
          const name = cleanCharacter(msg.name, LIMITS.character)
          if (!name) return fail('bad_name')
          a.written[me.id] = { target: this.targetOf(me.id)!, name }
          return this.broadcast(this.allWritten() ? this.beginPlay() : undefined)
        }
        case 'ask': {
          const g = this.playing()
          if (!g) return fail('wrong_stage')
          const q = ask(g, me.id, msg.text)
          return this.broadcast([{ e: 'ask', by: me.id, text: q.text }])
        }
        case 'pass': {
          const g = this.playing()
          if (!g) return fail('wrong_stage')
          const next = pass(g, me.id, this.isOnline)
          return this.broadcast(this.turnEvents(next, 'pass'))
        }
        case 'guess': {
          const g = this.playing()
          if (!g) return fail('wrong_stage')
          const voters = g.order.filter((id) => id !== me.id && this.isOnline(id))
          const v = startGuess(g, me.id, msg.text, voters)
          const events: RoomEvent[] = [{ e: 'guess', by: me.id, text: msg.text.replace(/\s+/g, ' ').trim() }]
          if (v) events.push(...this.afterVerdict(v))
          else this.armTurn() // пошло голосование
          return this.broadcast(events)
        }
        case 'answer': {
          const g = this.playing()
          if (!g) return fail('wrong_stage')
          if (msg.question && (msg.question.by !== g.question?.by || msg.question.n !== g.question.n)) return
          answer(g, me.id, msg.a)
          const events: RoomEvent[] = [{ e: 'answer', by: me.id, a: msg.a }]
          if (msg.a === 'no') events.push(...this.nextTurn('pass'))
          return this.broadcast(events)
        }
        case 'vote': {
          const g = this.playing()
          if (!g) return fail('wrong_stage')
          const v = vote(g, me.id, msg.ok)
          return this.broadcast(v ? this.afterVerdict(v) : undefined)
        }
        case 'giveup': {
          const g = this.playing()
          if (!g) return fail('wrong_stage')
          const wasTurn = g.turn === me.id
          const events: RoomEvent[] = [{ e: 'giveup', id: me.id, character: giveup(g, me.id) }]
          if (wasTurn || isFinished(g)) events.push(...this.nextTurn('giveup'))
          return this.broadcast(events)
        }
        case 'react':
          return this.broadcast([{ e: 'react', by: me.id, r: msg.r }])
      }
    } catch (err) {
      if (err instanceof GameError) return fail(err.code)
      this.log(`room ${this.code}: ${err instanceof Error ? err.stack : err}`)
      fail('server')
    }
  }

  private isOnline = (id: string): boolean => !!this.members.get(id)?.link

  private playing(): GameState | null {
    return this.stage === 'play' && this.game && this.game.phase !== 'over' ? this.game : null
  }

  /** Игроки текущей партии (на этапе assign — кольцо). */
  private party(): string[] {
    if (this.stage === 'assign') return this.assign?.ring ?? []
    if (this.stage === 'play' || this.stage === 'over') return this.game?.order ?? []
    return []
  }

  private onlinePlayers(): Member[] {
    return [...this.members.values()].filter((m) => m.link).sort((a, b) => a.joinedAt - b.joinedAt)
  }

  private blocker(): string | null {
    const n = this.onlinePlayers().length
    if (n < LIMITS.minPlayers) return `Нужно хотя бы ${LIMITS.minPlayers} игрока онлайн`
    if (n > LIMITS.maxPlayers) return `Слишком много игроков: не больше ${LIMITS.maxPlayers}`
    if (this.settings.source === 'deck' && this.deck.count(this.settings.categories) < n)
      return 'Мало персонажей в выбранных категориях'
    return null
  }

  private toLobby() {
    this.stage = 'lobby'
    this.game = null
    this.assign = null
    this.clearTurn()
  }

  private start() {
    const ids = shuffle(this.onlinePlayers().map((m) => m.id), this.rnd)
    this.game = null
    if (this.settings.source === 'players') {
      this.stage = 'assign'
      this.assign = { ring: ids, written: {} }
      this.clearTurn()
      return this.broadcast([{ e: 'assign' }])
    }
    const cards = this.deal(ids.length, new Set())
    const stickers: Record<string, Sticker> = {}
    ids.forEach((id, i) => (stickers[id] = { character: cards[i]!.character, category: cards[i]!.category, by: null }))
    this.broadcast(this.play(ids, stickers))
  }

  /** n персонажей из колоды: без повторов в партии и по возможности без уже сыгранных в комнате. */
  private deal(n: number, taken: Set<string>) {
    const cats = this.settings.source === 'deck' ? this.settings.categories : []
    const avoid = new Set([...this.played, ...taken])
    const out = this.deck.pick(cats, n + taken.size, this.rnd, avoid).filter((c) => !taken.has(normName(c.character))).slice(0, n)
    if (out.length < n) throw new GameError('bad_game')
    return out
  }

  private targetOf(writer: string): string | null {
    const ring = this.assign?.ring ?? []
    const i = ring.indexOf(writer)
    return i < 0 ? null : ring[(i + 1) % ring.length]!
  }

  private validWrite(writer: string): string | null {
    const w = this.assign?.written[writer]
    return w && w.target === this.targetOf(writer) ? w.name : null
  }

  private allWritten(): boolean {
    const a = this.assign
    return !!a && a.ring.length > 0 && a.ring.every((id) => this.validWrite(id) !== null)
  }

  /** Конец этапа assign: недостающих персонажей выдаёт колода. */
  private beginPlay(): RoomEvent[] {
    const a = this.assign!
    const stickers: Record<string, Sticker> = {}
    const missing: string[] = []
    for (const writer of a.ring) {
      const target = this.targetOf(writer)!
      const name = this.validWrite(writer)
      if (name) stickers[target] = { character: name, category: null, by: writer }
      else missing.push(target)
    }
    if (missing.length) {
      const taken = new Set(Object.values(stickers).map((s) => normName(s.character)))
      const cards = this.deal(missing.length, taken)
      missing.forEach((id, i) => (stickers[id] = { character: cards[i]!.character, category: cards[i]!.category, by: null }))
    }
    const order = a.ring.slice()
    this.assign = null
    return this.play(order, stickers)
  }

  private play(order: string[], stickers: Record<string, Sticker>): RoomEvent[] {
    this.game = newGame(order, stickers, this.settings.finish)
    this.stage = 'play'
    for (const s of Object.values(stickers)) this.played.push(normName(s.character))
    if (this.played.length > ROOM_LIMITS.played) this.played.splice(0, this.played.length - ROOM_LIMITS.played)
    // первым ходит первый онлайн по кругу
    const first = order.find(this.isOnline) ?? order[0]!
    this.game.turn = first
    this.armTurn()
    return [{ e: 'start' }, { e: 'turn', id: first, reason: 'start' }]
  }

  private afterVerdict(v: Verdict): RoomEvent[] {
    const events: RoomEvent[] = [v.ok ? { e: 'verdict', by: v.by, ok: true, character: v.character!, place: v.place! } : { e: 'verdict', by: v.by, ok: false }]
    if (v.ok && v.place === 1) this.score[v.by] = (this.score[v.by] ?? 0) + 1
    return [...events, ...this.nextTurn(v.ok ? 'solved' : 'wrong')]
  }

  private nextTurn(reason: TurnReason): RoomEvent[] {
    const g = this.game!
    return this.turnEvents(advance(g, this.isOnline), reason)
  }

  private turnEvents(next: string | null, reason: TurnReason): RoomEvent[] {
    if (next === null) return this.finish()
    this.armTurn()
    return [{ e: 'turn', id: next, reason }]
  }

  private finish(): RoomEvent[] {
    this.stage = 'over'
    this.clearTurn()
    return [{ e: 'over' }]
  }

  // ——— таймеры ———

  private clearTurn() {
    if (this.turnTimer !== null) this.clock.clearTimeout(this.turnTimer)
    this.turnTimer = null
    this.deadline = null
  }

  /** Таймер хода, а в фазе verdict — таймер голосования. */
  private armTurn() {
    this.clearTurn()
    const g = this.playing()
    if (!g) return
    if (g.phase === 'verdict') {
      this.deadline = this.clock.now() + ROOM_LIMITS.voteMs
      this.turnTimer = this.clock.setTimeout(() => {
        this.turnTimer = null
        const cur = this.playing()
        if (!cur || cur.phase !== 'verdict') return
        this.broadcast(this.afterVerdict(closeVote(cur)))
      }, ROOM_LIMITS.voteMs)
      return
    }
    const sec = this.settings.turnSeconds
    if (!sec) return
    this.deadline = this.clock.now() + sec * 1000
    this.turnTimer = this.clock.setTimeout(() => {
      this.turnTimer = null
      const cur = this.playing()
      if (!cur || cur.phase === 'verdict') return
      this.broadcast(this.nextTurn('timeout'))
    }, sec * 1000)
  }

  // ——— вид ———

  viewFor(m: Member | null): RoomView {
    const g = this.game
    const party = this.party()
    let game: GameView | null = null
    if (g) {
      const over = g.phase === 'over'
      const cards: GameView['cards'] = {}
      for (const id of g.order) {
        const c = g.cards[id]!
        // свой стикер владелец не видит, пока играет
        const hidden = !over && c.status === 'playing' && m?.id === id
        cards[id] = {
          character: hidden ? null : c.character,
          category: hidden ? null : c.category,
          by: hidden ? null : c.by,
          status: c.status,
          place: c.place,
          questions: c.questions,
          tries: c.tries,
        }
      }
      game = {
        order: [...g.order],
        cards,
        turn: g.turn,
        phase: g.phase,
        question: g.question ? { n: g.question.n, text: g.question.text, answers: { ...g.question.answers } } : null,
        guess: g.guess ? { text: g.guess.text, votes: { ...g.guess.votes }, need: g.guess.need } : null,
        log: g.log.map((e) => ({ ...e })),
        deadline: this.deadline,
      }
    }
    let assign: AssignView | null = null
    if (this.stage === 'assign' && this.assign) {
      const mineIn = !!m && this.assign.ring.includes(m.id)
      assign = {
        target: mineIn ? this.targetOf(m!.id) : null,
        mine: mineIn ? this.validWrite(m!.id) : null,
        done: this.assign.ring.filter((id) => this.validWrite(id) !== null),
      }
    }
    return {
      code: this.code,
      hostId: this.hostId ?? '',
      stage: this.stage,
      players: [...this.members.values()].map((x) => ({
        id: x.id, name: x.name, color: x.color, online: !!x.link,
        spectator: this.stage !== 'lobby' && !party.includes(x.id),
      })),
      settings: this.settings,
      categories: this.deck.categories,
      assign,
      game,
      score: { ...this.score },
      blocker: this.stage === 'lobby' || this.stage === 'over' ? this.blocker() : null,
      serverNow: this.clock.now(),
    }
  }

  private broadcast(events?: RoomEvent[], except?: Member) {
    for (const m of this.members.values()) {
      if (!m.link || m === except) continue
      m.link.send(events?.length ? { t: 'view', view: this.viewFor(m), events } : { t: 'view', view: this.viewFor(m) })
    }
  }

  private sendAll(msg: ServerMessage, except?: Member) {
    for (const m of this.members.values()) if (m.link && m !== except) m.link.send(msg)
  }

  // ——— сохранение между перезапусками сервера ———

  snapshot(): RoomSnapshot {
    return {
      v: 2,
      code: this.code,
      hostId: this.hostId,
      nextId: this.nextId,
      members: [...this.members.values()].map(({ link: _l, ...rest }) => rest),
      banned: [...this.banned],
      settings: this.settings,
      stage: this.stage,
      assign: this.assign,
      game: this.game,
      score: this.score,
      played: this.played,
    }
  }

  private restore(s: RoomSnapshot) {
    this.hostId = s.hostId
    this.nextId = s.nextId
    for (const m of s.members) this.members.set(m.id, { ...m, link: null })
    this.banned = new Set(s.banned)
    this.settings = { ...DEFAULT_SETTINGS, ...s.settings }
    this.stage = s.stage
    this.assign = s.assign
    this.game = s.game
    this.score = s.score ?? {}
    this.played = s.played ?? []
    // таймер хода после перезапуска начинаем заново — честнее, чем терять ход из-за выката
    this.armTurn()
  }
}
