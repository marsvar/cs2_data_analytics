import { deriveTeamStats } from '@/lib/derive-team-stats'
import { roundedProbability, winProbability } from '@/lib/win-probability'
import type { AnalyzeResponse, PlayerAnalysis, Team } from '@/lib/types'

function formatDate(meta: AnalyzeResponse['meta']): string {
  const value = meta.match_start_time ?? meta.match_finished_time ?? meta.fetched_at
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Unknown time'
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function playerLine(player: PlayerAnalysis): string {
  const name = player.name.padEnd(12, ' ')
  const score = (player.score * 10).toFixed(1).padStart(4, ' ')
  const kd = player.kd.toFixed(2)
  const dpr = player.dpr.toFixed(0)
  const kast = `${Math.round(player.kast * 100)}%`
  const survival = player.bl_extended?.survival_ratio != null
    ? `, SURV ${Math.round(player.bl_extended.survival_ratio * 100)}%`
    : ''
  return `  ${name} ${score}  (K/D ${kd}, DPR ${dpr}, KAST ${kast}${survival})`
}

function teamSection(team: Team): string {
  const stats = deriveTeamStats(team.players)
  const avgCi = team.players.length > 0
    ? team.players.reduce((sum, p) => sum + p.ci, 0) / team.players.length
    : 0
  const sorted = [...team.players].sort((a, b) => b.score - a.score)

  const lines = [
    `${team.name || 'Unknown team'} (strength: ${(stats.avg_score * 10).toFixed(1)} ±${avgCi.toFixed(1)})`,
    ...sorted.map(playerLine),
  ]

  return lines.join('\n')
}

export function formatReport(result: AnalyzeResponse): string {
  if (result.meta.match_status === 'played') {
    const winnerLabel =
      result.result_summary?.winner === 'home'
        ? result.teams.home.name || 'Home'
        : result.result_summary?.winner === 'away'
          ? result.teams.away.name || 'Away'
          : result.result_summary?.winner === 'draw'
            ? 'Draw'
            : 'Unknown'

    const scoreLabel = (
      result.result_summary?.home_score != null &&
      result.result_summary?.away_score != null
    )
      ? `${result.result_summary.home_score}-${result.result_summary.away_score}`
      : 'Unknown score'

    const mapLines = (() => {
      const maps = result.maps_played
      if (!maps) return ['Maps: Not available']
      if (maps.maps.length === 0) {
        return [
          `Maps: ${maps.total_maps > 0 ? `${maps.total_maps} (without details)` : 'Not available'}`,
          ...(maps.note ? [`Note: ${maps.note}`] : []),
        ]
      }
      return [
        `Maps (${maps.total_maps}):`,
        ...maps.maps.map((map, index) => {
          const mapName = map.name ?? `Map ${index + 1}`
          const mapScore = map.home_score != null && map.away_score != null
            ? ` ${map.home_score}-${map.away_score}`
            : ''
          const source = map.source === 'derived' ? ' (estimated)' : ''
          return `  - ${mapName}${mapScore}${source}`
        }),
        ...(maps.note ? [`Note: ${maps.note}`] : []),
      ]
    })()

    const tactical = result.post_analysis?.tactical_control
    const economy = result.post_analysis?.economy_proxies
    const teamplay = result.post_analysis?.teamplay_control
    const stability = result.post_analysis?.round_stability
    const lateRound = result.post_analysis?.late_round_conversion
    const dev = result.post_analysis?.player_development
    const coach = result.post_analysis?.coach_recommendations ?? []

    const lines = [
      'CS2 POST-MATCH ANALYSIS',
      `${result.teams.home.name || 'Unknown team'} vs ${result.teams.away.name || 'Unknown team'} — ${formatDate(result.meta)}`,
      '',
      `Resultat: ${scoreLabel} (${winnerLabel})`,
      ...mapLines,
      '',
      tactical
        ? `Tactical Control: ${tactical.summary} (Opening Duel edge ${tactical.opening_duel_edge_pp.toFixed(1)}pp, KAST edge ${tactical.stability_edge_kast_pp.toFixed(1)}pp, DPR edge ${tactical.pressure_edge_dpr.toFixed(1)})`
        : 'Tactical Control: Not available',
      economy
        ? `Economy: ${economy.summary} (Opening Duel ${economy.indicators.opening_control_pp.toFixed(1)}pp, KAST ${economy.indicators.survival_edge_kast_pp.toFixed(1)}pp, DPR ${economy.indicators.damage_pressure_edge_dpr.toFixed(1)}, trade ${economy.indicators.trade_structure_pp?.toFixed(1) ?? 'n/a'})`
        : 'Economy: Not available',
      teamplay
        ? `Teamplay Control: ${teamplay.summary} (trade ${teamplay.indicators.trade_kill_edge_per_100_rounds.toFixed(1)}/100r, assist ${teamplay.indicators.assist_edge_per_round.toFixed(2)}/r${teamplay.indicators.trade_recovery_edge_pp != null ? `, recovery ${teamplay.indicators.trade_recovery_edge_pp.toFixed(1)}pp` : ''})`
        : 'Teamplay Control: Not available',
      stability
        ? `Round Stability: ${stability.summary} (${stability.indicators.survival_edge_pp != null ? `survival ${stability.indicators.survival_edge_pp.toFixed(1)}pp, ` : ''}KAST ${stability.indicators.kast_edge_pp.toFixed(1)}pp${stability.indicators.survival_minus_kast_edge_pp != null ? `, survival-KAST ${stability.indicators.survival_minus_kast_edge_pp.toFixed(1)}pp` : ''})`
        : 'Round Stability: Not available',
      lateRound
        ? `Late-round impact: ${lateRound.summary} (${lateRound.metrics.clutch_wins_per_map ? `clutch ${lateRound.metrics.clutch_wins_per_map.home.toFixed(2)} vs ${lateRound.metrics.clutch_wins_per_map.away.toFixed(2)}/map, ` : ''}${lateRound.metrics.one_v_x_wins_per_map ? `1vX ${lateRound.metrics.one_v_x_wins_per_map.home.toFixed(2)} vs ${lateRound.metrics.one_v_x_wins_per_map.away.toFixed(2)}/map, ` : ''}${lateRound.metrics.explosive_rounds_per_map ? `explosive ${lateRound.metrics.explosive_rounds_per_map.home.toFixed(2)} vs ${lateRound.metrics.explosive_rounds_per_map.away.toFixed(2)}/map` : 'high variance'})`
        : 'Late-round impact: Not available',
      '',
      teamSection(result.teams.home),
      '',
      teamSection(result.teams.away),
      '',
      ...(dev && dev.focus_players.length > 0
        ? [
          'Player Development:',
          ...dev.focus_players.map((p) =>
            `  - ${p.player_name} (${p.team === 'home' ? (result.teams.home.name || 'Home') : (result.teams.away.name || 'Away')}): ${p.note} Action: ${p.action}`,
          ),
          '',
        ]
        : []),
      ...(coach.length > 0
        ? [
          'Coach Notes:',
          ...coach.map((c) => `  - ${c}`),
        ]
        : []),
    ]

    return lines.join('\n')
  }

  const homeStats = deriveTeamStats(result.teams.home.players)
  const awayStats = deriveTeamStats(result.teams.away.players)
  const homeWinProbability = roundedProbability(
    winProbability(homeStats.avg_score, awayStats.avg_score),
  )
  const homeWinPct = Math.round(homeWinProbability * 100)

  const avgRounds = (() => {
    const rounds = [...result.teams.home.players, ...result.teams.away.players].map((p) => p.rounds)
    if (rounds.length === 0) return 0
    return rounds.reduce((sum, value) => sum + value, 0) / rounds.length
  })()

  const hasLargeUncertainty = [...result.teams.home.players, ...result.teams.away.players]
    .some((p) => p.ci > (p.score * 10) / 2)

  const favoredTeam = homeWinPct >= 50
    ? result.teams.home.name || 'Home'
    : result.teams.away.name || 'Away'

  const confidenceBits: string[] = []
  if (avgRounds < 50) confidenceBits.push('<50 rounds/player')
  if (hasLargeUncertainty) confidenceBits.push('high CI on key players')
  const confidenceText = confidenceBits.length > 0
    ? `low confidence, ${confidenceBits.join(', ')}`
    : 'normal confidence'

  const lines = [
    'CS2 ANALYSIS',
    `${result.teams.home.name || 'Unknown team'} vs ${result.teams.away.name || 'Unknown team'} — ${formatDate(result.meta)}`,
    '',
    teamSection(result.teams.home),
    '',
    teamSection(result.teams.away),
    '',
    `Edge: ${favoredTeam} (${homeWinPct}%/${100 - homeWinPct}% — ${confidenceText})`,
  ]

  return lines.join('\n')
}
