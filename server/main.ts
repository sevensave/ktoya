// Сервер «Кто я?»: комнаты по шестизначному коду, партия считается здесь (room.ts),
// колода персонажей — из текстового файла (deck.ts, characters.txt).
//
// WS  /ws?create=1           — новая комната, код придёт во view
// WS  /ws?code=123456        — войти в комнату (4404 — нет такой)
// GET /health                — {ok, rooms, online, characters}
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { randomInt } from 'node:crypto'
import { WebSocketServer, type WebSocket } from 'ws'
import { Room, type RoomSnapshot, type Clock } from './room.ts'
import { loadDeck, type Deck } from './deck.ts'

export const LIMITS = {
  rooms: 500,
  maxPayload: 96 * 1024,
  rate: 30,
  burst: 80,
  pingMs: 25_000,
  missesPerWindow: 12,
  missWindowMs: 60_000,
  missBlockMs: 60_000,
  createsPerMinute: 10,
}

const CLOSE = { notFound: 4404, full: 4413, badRequest: 4400, tooFast: 4429, busy: 4503 }

export interface ServerOptions {
  port?: number
  host?: string
  trustProxy?: boolean
  /** Файл колоды; нет файла — пустая колода (раздавать сможет только source: players). */
  deckFile?: string | null
  deck?: Deck
  roomsFile?: string | null
  clock?: Clock
  log?: (s: string) => void
}

type Ws = WebSocket & { isAlive?: boolean }

