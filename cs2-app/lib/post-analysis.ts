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

function trendCategory(delta: number): 'overperforming' | 'underperforming' | 'stable' {
  if (delta >= 0.03) return 'overperforming'
  if (delta <= -0.03) return 'underperforming'
  return 'stable'
}

function buildPlayerAction(role: string, trend: 'overperforming' | 'underperforming' | 'stable'): string {
  if (trend === 'overperforming') {
    return role === 'ENTRY'
      ? 'Bygg tidlige runder rundt spillerens entry-tempo og sikre tett trade-avstand.'
      : 'Bygg flere mid-round kall rundt denne spilleren som primær impact-kilde.'
  }
  if (trend === 'underperforming') {
    if (role === 'ENTRY') return 'Reduser solo entries og øk støtteflash/trade-protokoll i åpningene.'
    if (role === 'AWP') return 'Juster AWP-posisjoner og prioriter tryggere re-peek-rytme tidlig i rundene.'
    if (role === 'SUPP') return 'Flytt utility-ansvar tidligere i runden for bedre tempo-kontroll.'
    return 'Forenkle rolleoppgaver i åpningen og fokuser på høyprosent dueller.'
  }
  return 'Hold nåværende rolleprofil, men finjuster kommunikasjon rundt første kontakt.'
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
      ? `${teams.home.name || 'Hjem'} kontrollerte kampbildet best gjennom åpningstrykk, trade-struktur og stabil rundeutførelse.`
      : `${teams.away.name || 'Borte'} kontrollerte kampbildet best gjennom åpningstrykk, trade-struktur og stabil rundeutførelse.`

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
        ? 'Skapte første-kontakt press og tvang defensive rotasjoner.'
        : role === 'AWP'
          ? 'Skapte høy verdi i tidlige dueller og kontroll på nøkkelvinkler.'
          : role === 'SUPP'
            ? 'Stabiliserte runder via høy overlevelse og tradekvalitet.'
            : 'Leverte stabil impact i sentrale rifledueller.'
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
      ? `${teams.home.name || 'Hjem'} vant flest signaler for økonomisk kontroll (åpning, skadepress, trades og overlevelse).`
      : `${teams.away.name || 'Borte'} vant flest signaler for økonomisk kontroll (åpning, skadepress, trades og overlevelse).`

  const teamplayWinner =
    Math.abs(tradeKillEdge) + Math.abs(assistEdge) >= Math.abs(tradeRecoveryEdge ?? 0)
      ? (tradeKillEdge + assistEdge >= 0 ? 'home' : 'away')
      : ((tradeRecoveryEdge ?? 0) >= 0 ? 'home' : 'away')
  const teamplaySummary =
    teamplayWinner === 'home'
      ? `${teams.home.name || 'Hjem'} hadde best teamplay-kontroll gjennom trades, refrags og støtteimpact.`
      : `${teams.away.name || 'Borte'} hadde best teamplay-kontroll gjennom trades, refrags og støtteimpact.`

  const stabilityWinner =
    Math.abs(survivalEdge) >= Math.abs(stabilityEdge)
      ? (survivalEdge >= 0 ? 'home' : 'away')
      : (stabilityEdge >= 0 ? 'home' : 'away')
  const roundStabilitySummary =
    stabilityWinner === 'home'
      ? `${teams.home.name || 'Hjem'} holdt flest runder levende via bedre survival-disciplin og stabil KAST-profil.`
      : `${teams.away.name || 'Borte'} holdt flest runder levende via bedre survival-disciplin og stabil KAST-profil.`

  const lateRoundSignals = [clutchEdge ?? 0, oneVXEdge ?? 0, explosiveEdge ?? 0]
  const lateRoundWinner = lateRoundSignals.reduce((sum, value) => sum + value, 0) >= 0 ? 'home' : 'away'
  const lateRoundSummary =
    clutchEdge == null && oneVXEdge == null && explosiveEdge == null
      ? 'Late-round conversion mangler robuste BL-felt i denne kampen.'
      : lateRoundWinner === 'home'
        ? `${teams.home.name || 'Hjem'} hadde høyest late-round impact via clutch- og closer-signaler.`
        : `${teams.away.name || 'Borte'} hadde høyest late-round impact via clutch- og closer-signaler.`

  const comparablePlayers = [
    ...teams.home.players.map((player) => ({ team: 'home' as const, player })),
    ...teams.away.players.map((player) => ({ team: 'away' as const, player })),
  ].filter((entry) => entry.player.leetify_prior != null)

  const allPlayersForDev = [
    ...teams.home.players.map((player) => ({ team: 'home' as const, player })),
    ...teams.away.players.map((player) => ({ team: 'away' as const, player })),
  ]

  let focusPlayers: PostAnalysis['player_development']['focus_players']

  if (comparablePlayers.length >= 2) {
    const scoreMax = Math.max(...comparablePlayers.map((e) => e.player.score), 0.01)
    focusPlayers = comparablePlayers
      .map(({ team, player }) => {
        const delta = player.score - (player.leetify_prior ?? player.score)
        const trend = trendCategory(delta)
        const role = roleLabel(player)
        const note =
          trend === 'overperforming'
            ? `Leverte over baseline (${(delta * 10).toFixed(1)} poeng over forventning).`
            : trend === 'underperforming'
              ? `Leverte under baseline (${(delta * 10).toFixed(1)} poeng under forventning).`
              : 'Lå nær baseline-nivå.'
        return {
          team,
          player_name: player.name,
          trend,
          note,
          action: buildPlayerAction(role, trend),
          score: round2(player.score),
          score_max: round2(scoreMax),
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
        const note = `In-match relativ: ${sign}${(delta * 10).toFixed(1)} ift. kampsnitt (ingen historisk baseline).`
        return {
          team,
          player_name: player.name,
          trend,
          note,
          action: buildPlayerAction(role, trend),
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
    const side = openingEdge >= 0 ? teams.home.name || 'Hjem' : teams.away.name || 'Borte'
    coachRecommendations.push(
      `Prioriter å gjenskape åpningsoverlegenheten for ${side}; dagens OD-edge var ${Math.abs(round2(openingEdge))} pp.`,
    )
  } else {
    coachRecommendations.push('Åpningsduellene var jevne; fokuser på bedre trade-struktur i første 20 sekunder.')
  }
  if (Math.abs(pressureEdge) >= 5) {
    const side = pressureEdge >= 0 ? teams.home.name || 'Hjem' : teams.away.name || 'Borte'
    coachRecommendations.push(
      `${side} hadde tydelig skadepress (${Math.abs(round2(pressureEdge)).toFixed(1)} DPR-edge); bygg neste kampplan rundt dette tempoet.`,
    )
  } else {
    coachRecommendations.push('Skadepresset var tett; neste forbedring ligger i utility-synk og refrag timing.')
  }
  if (Math.abs(tradeKillEdge) >= 3) {
    const side = tradeKillEdge >= 0 ? teams.home.name || 'Hjem' : teams.away.name || 'Borte'
    coachRecommendations.push(
      `${side} vant trade-spillet tydelig (${Math.abs(round2(tradeKillEdge)).toFixed(1)} trade-kills per 100 runder); behold spacing og refrag-protokoller.`,
    )
  } else {
    coachRecommendations.push('Trade-spillet var jevnt; fokuser på kortere avstand til første kontakt og raskere refrag-kall.')
  }
  if (Math.abs(survivalEdge) >= 4) {
    const side = survivalEdge >= 0 ? teams.home.name || 'Hjem' : teams.away.name || 'Borte'
    coachRecommendations.push(
      `${side} hadde bedre survival-disciplin (${Math.abs(round2(survivalEdge)).toFixed(1)} pp); bruk dette som modell for mid-round og post-plant-posisjonering.`,
    )
  }
  coachRecommendations.push(
    'Tolk clutch og explosive rounds konservativt; de er høyimpact, men mer volatile enn survival-, trade- og opening-signaler.',
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
      caveat: 'BL-signal styrer når tilgjengelig; uten full buy/utility-telemetri brukes fortsatt OD/KAST/DPR som økonomisk proxy.',
    },
    teamplay_control: {
      summary: teamplaySummary,
      indicators: {
        trade_kill_edge_per_100_rounds: round2(tradeKillEdge),
        trade_recovery_edge_pp: tradeRecoveryEdge != null ? round2(tradeRecoveryEdge) : undefined,
        assist_edge_per_round: round2(assistEdge),
      },
      caveat: 'Trade-struktur er sterkest når både trade_kills og traded_deaths finnes; ellers må signalet leses mer forsiktig.',
    },
    round_stability: {
      summary: roundStabilitySummary,
      indicators: {
        survival_edge_pp: homeStats.avg_survival != null && awayStats.avg_survival != null ? round2(survivalEdge) : undefined,
        kast_edge_pp: round2(stabilityEdge),
        survival_minus_kast_edge_pp: survivalMinusKastEdge != null ? round2(survivalMinusKastEdge) : undefined,
      },
      caveat: 'Survival brukes som støtteindikator til KAST, ikke som erstatning; gapet mellom dem sier noe om hvordan rundene ble overlevd.',
    },
    late_round_conversion: {
      summary: lateRoundSummary,
      indicators: {
        clutch_edge_per_map: clutchEdge != null ? round2(clutchEdge) : undefined,
        one_v_x_edge: oneVXEdge != null ? round2(oneVXEdge) : undefined,
        explosive_round_edge: explosiveEdge != null ? round2(explosiveEdge) : undefined,
      },
      caveat: 'Clutch- og explosive-signaler er forklarende i etteranalyse, men skal ikke overtolkes som stabile prediktive inputs alene.',
    },
    player_development: {
      focus_players: focusPlayers,
    },
    coach_recommendations: coachRecommendations,
  }
}
