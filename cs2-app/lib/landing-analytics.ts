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

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
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

function percentLabel(value: number): string {
  return `${Math.round(value * 100)}%`
}

function relativeShare(homeValue: number, awayValue: number): { home: number; away: number } {
  const safeHome = Math.max(homeValue, 0)
  const safeAway = Math.max(awayValue, 0)
  const total = safeHome + safeAway

  if (total <= 0) {
    return { home: 50, away: 50 }
  }

  const home = clamp((safeHome / total) * 100, 0, 100)
  return {
    home: round4(home),
    away: round4(100 - home),
  }
}

function signedPercentPoints(delta: number): string {
  const scaled = delta * 100
  return `${scaled >= 0 ? '+' : ''}${scaled.toFixed(1)} pp`
}

function confidenceFromSignals(params: {
  source: 'bl' | 'leetify' | 'combined' | 'derived' | 'insufficient'
  coverage: number
  avgRounds: number
}): 'low' | 'medium' | 'high' {
  let score = 0
  if (params.source !== 'insufficient') score += 1
  if (params.source === 'combined' || params.source === 'derived') score += 1
  if (params.coverage >= 0.7) score += 1
  if (params.avgRounds >= 100) score += 1
  if (score >= 4) return 'high'
  if (score >= 2) return 'medium'
  return 'low'
}