export async function createGameServer(o: ServerOptions = {}) {
  const log = o.log ?? console.log
  const deck = o.deck ?? loadDeck(o.deckFile && existsSync(o.deckFile) ? readFileSync(o.deckFile, 'utf8') : '')
  if (!deck.size) log('deck: колода пуста')
  const rooms = new Map<string, Room>()

  const makeRoom = (code: string, snap?: RoomSnapshot) => {
    const room = new Room(
      {
        code,
        deck,
        clock: o.clock,
        log,
        onEmpty: () => {
          if (rooms.get(code) !== room) return
          rooms.delete(code)
          room.dispose()
          log(`room ${code} closed (${rooms.size} rooms)`)
        },
      },
      snap,
    )
    rooms.set(code, room)
    return room
  }

  if (o.roomsFile && existsSync(o.roomsFile)) {
    try {
      const snaps = JSON.parse(readFileSync(o.roomsFile, 'utf8')) as RoomSnapshot[]
      for (const s of snaps) if (s.v === 2) makeRoom(s.code, s)
      log(`restored ${rooms.size} rooms`)
    } catch (err) {
      log(`rooms restore failed: ${err}`)
    }
  }

  const saveRooms = () => {
    if (!o.roomsFile) return
    const tmp = `${o.roomsFile}.tmp`
    writeFileSync(tmp, JSON.stringify([...rooms.values()].map((r) => r.snapshot())))
    renameSync(tmp, o.roomsFile)
  }

  const newCode = () => {
    for (let i = 0; i < 50; i++) {
      const c = String(randomInt(100000, 1000000))
      if (!rooms.has(c)) return c
    }
    return null
  }

  // ——— ограничения по адресу ———
  const ipOf = (req: IncomingMessage): string | null => {
    if (o.trustProxy) {
      const v = req.headers['x-real-ip']
      return typeof v === 'string' && v ? v : null
    }
    return req.socket.remoteAddress ?? null
  }
  const windows = new Map<string, { count: number; since: number; until: number }>()
  /** Считает событие kind для ip; true — превышено. */
  const hit = (kind: string, ip: string | null, max: number, windowMs = 60_000, blockMs = 0): boolean => {
    if (!ip) return false
    const key = `${kind}:${ip}`
    const t = Date.now()
    const w = windows.get(key) ?? { count: 0, since: t, until: 0 }
    if (w.until > t) return true
    if (t - w.since > windowMs) Object.assign(w, { count: 0, since: t })
    w.count++
    if (w.count > max && blockMs) w.until = t + blockMs
    windows.set(key, w)
    return w.count > max
  }
  const isBlocked = (ip: string | null) => {
    const w = ip ? windows.get(`miss:${ip}`) : undefined
    return !!w && w.until > Date.now()
  }

  // ——— HTTP ———
  const http = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]!
    if (path === '/health') {
      let online = 0
      for (const r of rooms.values()) online += r.online
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, rooms: rooms.size, online, characters: deck.size }))
      return
    }
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Кто я?: сервер комнат. Скачать игру: https://github.com/sevensave/ktoya/releases\n')
  })

  // ——— WebSocket ———
  const wss = new WebSocketServer({ noServer: true, maxPayload: LIMITS.maxPayload, perMessageDeflate: false })

  http.on('upgrade', (req, socket, head) => {
    let url: URL
    try {
      url = new URL(req.url ?? '/', 'http://x')
    } catch {
      return socket.destroy()
    }
    if (url.pathname !== '/ws') return socket.destroy()
    const ip = ipOf(req)
    wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws as Ws, url.searchParams, ip))
  })

  function onConnection(ws: Ws, params: URLSearchParams, ip: string | null) {
    ws.isAlive = true
    ws.on('pong', () => (ws.isAlive = true))
    let room: Room | undefined
    if (params.get('create') === '1') {
      if (hit('create', ip, LIMITS.createsPerMinute)) return ws.close(CLOSE.tooFast, 'too many rooms')
      const code = rooms.size < LIMITS.rooms ? newCode() : null
      if (!code) return ws.close(CLOSE.busy, 'busy')
      room = makeRoom(code)
      log(`room ${code} created (${rooms.size} rooms)`)
    } else {
      const code = params.get('code') ?? ''
      if (!/^\d{6}$/.test(code)) return ws.close(CLOSE.badRequest, 'bad code')
      if (isBlocked(ip)) return ws.close(CLOSE.tooFast, 'slow down')
      room = rooms.get(code)
      if (!room) {
        hit('miss', ip, LIMITS.missesPerWindow, LIMITS.missWindowMs, LIMITS.missBlockMs)
        return ws.close(CLOSE.notFound, 'no room')
      }
    }

    let tokens = LIMITS.burst
    let last = Date.now()
    const session = room.attach({
      send: (m) => {
        if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m))
      },
      close: () => ws.close(1000),
    })
    ws.on('message', (data, isBinary) => {
      const t = Date.now()
      tokens = Math.min(LIMITS.burst, tokens + ((t - last) / 1000) * LIMITS.rate)
      last = t
      if (tokens < 1) return ws.close(CLOSE.tooFast, 'too fast')
      tokens--
      if (isBinary) return
      let msg: unknown
      try {
        msg = JSON.parse(data.toString())
      } catch {
        return
      }
      session.receive(msg)
    })
    ws.on('close', () => session.detach())
    ws.on('error', () => {})
  }

  const heartbeat = setInterval(() => {
    const t = Date.now()
    for (const [k, w] of windows) if (w.until < t && t - w.since > 10 * 60_000) windows.delete(k)
    for (const c of wss.clients as Set<Ws>) {
      if (!c.isAlive) {
        c.terminate()
        continue
      }
      c.isAlive = false
      c.ping()
    }
  }, LIMITS.pingMs)
  const saver = setInterval(() => {
    try {
      saveRooms()
    } catch (err) {
      log(`save rooms: ${err}`)
    }
  }, 60_000)
  saver.unref()

  return new Promise<{ port: number; rooms: Map<string, Room>; deck: Deck; close(): Promise<void> }>((resolve) => {
    http.listen(o.port ?? 8080, o.host ?? '0.0.0.0', () => {
      const addr = http.address()
      resolve({
        port: typeof addr === 'object' && addr ? addr.port : 0,
        rooms,
        deck,
        close: () =>
          new Promise<void>((r) => {
            clearInterval(heartbeat)
            clearInterval(saver)
            try {
              saveRooms()
            } catch (err) {
              log(`save rooms: ${err}`)
            }
            for (const room of rooms.values()) room.dispose()
            for (const c of wss.clients) c.terminate()
            wss.close()
            http.close(() => r())
          }),
      })
    })
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = new URL('.', import.meta.url).pathname
  const server = await createGameServer({
    port: Number(process.env.PORT ?? 8787),
    trustProxy: process.env.TRUST_PROXY === '1',
    roomsFile: process.env.ROOMS_FILE ?? `${dir}rooms.json`,
    deckFile: process.env.DECK_FILE ?? `${dir}characters.txt`,
  })
  console.log(`ktoya server on :${server.port}, ${server.deck.size} characters`)
  const stop = async () => {
    await server.close()
    process.exit(0)
  }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
}
