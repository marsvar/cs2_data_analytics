import type { PlayerAnalysis } from './types'

export type TeamStats = {
  avg_score: number
  avg_kd: number
  avg_kast: number
  avg_dpr: number
  avg_hs: number
  avg_od_rate: number
  avg_survival: number | null
  avg_trade_kills_per_round: number | null
  avg_traded_deaths_per_round: number | null
  avg_firstkills_per_round: number | null
  avg_clutches_per_map: number | null
  avg_one_v_x_per_map: number | null
  avg_explosive_rounds_per_map: number | null
  avg_assists_per_round: number | null
  avg_aim: number | null
  avg_ct_od: number | null  // avg CT-side OD% from Leetify (matchmaking)
  avg_t_od: number | null   // avg T-side OD% from Leetify (matchmaking)
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
      avg_survival: null,
      avg_trade_kills_per_round: null,
      avg_traded_deaths_per_round: null,
      avg_firstkills_per_round: null,
      avg_clutches_per_map: null,
      avg_one_v_x_per_map: null,
      avg_explosive_rounds_per_map: null,
      avg_assists_per_round: null,
      avg_aim: null,
      avg_ct_od: null,
      avg_t_od: null,
      min_rounds: 0,
      avg_rounds: 0,
      leetify_count: 0,
    }
  }

  const playersWithLeetify = players.filter((p) => p.leetify != null)
  const avgAim = playersWithLeetify.length > 0
    ? playersWithLeetify.reduce((s, p) => s + (p.leetify?.aim ?? 0), 0) / playersWithLeetify.length
    : null
  const avgCtOd = playersWithLeetify.length > 0
    ? playersWithLeetify.reduce((s, p) => s + (p.leetify?.ct_od ?? 0), 0) / playersWithLeetify.length
    : null
  const avgTOd = playersWithLeetify.length > 0
    ? playersWithLeetify.reduce((s, p) => s + (p.leetify?.t_od ?? 0), 0) / playersWithLeetify.length
    : null
  const playersWithSurvival = players.filter((p) => p.bl_extended?.survival_ratio != null)
  const avgSurvival = playersWithSurvival.length > 0
    ? playersWithSurvival.reduce((s, p) => s + (p.bl_extended?.survival_ratio ?? 0), 0) / playersWithSurvival.length
    : null
  const perRoundAverage = (
    selector: (player: PlayerAnalysis) => number | undefined,
  ): number | null => {
    const values = players
      .map((player) => {
        const raw = selector(player)
        if (raw == null || player.rounds <= 0) return null
        return raw / player.rounds
      })
      .filter((value): value is number => value != null)
    if (values.length === 0) return null
    return values.reduce((sum, value) => sum + value, 0) / values.length
  }
  const perMapAverage = (
    selector: (player: PlayerAnalysis) => number | undefined,
  ): number | null => {
    const normalised = players
      .map((player) => {
        const raw = selector(player)
        const mapsPlayed = player.rounds > 0 ? Math.max(player.rounds / 24, 1) : 0
        if (raw == null || mapsPlayed <= 0) return null
        return raw / mapsPlayed
      })
      .filter((value): value is number => value != null)
    if (normalised.length === 0) return null
    return normalised.reduce((sum, value) => sum + value, 0) / normalised.length
  }

  return {
    avg_score: players.reduce((s, p) => s + p.score, 0) / n,
    avg_kd: players.reduce((s, p) => s + p.kd, 0) / n,
    avg_kast: players.reduce((s, p) => s + p.kast, 0) / n,
    avg_dpr: players.reduce((s, p) => s + p.dpr, 0) / n,
    avg_hs: players.reduce((s, p) => s + p.hs, 0) / n,
    avg_od_rate: players.reduce((s, p) => s + p.od_rate, 0) / n,
    avg_survival: avgSurvival,
    avg_trade_kills_per_round: perRoundAverage((p) => p.bl_extended?.trade_kills),
    avg_traded_deaths_per_round: perRoundAverage((p) => p.bl_extended?.traded_deaths),
    avg_firstkills_per_round: perRoundAverage((p) => p.bl_extended?.firstkills),
    avg_clutches_per_map: perMapAverage((p) => p.bl_extended?.clutches_won),
    avg_one_v_x_per_map: perMapAverage((p) => {
      const ext = p.bl_extended
      if (!ext) return undefined
      return (ext.won_1v1 ?? 0) + (ext.won_1v2 ?? 0) + (ext.won_1v3 ?? 0) + (ext.won_1v4 ?? 0) + (ext.won_1v5 ?? 0)
    }),
    avg_explosive_rounds_per_map: perMapAverage((p) => {
      const multi = p.bl_extended?.multi_kills
      if (!multi) return undefined
      return (multi.rounds_with_3k ?? 0) + (multi.rounds_with_4k ?? 0) + (multi.rounds_with_5k ?? 0)
    }),
    avg_assists_per_round: perRoundAverage((p) => p.assists),
    avg_aim: avgAim,
    avg_ct_od: avgCtOd,
    avg_t_od: avgTOd,
    min_rounds: Math.min(...players.map((p) => p.rounds)),
    avg_rounds: players.reduce((s, p) => s + p.rounds, 0) / n,
    leetify_count: playersWithLeetify.length,
  }
}
