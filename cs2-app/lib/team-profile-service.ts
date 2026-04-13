/**
 * team-profile-service.ts
 * -----------------------
 * Builds a TeamProfileResponse for a given BL team ID by aggregating all
 * finished matchup stats, player roles, and map pool data.
 */

import {
  getTeamInfo,
  getTeamPlayers,
  getTeamMatchups,
  getMatchupStats,
  getMatchupMeta,
} from '@/lib/bl-api'
import { fetchProfiles } from '@/lib/leetify-api'
import { compositeScore, blWeight, ci90 } from '@/lib/aggregation'
import { inferProfileRole } from '@/lib/detect-role'
import { normalizeActiveDutyMap } from '@/lib/map-pool'
import type {
  TeamProfileResponse,
  TeamMapPoolEntry,
  TeamMatchResult,
  RosterMember,
  PlayerRole,
  BLPlayerStats,
} from '@/lib/types'

export class TeamProfileError extends Error {
  status: number
  constructor(message: string, status = 500) {
    super(message)
    this.name = 'TeamProfileError'
    this.status = status
  }
}

const TEAM_CACHE_TTL_MS = 15 * 60 * 1000

type CachedEntry = { value: TeamProfileResponse; expiresAt: number }
const teamCache = new Map<number, CachedEntry>()

const BL_TOKEN = process.env.BL_TOKEN ?? ''
const LEETIFY_TOKEN = process.env.LEETIFY_TOKEN ?? ''

function resolveTeamSide(
  teamId: number,
  meta: Awaited<ReturnType<typeof getMatchupMeta>> | null,
  stats: Awaited<ReturnType<typeof getMatchupStats>>,
): 'home' | 'away' | null {
  if (meta) {
    if (meta.home.id === teamId) return 'home'
    if (meta.away.id === teamId) return 'away'
  }

  if (stats.home_team.id === teamId) return 'home'
  if (stats.away_team.id === teamId) return 'away'

  return null
}

