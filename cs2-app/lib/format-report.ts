import { deriveTeamStats } from '@/lib/derive-team-stats'
import { roundedProbability, winProbability } from '@/lib/win-probability'
import type { AnalyzeResponse, PlayerAnalysis, Team } from '@/lib/types'

function formatDate(meta: AnalyzeResponse['meta']): string {
  const value = meta.match_start_time ?? meta.match_finished_time ?? meta.fetched_at
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Ukjent tid'
  return new Intl.DateTimeFormat('nb-NO', {
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
    `${team.name || 'Ukjent lag'} (styrke: ${(stats.avg_score * 10).toFixed(1)} ±${avgCi.toFixed(1)})`,
    ...sorted.map(playerLine),
  ]

  return lines.join('\n')
}

export function formatReport(result: AnalyzeResponse): string {
  if (result.meta.match_status === 'played') {
    const winnerLabel =
      result.result_summary?.winner === 'home'
        ? result.teams.home.name || 'Hjem'
        : result.result_summary?.winner === 'away'
          ? result.teams.away.name || 'Borte'
          : result.result_summary?.winner === 'draw'
            ? 'Uavgjort'
            : 'Ukjent'

    const scoreLabel = (
      result.result_summary?.home_score != null &&
      result.result_summary?.away_score != null
    )
      ? `${result.result_summary.home_score}-${result.result_summary.away_score}`
      : 'Ukjent score'

    const mapLines = (() => {
      const maps = result.maps_played
      if (!maps) return ['Kart: Ikke tilgjengelig']
      if (maps.maps.length === 0) {
        return [
          `Kart: ${maps.total_maps > 0 ? `${maps.total_maps} (uten detaljer)` : 'Ikke tilgjengelig'}`,
          ...(maps.note ? [`Notat: ${maps.note}`] : []),
        ]
      }
      return [
        `Kart (${maps.total_maps}):`,
        ...maps.maps.map((map, index) => {
          const mapName = map.name ?? `Map ${index + 1}`
          const mapScore = map.home_score != null && map.away_score != null
            ? ` ${map.home_score}-${map.away_score}`
            : ''
          const source = map.source === 'derived' ? ' (estimert)' : ''
          return `  - ${mapName}${mapScore}${source}`
        }),
        ...(maps.note ? [`Notat: ${maps.note}`] : []),
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
      'CS2 ETTERANALYSE',
      `${result.teams.home.name || 'Ukjent lag'} vs ${result.teams.away.name || 'Ukjent lag'} — ${formatDate(result.meta)}`,
      '',
      `Resultat: ${scoreLabel} (${winnerLabel})`,
      ...mapLines,
      '',
      tactical
        ? `Taktisk kontroll: ${tactical.summary} (OD-edge ${tactical.opening_duel_edge_pp.toFixed(1)}pp, KAST-edge ${tactical.stability_edge_kast_pp.toFixed(1)}pp, DPR-edge ${tactical.pressure_edge_dpr.toFixed(1)})`
        : 'Taktisk kontroll: Ikke tilgjengelig',
      economy
        ? `Økonomi-proxy: ${economy.summary} (OD ${economy.indicators.opening_control_pp.toFixed(1)}pp, KAST ${economy.indicators.survival_edge_kast_pp.toFixed(1)}pp, DPR ${economy.indicators.damage_pressure_edge_dpr.toFixed(1)}, trade ${economy.indicators.trade_structure_pp?.toFixed(1) ?? 'n/a'})`
        : 'Økonomi-proxy: Ikke tilgjengelig',
      teamplay
        ? `Teamplay-kontroll: ${teamplay.summary} (trade ${teamplay.indicators.trade_kill_edge_per_100_rounds.toFixed(1)}/100r, assist ${teamplay.indicators.assist_edge_per_round.toFixed(2)}/r${teamplay.indicators.trade_recovery_edge_pp != null ? `, recovery ${teamplay.indicators.trade_recovery_edge_pp.toFixed(1)}pp` : ''})`
        : 'Teamplay-kontroll: Ikke tilgjengelig',
      stability
        ? `Round stability: ${stability.summary} (${stability.indicators.survival_edge_pp != null ? `survival ${stability.indicators.survival_edge_pp.toFixed(1)}pp, ` : ''}KAST ${stability.indicators.kast_edge_pp.toFixed(1)}pp${stability.indicators.survival_minus_kast_edge_pp != null ? `, survival-KAST ${stability.indicators.survival_minus_kast_edge_pp.toFixed(1)}pp` : ''})`
        : 'Round stability: Ikke tilgjengelig',
      lateRound
        ? `Late-round conversion: ${lateRound.summary} (${lateRound.indicators.clutch_edge_per_map != null ? `clutch ${lateRound.indicators.clutch_edge_per_map.toFixed(2)}/map, ` : ''}${lateRound.indicators.one_v_x_edge != null ? `1vX ${lateRound.indicators.one_v_x_edge.toFixed(2)}/map, ` : ''}${lateRound.indicators.explosive_round_edge != null ? `explosive ${lateRound.indicators.explosive_round_edge.toFixed(2)}/map` : 'høy varians'})`
        : 'Late-round conversion: Ikke tilgjengelig',
      '',
      teamSection(result.teams.home),
      '',
      teamSection(result.teams.away),
      '',
      ...(dev && dev.focus_players.length > 0
        ? [
          'Utviklingspunkter:',
          ...dev.focus_players.map((p) =>
            `  - ${p.player_name} (${p.team === 'home' ? (result.teams.home.name || 'Hjem') : (result.teams.away.name || 'Borte')}): ${p.note} Tiltak: ${p.action}`,
          ),
          '',
        ]
        : []),
      ...(coach.length > 0
        ? [
          'Coach-anbefalinger:',
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
    ? result.teams.home.name || 'Hjemmelag'
    : result.teams.away.name || 'Bortelag'

  const confidenceBits: string[] = []
  if (avgRounds < 50) confidenceBits.push('<50 runder/spiller')
  if (hasLargeUncertainty) confidenceBits.push('høy CI på nøkkelspillere')
  const confidenceText = confidenceBits.length > 0
    ? `lav konfidans, ${confidenceBits.join(', ')}`
    : 'normal konfidans'

  const lines = [
    'CS2 ANALYSE',
    `${result.teams.home.name || 'Ukjent lag'} vs ${result.teams.away.name || 'Ukjent lag'} — ${formatDate(result.meta)}`,
    '',
    teamSection(result.teams.home),
    '',
    teamSection(result.teams.away),
    '',
    `Fordel: ${favoredTeam} (${homeWinPct}%/${100 - homeWinPct}% — ${confidenceText})`,
  ]

  return lines.join('\n')
}
