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
  return `  ${name} ${score}  (K/D ${kd}, DPR ${dpr}, KAST ${kast})`
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
    `CS2 ANALYSE — Matchup #${result.matchup_id}`,
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
