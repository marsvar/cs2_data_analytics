/**
 * player-profile-service.ts
 * -------------------------
 * Builds a PlayerProfileResponse for a given paradise_user_id by aggregating
 * all finished matchup stats for the player's team, then blending with Leetify.
 */

import {
  getUserSteamId,
  getUserTeamId,
  getTeamMatchups,
  getTeamPlayers,
  getMatchupStats,
  getMatchupMeta,
  getUserImageUrl,
  getCompetitions,
  getCompetitionSignupTeams,
} from '@/lib/bl-api'
import { fetchProfiles } from '@/lib/leetify-api'
import { compositeScore, blWeight, ci90 } from '@/lib/aggregation'
import { inferProfileRole } from '@/lib/detect-role'
import { normalizeActiveDutyMap } from '@/lib/map-pool'
import type {
  PlayerProfileResponse,
  PerformanceTrendPoint,
  PlayerMapRecord,
  PlayerRole,
  BLPlayerStats,
} from '@/lib/types'

export class PlayerProfileError extends Error {
  status: number
  constructor(message: string, status = 500) {
    super(message)
    this.name = 'PlayerProfileError'
    this.status = status
  }
}

const PROFILE_CACHE_TTL_MS = 10 * 60 * 1000

type CachedEntry = { value: PlayerProfileResponse; expiresAt: number }
const profileCache = new Map<number, CachedEntry>()

const BL_TOKEN = process.env.BL_TOKEN ?? ''
const LEETIFY_TOKEN = process.env.LEETIFY_TOKEN ?? ''

/**
 * Find a player's team ID by scanning competition signups.
 * Uses COMPETITION_ID env var if set, otherwise scans recent CS2 competitions.
 * Returns null if not found.
 */
async function discoverTeamId(
  userId: number,
  token: string,
): Promise<number | null> {
  // Build list of competition IDs to scan (env vars first, then dynamic)
  const competitionIdsToScan: number[] = []

  const envCompId = process.env.COMPETITION_ID ? parseInt(process.env.COMPETITION_ID) : NaN
  if (!isNaN(envCompId) && envCompId > 0) {
    competitionIdsToScan.push(envCompId)
  }

  if (competitionIdsToScan.length === 0) {
    // Dynamically find recent CS2 competitions
    const competitions = await getCompetitions(token)
    const recentCs2 = competitions
      .filter((c) => {
        const n = c.name?.toLowerCase() ?? ''
        return n.includes('bedriftsligaen') || n.includes('counter-strike') || n.includes('cs2')
      })
      .sort((a, b) => b.id - a.id)
      .slice(0, 3)
    competitionIdsToScan.push(...recentCs2.map((c) => c.id))
  }

  for (const compId of competitionIdsToScan) {
    const signups = await getCompetitionSignupTeams(compId, token)
    const teamIds = signups.map((s) => s.team_id)
    if (teamIds.length === 0) continue

    // Parallel-check all teams for the user
    const results = await Promise.allSettled(
      teamIds.map(async (teamId) => {
        const players = await getTeamPlayers(teamId, token)
        if (players.some((p) => p.userId === userId)) return teamId
        return null
      }),
    )

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value != null) return r.value
    }
  }
  return null
}

