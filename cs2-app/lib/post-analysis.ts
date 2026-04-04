import { detectRole, ROLE_META } from '@/lib/detect-role'
import { deriveTeamStats } from '@/lib/derive-team-stats'
import type { AnalyzeResponse, BLPlayerStats, Team } from '@/lib/types'

type ResultSummary = NonNullable<AnalyzeResponse['result_summary']>
type MapsPlayed = NonNullable<AnalyzeResponse['maps_played']>
type PostAnalysis = NonNullable<AnalyzeResponse['post_analysis']>

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function toWinner(
  winner: ResultSummary['winner'],
  homeScore?: number | null,
  awayScore?: number | null,
): ResultSummary['winner'] {
  if (winner !== 'unknown') return winner
  if (homeScore != null && awayScore != null) {
    if (homeScore > awayScore) return 'home'
    if (awayScore > homeScore) return 'away'
    if (homeScore === awayScore) return 'draw'
  }
  return 'unknown'
}

export function buildResultSummary(params: {
  homeScore?: number | null
  awayScore?: number | null
  winner?: ResultSummary['winner']
  finishedAt?: string | null
}): ResultSummary {
  const winner = toWinner(params.winner ?? 'unknown', params.homeScore, params.awayScore)
  return {
    home_score: params.homeScore ?? null,
    away_score: params.awayScore ?? null,
    winner,
    finished_at: params.finishedAt ?? null,
  }
}

function inferredMapCountFromPlayers(players: BLPlayerStats[]): number {
  const withMapCount = players
    .map((p) => p.maps_played ?? 0)
    .filter((value) => Number.isInteger(value) && value > 0)
  if (withMapCount.length === 0) return 0
  return Math.max(...withMapCount)
}

export function buildMapsPlayed(params: {
  mapsFromApi: NonNullable<AnalyzeResponse['maps_played']>['maps']
  apiCompleteness: MapsPlayed['completeness']
  apiNote?: string
  playerStats: BLPlayerStats[]
  bestOf?: number | null
  homeSeriesScore?: number | null
  awaySeriesScore?: number | null
}): MapsPlayed {
  const playedMaps = params.mapsFromApi.filter(
    (map) => map.home_score != null && map.away_score != null,
  )
  const unplayedMaps = params.mapsFromApi.filter(
    (map) => map.home_score == null || map.away_score == null,
  )

  const hasDecidedSeries = (() => {
    const bestOf = params.bestOf ?? null
    if (!bestOf || bestOf <= 0) return false
    const home = params.homeSeriesScore
    const away = params.awaySeriesScore
    if (home == null || away == null) return false
    const winsNeeded = Math.floor(bestOf / 2) + 1
    return home >= winsNeeded || away >= winsNeeded
  })()

  if (playedMaps.length > 0 && unplayedMaps.length > 0 && hasDecidedSeries) {
    const skippedLabels = unplayedMaps
      .map((map, idx) => map.name ?? `Map ${playedMaps.length + idx + 1}`)
      .join(', ')
    return {
      total_maps: playedMaps.length,
      maps: params.mapsFromApi,
      completeness: 'full',
      note: `${skippedLabels} ble ikke spilt fordi serien allerede var avgjort ${params.homeSeriesScore}-${params.awaySeriesScore} i BO${params.bestOf}.`,
    }
  }

  if (params.mapsFromApi.length > 0) {
    return {
      total_maps: playedMaps.length > 0 ? playedMaps.length : params.mapsFromApi.length,
      maps: params.mapsFromApi,
      completeness: params.apiCompleteness,
      note:
        params.apiCompleteness === 'partial'
          ? params.apiNote ?? 'Map-detaljer mangler delvis i BL-data.'
          : undefined,
    }
  }

  const inferredMapCount = inferredMapCountFromPlayers(params.playerStats)
  if (inferredMapCount > 0) {
    return {
      total_maps: inferredMapCount,
      maps: Array.from({ length: inferredMapCount }, () => ({ source: 'derived' })),
      completeness: 'partial',
      note: 'Antall maps er estimert fra spillerstatistikk, men map-navn/resultater mangler fra BL API.',
    }
  }

  return {
    total_maps: 0,
    maps: [],
    completeness: 'missing',
    note: 'Map-spesifikke resultater ble ikke returnert fra BL API for denne kampen.',
  }
}

