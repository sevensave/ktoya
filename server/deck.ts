// Колода персонажей по категориям. Файл: секции «# id | Название», дальше по имени на строку;
// «//» — комментарий, строки «#» без «|» — тоже комментарии.
import { cleanCharacter, normName, shuffle, type RandomInt } from '../src/engine/index.ts'
import { LIMITS, type CategoryView } from '../src/protocol/index.ts'

export interface DeckCard {
  character: string
  /** Название категории («Кино и сериалы»). */
  category: string
}

export interface Deck {
  categories: CategoryView[]
  size: number
  /** Сколько персонажей в выбранных категориях (пусто или ни одной известной — все). */
  count(ids: readonly string[]): number
  /**
   * n разных персонажей из выбранных категорий. Сначала берём тех, кого нет в avoid
   * (нормализованные имена уже игравших), не хватает — добираем из остальных.
   */
  pick(ids: readonly string[], n: number, rnd: RandomInt, avoid?: ReadonlySet<string>): DeckCard[]
}

interface Section {
  id: string
  title: string
  names: string[]
}

export function parseDeck(text: string): Section[] {
  const sections: Section[] = []
  const seen = new Set<string>()
  let cur: Section | null = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('//')) continue
    if (line.startsWith('#')) {
      const m = /^#\s*([a-z0-9_-]{1,24})\s*\|\s*(.+)$/.exec(line)
      if (m) {
        cur = sections.find((s) => s.id === m[1]) ?? null
        if (!cur) sections.push((cur = { id: m[1]!, title: m[2]!.trim(), names: [] }))
      }
      continue
    }
    if (!cur) continue
    const name = cleanCharacter(line, LIMITS.character)
    if (!name) continue
    const key = normName(name)
    if (seen.has(key)) continue // дубль в колоде — берём первый
    seen.add(key)
    cur.names.push(name)
  }
  return sections.filter((s) => s.names.length > 0)
}

export function makeDeck(sections: Section[]): Deck {
  const known = (ids: readonly string[]) => {
    const sel = sections.filter((s) => ids.includes(s.id))
    return sel.length ? sel : sections
  }
  const all = (ids: readonly string[]) => known(ids).flatMap((s) => s.names.map((character) => ({ character, category: s.title })))
  return {
    categories: sections.map((s) => ({ id: s.id, title: s.title, count: s.names.length })),
    size: sections.reduce((n, s) => n + s.names.length, 0),
    count: (ids) => known(ids).reduce((n, s) => n + s.names.length, 0),
    pick(ids, n, rnd, avoid) {
      const pool = shuffle(all(ids), rnd)
      const fresh = avoid ? pool.filter((c) => !avoid.has(normName(c.character))) : pool
      const rest = avoid ? pool.filter((c) => avoid.has(normName(c.character))) : []
      return [...fresh, ...rest].slice(0, n)
    },
  }
}

export function loadDeck(text: string): Deck {
  return makeDeck(parseDeck(text))
}
