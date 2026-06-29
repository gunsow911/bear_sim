/**
 * 議題フェーズ（§5.1）の抽選・適用。純関数。乱数は rng で注入可能。
 * 効果自体は各 Agenda/RandomEvent の apply(game)=>game に委譲。
 */
import { AGENDAS } from '@/data/agendas'
import { EVENTS } from '@/data/events'
import type { Agenda, GameState, RandomEvent } from '@/types'

/** 毎ターン開始時に約 eventChance の確率で1件抽選。発生しなければ null。 */
export function rollEvent(
  rng: () => number = Math.random,
  eventChance = 0.35,
): RandomEvent | null {
  if (rng() >= eventChance) return null
  const total = EVENTS.reduce((s, e) => s + e.weight, 0)
  let r = rng() * total
  for (const e of EVENTS) {
    r -= e.weight
    if (r < 0) return e
  }
  return EVENTS[EVENTS.length - 1] ?? null
}

/** プールから重複なく count 枚（既定3枚）を抽選。 */
export function pickAgendas(rng: () => number = Math.random, count = 3): Agenda[] {
  const pool = [...AGENDAS]
  // Fisher–Yates シャッフル
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }
  return pool.slice(0, Math.min(count, pool.length))
}

export function applyAgenda(game: GameState, agenda: Agenda): GameState {
  return agenda.apply(game)
}

export function applyEvent(game: GameState, event: RandomEvent): GameState {
  return event.apply(game)
}
