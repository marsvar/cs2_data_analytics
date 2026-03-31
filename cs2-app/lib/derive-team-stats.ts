import type { PlayerAnalysis } from './types'

export type TeamStats = {
  avg_score: number
  avg_kd: number
  avg_kast: number
  avg_dpr: number
  avg_hs: number
  avg_od_rate: number
  avg_aim: number | null
  min_rounds: number
  avg_rounds: number
  leetify_count: number
}

export function deriveTeamStats(players: PlayerAnalysis[]): TeamStats {
  const n = players.length
  if (n === 0) {
    return {
      avg_score: 0,
      avg_kd: 0,
      avg_kast: 0,
      avg_dpr: 0,
      avg_hs: 0,
      avg_od_rate: 0,
      avg_aim: null,
      min_rounds: 0,
      avg_rounds: 0,
      leetify_count: 0,
    }
  }

  const playersWithLeetify = players.filter((p) => p.leetify != null)
  const avgAim = playersWithLeetify.length > 0
    ? playersWithLeetify.reduce((s, p) => s + (p.leetify?.aim ?? 0), 0) / playersWithLeetify.length
    : null

  return {
    avg_score: players.reduce((s, p) => s + p.score, 0) / n,
    avg_kd: players.reduce((s, p) => s + p.kd, 0) / n,
    avg_kast: players.reduce((s, p) => s + p.kast, 0) / n,
    avg_dpr: players.reduce((s, p) => s + p.dpr, 0) / n,
    avg_hs: players.reduce((s, p) => s + p.hs, 0) / n,
    avg_od_rate: players.reduce((s, p) => s + p.od_rate, 0) / n,
    avg_aim: avgAim,
    min_rounds: Math.min(...players.map((p) => p.rounds)),
    avg_rounds: players.reduce((s, p) => s + p.rounds, 0) / n,
    leetify_count: playersWithLeetify.length,
  }
}
