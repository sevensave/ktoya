// Патчноуты. Правило: у каждой версии из package.json здесь есть запись, иначе тесты и релиз не пройдут.
// Новая версия идёт первой. Пишем для игроков: что изменилось за столом, без внутренней кухни.

export type ChangeKind = 'new' | 'better' | 'fix'

export interface Change {
  kind: ChangeKind
  /** Коротко, как заголовок: «Кролик». */
  title: string
  /** Одно-два предложения: что это и как этим пользоваться. */
  text?: string
}

export interface Release {
  version: string
  /** ГГГГ-ММ-ДД. */
  date: string
  /** Имя релиза в два-три слова. */
  title: string
  changes: Change[]
}

export const CHANGELOG: Release[] = [
  {
    version: '0.1.1',
    date: '2026-11-18',
    title: 'Стикеры и ходы',
    changes: [
      { kind: 'better', title: 'Видно верхнюю панель', text: 'На Windows кнопки комнаты теперь не заходят под кнопки окна. Код, настройки и выход остаются доступны во время игры.' },
      { kind: 'fix', title: 'Целые буквы на стикерах', text: 'Имя персонажа переносится и при необходимости уменьшается, чтобы буквы целиком поместились на стикере.' },
      { kind: 'fix', title: 'Ход после «нет»', text: 'Как только кто-то отвечает «нет» на твой вопрос, ход сразу переходит к следующему игроку.' },
    ],
  },
  {
    version: '0.1.0',
    date: '2026-11-12',
    title: 'Стикер на лбу',
    changes: [
      { kind: 'new', title: 'Комната по коду', text: 'Один создаёт комнату и диктует шестизначный код, остальные входят по нему. Своего стикера не видишь, чужие видишь все.' },
      { kind: 'new', title: 'Колода или своими руками', text: 'Персонажей можно раздать из готовой колоды, а можно написать стикеры друг другу: каждый придумывает персонажа соседу.' },
      { kind: 'new', title: 'Да, нет и заметки', text: 'В свой ход пишешь вопрос, остальные отвечают «да», «нет» или «не знаю». Что уже выяснил, записывай в заметки, чтобы не забыть к следующему ходу.' },
      { kind: 'new', title: 'Через Sevensave', text: 'Игру можно поставить и обновлять из лаунчера Sevensave: одна кнопка, без выбора файлов.' },
    ],
  },
]

/** Сравнение версий вида 1.2.3: отрицательное, если a старше b. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d
  }
  return 0
}

/**
 * Что показать после обновления: версии новее `seen` до текущей включительно, не больше трёх.
 * seen = null: игрок пришёл с версии, где патчноутов ещё не было, показываем только текущую.
 */
export function releasesSince(seen: string | null, current: string, log: readonly Release[] = CHANGELOG): Release[] {
  const upTo = log.filter((r) => compareVersions(r.version, current) <= 0)
  if (seen === null) return upTo.filter((r) => r.version === current)
  return upTo.filter((r) => compareVersions(r.version, seen) > 0).slice(0, 3)
}

/** Все вышедшие версии до текущей: для списка в настройках. */
export function releasedUpTo(current: string, log: readonly Release[] = CHANGELOG): Release[] {
  return log.filter((r) => compareVersions(r.version, current) <= 0)
}