function roleLabel(teamPlayer: Team['players'][number]): string {
  const role = detectRole(teamPlayer)
  if (!role) return 'GENERELL'
  return ROLE_META[role].label
}

function trendCategory(
  delta: number,
  threshold = 0.03,
): 'overperforming' | 'underperforming' | 'stable' {
  if (delta >= threshold) return 'overperforming'
  if (delta <= -threshold) return 'underperforming'
  return 'stable'
}

function buildPlayerAction(role: string, trend: 'overperforming' | 'underperforming' | 'stable'): string {
  if (trend === 'overperforming') {
    return role === 'ENTRY'
      ? 'Build early rounds around this player’s entry tempo and keep close trade spacing.'
      : 'Build more mid-round calls around this player as the primary impact source.'
  }
  if (trend === 'underperforming') {
    if (role === 'ENTRY') return 'Reduce solo entries and increase support flashes and trade structure in the opening phase.'
    if (role === 'AWP') return 'Adjust AWP positions and prioritize safer early re-peek timing.'
    if (role === 'SUPP') return 'Move utility responsibility earlier in the round to improve tempo control.'
    return 'Simplify opening responsibilities and focus on higher-percentage fights.'
  }
  return 'Keep the current role profile, but fine-tune communication around first contact.'
}

export function buildPostAnalysis(teams: { home: Team; away: Team }): PostAnalysis {
  const homeStats = deriveTeamStats(teams.home.players)
  const awayStats = deriveTeamStats(teams.away.players)

  const openingEdge = (homeStats.avg_od_rate - awayStats.avg_od_rate) * 100
  const pressureEdge = homeStats.avg_dpr - awayStats.avg_dpr
  const stabilityEdge = (homeStats.avg_kast - awayStats.avg_kast) * 100
  const survivalEdge = (
    (homeStats.avg_survival ?? homeStats.avg_kast) -
    (awayStats.avg_survival ?? awayStats.avg_kast)
  ) * 100
  const tradeKillEdge = ((homeStats.avg_trade_kills_per_round ?? 0) - (awayStats.avg_trade_kills_per_round ?? 0)) * 100
  const tradeRecoveryEdge = homeStats.avg_traded_deaths_per_round != null && awayStats.avg_traded_deaths_per_round != null
    ? (homeStats.avg_traded_deaths_per_round - awayStats.avg_traded_deaths_per_round) * 100
    : undefined
  const assistEdge = ((homeStats.avg_assists_per_round ?? 0) - (awayStats.avg_assists_per_round ?? 0)) * 100
  const firstkillEdge = homeStats.avg_firstkills_per_round != null && awayStats.avg_firstkills_per_round != null
    ? (homeStats.avg_firstkills_per_round - awayStats.avg_firstkills_per_round) * 100
    : undefined
  const homeSurvivalMinusKast = ((homeStats.avg_survival ?? homeStats.avg_kast) - homeStats.avg_kast) * 100
  const awaySurvivalMinusKast = ((awayStats.avg_survival ?? awayStats.avg_kast) - awayStats.avg_kast) * 100
  const survivalMinusKastEdge = homeStats.avg_survival != null && awayStats.avg_survival != null
    ? homeSurvivalMinusKast - awaySurvivalMinusKast
    : undefined
  const clutchEdge = homeStats.avg_clutches_per_map != null && awayStats.avg_clutches_per_map != null
    ? homeStats.avg_clutches_per_map - awayStats.avg_clutches_per_map
    : undefined
  const oneVXEdge = homeStats.avg_one_v_x_per_map != null && awayStats.avg_one_v_x_per_map != null
    ? homeStats.avg_one_v_x_per_map - awayStats.avg_one_v_x_per_map
    : undefined
  const explosiveEdge = homeStats.avg_explosive_rounds_per_map != null && awayStats.avg_explosive_rounds_per_map != null
    ? homeStats.avg_explosive_rounds_per_map - awayStats.avg_explosive_rounds_per_map
    : undefined

  const tacticalWinner =
    Math.abs(openingEdge) + Math.abs(tradeKillEdge) >= Math.abs(stabilityEdge)
      ? (openingEdge + tradeKillEdge >= 0 ? 'home' : 'away')
      : ((survivalEdge + stabilityEdge) >= 0 ? 'home' : 'away')
  const tacticalSummary =
    tacticalWinner === 'home'
      ? `${teams.home.name || 'Home'} controlled the match best through opening pressure, trade structure, and stable round execution.`
      : `${teams.away.name || 'Away'} controlled the match best through opening pressure, trade structure, and stable round execution.`

  const roleImpact: PostAnalysis['tactical_control']['role_impact'] = [
    ...teams.home.players
      .map((player) => ({ team: 'home' as const, player }))
      .sort((a, b) => b.player.score - a.player.score)
      .slice(0, 2),
    ...teams.away.players
      .map((player) => ({ team: 'away' as const, player }))
      .sort((a, b) => b.player.score - a.player.score)
      .slice(0, 2),
  ].map(({ team, player }) => {
    const role = roleLabel(player)
    const impactNote =
      role === 'ENTRY'
        ? 'Created first-contact pressure and forced defensive rotations.'
        : role === 'AWP'
          ? 'Created high value in early duels and controlled key angles.'
          : role === 'SUPP'
            ? 'Stabilized rounds through strong survival and trade quality.'
            : 'Delivered steady impact in key rifle duels.'
    return {
      team,
      player_name: player.name,
      role,
      impact_note: impactNote,
    }
  })

  const economyLeader =
    Math.abs(openingEdge) + Math.abs(pressureEdge) + Math.abs(tradeKillEdge) >= Math.abs(survivalEdge)
      ? (openingEdge + pressureEdge + tradeKillEdge >= 0 ? 'home' : 'away')
      : (survivalEdge >= 0 ? 'home' : 'away')
  const economySummary =
    economyLeader === 'home'
      ? `${teams.home.name || 'Home'} won more signals for economy control through openings, damage pressure, trading, and survival.`
      : `${teams.away.name || 'Away'} won more signals for economy control through openings, damage pressure, trading, and survival.`

  const teamplayWinner =
    Math.abs(tradeKillEdge) + Math.abs(assistEdge) >= Math.abs(tradeRecoveryEdge ?? 0)
      ? (tradeKillEdge + assistEdge >= 0 ? 'home' : 'away')
      : ((tradeRecoveryEdge ?? 0) >= 0 ? 'home' : 'away')
  const teamplaySummary =
    teamplayWinner === 'home'
      ? `${teams.home.name || 'Home'} had the better teamplay control through trades, refrags, and support impact.`
      : `${teams.away.name || 'Away'} had the better teamplay control through trades, refrags, and support impact.`

  const stabilityWinner =
    Math.abs(survivalEdge) >= Math.abs(stabilityEdge)
      ? (survivalEdge >= 0 ? 'home' : 'away')
      : (stabilityEdge >= 0 ? 'home' : 'away')
  const roundStabilitySummary =
    stabilityWinner === 'home'
      ? `${teams.home.name || 'Home'} kept more rounds alive through stronger survival discipline and a steadier KAST profile.`
      : `${teams.away.name || 'Away'} kept more rounds alive through stronger survival discipline and a steadier KAST profile.`

  const lateRoundSignals = [clutchEdge ?? 0, oneVXEdge ?? 0, explosiveEdge ?? 0]
  const lateRoundWinner = lateRoundSignals.reduce((sum, value) => sum + value, 0) >= 0 ? 'home' : 'away'
  const lateRoundSummary =
    clutchEdge == null && oneVXEdge == null && explosiveEdge == null
      ? 'Late-round impact is missing robust BL fields for this match.'
      : lateRoundWinner === 'home'
        ? `${teams.home.name || 'Home'} was stronger in late-round phases through more clutch wins and better closer signals.`
        : `${teams.away.name || 'Away'} was stronger in late-round phases through more clutch wins and better closer signals.`

  const comparablePlayersByRating = [
    ...teams.home.players.map((player) => ({ team: 'home' as const, player })),
    ...teams.away.players.map((player) => ({ team: 'away' as const, player })),
  ].filter((entry) =>
    entry.player.bl_rating != null &&
    entry.player.bl_rating_baseline != null &&
    Number.isFinite(entry.player.bl_rating) &&
    Number.isFinite(entry.player.bl_rating_baseline),
  )

  const allPlayersForDev = [
    ...teams.home.players.map((player) => ({ team: 'home' as const, player })),
    ...teams.away.players.map((player) => ({ team: 'away' as const, player })),
  ]

  let focusPlayers: PostAnalysis['player_development']['focus_players']

  if (comparablePlayersByRating.length >= 2) {
    focusPlayers = comparablePlayersByRating
      .map(({ team, player }) => {
        const currentRating = player.bl_rating ?? 0
        const baselineRating = player.bl_rating_baseline ?? currentRating
        const delta = currentRating - baselineRating
        const trend = trendCategory(delta, 0.05)
        const role = roleLabel(player)
        const sign = delta >= 0 ? '+' : ''
        const note =
          trend === 'overperforming'
            ? `R-rating ${currentRating.toFixed(2)} versus historical BL baseline ${baselineRating.toFixed(2)} (${sign}${delta.toFixed(2)}).`
            : trend === 'underperforming'
              ? `R-rating ${currentRating.toFixed(2)} versus historical BL baseline ${baselineRating.toFixed(2)} (${sign}${delta.toFixed(2)}).`
              : `R-rating ${currentRating.toFixed(2)} stayed close to the historical BL baseline ${baselineRating.toFixed(2)} (${sign}${delta.toFixed(2)}).`
        return {
          team,
          player_name: player.name,
          trend,
          metric: 'bl_rating' as const,
          note,
          action: buildPlayerAction(role, trend),
          current_value: round2(currentRating),
          baseline_value: round2(baselineRating),
          delta_value: round2(delta),
          is_relative: false,
          absDelta: Math.abs(delta),
        }
      })
      .sort((a, b) => b.absDelta - a.absDelta)
      .slice(0, 4)
      .map(({ absDelta, ...item }) => item)
  } else {
    // No Leetify baseline available — fall back to relative in-match performance
    const avgScore =
      allPlayersForDev.reduce((s, e) => s + e.player.score, 0) /
      (allPlayersForDev.length || 1)
    const scoreMax = Math.max(...allPlayersForDev.map((e) => e.player.score), 0.01)
    focusPlayers = allPlayersForDev
      .map(({ team, player }) => {
        const delta = player.score - avgScore
        const trend = trendCategory(delta)
        const role = roleLabel(player)
        const sign = delta >= 0 ? '+' : ''
        const note = `In-match relative: ${sign}${(delta * 10).toFixed(1)} on the 0-10 score scale versus match average (no historical baseline).`
        return {
          team,
          player_name: player.name,
          trend,
          metric: 'score' as const,
          note,
          action: buildPlayerAction(role, trend),
          current_value: round2(player.score * 10),
          baseline_value: round2(avgScore * 10),
          delta_value: round2(delta * 10),
          score: round2(player.score),
          score_max: round2(scoreMax),
          is_relative: true,
          absDelta: Math.abs(delta),
        }
      })
      .sort((a, b) => b.absDelta - a.absDelta)
      .slice(0, 6)
      .map(({ absDelta, ...item }) => item)
  }

  const coachRecommendations: string[] = []
  if (Math.abs(openingEdge) >= 4) {
    const side = openingEdge >= 0 ? teams.home.name || 'Home' : teams.away.name || 'Away'
    coachRecommendations.push(
      `Prioritize recreating the opening-duel advantage for ${side}; today’s opening-duel edge was ${Math.abs(round2(openingEdge))} pp.`,
    )
  } else {
    coachRecommendations.push('Opening duels were close; focus on stronger trade structure in the first 20 seconds.')
  }
  if (Math.abs(pressureEdge) >= 5) {
    const side = pressureEdge >= 0 ? teams.home.name || 'Home' : teams.away.name || 'Away'
    coachRecommendations.push(
      `${side} had clear damage pressure (${Math.abs(round2(pressureEdge)).toFixed(1)} DPR edge); build the next game plan around that tempo.`,
    )
  } else {
    coachRecommendations.push('Damage pressure was close; the next improvement is better utility sync and refrag timing.')
  }
  if (Math.abs(tradeKillEdge) >= 3) {
    const side = tradeKillEdge >= 0 ? teams.home.name || 'Home' : teams.away.name || 'Away'
    coachRecommendations.push(
      `${side} clearly won the trade game (${Math.abs(round2(tradeKillEdge)).toFixed(1)} trade kills per 100 rounds); keep the spacing and refrag protocols.`,
    )
  } else {
    coachRecommendations.push('Trading was close; focus on shorter distance to first contact and faster refrag calls.')
  }
  if (Math.abs(survivalEdge) >= 4) {
    const side = survivalEdge >= 0 ? teams.home.name || 'Home' : teams.away.name || 'Away'
    coachRecommendations.push(
      `${side} had better survival discipline (${Math.abs(round2(survivalEdge)).toFixed(1)} pp); use that as the model for mid-round and post-plant positioning.`,
    )
  }
  coachRecommendations.push(
    'Read clutch and explosive rounds conservatively; they are high-impact, but more volatile than survival, trade, and opening signals.',
  )

  return {
    tactical_control: {
      summary: tacticalSummary,
      opening_duel_edge_pp: round2(openingEdge),
      pressure_edge_dpr: round2(pressureEdge),
      stability_edge_kast_pp: round2(stabilityEdge),
      role_impact: roleImpact,
    },
    economy_proxies: {
      summary: economySummary,
      indicators: {
        opening_control_pp: round2(openingEdge),
        survival_edge_kast_pp: round2(stabilityEdge),
        damage_pressure_edge_dpr: round2(pressureEdge),
        trade_structure_pp: round2(tradeKillEdge),
        survival_edge_pp: round2(survivalEdge),
      },
      caveat: 'BL signals lead when available. Without full buy and utility telemetry, OD, KAST, and DPR still act as economy proxies.',
    },
    teamplay_control: {
      summary: teamplaySummary,
      indicators: {
        trade_kill_edge_per_100_rounds: round2(tradeKillEdge),
        trade_recovery_edge_pp: tradeRecoveryEdge != null ? round2(tradeRecoveryEdge) : undefined,
        assist_edge_per_round: round2(assistEdge),
      },
      caveat: 'Trade structure is strongest when both trade_kills and traded_deaths are available; otherwise read the signal more cautiously.',
    },
    round_stability: {
      summary: roundStabilitySummary,
      indicators: {
        survival_edge_pp: homeStats.avg_survival != null && awayStats.avg_survival != null ? round2(survivalEdge) : undefined,
        kast_edge_pp: round2(stabilityEdge),
        survival_minus_kast_edge_pp: survivalMinusKastEdge != null ? round2(survivalMinusKastEdge) : undefined,
      },
      caveat: 'Survival is a support signal for KAST, not a replacement. The gap between them says something about how rounds were survived.',
    },
    late_round_conversion: {
      summary: lateRoundSummary,
      metrics: {
        clutch_wins_per_map:
          clutchEdge != null && homeStats.avg_clutches_per_map != null && awayStats.avg_clutches_per_map != null
            ? {
              home: round2(homeStats.avg_clutches_per_map),
              away: round2(awayStats.avg_clutches_per_map),
              edge: round2(clutchEdge),
            }
            : undefined,
        one_v_x_wins_per_map:
          oneVXEdge != null && homeStats.avg_one_v_x_per_map != null && awayStats.avg_one_v_x_per_map != null
            ? {
              home: round2(homeStats.avg_one_v_x_per_map),
              away: round2(awayStats.avg_one_v_x_per_map),
              edge: round2(oneVXEdge),
            }
            : undefined,
        explosive_rounds_per_map:
          explosiveEdge != null && homeStats.avg_explosive_rounds_per_map != null && awayStats.avg_explosive_rounds_per_map != null
            ? {
              home: round2(homeStats.avg_explosive_rounds_per_map),
              away: round2(awayStats.avg_explosive_rounds_per_map),
              edge: round2(explosiveEdge),
            }
            : undefined,
      },
      caveat: 'Shows per-team level and edge in the same card. Clutch and explosive signals are useful in post-analysis, but should not be overread as stable predictive inputs on their own.',
    },
    player_development: {
      focus_players: focusPlayers,
    },
    coach_recommendations: coachRecommendations,
  }
}
