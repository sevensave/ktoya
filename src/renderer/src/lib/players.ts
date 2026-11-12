import type { PlayerView, RoomView } from '../../../protocol/index.ts'

export function me(view: RoomView | null, you: string | null): PlayerView | null {
  return view?.players.find((p) => p.id === you) ?? null
}

export function playerById(view: RoomView, id: string | null): PlayerView | null {
  return (id && view.players.find((p) => p.id === id)) || null
}
