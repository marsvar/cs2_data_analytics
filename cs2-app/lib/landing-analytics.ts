import { deriveTeamStats } from '@/lib/derive-team-stats'
import { roundedProbability, winProbability } from '@/lib/win-probability'
import type { LandingAnalytics, PlayerAnalysis, Team } from '@/lib/types'

type MatchTeams = {
  home: Team
  away: Team
}

type LandingOptions = {
  mapPool?: LandingAnalytics['map_pool']
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000
}

function average(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function averageOrNull(values: Array<number | null | undefined>): number | null {
  const filtered = values.filter((value): value is number => value != null)
  if (filtered.length === 0) return null
  return average(filtered)
}

function averageLeetifyOd(players: PlayerAnalysis[]): number | null {
  const values = players
    .filter((player) => player.leetify != null)
    .map((player) => ((player.leetify!.ct_od + player.leetify!.t_od) / 2))
  return values.length > 0 ? average(values) : null
}

function averageScoreDelta(players: PlayerAnalysis[]): { value: number; n: number } {
  const deltas = players
    .filter((player) => player.leetify_prior != null)
    .map((player) => player.score - (player.leetify_prior ?? 0))
  return { value: deltas.length > 0 ? average(deltas) : 0, n: deltas.length }
}

export function deriveLandingAnalytics(
  teams: MatchTeams,
  options?: LandingOptions,
): LandingAnalytics {
  const homeStats = deriveTeamStats(teams.home.players)
  const awayStats = deriveTeamStats(teams.away.players)

  const homeWinP = roundedProbability(winProbability(homeStats.avg_score, awayStats.avg_score))
  const homeWinPct = Math.round(homeWinP * 100)
  const awayWinPct = 100 - homeWinPct
  const favored: LandingAnalytics['tactical_edge']['favored'] =
    Math.abs(homeWinPct - awayWinPct) <= 5
      ? 'even'
      : homeWinPct > awayWinPct
        ? 'home'
        : 'away'

  const allPlayers = [...teams.home.players, ...teams.away.players]
  const avgRounds = average(allPlayers.map((player) => player.rounds))
  const lowSample = avgRounds < 50
  const highUncertainty = allPlayers.some((player) => player.ci > (player.score * 10) / 2)

  const confidenceReasons: string[] = []
  if (lowSample) confidenceReasons.push('<50 runder per spiller')
  if (highUncertainty) confidenceReasons.push('høy CI på nøkkelspillere')
  const confidenceNote = confidenceReasons.length > 0
    ? `Lav konfidans: ${confidenceReasons.join(', ')}`
    : 'Moderat konfidans: stabilt datagrunnlag.'

  const homeLeetifyOd = averageLeetifyOd(teams.home.players)
  const awayLeetifyOd = averageLeetifyOd(teams.away.players)

  let source: LandingAnalytics['early_round_edge']['source'] = 'bl'
  let homeOd = homeStats.avg_od_rate
  let awayOd = awayStats.avg_od_rate

  if (homeLeetifyOd != null && awayLeetifyOd != null) {
    const homeCoverage = teams.home.players.length > 0 ? homeStats.leetify_count / teams.home.players.length : 0
    const awayCoverage = teams.away.players.length > 0 ? awayStats.leetify_count / teams.away.players.length : 0
    if (homeCoverage >= 0.5 && awayCoverage >= 0.5) {
      source = 'combined'
      homeOd = (homeStats.avg_od_rate + homeLeetifyOd) / 2
      awayOd = (awayStats.avg_od_rate + awayLeetifyOd) / 2
    }
  }

  const homeForm = averageScoreDelta(teams.home.players)
  const awayForm = averageScoreDelta(teams.away.players)
  const homeTradeKillRate = homeStats.avg_trade_kills_per_round
  const awayTradeKillRate = awayStats.avg_trade_kills_per_round
  const homeTradeRecovery = homeStats.avg_traded_deaths_per_round
  const awayTradeRecovery = awayStats.avg_traded_deaths_per_round
  const homeSurvival = homeStats.avg_survival
  const awaySurvival = awayStats.avg_survival
  const homeFirstkillRate = homeStats.avg_firstkills_per_round
  const awayFirstkillRate = awayStats.avg_firstkills_per_round

  return {
    tactical_edge: {
      favored,
      home_win_pct: homeWinPct,
      away_win_pct: awayWinPct,
      confidence_note: confidenceNote,
    },
    reliability: {
      avg_rounds: Math.round(avgRounds * 10) / 10,
      low_sample: lowSample,
      high_uncertainty: highUncertainty,
      player_count: allPlayers.length,
    },
    early_round_edge: {
      home_od: round4(homeOd),
      away_od: round4(awayOd),
      delta: round4(homeOd - awayOd),
      source,
    },
    trade_structure_edge: homeTradeKillRate != null && awayTradeKillRate != null
      ? {
        home_trade_kill_rate: round4(homeTradeKillRate),
        away_trade_kill_rate: round4(awayTradeKillRate),
        trade_kill_delta: round4(homeTradeKillRate - awayTradeKillRate),
        home_trade_recovery_rate: homeTradeRecovery != null ? round4(homeTradeRecovery) : undefined,
        away_trade_recovery_rate: awayTradeRecovery != null ? round4(awayTradeRecovery) : undefined,
        trade_recovery_delta:
          homeTradeRecovery != null && awayTradeRecovery != null
            ? round4(homeTradeRecovery - awayTradeRecovery)
            : undefined,
        source: 'bl',
      }
      : {
        home_trade_kill_rate: round4(homeTradeKillRate ?? 0),
        away_trade_kill_rate: round4(awayTradeKillRate ?? 0),
        trade_kill_delta: round4((homeTradeKillRate ?? 0) - (awayTradeKillRate ?? 0)),
        source: 'insufficient',
      },
    survival_discipline_edge: homeSurvival != null && awaySurvival != null
      ? {
        home_survival: round4(homeSurvival),
        away_survival: round4(awaySurvival),
        survival_delta: round4(homeSurvival - awaySurvival),
        home_kast: round4(homeStats.avg_kast),
        away_kast: round4(awayStats.avg_kast),
        source: 'bl',
      }
      : {
        home_survival: round4(homeSurvival ?? 0),
        away_survival: round4(awaySurvival ?? 0),
        survival_delta: round4((homeSurvival ?? 0) - (awaySurvival ?? 0)),
        home_kast: round4(homeStats.avg_kast),
        away_kast: round4(awayStats.avg_kast),
        source: 'insufficient',
      },
    entry_pressure_edge: homeFirstkillRate != null && awayFirstkillRate != null
      ? {
        home_firstkill_rate: round4(homeFirstkillRate),
        away_firstkill_rate: round4(awayFirstkillRate),
        firstkill_delta: round4(homeFirstkillRate - awayFirstkillRate),
        home_od: round4(homeOd),
        away_od: round4(awayOd),
        source,
      }
      : {
        home_firstkill_rate: round4(homeFirstkillRate ?? 0),
        away_firstkill_rate: round4(awayFirstkillRate ?? 0),
        firstkill_delta: round4((homeFirstkillRate ?? 0) - (awayFirstkillRate ?? 0)),
        home_od: round4(homeOd),
        away_od: round4(awayOd),
        source: 'insufficient',
      },
    form_vs_prior: {
      home_delta: round4(homeForm.value),
      away_delta: round4(awayForm.value),
      home_samples: homeForm.n,
      away_samples: awayForm.n,
    },
    map_pool: options?.mapPool,
  }
}
