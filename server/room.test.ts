import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Room, ROOM_LIMITS, type Clock, type Link } from './room.ts'
import { loadDeck, parseDeck } from './deck.ts'
import { normName, seededRandomInt } from '../src/engine/index.ts'
import { LIMITS, PROTOCOL_VERSION, type RoomEvent, type RoomView, type ServerMessage } from '../src/protocol/index.ts'

const DECK_TEXT = `
# kino | Кино
Шрек
Нео
Тор
Халк
# zoo | Животные
Кошка
Собака
Ёж
Лось
`
const deck = loadDeck(DECK_TEXT)

class FakeClock implements Clock {
  t = 1_000_000
  timers: { at: number; fn: () => void; id: number }[] = []
  private id = 0
  now = () => this.t
  setTimeout = (fn: () => void, ms: number) => {
    const id = ++this.id
    this.timers.push({ at: this.t + ms, fn, id })
    return id
  }
  clearTimeout = (h: unknown) => {
    this.timers = this.timers.filter((x) => x.id !== h)
  }
  advance(ms: number) {
    this.t += ms
    for (;;) {
      const due = this.timers.filter((x) => x.at <= this.t).sort((a, b) => a.at - b.at)[0]
      if (!due) break
      this.timers = this.timers.filter((x) => x !== due)
      due.fn()
    }
  }
}

class Client {
  inbox: ServerMessage[] = []
  closed = false
  id = ''
  link: Link = {
    send: (m) => this.inbox.push(structuredClone(m)),
    close: () => (this.closed = true),
  }
  session
  constructor(public room: Room, public token: string, name = token.slice(0, 10)) {
    this.session = room.attach(this.link)
    this.send({ t: 'hello', v: PROTOCOL_VERSION, name, color: '#aabbcc', avatar: null, token, appVersion: '0.1.0' })
    const w = this.inbox.find((m) => m.t === 'welcome')
    if (w && w.t === 'welcome') this.id = w.you
  }
  send(m: unknown) {
    this.session.receive(m)
  }
  get view(): RoomView {
    for (let i = this.inbox.length - 1; i >= 0; i--) {
      const m = this.inbox[i]!
      if (m.t === 'view' || m.t === 'welcome') return m.view
    }
    throw new Error('no view')
  }
  get events(): RoomEvent[] {
    return this.inbox.flatMap((m) => (m.t === 'view' && m.events ? m.events : []))
  }
  get lastError() {
    return [...this.inbox].reverse().find((m) => m.t === 'error')
  }
}

const tk = (s: string) => `${s}-token-0123456789`

function setup(n = 3, seed = 7) {
  const clock = new FakeClock()
  const room = new Room({ code: '123456', deck, clock, rnd: seededRandomInt(seed) })
  const cs = ['host', 'b', 'c', 'd', 'e', 'f'].slice(0, n).map((s) => new Client(room, tk(s)))
  return { clock, room, cs, host: cs[0]! }
}

function started(n = 3, settings: Partial<RoomView['settings']> = {}, seed = 7) {
  const s = setup(n, seed)
  s.host.send({ t: 'settings', settings: { source: 'deck', categories: [], turnSeconds: 0, finish: 'all', ...settings } })
  s.host.send({ t: 'start' })
  expect(s.host.view.stage).toBe(settings.source === 'players' ? 'assign' : 'play')
  return s
}

/** Клиент по id ходящего. */
const byId = (cs: Client[], id: string | null) => cs.find((c) => c.id === id)!
/** Настоящий персонаж игрока — глазами другого. */
const characterOf = (cs: Client[], id: string) => cs.find((c) => c.id !== id)!.view.game!.cards[id]!.character!