function formatMapName(map: string): string {
  const normalized = map.replace(/^de_/, '')
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function mapConfidenceScore(confidence: 'low' | 'medium' | 'high'): number {
  if (confidence === 'high') return 3
  if (confidence === 'medium') return 2
  return 1
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

function blendedOpeningImpact(player: PlayerAnalysis): number {
  const leetifyOd = player.leetify ? (player.leetify.ct_od + player.leetify.t_od) / 2 : null
  const openingRate = leetifyOd != null
    ? (player.od_rate * 0.55) + (leetifyOd * 0.45)
    : player.od_rate
  const firstkillRate = player.rounds > 0 && player.bl_extended?.firstkills != null
    ? player.bl_extended.firstkills / player.rounds
    : 0
  const firstkillScore = clamp(firstkillRate / 0.12, 0, 1)
  return openingRate * 0.7 + firstkillScore * 0.3
}

function buildWatchBuckets(players: PlayerAnalysis[]) {
  const initiators = [...players]
    .sort((a, b) => blendedOpeningImpact(b) - blendedOpeningImpact(a))
    .slice(0, 2)
    .map((player) => {
      const firstkillRate = player.rounds > 0 && player.bl_extended?.firstkills != null
        ? player.bl_extended.firstkills / player.rounds
        : 0
      return {
        paradise_user_id: player.paradise_user_id,
        name: player.name,
        avatar_url: player.avatar_url,
        reason: `OD ${percentLabel(player.od_rate)}${firstkillRate > 0 ? ` · FK/R ${firstkillRate.toFixed(2)}` : ''}`,
        display_value: `${(blendedOpeningImpact(player) * 100).toFixed(0)} impact`,
      }
    })

  const formPlayers = players
    .filter((player) => player.leetify_prior != null)
    .sort((a, b) => Math.abs((b.score - (b.leetify_prior ?? 0))) - Math.abs((a.score - (a.leetify_prior ?? 0))))
    .slice(0, 2)
    .map((player) => {
      const delta = player.score - (player.leetify_prior ?? 0)
      return {
        paradise_user_id: player.paradise_user_id,
        name: player.name,
        avatar_url: player.avatar_url,
        reason: delta >= 0 ? 'Spiller over forventet baseline' : 'Spiller under forventet baseline',
        display_value: `${delta >= 0 ? '+' : ''}${(delta * 10).toFixed(1)}`,
      }
    })

  const riskPlayers = [...players]
    .sort((a, b) => {
      const aRisk = a.ci - Math.min(a.rounds / 1000, 0.2)
      const bRisk = b.ci - Math.min(b.rounds / 1000, 0.2)
      return bRisk - aRisk
    })
    .slice(0, 2)
    .map((player) => ({
      paradise_user_id: player.paradise_user_id,
      name: player.name,
      avatar_url: player.avatar_url,
      reason: player.rounds < 50 ? 'Tynt utvalg kan vippe kampen' : 'Høy varians i profilen',
      display_value: `CI ${player.ci.toFixed(2)} · ${player.rounds} r`,
    }))

  return { initiators, form_players: formPlayers, risk_players: riskPlayers }
}

function buildMapBattlefield(mapPool?: LandingAnalytics['map_pool']): LandingAnalytics['map_battlefield'] | undefined {
  if (!mapPool) return undefined

  const homeByMap = new Map(mapPool.home.maps.map((map) => [map.map, map]))
  const awayByMap = new Map(mapPool.away.maps.map((map) => [map.map, map]))
  const mapNames = Array.from(new Set([...homeByMap.keys(), ...awayByMap.keys()])).sort()

  const maps = mapNames.map((map) => {
    const home = homeByMap.get(map)
    const away = awayByMap.get(map)
    const homeWinRate = home?.win_rate
    const awayWinRate = away?.win_rate
    const edge = (homeWinRate ?? 0.5) - (awayWinRate ?? 0.5)
    const favored: 'home' | 'away' | 'even' =
      Math.abs(edge) < 0.035
        ? 'even'
        : edge > 0
          ? 'home'
          : 'away'
    const confidence: 'low' | 'medium' | 'high' = (() => {
      const score = Math.min(
        3,
        Math.max(
          mapConfidenceScore(home?.confidence ?? 'low'),
          mapConfidenceScore(away?.confidence ?? 'low'),
        ),
      )
      if (score >= 3) return 'high'
      if (score >= 2) return 'medium'
      return 'low'
    })()

    return {
      map,
      home_win_rate: homeWinRate,
      away_win_rate: awayWinRate,
      home_sample_size: home?.sample_size ?? 0,
      away_sample_size: away?.sample_size ?? 0,
      favored,
      confidence,
      home_display: home != null ? `${Math.round(home.win_rate * 100)}% · ${home.sample_size}` : 'Ingen data',
      away_display: away != null ? `${Math.round(away.win_rate * 100)}% · ${away.sample_size}` : 'Ingen data',
    }
  })

  const edgeSorted = [...maps].sort((a, b) => {
    const aEdge = (a.home_win_rate ?? 0.5) - (a.away_win_rate ?? 0.5)
    const bEdge = (b.home_win_rate ?? 0.5) - (b.away_win_rate ?? 0.5)
    return bEdge - aEdge
  })

  const vetoFlow: NonNullable<LandingAnalytics['map_battlefield']>['veto_flow'] = []
  const vetoHint = mapPool.veto_hint
  if (vetoHint?.suggested_ban1_for_home) {
    vetoFlow.push({ step: 'ban', team: 'home', label: 'Ban 1', map: vetoHint.suggested_ban1_for_home })
  }
  if (vetoHint?.suggested_ban1_for_away) {
    vetoFlow.push({ step: 'ban', team: 'away', label: 'Ban 1', map: vetoHint.suggested_ban1_for_away })
  }
  if (vetoHint?.suggested_pick_for_home) {
    vetoFlow.push({ step: 'pick', team: 'home', label: 'Pick', map: vetoHint.suggested_pick_for_home })
  }
  if (vetoHint?.suggested_pick_for_away) {
    vetoFlow.push({ step: 'pick', team: 'away', label: 'Pick', map: vetoHint.suggested_pick_for_away })
  }
  if (vetoHint?.suggested_ban2_for_home) {
    vetoFlow.push({ step: 'ban', team: 'home', label: 'Ban 2', map: vetoHint.suggested_ban2_for_home })
  }
  if (vetoHint?.suggested_ban2_for_away) {
    vetoFlow.push({ step: 'ban', team: 'away', label: 'Ban 2', map: vetoHint.suggested_ban2_for_away })
  }
  if (vetoHint?.decider_map) {
    vetoFlow.push({ step: 'decider', team: 'neutral', label: 'Decider', map: vetoHint.decider_map })
  }

  return {
    maps,
    strongest_for_home: edgeSorted.slice(0, 3).map((entry) => entry.map),
    weakest_for_home: [...edgeSorted].reverse().slice(0, 3).map((entry) => entry.map),
    strongest_for_away: [...edgeSorted].reverse().slice(0, 3).map((entry) => entry.map),
    weakest_for_away: edgeSorted.slice(0, 3).map((entry) => entry.map),
    veto_flow: vetoFlow,
  }
}

function buildGamePlan(params: {
  homeName: string
  awayName: string
  favored: LandingAnalytics['tactical_edge']['favored']
  confidenceNote: string
  mapBattlefield?: LandingAnalytics['map_battlefield']
  tradeDelta: number
  survivalDelta: number
  entryDelta: number
}): string[] {
  const { homeName, awayName, favored, confidenceNote, mapBattlefield, tradeDelta, survivalDelta, entryDelta } = params
  const lines: string[] = []

  if (favored === 'even') {
    lines.push(`The opening looks even. The first five rifle rounds will likely set the tempo between ${homeName} and ${awayName}.`)
  } else {
    const favoredName = favored === 'home' ? homeName : awayName
    lines.push(`${favoredName} holds the clearest pre-match edge right now, but ${confidenceNote.toLowerCase()}.`)
  }

  const structuralSignals = [
    { delta: tradeDelta, label: 'trade structure' },
    { delta: survivalDelta, label: 'survival discipline' },
    { delta: entryDelta, label: 'entry pressure' },
  ].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  const strongestSignal = structuralSignals[0]
  if (Math.abs(strongestSignal.delta) >= 0.01) {
    const owner = strongestSignal.delta > 0 ? homeName : awayName
    lines.push(`${owner} should try to make the match a question of ${strongestSignal.label}, where they hold the clearest advantage.`)
  }

  const bestMap = mapBattlefield?.maps.find((map) => map.favored === 'home')
  const dangerMap = mapBattlefield?.maps.find((map) => map.favored === 'away')
  if (bestMap || dangerMap) {
    const parts: string[] = []
    if (bestMap) parts.push(`${homeName} favours ${formatMapName(bestMap.map)}`)
    if (dangerMap) parts.push(`${awayName} most often gets their preferred map picture on ${formatMapName(dangerMap.map)}`)
    lines.push(parts.join(' while '))
  }

  return lines.slice(0, 3)
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
  if (lowSample) confidenceReasons.push('<50 rounds per player')
  if (highUncertainty) confidenceReasons.push('high CI on key players')
  const confidenceNote = confidenceReasons.length > 0
    ? `Low confidence: ${confidenceReasons.join(', ')}`
    : 'Moderate confidence: stable data baseline.'

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
  const mapBattlefield = buildMapBattlefield(options?.mapPool)
  const mapEdges = mapBattlefield?.maps.map((map) => (map.home_win_rate ?? 0.5) - (map.away_win_rate ?? 0.5)) ?? []
  const averageMapEdge = mapEdges.length > 0 ? average(mapEdges) : 0
  const openingShare = relativeShare(homeOd, awayOd)
  const tradeShare = relativeShare(homeTradeKillRate ?? 0, awayTradeKillRate ?? 0)
  const survivalShare = relativeShare(homeSurvival ?? homeStats.avg_kast, awaySurvival ?? awayStats.avg_kast)
  const homeEntryBlend = clamp(((homeFirstkillRate ?? 0) / 0.12) * 0.6 + homeOd * 0.4, 0, 1)
  const awayEntryBlend = clamp(((awayFirstkillRate ?? 0) / 0.12) * 0.6 + awayOd * 0.4, 0, 1)
  const entryShare = relativeShare(homeEntryBlend, awayEntryBlend)
  const tradeCoverage = average([
    teams.home.players.filter((player) => player.bl_extended?.trade_kills != null).length / Math.max(teams.home.players.length, 1),
    teams.away.players.filter((player) => player.bl_extended?.trade_kills != null).length / Math.max(teams.away.players.length, 1),
  ])
  const survivalCoverage = average([
    teams.home.players.filter((player) => player.bl_extended?.survival_ratio != null).length / Math.max(teams.home.players.length, 1),
    teams.away.players.filter((player) => player.bl_extended?.survival_ratio != null).length / Math.max(teams.away.players.length, 1),
  ])
  const entryCoverage = average([
    teams.home.players.filter((player) => player.bl_extended?.firstkills != null).length / Math.max(teams.home.players.length, 1),
    teams.away.players.filter((player) => player.bl_extended?.firstkills != null).length / Math.max(teams.away.players.length, 1),
  ])

  const matchupAxes: NonNullable<LandingAnalytics['matchup_axes']> = [
    {
      key: 'opening_duel',
      label: 'Opening duel',
      home_value: openingShare.home,
      away_value: openingShare.away,
      home_display: percentLabel(homeOd),
      away_display: percentLabel(awayOd),
      confidence: confidenceFromSignals({
        source,
        coverage: average([
          teams.home.players.length > 0 ? homeStats.leetify_count / teams.home.players.length : 0,
          teams.away.players.length > 0 ? awayStats.leetify_count / teams.away.players.length : 0,
        ]),
        avgRounds,
      }),
      source,
      note: `Edge ${signedPercentPoints(homeOd - awayOd)}`,
    },
    {
      key: 'trade_structure',
      label: 'Trade structure',
      home_value: tradeShare.home,
      away_value: tradeShare.away,
      home_display: homeTradeKillRate != null ? `${homeTradeKillRate.toFixed(2)} K/R` : 'Fallback',
      away_display: awayTradeKillRate != null ? `${awayTradeKillRate.toFixed(2)} K/R` : 'Fallback',
      confidence: confidenceFromSignals({
        source: homeTradeKillRate != null && awayTradeKillRate != null ? 'bl' : 'insufficient',
        coverage: tradeCoverage,
        avgRounds,
      }),
      source: homeTradeKillRate != null && awayTradeKillRate != null ? 'bl' : 'insufficient',
      note: homeTradeRecovery != null && awayTradeRecovery != null
        ? `Recovery ${signedPercentPoints(homeTradeRecovery - awayTradeRecovery)}`
        : 'Trade-kill rate per round',
    },
    {
      key: 'survival_discipline',
      label: 'Survival discipline',
      home_value: survivalShare.home,
      away_value: survivalShare.away,
      home_display: homeSurvival != null ? percentLabel(homeSurvival) : `KAST ${percentLabel(homeStats.avg_kast)}`,
      away_display: awaySurvival != null ? percentLabel(awaySurvival) : `KAST ${percentLabel(awayStats.avg_kast)}`,
      confidence: confidenceFromSignals({
        source: homeSurvival != null && awaySurvival != null ? 'bl' : 'insufficient',
        coverage: survivalCoverage,
        avgRounds,
      }),
      source: homeSurvival != null && awaySurvival != null ? 'bl' : 'insufficient',
      note: homeSurvival != null && awaySurvival != null
        ? `Primary: survival ratio · støtte: KAST ${percentLabel(homeStats.avg_kast)} vs ${percentLabel(awayStats.avg_kast)}`
        : `Fallback: KAST ${percentLabel(homeStats.avg_kast)} vs ${percentLabel(awayStats.avg_kast)}`,
    },
    {
      key: 'entry_pressure',
      label: 'Entry pressure blend',
      home_value: entryShare.home,
      away_value: entryShare.away,
      home_display: homeFirstkillRate != null ? `${homeFirstkillRate.toFixed(2)} FK/R` : percentLabel(homeOd),
      away_display: awayFirstkillRate != null ? `${awayFirstkillRate.toFixed(2)} FK/R` : percentLabel(awayOd),
      confidence: confidenceFromSignals({
        source: homeFirstkillRate != null && awayFirstkillRate != null ? source : 'insufficient',
        coverage: entryCoverage,
        avgRounds,
      }),
      source: homeFirstkillRate != null && awayFirstkillRate != null ? source : 'insufficient',
      note: homeFirstkillRate != null && awayFirstkillRate != null
        ? `Blend: 60% FK/R + 40% OD · OD ${percentLabel(homeOd)} vs ${percentLabel(awayOd)}`
        : `Fallback: OD ${percentLabel(homeOd)} vs ${percentLabel(awayOd)}`,
    },
    {
      key: 'map_leverage',
      label: 'Map leverage',
      home_value: clamp(50 + averageMapEdge * 100, 5, 95),
      away_value: clamp(50 - averageMapEdge * 100, 5, 95),
      home_display: mapBattlefield?.strongest_for_home[0] ? formatMapName(mapBattlefield.strongest_for_home[0]) : 'No clear edge',
      away_display: mapBattlefield?.strongest_for_away[0] ? formatMapName(mapBattlefield.strongest_for_away[0]) : 'No clear edge',
      confidence: confidenceFromSignals({
        source: mapBattlefield != null ? 'derived' : 'insufficient',
        coverage: mapBattlefield != null && mapBattlefield.maps.length > 0 ? 1 : 0,
        avgRounds,
      }),
      source: mapBattlefield != null ? 'derived' : 'insufficient',
      note: mapBattlefield?.veto_flow.length
        ? `Veto-plan ${mapBattlefield.veto_flow.map((step) => `${step.label} ${formatMapName(step.map)}`).slice(0, 2).join(' · ')}`
        : 'Ingen robust veto-sekvens',
    },
  ]

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
    matchup_axes: matchupAxes,
    map_battlefield: mapBattlefield,
    watchlist: {
      home: buildWatchBuckets(teams.home.players),
      away: buildWatchBuckets(teams.away.players),
    },
    game_plan: buildGamePlan({
      homeName: teams.home.name || 'Home',
      awayName: teams.away.name || 'Away',
      favored,
      confidenceNote,
      mapBattlefield,
      tradeDelta: (homeTradeKillRate ?? 0) - (awayTradeKillRate ?? 0),
      survivalDelta: (homeSurvival ?? homeStats.avg_kast) - (awaySurvival ?? awayStats.avg_kast),
      entryDelta: (homeFirstkillRate ?? homeOd) - (awayFirstkillRate ?? awayOd),
    }),
  }
}
