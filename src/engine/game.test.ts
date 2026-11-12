import { describe, expect, it } from 'vitest'
import {
  GameError, LOG_MAX, advance, answer, ask, closeVote, dropVoter, giveup, majority, newGame, normName, pass,
  seededRandomInt, shuffle, startGuess, vote, type FinishMode, type GameState,
} from './game.ts'

const IDS = ['a', 'b', 'c', 'd']
function game(finish: FinishMode = 'all', ids = IDS): GameState {
  const st = Object.fromEntries(ids.map((id) => [id, { character: `Персонаж ${id.toUpperCase()}`, category: 'Кино', by: null }]))
  return newGame(ids, st, finish)
}
const code = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    return e instanceof GameError ? e.code : 'other'
  }
  return null
}

describe('нормализация', () => {
  it('регистр, ё, знаки, пробелы', () => {
    expect(normName('  Ёжик   в ТУМАНЕ!! ')).toBe('ежик в тумане')
    expect(normName('Человек-паук')).toBe(normName('человек паук'))
    expect(normName('R2-D2')).toBe('r2 d2')
  })
  it('большинство', () => {
    expect([1, 2, 3, 4, 5].map(majority)).toEqual([1, 2, 2, 3, 3])
  })
  it('перемешивание сохраняет состав', () => {
    expect(shuffle([1, 2, 3, 4, 5], seededRandomInt(3)).sort()).toEqual([1, 2, 3, 4, 5])
  })
})

describe('ход', () => {
  it('вопрос, ответы, новый вопрос уходит в ленту', () => {
    const g = game()
    expect(g.turn).toBe('a')
    expect(code(() => answer(g, 'b', 'yes'))).toBe('wrong_phase')
    ask(g, 'a', 'Я человек?')
    expect(g.phase).toBe('answers')
    expect(code(() => ask(g, 'b', 'x'))).toBe('not_your_turn')
    expect(code(() => answer(g, 'a', 'yes'))).toBe('not_your_turn')
    answer(g, 'b', 'yes')
    answer(g, 'c', 'no')
    answer(g, 'c', 'yes') // передумал
    answer(g, 'd', 'maybe')
    ask(g, 'a', '')
    expect(g.log).toEqual([{ kind: 'q', by: 'a', text: 'Я человек?', yes: 2, no: 0, maybe: 1 }])
    expect(g.question!.n).toBe(2)
    expect(g.cards.a!.questions).toBe(2)
    expect(pass(g, 'a')).toBe('b')
    expect(g.log).toHaveLength(2)
    expect(g.phase).toBe('ask')
  })

  it('точное совпадение засчитывается сразу', () => {
    const g = game()
    const v = startGuess(g, 'a', '  персонаж   a! ',['b', 'c'])
    expect(v).toEqual({ by: 'a', ok: true, character: 'Персонаж A', place: 1 })
    expect(g.cards.a).toMatchObject({ status: 'guessed', place: 1, tries: 1 })
    expect(advance(g)).toBe('b')
  })

  it('голосование: большинство решает, ничья — не засчитано', () => {
    const g = game()
    expect(startGuess(g, 'a', 'кто-то', ['b', 'c', 'd'])).toBeNull()
    expect(g.phase).toBe('verdict')
    expect(g.guess!.need).toBe(2)
    expect(code(() => vote(g, 'a', true))).toBe('not_voter')
    expect(vote(g, 'b', true)).toBeNull()
    expect(vote(g, 'c', true)).toMatchObject({ ok: true, place: 1 })

    const h = game()
    startGuess(h, 'a', 'кто-то', ['b', 'c'])
    vote(h, 'b', true)
    expect(vote(h, 'c', false)).toEqual({ by: 'a', ok: false })
    expect(h.cards.a!.status).toBe('playing')
    expect(h.log.at(-1)).toEqual({ kind: 'guess', by: 'a', text: 'кто-то', ok: false })
  })

  it('голосовать некому — не засчитано; таймаут голосования', () => {
    const g = game()
    expect(startGuess(g, 'a', 'кто-то', [])).toEqual({ by: 'a', ok: false })
    const h = game()
    startGuess(h, 'a', 'x', ['b', 'c', 'd'])
    vote(h, 'b', true)
    expect(closeVote(h)).toMatchObject({ ok: true })
    const k = game()
    startGuess(k, 'a', 'x', ['b', 'c', 'd'])
    expect(closeVote(k)).toMatchObject({ ok: false })
  })

  it('выбывший голосующий пересчитывает нужное', () => {
    const g = game()
    startGuess(g, 'a', 'x', ['b', 'c', 'd'])
    vote(g, 'b', true)
    expect(dropVoter(g, 'c')).toBeNull()
    expect(g.guess!.need).toBe(2)
    expect(dropVoter(g, 'd')).toMatchObject({ ok: true })
  })

  it('сдаться можно в любой фазе, ход переходит, сдавшиеся пропускаются', () => {
    const g = game()
    ask(g, 'a', 'q')
    expect(giveup(g, 'c')).toBe('Персонаж C')
    expect(code(() => giveup(g, 'c'))).toBe('already_done')
    giveup(g, 'a')
    expect(g.phase).toBe('ask')
    expect(advance(g)).toBe('b')
    expect(advance(g)).toBe('d')
    expect(advance(g)).toBe('b')
  })

  it('prefer пропускает офлайн, если есть кто-то онлайн', () => {
    const g = game()
    expect(advance(g, (id) => id === 'd')).toBe('d')
    expect(advance(g, () => false)).toBe('a')
  })

  it('finish first — до первого отгадавшего', () => {
    const g = game('first')
    startGuess(g, 'a', 'Персонаж A', [])
    expect(advance(g)).toBeNull()
    expect(g.phase).toBe('over')
    expect(g.turn).toBeNull()
  })

  it('finish all — пока есть играющие; места по порядку', () => {
    const g = game('all', ['a', 'b', 'c'])
    startGuess(g, 'a', 'Персонаж A', [])
    advance(g)
    giveup(g, 'b')
    advance(g)
    expect(g.turn).toBe('c')
    expect(startGuess(g, 'c', 'Персонаж C', [])).toMatchObject({ place: 2 })
    expect(advance(g)).toBeNull()
    expect(g.phase).toBe('over')
    expect(code(() => giveup(g, 'c'))).toBe('wrong_phase')
  })

  it('лента не длиннее предела', () => {
    const g = game()
    for (let i = 0; i < LOG_MAX + 30; i++) ask(g, 'a', `q${i}`)
    expect(g.log).toHaveLength(LOG_MAX)
    expect(g.log.at(-1)).toMatchObject({ text: `q${LOG_MAX + 28}` })
  })
})