describe('колода', () => {
  it('настоящий файл: 8–10 категорий, 450+ персонажей, без дублей и длинных имён', () => {
    const text = readFileSync(new URL('./characters.txt', import.meta.url), 'utf8')
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !l.startsWith('//'))
    const keys = lines.map(normName)
    const dup = keys.filter((k, i) => keys.indexOf(k) !== i)
    expect(dup).toEqual([])
    expect(lines.filter((l) => l.length > LIMITS.character)).toEqual([])
    const secs = parseDeck(text)
    expect(secs.length).toBeGreaterThanOrEqual(8)
    expect(secs.length).toBeLessThanOrEqual(10)
    expect(secs.reduce((n, s) => n + s.names.length, 0)).toBeGreaterThanOrEqual(450)
    expect(secs.reduce((n, s) => n + s.names.length, 0)).toBe(lines.length)
    for (const s of secs) {
      expect(s.id.length).toBeLessThanOrEqual(24)
      expect(s.names.length).toBeGreaterThanOrEqual(20)
    }
  })
  it('выбор категорий и обход уже сыгранных', () => {
    expect(deck.categories).toEqual([
      { id: 'kino', title: 'Кино', count: 4 },
      { id: 'zoo', title: 'Животные', count: 4 },
    ])
    expect(deck.count(['zoo'])).toBe(4)
    expect(deck.count(['nope'])).toBe(8)
    const p = deck.pick(['kino'], 4, seededRandomInt(1), new Set(['шрек', 'нео']))
    expect(p.map((c) => c.character).slice(2).sort()).toEqual(['Нео', 'Шрек'])
    expect(p.every((c) => c.category === 'Кино')).toBe(true)
  })
})