export async function buildTeamProfile(
  teamId: number,
): Promise<TeamProfileResponse> {
  // Cache hit
  const cached = teamCache.get(teamId)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  // 1. Fetch team info, roster, and matchups in parallel
  const [teamInfo, roster, allMatchups] = await Promise.all([
    getTeamInfo(teamId, BL_TOKEN),
    getTeamPlayers(teamId, BL_TOKEN),
    getTeamMatchups(teamId, BL_TOKEN),
  ])

  const finishedMatchups = allMatchups.filter((m) => m.finished_at && m.id > 0)

  // 2. Fetch stats + meta for all finished matchups
  const matchResults = await Promise.allSettled(
    finishedMatchups.map(async (m) => {
      const [stats, meta] = await Promise.all([
        getMatchupStats(m.id, BL_TOKEN),
        getMatchupMeta(m.id, BL_TOKEN),
      ])
      return { matchupId: m.id, stats, meta, finishedAt: m.finished_at }
    }),
  )

  // 3. Determine team name from info or matchup metadata
  let teamName = teamInfo?.name ?? ''
  let logoUrl = teamInfo?.logoUrl

  for (const r of matchResults) {
    if (r.status !== 'fulfilled') continue
    const { stats, meta } = r.value
    if (!teamName) {
      if (stats.home_team.id === teamId) teamName = stats.home_team.name
      else if (stats.away_team.id === teamId) teamName = stats.away_team.name
    }
    if (!logoUrl && meta) {
      if (meta.home.id === teamId) logoUrl = meta.home.logoUrl
      else if (meta.away.id === teamId) logoUrl = meta.away.logoUrl
    }
    if (teamName && logoUrl) break
  }

  // 4. Fetch Leetify profiles for roster members
  const steamIds = roster.map((p) => p.steam64).filter((s): s is string => Boolean(s))
  const leetifyProfiles = steamIds.length > 0
    ? await fetchProfiles(steamIds, LEETIFY_TOKEN)
    : new Map()
  const rosterByUserId = new Map(roster.map((player) => [player.userId, player]))
  const rosterUserIds = new Set(rosterByUserId.keys())

  // 5. Build per-player aggregated stats
  type PlayerAcc = {
    userId: number
    name: string
    steam64?: string
    kills: number
    deaths: number
    assists: number
    damage: number
    rounds: number
    weightedKast: number
    weightedHs: number
    odWon: number
    odAttempts: number
    tradeKills: number
    tradedDeaths: number
    firstkills: number
    matchCount: number
  }

  const playerAccs = new Map<number, PlayerAcc>()

  for (const r of matchResults) {
    if (r.status !== 'fulfilled') continue
    const { stats, meta } = r.value
    const teamSide = resolveTeamSide(teamId, meta, stats)
    if (!teamSide) continue

    const teamPlayers = (teamSide === 'home' ? stats.home_players : stats.away_players)
      .filter((player) => (
        rosterUserIds.size === 0 || rosterUserIds.has(player.paradise_user_id)
      ))

    for (const p of teamPlayers) {
      if (!playerAccs.has(p.paradise_user_id)) {
        const rosterEntry = rosterByUserId.get(p.paradise_user_id)
        playerAccs.set(p.paradise_user_id, {
          userId: p.paradise_user_id,
          name: p.name,
          steam64: rosterEntry?.steam64,
          kills: 0, deaths: 0, assists: 0, damage: 0, rounds: 0,
          weightedKast: 0, weightedHs: 0,
          odWon: 0, odAttempts: 0,
          tradeKills: 0, tradedDeaths: 0, firstkills: 0,
          matchCount: 0,
        })
      }
      const acc = playerAccs.get(p.paradise_user_id)!
      acc.kills += p.kills
      acc.deaths += p.deaths
      acc.assists += p.assists
      acc.damage += p.damage
      acc.weightedKast += p.kast * p.rounds
      acc.weightedHs += p.hs * p.rounds
      acc.rounds += p.rounds
      acc.odWon += p.opening_kills
      acc.odAttempts += p.opening_attempts
      acc.tradeKills += p.bl_extended?.trade_kills ?? 0
      acc.tradedDeaths += p.bl_extended?.traded_deaths ?? 0
      acc.firstkills += p.bl_extended?.firstkills ?? 0
      acc.matchCount += 1
    }
  }

  // 6. Build roster member list with role inference.
  // Prefer the current BL roster as the source of truth for who appears.
  const rosterMembers: RosterMember[] = []
  const rosterSource = roster.length > 0
    ? roster
    : Array.from(playerAccs.values()).map((acc) => ({
      userId: acc.userId,
      userName: acc.name,
      steam64: acc.steam64,
    }))

  for (const rosterEntry of rosterSource) {
    const acc = playerAccs.get(rosterEntry.userId)

    if (!acc) {
      rosterMembers.push({
        paradise_user_id: rosterEntry.userId,
        name: rosterEntry.userName,
        steam64: rosterEntry.steam64,
        role: null,
        score: null,
        rounds: 0,
        kd: null,
        dpr: null,
        kast: null,
        hs: null,
        od_rate: null,
      })
      continue
    }

    const kd = acc.deaths > 0 ? acc.kills / acc.deaths : acc.kills
    const dpr = acc.rounds > 0 ? acc.damage / acc.rounds : 0
    const kast = acc.rounds > 0 ? acc.weightedKast / acc.rounds : 0
    const hs = acc.rounds > 0 ? acc.weightedHs / acc.rounds : 0
    const odRate = acc.odAttempts > 0 ? acc.odWon / acc.odAttempts : 0

    const leetifyData = acc.steam64 ? leetifyProfiles.get(acc.steam64)?.summary : undefined
    const score = compositeScore(dpr, kast, odRate, kd, hs)
    const w = blWeight(acc.rounds)
    let finalScore = score
    if (leetifyData) {
      const prior = (leetifyData.aim / 100) * 0.4 + (leetifyData.positioning / 100) * 0.3 + ((leetifyData.ct_od + leetifyData.t_od) / 2) * 0.3
      finalScore = w * score + (1 - w) * prior
    }

    const aggPlayer = {
      name: acc.name,
      paradise_user_id: rosterEntry.userId,
      steam64: acc.steam64,
      score: finalScore,
      ci: ci90(kast, odRate, dpr, kd, acc.rounds, acc.odAttempts),
      rounds: acc.rounds,
      assists: acc.assists,
      kd, kast, dpr, hs,
      od_rate: odRate,
      bl_extended: {
        trade_kills: acc.tradeKills,
        traded_deaths: acc.tradedDeaths,
        firstkills: acc.firstkills,
      },
      leetify: leetifyData,
      data_source: (leetifyData ? 'combined' : 'bl') as 'combined' | 'bl',
    }

    const roleResult = inferProfileRole(aggPlayer, acc.matchCount)

    rosterMembers.push({
      paradise_user_id: rosterEntry.userId,
      name: rosterEntry.userName ?? acc.name,
      steam64: acc.steam64,
      role: roleResult.role,
      score: Math.round(finalScore * 10000) / 10000,
      rounds: acc.rounds,
      kd: Math.round(kd * 1000) / 1000,
      dpr: Math.round(dpr * 10) / 10,
      kast: Math.round(kast * 10000) / 10000,
      hs: Math.round(hs * 10000) / 10000,
      od_rate: Math.round(odRate * 10000) / 10000,
    })
  }

  rosterMembers.sort((a, b) => {
    if (a.score == null && b.score == null) return a.name.localeCompare(b.name)
    if (a.score == null) return 1
    if (b.score == null) return -1
    return b.score - a.score
  })

  // 7. Role distribution and composition notes
  const roleDist: Partial<Record<PlayerRole, number>> = {}
  for (const m of rosterMembers) {
    if (m.role) roleDist[m.role] = (roleDist[m.role] ?? 0) + 1
  }

  const compositionNotes: string[] = []
  if ((roleDist.entry ?? 0) >= 2) compositionNotes.push('2 entry fraggers — aggressive opening style')
  if (!roleDist.awper) compositionNotes.push('No dedicated AWPer identified')
  if (!roleDist.support && rosterMembers.length >= 4) compositionNotes.push('No clear support role')
  if ((roleDist.igl ?? 0) >= 1) compositionNotes.push('IGL profile identified')
  if (rosterMembers.length < 5) compositionNotes.push(`Only ${rosterMembers.length} players with match data`)

  // 8. Map pool from matchup metadata
  type MapGroup = { wins: number; losses: number; count: number }
  const mapGroups = new Map<string, MapGroup>()

  const matchHistory: TeamMatchResult[] = []

  for (const r of matchResults) {
    if (r.status !== 'fulfilled') continue
    const { matchupId, stats, meta, finishedAt } = r.value

    const teamSide = resolveTeamSide(teamId, meta, stats)
    if (!teamSide) continue
    const isHome = teamSide === 'home'

    let won: boolean | null = null
    let opponentName = ''
    let opponentId = 0
    const date = (finishedAt as string | undefined) ?? meta?.finishedAt ?? null

    if (meta) {
      if (meta.winner === 'home') won = isHome
      else if (meta.winner === 'away') won = !isHome
      opponentName = isHome ? meta.away.name : meta.home.name
      opponentId = isHome ? meta.away.id : meta.home.id

      // Map pool from meta maps
      for (const mapEntry of meta.maps) {
        if (!mapEntry.name) continue
        const canonMap = normalizeActiveDutyMap(mapEntry.name)
        if (!canonMap) continue
        if (!mapGroups.has(canonMap)) mapGroups.set(canonMap, { wins: 0, losses: 0, count: 0 })
        const g = mapGroups.get(canonMap)!
        g.count += 1
        if (mapEntry.winner === 'home' && isHome) g.wins += 1
        else if (mapEntry.winner === 'away' && !isHome) g.wins += 1
        else if (mapEntry.winner !== 'unknown' && mapEntry.winner !== 'draw') g.losses += 1
      }
    }

    const firstMap = meta?.maps?.[0]?.name ? normalizeActiveDutyMap(meta.maps[0].name) : undefined
    matchHistory.push({
      matchup_id: matchupId,
      date,
      opponent_name: opponentName,
      opponent_id: opponentId,
      home_or_away: isHome ? 'home' : 'away',
      won,
      home_score: meta?.homeScore ?? null,
      away_score: meta?.awayScore ?? null,
      map: firstMap ?? undefined,
    })
  }

  // Sort match history by date descending
  matchHistory.sort((a, b) => {
    if (!a.date && !b.date) return 0
    if (!a.date) return 1
    if (!b.date) return -1
    return new Date(b.date).getTime() - new Date(a.date).getTime()
  })

  const mapPool: TeamMapPoolEntry[] = Array.from(mapGroups.entries())
    .map(([map, g]) => ({
      map,
      played: g.count,
      wins: g.wins,
      losses: g.losses,
      win_rate: g.count > 0 ? Math.round((g.wins / g.count) * 10000) / 10000 : 0,
      ct_rounds: null,
      t_rounds: null,
      confidence: g.count >= 10 ? ('high' as const) : g.count >= 5 ? ('medium' as const) : ('low' as const),
    }))
    .sort((a, b) => b.played - a.played)

  // 9. Overall win rate
  const wins = matchHistory.filter((m) => m.won === true).length
  const losses = matchHistory.filter((m) => m.won === false).length
  const totalMatches = matchHistory.length
  const winRate = totalMatches > 0 ? wins / totalMatches : 0

  // 10. Economy proxy notes
  const economyNotes: string[] = []
  // Derive from aggregated player stats
  const allPlayers = Array.from(playerAccs.values())
  if (allPlayers.length > 0) {
    const avgOdRate = allPlayers.reduce((s, p) => s + (p.odAttempts > 0 ? p.odWon / p.odAttempts : 0), 0) / allPlayers.length
    const avgFirstkillRate = allPlayers.reduce((s, p) => s + (p.rounds > 0 ? p.firstkills / p.rounds : 0), 0) / allPlayers.length
    const avgKast = allPlayers.reduce((s, p) => s + (p.rounds > 0 ? p.weightedKast / p.rounds : 0), 0) / allPlayers.length

    if (avgOdRate > 0.52) economyNotes.push(`High OD rate (${(avgOdRate * 100).toFixed(0)}%) — aggressive opening economy`)
    else if (avgOdRate < 0.44) economyNotes.push(`Low OD rate (${(avgOdRate * 100).toFixed(0)}%) — defensive playstyle`)

    if (avgFirstkillRate > 0.08) economyNotes.push(`High first-kill rate (${(avgFirstkillRate * 100).toFixed(1)}%) — strong eco rounds`)
    if (avgKast > 0.74) economyNotes.push(`High KAST (${(avgKast * 100).toFixed(0)}%) — efficient round utilisation`)
  }

  // 11. Playstyle summary
  const dominantRole = Object.entries(roleDist).sort(([, a], [, b]) => b - a)[0]?.[0] as PlayerRole | undefined
  let playstyleSummary = ''
  if (winRate > 0.65) playstyleSummary = `Dominant team at ${(winRate * 100).toFixed(0)}% win rate. `
  else if (winRate > 0.5) playstyleSummary = `Consistent team above .500. `
  else playstyleSummary = `Developing team. `

  if (dominantRole === 'entry') playstyleSummary += 'Aggressive, entry-focused playstyle.'
  else if (dominantRole === 'support') playstyleSummary += 'Team-oriented playstyle with strong utility usage.'
  else if (dominantRole === 'awper') playstyleSummary += 'Precision-focused with AWP specialists.'
  else playstyleSummary += 'Versatile playstyle.'

  const profile: TeamProfileResponse = {
    team_id: teamId,
    team_name: teamName,
    logo_url: logoUrl,
    total_matches: totalMatches,
    wins,
    losses,
    win_rate: Math.round(winRate * 10000) / 10000,
    map_pool: mapPool,
    roster: rosterMembers,
    role_distribution: roleDist,
    composition_notes: compositionNotes,
    playstyle_summary: playstyleSummary,
    match_history: matchHistory,
    economy_notes: economyNotes,
    veto_patterns: null,
    fetched_at: new Date().toISOString(),
  }

  teamCache.set(teamId, { value: profile, expiresAt: Date.now() + TEAM_CACHE_TTL_MS })
  return profile
}