export async function buildPlayerProfile(
  userId: number,
  hintTeamId?: number,
): Promise<PlayerProfileResponse> {
  // Cache hit
  const cached = profileCache.get(userId)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  // 1. Get Steam64 and avatar in parallel
  const [steam64, avatarUrl] = await Promise.all([
    getUserSteamId(userId, BL_TOKEN),
    getUserImageUrl(userId, BL_TOKEN),
  ])

  // 2. Resolve team ID (fast path → fallback chain)
  let resolvedTeamId: number | null = hintTeamId ?? null

  if (!resolvedTeamId) {
    // Try /user/{id} fields first (usually returns null but free to try)
    resolvedTeamId = await getUserTeamId(userId, BL_TOKEN)
  }

  if (!resolvedTeamId) {
    // Try scanning recent competitions for the player
    resolvedTeamId = await discoverTeamId(userId, BL_TOKEN)
  }

  if (!resolvedTeamId) {
    throw new PlayerProfileError('Spiller har ingen lagdata', 404)
  }

  // 3. Fetch all team matchups
  const allMatchups = await getTeamMatchups(resolvedTeamId, BL_TOKEN)
  const finishedMatchups = allMatchups.filter((m) => m.finished_at && m.id > 0)

  if (finishedMatchups.length === 0) {
    // Return a minimal profile when no matches have been played
    const emptyProfile: PlayerProfileResponse = {
      paradise_user_id: userId,
      name: '',
      avatar_url: avatarUrl,
      steam64: steam64 ?? undefined,
      total_rounds: 0,
      total_matches: 0,
      kd: 0,
      kast: 0,
      dpr: 0,
      hs: 0,
      od_rate: 0,
      flash_assists_per_round: null,
      utility_dmg_per_round: null,
      clutch_win_pct: null,
      first_death_rate: null,
      multi_kills: null,
      side_split: null,
      score: 0,
      ci: 0,
      role: 'hybrid',
      role_confidence: 'low',
      role_signals: [],
      trend: { last5: [], last10: [], last20: [] },
      map_records: [],
      data_source: 'bl',
      fetched_at: new Date().toISOString(),
    }
    return emptyProfile
  }

  // 3. Fetch stats + meta for all finished matchups in parallel
  const results = await Promise.allSettled(
    finishedMatchups.map(async (m) => {
      const [stats, meta] = await Promise.all([
        getMatchupStats(m.id, BL_TOKEN),
        getMatchupMeta(m.id, BL_TOKEN),
      ])
      return { matchupId: m.id, stats, meta, finishedAt: m.finished_at }
    }),
  )

  // 4. Collect this player's rows from each matchup
  type MatchEntry = {
    matchupId: number
    player: BLPlayerStats
    date: string | null
    won: boolean | null
    mapName?: string
    isHome: boolean
  }

  const matchEntries: MatchEntry[] = []
  let displayName = ''

  for (const r of results) {
    if (r.status !== 'fulfilled') continue
    const { matchupId, stats, meta, finishedAt } = r.value

    const allPlayers = [...stats.home_players, ...stats.away_players]
    const player = allPlayers.find((p) => p.paradise_user_id === userId)
    if (!player) continue

    if (!displayName && player.name) displayName = player.name

    const isHome = stats.home_players.some((p) => p.paradise_user_id === userId)
    let won: boolean | null = null
    let mapName: string | undefined
    const date = (finishedAt as string | undefined) ?? meta?.finishedAt ?? null

    if (meta) {
      if (meta.winner === 'home') won = isHome
      else if (meta.winner === 'away') won = !isHome
      else won = null

      // Use first map name if available
      if (meta.maps.length > 0 && meta.maps[0].name) {
        mapName = normalizeActiveDutyMap(meta.maps[0].name) ?? undefined
      }
    }

    matchEntries.push({ matchupId, player, date, won, mapName, isHome })
  }

  if (matchEntries.length === 0) {
    throw new PlayerProfileError('Ingen kampdata funnet for spilleren', 404)
  }

  // 5. Fetch Leetify profile if we have a Steam64
  let leetifyData = undefined
  let recentMatches = undefined
  if (steam64) {
    const profiles = await fetchProfiles([steam64], LEETIFY_TOKEN)
    const profile = profiles.get(steam64)
    if (profile) {
      leetifyData = profile.summary
      recentMatches = profile.recent_matches
    }
  }

  // 6. Aggregate stats across all matches
  let totalKills = 0
  let totalDeaths = 0
  let totalAssists = 0
  let totalDamage = 0
  let totalRounds = 0
  let totalOdWon = 0
  let totalOdAttempts = 0
  let weightedKast = 0
  let weightedHs = 0
  let totalClutchWon = 0
  let totalOneVX = 0
  let totalTradedDeaths = 0
  let totalK3 = 0
  let totalK4 = 0
  let totalK5 = 0

  for (const { player } of matchEntries) {
    totalKills += player.kills
    totalDeaths += player.deaths
    totalAssists += player.assists
    totalDamage += player.damage
    totalOdWon += player.opening_kills
    totalOdAttempts += player.opening_attempts
    weightedKast += player.kast * player.rounds
    weightedHs += player.hs * player.rounds
    totalRounds += player.rounds

    const ext = player.bl_extended
    if (ext) {
      totalClutchWon += (ext.won_1v1 ?? 0) + (ext.won_1v2 ?? 0) + (ext.won_1v3 ?? 0) + (ext.won_1v4 ?? 0) + (ext.won_1v5 ?? 0)
      totalOneVX += ext.one_v_x_total ?? 0
      totalTradedDeaths += ext.traded_deaths ?? 0
      totalK3 += ext.multi_kills?.rounds_with_3k ?? 0
      totalK4 += ext.multi_kills?.rounds_with_4k ?? 0
      totalK5 += ext.multi_kills?.rounds_with_5k ?? 0
    }
  }

  const aggKd = totalDeaths > 0 ? totalKills / totalDeaths : totalKills
  const aggDpr = totalRounds > 0 ? totalDamage / totalRounds : 0
  const aggKast = totalRounds > 0 ? weightedKast / totalRounds : 0
  const aggHs = totalRounds > 0 ? weightedHs / totalRounds : 0
  const aggOdRate = totalOdAttempts > 0 ? totalOdWon / totalOdAttempts : 0

  // 7. Build trend (most recent first, up to 20 matches)
  const sortedEntries = [...matchEntries].sort((a, b) => {
    if (!a.date && !b.date) return 0
    if (!a.date) return 1
    if (!b.date) return -1
    return new Date(b.date).getTime() - new Date(a.date).getTime()
  })

  const trendPoints: PerformanceTrendPoint[] = sortedEntries.map(({ matchupId, player, date, won, mapName }) => {
    const kd = player.deaths > 0 ? player.kills / player.deaths : player.kills
    const dpr = player.rounds > 0 ? player.damage / player.rounds : 0
    const odRate = player.opening_attempts > 0 ? player.opening_kills / player.opening_attempts : 0
    const score = compositeScore(dpr, player.kast, odRate, kd, player.hs)
    return { matchup_id: matchupId, date, score: Math.round(score * 10000) / 10000, kd: Math.round(kd * 100) / 100, dpr: Math.round(dpr * 10) / 10, map: mapName, won }
  })

  // 8. Per-map records
  const mapGroups = new Map<string, { wins: number; losses: number; kdSum: number; dprSum: number; kastSum: number; count: number }>()
  for (const { player, won, mapName } of matchEntries) {
    if (!mapName) continue
    if (!mapGroups.has(mapName)) mapGroups.set(mapName, { wins: 0, losses: 0, kdSum: 0, dprSum: 0, kastSum: 0, count: 0 })
    const g = mapGroups.get(mapName)!
    const kd = player.deaths > 0 ? player.kills / player.deaths : player.kills
    const dpr = player.rounds > 0 ? player.damage / player.rounds : 0
    g.kdSum += kd
    g.dprSum += dpr
    g.kastSum += player.kast
    g.count += 1
    if (won === true) g.wins += 1
    if (won === false) g.losses += 1
  }

  const mapRecords: PlayerMapRecord[] = Array.from(mapGroups.entries())
    .map(([map, g]) => ({
      map,
      played: g.count,
      wins: g.wins,
      losses: g.losses,
      win_rate: g.count > 0 ? g.wins / g.count : 0,
      avg_kd: Math.round((g.kdSum / g.count) * 100) / 100,
      avg_dpr: Math.round(g.dprSum / g.count),
      avg_kast: Math.round((g.kastSum / g.count) * 1000) / 1000,
      confidence: g.count >= 5 ? ('medium' as const) : g.count >= 10 ? ('high' as const) : ('low' as const),
    }))
    .sort((a, b) => b.played - a.played)

  // Fix confidence assignment (high needs more matches)
  for (const r of mapRecords) {
    r.confidence = r.played >= 10 ? 'high' : r.played >= 5 ? 'medium' : 'low'
  }

  // 9. Composite score + CI on aggregated data
  const aggScore = compositeScore(aggDpr, aggKast, aggOdRate, aggKd, aggHs)
  const w = blWeight(totalRounds)
  let finalScore = aggScore
  let dataSource: PlayerProfileResponse['data_source'] = 'bl'

  if (leetifyData) {
    const leetifyPrior =
      (leetifyData.aim / 100) * 0.4 +
      (leetifyData.positioning / 100) * 0.3 +
      ((leetifyData.ct_od + leetifyData.t_od) / 2) * 0.3
    finalScore = w * aggScore + (1 - w) * leetifyPrior
    dataSource = 'combined'
  }

  const ciVal = ci90(aggKast, aggOdRate, aggDpr, aggKd, totalRounds, totalOdAttempts)

  // 10. Role inference — build a minimal PlayerAnalysis shape
  const aggPlayerAnalysis = {
    name: displayName,
    paradise_user_id: userId,
    steam64: steam64 ?? undefined,
    score: finalScore,
    ci: ciVal,
    rounds: totalRounds,
    assists: totalAssists,
    kd: aggKd,
    kast: aggKast,
    dpr: aggDpr,
    hs: aggHs,
    od_rate: aggOdRate,
    bl_extended: {
      trade_kills: matchEntries.reduce((s, e) => s + (e.player.bl_extended?.trade_kills ?? 0), 0),
      traded_deaths: totalTradedDeaths,
      firstkills: matchEntries.reduce((s, e) => s + (e.player.bl_extended?.firstkills ?? 0), 0),
      survival_ratio: matchEntries[0]?.player.bl_extended?.survival_ratio,
    },
    leetify: leetifyData,
    data_source: dataSource,
  }

  const roleResult = inferProfileRole(aggPlayerAnalysis, matchEntries.length)

  // 11. Side split from Leetify
  let sideSplit: PlayerProfileResponse['side_split'] = null
  if (leetifyData) {
    const ctOd = leetifyData.ct_od
    const tOd = leetifyData.t_od
    const delta = Math.abs(ctOd - tOd)
    const verdict = delta < 0.05
      ? 'Balansert CT/T-split'
      : ctOd > tOd
        ? `CT-sterk (${(ctOd * 100).toFixed(0)}% vs ${(tOd * 100).toFixed(0)}%)`
        : `T-sterk (${(tOd * 100).toFixed(0)}% vs ${(ctOd * 100).toFixed(0)}%)`
    sideSplit = { ct_od: ctOd, t_od: tOd, verdict }
  }

  // 12. Multi-kills per map
  const mapsPlayed = matchEntries.length
  const multiKills = mapsPlayed > 0
    ? {
        k3: totalK3,
        k4: totalK4,
        k5: totalK5,
        k3_per_map: Math.round((totalK3 / mapsPlayed) * 100) / 100,
        k4_per_map: Math.round((totalK4 / mapsPlayed) * 100) / 100,
        k5_per_map: Math.round((totalK5 / mapsPlayed) * 100) / 100,
      }
    : null

  const last20 = trendPoints.slice(0, 20)
  const last10 = trendPoints.slice(0, 10)
  const last5 = trendPoints.slice(0, 5)

  const profile: PlayerProfileResponse = {
    paradise_user_id: userId,
    name: displayName,
    avatar_url: avatarUrl,
    steam64: steam64 ?? undefined,
    total_rounds: totalRounds,
    total_matches: matchEntries.length,
    kd: Math.round(aggKd * 1000) / 1000,
    kast: Math.round(aggKast * 10000) / 10000,
    dpr: Math.round(aggDpr * 10) / 10,
    hs: Math.round(aggHs * 10000) / 10000,
    od_rate: Math.round(aggOdRate * 10000) / 10000,
    flash_assists_per_round: null,
    utility_dmg_per_round: null,
    clutch_win_pct: totalOneVX > 0 ? Math.round((totalClutchWon / totalOneVX) * 10000) / 10000 : null,
    first_death_rate: totalRounds > 0 ? Math.round((totalTradedDeaths / totalRounds) * 10000) / 10000 : null,
    multi_kills: multiKills,
    side_split: sideSplit,
    score: Math.round(finalScore * 10000) / 10000,
    ci: ciVal,
    role: roleResult.role,
    role_confidence: roleResult.confidence,
    role_signals: roleResult.signals,
    trend: { last5, last10, last20 },
    map_records: mapRecords,
    leetify: leetifyData,
    recent_matches: recentMatches,
    data_source: dataSource,
    fetched_at: new Date().toISOString(),
  }

  profileCache.set(userId, { value: profile, expiresAt: Date.now() + PROFILE_CACHE_TTL_MS })
  return profile
}