describe('комната', () => {
  it('первый вошедший — хост; одному начать нельзя', () => {
    const { host } = setup(1)
    expect(host.view.hostId).toBe(host.id)
    expect(host.view.blocker).toMatch(/хотя бы 2/)
    host.send({ t: 'start' })
    expect(host.lastError).toMatchObject({ code: 'cannot_start' })
    expect(host.view.categories).toHaveLength(2)
  })

  it('чужая версия протокола — отказ', () => {
    const { room } = setup(1)
    const c = new Client(room, tk('zz'))
    const bad = room.attach(c.link)
    bad.receive({ t: 'hello', v: 999, name: 'x', color: '#000000', avatar: null, token: 'zzzzzzzzzzzzzzzzzz', appVersion: '1' })
    expect(c.inbox.at(-1)).toMatchObject({ t: 'reject', reason: 'version' })
  })

  it('больше maxPlayers не пускаем, но место ушедшего освобождается', () => {
    const { room, cs } = setup(LIMITS.maxPlayers > 6 ? 6 : LIMITS.maxPlayers)
    const extra: Client[] = []
    for (let i = cs.length; i < LIMITS.maxPlayers; i++) extra.push(new Client(room, tk(`x${i}`)))
    expect(room.size).toBe(LIMITS.maxPlayers)
    const late = new Client(room, tk('late'))
    expect(late.inbox.at(-1)).toMatchObject({ t: 'reject', reason: 'full' })
    extra[0]!.session.detach()
    const late2 = new Client(room, tk('late2'))
    expect(late2.id).not.toBe('')
    expect(room.size).toBe(LIMITS.maxPlayers)
  })

  it('мало персонажей в категории — блокер', () => {
    const { host } = setup(5)
    host.send({ t: 'settings', settings: { source: 'deck', categories: ['kino'], turnSeconds: 0, finish: 'all' } })
    expect(host.view.blocker).toMatch(/Мало персонажей/)
  })

  it('свой персонаж не виден ни во view, ни в событиях, пока не отгадан', () => {
    const { cs } = started(3)
    const g = cs[1]!.view.game!
    expect(g.order).toHaveLength(3)
    for (const c of cs) {
      const mine = c.view.game!.cards[c.id]!
      expect(mine).toMatchObject({ character: null, category: null, by: null, status: 'playing' })
      for (const o of cs) if (o !== c) expect(c.view.game!.cards[o.id]!.character).toBeTruthy()
    }
    // ход, вопросы, ответы, неверная попытка, голосование
    const turn = byId(cs, g.turn)
    turn.send({ t: 'ask', text: 'Я человек?' })
    for (const c of cs) if (c !== turn) c.send({ t: 'answer', a: 'yes' })
    turn.send({ t: 'guess', text: 'Пингвин' })
    for (const c of cs) if (c !== turn) c.send({ t: 'vote', ok: false })
    const next = byId(cs, turn.view.game!.turn)
    expect(next).not.toBe(turn)
    next.send({ t: 'pass' })
    for (const c of cs) {
      const secret = characterOf(cs, c.id)
      const raw = JSON.stringify(c.inbox)
      expect(raw).not.toContain(`"${secret}"`)
    }
    // а сдался — увидел
    const quitter = cs.find((c) => c.id !== cs[0]!.view.game!.turn)!
    const secret = characterOf(cs, quitter.id)
    quitter.send({ t: 'giveup' })
    expect(quitter.view.game!.cards[quitter.id]!.character).toBe(secret)
    expect(quitter.events.at(-1)).toEqual({ e: 'giveup', id: quitter.id, character: secret })
  })

  it('и в source players: адресат не видит, что ему написали и кто', () => {
    const { cs, host } = started(3, { source: 'players' })
    expect(host.events).toContainEqual({ e: 'assign' })
    const names: Record<string, string> = {}
    for (const c of cs) {
      const a = c.view.assign!
      expect(a.target).not.toBe(c.id)
      names[a.target!] = `Тайный ${c.token.slice(0, 4)}`
      c.send({ t: 'assign', name: `  Тайный ${c.token.slice(0, 4)} ` })
      expect(c.view.assign?.mine ?? names[a.target!]).toBe(names[a.target!])
    }
    expect(host.view.stage).toBe('play')
    expect(host.events.slice(-2).map((e) => e.e)).toEqual(['start', 'turn'])
    for (const c of cs) {
      expect(c.view.game!.cards[c.id]!.character).toBeNull()
      expect(JSON.stringify(c.inbox)).not.toContain(names[c.id]!)
      for (const o of cs) if (o !== c) expect(c.view.game!.cards[o.id]).toMatchObject({ character: names[o.id], category: null })
    }
  })

  it('передаёт ход после первого «нет» и не применяет запоздавший ответ к новому вопросу', () => {
    const { cs, clock, host } = started(4, { turnSeconds: 20 })
    const g = host.view.game!
    const turn = byId(cs, g.turn)
    const next = byId(cs, g.order[(g.order.indexOf(turn.id) + 1) % g.order.length]!)
    const [other, late] = cs.filter((c) => c !== turn && c !== next)
    const text = 'Я человек?'

    turn.send({ t: 'ask', text })
    const question = { by: turn.id, n: 1 }
    next.send({ t: 'answer', a: 'yes', question })
    other!.send({ t: 'answer', a: 'maybe', question })
    expect(turn.view.game).toMatchObject({ turn: turn.id, phase: 'answers', deadline: g.deadline })

    clock.advance(5_000)
    next.send({ t: 'answer', a: 'no', question })
    for (const c of cs) {
      expect(c.view.game).toMatchObject({ turn: next.id, phase: 'ask', question: null, deadline: clock.t + 20_000 })
      expect(c.view.game!.log.at(-1)).toEqual({ kind: 'q', by: turn.id, text, yes: 0, no: 1, maybe: 1 })
      expect(c.events.slice(-2)).toEqual([{ e: 'answer', by: next.id, a: 'no' }, { e: 'turn', id: next.id, reason: 'pass' }])
    }

    next.send({ t: 'ask', text: 'Я из кино?' })
    late!.send({ t: 'answer', a: 'no', question })
    expect(next.view.game).toMatchObject({ turn: next.id, phase: 'answers', question: { answers: {} } })

    // Формат ответа из уже выпущенной версии клиента тоже работает.
    late!.send({ t: 'answer', a: 'no' })
    expect(next.view.game!.turn).not.toBe(next.id)
  })

  it('assign: переписать можно, force добирает из колоды', () => {
    const { cs, host } = started(3, { source: 'players' })
    cs[1]!.send({ t: 'assign', name: 'Первый' })
    cs[1]!.send({ t: 'assign', name: 'Второй' })
    expect(cs[1]!.view.assign).toMatchObject({ mine: 'Второй', done: [cs[1]!.id] })
    expect(host.view.stage).toBe('assign')
    cs[2]!.send({ t: 'force' })
    expect(cs[2]!.lastError).toMatchObject({ code: 'not_host' })
    host.send({ t: 'force' })
    expect(host.view.stage).toBe('play')
    const target = cs[1]!.view.game!.order.find((id) => cs[1]!.view.game!.cards[id]!.by === cs[1]!.id)!
    expect(cs[1]!.view.game!.cards[target]!.character).toBe('Второй')
    const fromDeck = cs[1]!.view.game!.order.filter((id) => id !== target && id !== cs[1]!.id)
    for (const id of fromDeck) expect(cs[1]!.view.game!.cards[id]!.category).toBeTruthy()
  })

  it('точное совпадение: место, очко, конец при finish first', () => {
    const { cs } = started(3, { finish: 'first' })
    const turn = byId(cs, cs[0]!.view.game!.turn)
    const secret = characterOf(cs, turn.id)
    turn.send({ t: 'guess', text: secret.toUpperCase() })
    expect(turn.events.slice(-3)).toEqual([
      { e: 'guess', by: turn.id, text: secret.toUpperCase() },
      { e: 'verdict', by: turn.id, ok: true, character: secret, place: 1 },
      { e: 'over' },
    ])
    expect(turn.view.stage).toBe('over')
    expect(turn.view.game!.turn).toBeNull()
    expect(turn.view.score[turn.id]).toBe(1)
    for (const c of cs) for (const id of turn.view.game!.order) expect(c.view.game!.cards[id]!.character).toBeTruthy()
    cs[0]!.send({ t: 'lobby' })
    expect(cs[0]!.view.stage).toBe('lobby')
    expect(cs[0]!.view.game).toBeNull()
  })

  it('голосование: офлайн не голосуют, 30 с — решение по голосам', () => {
    const { cs, clock } = started(4)
    const turn = byId(cs, cs[0]!.view.game!.turn)
    const others = cs.filter((c) => c !== turn)
    others[2]!.session.detach()
    turn.send({ t: 'guess', text: 'Что-то похожее' })
    const g = turn.view.game!
    expect(g.phase).toBe('verdict')
    expect(g.guess).toMatchObject({ text: 'Что-то похожее', need: 2, votes: {} })
    expect(g.deadline).toBe(clock.t + ROOM_LIMITS.voteMs)
    others[0]!.send({ t: 'vote', ok: true })
    clock.advance(ROOM_LIMITS.voteMs + 1)
    expect(turn.view.game!.cards[turn.id]).toMatchObject({ status: 'guessed', place: 1, tries: 1 })
    expect(turn.events).toContainEqual({ e: 'turn', id: turn.view.game!.turn, reason: 'solved' })
  })

  it('таймер хода передаёт ход и пропускает офлайн', () => {
    const { cs, clock } = started(3, { turnSeconds: 20 })
    const g = cs[0]!.view.game!
    expect(g.deadline).toBe(clock.t + 20_000)
    const i = g.order.indexOf(g.turn!)
    const skipped = byId(cs, g.order[(i + 1) % 3]!)
    skipped.session.detach()
    clock.advance(20_001)
    const after = cs.find((c) => c !== skipped)!.view.game!
    expect(after.turn).toBe(g.order[(i + 2) % 3])
    expect(cs.find((c) => c !== skipped)!.events.at(-1)).toEqual({ e: 'turn', id: after.turn, reason: 'timeout' })
  })

  it('skip от хоста, pass от ходящего', () => {
    const { cs, host } = started(3)
    const t0 = host.view.game!.turn
    host.send({ t: 'skip' })
    expect(host.view.game!.turn).not.toBe(t0)
    expect(host.events.at(-1)).toMatchObject({ e: 'turn', reason: 'skip' })
    const t1 = byId(cs, host.view.game!.turn)
    const notTurn = cs.find((c) => c !== t1)!
    notTurn.send({ t: 'pass' })
    expect(notTurn.lastError).toMatchObject({ code: 'not_your_turn' })
    t1.send({ t: 'pass' })
    expect(host.events.at(-1)).toMatchObject({ e: 'turn', reason: 'pass' })
  })

  it('ушедший посреди партии — сдался, порядок сохраняется; при all партия доигрывается', () => {
    const { cs, host } = started(3)
    const turn = byId(cs, host.view.game!.turn)
    const leaver = turn === host ? cs[1]! : turn
    const secret = characterOf(cs, leaver.id)
    leaver.send({ t: 'leave' })
    const v = host.view.game!
    expect(v.order).toHaveLength(3)
    expect(v.cards[leaver.id]!.status).toBe('gaveup')
    expect(host.events).toContainEqual({ e: 'giveup', id: leaver.id, character: secret })
    expect(host.events).toContainEqual({ e: 'turn', id: v.turn, reason: 'left' })
    expect(v.turn).not.toBe(leaver.id)
  })

  it('вошедший посреди партии — зритель, видит всех; вернувшийся — на своём месте', () => {
    const { cs, room } = started(3)
    const late = new Client(room, tk('late'))
    expect(late.view.players.find((p) => p.id === late.id)!.spectator).toBe(true)
    for (const c of cs) expect(late.view.game!.cards[c.id]!.character).toBeTruthy()
    cs[1]!.session.detach()
    const back = new Client(room, cs[1]!.token)
    expect(back.id).toBe(cs[1]!.id)
    expect(back.view.players.find((p) => p.id === back.id)!.spectator).toBe(false)
    expect(back.view.game!.cards[back.id]!.character).toBeNull()
  })

  it('без повторов персонажей между партиями, пока хватает колоды', () => {
    const { cs, host } = started(4, { categories: ['kino'] })
    const first = new Set(host.view.game!.order.map((id) => characterOf(cs, id)))
    expect(first.size).toBe(4)
    host.send({ t: 'lobby' })
    host.send({ t: 'settings', settings: { source: 'deck', categories: ['kino', 'zoo'], turnSeconds: 0, finish: 'all' } })
    host.send({ t: 'start' })
    const second = host.view.game!.order.map((id) => characterOf(cs, id))
    expect(second.filter((x) => first.has(x))).toEqual([])
  })

  it('react — событие всем; снапшот восстанавливает партию', () => {
    const { cs, room, clock } = started(3)
    cs[1]!.send({ t: 'react', r: 'fire' })
    expect(cs[2]!.events.at(-1)).toEqual({ e: 'react', by: cs[1]!.id, r: 'fire' })
    const snap = JSON.parse(JSON.stringify(room.snapshot()))
    const room2 = new Room({ code: '123456', deck, clock }, snap)
    const back = new Client(room2, cs[2]!.token)
    expect(back.id).toBe(cs[2]!.id)
    expect(back.view.stage).toBe('play')
    expect(back.view.game!.cards[back.id]!.character).toBeNull()
  })

  it('хост пропал — права переходят через паузу', () => {
    const { room, clock, host, cs } = setup(2)
    host.session.detach()
    clock.advance(ROOM_LIMITS.hostGraceMs - 1000)
    expect(cs[1]!.view.hostId).toBe(host.id)
    const back = new Client(room, host.token)
    clock.advance(5000)
    expect(back.view.hostId).toBe(host.id)
    back.session.detach()
    clock.advance(ROOM_LIMITS.hostGraceMs + 1)
    expect(cs[1]!.view.hostId).toBe(cs[1]!.id)
  })

  it('кик закрывает вход по тому же токену', () => {
    const { room, host, cs } = setup(3)
    host.send({ t: 'kick', id: cs[2]!.id })
    expect(cs[2]!.inbox.at(-1)).toMatchObject({ t: 'reject', reason: 'kicked' })
    const again = new Client(room, cs[2]!.token)
    expect(again.inbox.at(-1)).toMatchObject({ t: 'reject', reason: 'kicked' })
  })

  it('пустая комната закрывается через срок', () => {
    let closed = false
    const clock = new FakeClock()
    const room = new Room({ code: '222222', deck, clock, onEmpty: () => (closed = true) })
    const c = new Client(room, tk('solo'))
    c.session.detach()
    clock.advance(ROOM_LIMITS.emptyTtlMs + 1)
    expect(closed).toBe(true)
  })
})
