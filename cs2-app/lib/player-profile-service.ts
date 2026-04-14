/**
 * player-profile-service.ts
 * -------------------------
 * Builds a PlayerProfileResponse for a given paradise_user_id by aggregating
 * the player's finished matchup stats, then blending with Leetify.
 */

import {
  getUserSteamId,
  getUserMatchups,
  getMatchupStats,
  getMatchupMeta,
  getUserImageUrl,
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
const COMPETITION_ID = Number.parseInt(process.env.COMPETITION_ID ?? '', 10)
const CURRENT_COMPETITION_ID = Number.isFinite(COMPETITION_ID) ? COMPETITION_ID : null

export async function buildPlayerProfile(
  userId: number,
): Promise<PlayerProfileResponse> {
  const cached = profileCache.get(userId)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const [steam64, avatarUrl] = await Promise.all([
    getUserSteamId(userId, BL_TOKEN),
    getUserImageUrl(userId, BL_TOKEN),
  ])

  const buildEmptyProfile = (name = ''): PlayerProfileResponse => ({
    paradise_user_id: userId,
    name,
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
  })

  let allMatchups = await getUserMatchups(userId, BL_TOKEN, {
    competitionId: CURRENT_COMPETITION_ID ?? undefined,
  })
  if (allMatchups.length === 0 && CURRENT_COMPETITION_ID != null) {
    allMatchups = await getUserMatchups(userId, BL_TOKEN)
  }
  const finishedMatchups = allMatchups.filter(
    (m) => m.finished_at && m.id > 0,
  )

  if (finishedMatchups.length === 0) {
    return buildEmptyProfile()
  }

  const results = await Promise.allSettled(
    finishedMatchups.map(async (m) => {
      try {
        const [stats, meta] = await Promise.all([
          getMatchupStats(m.id, BL_TOKEN),
          getMatchupMeta(m.id, BL_TOKEN),
        ])
        return { matchupId: m.id, stats, meta, finishedAt: m.finished_at }
      } catch {
        return null
      }
    }),
  )

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
    if (r.status !== 'fulfilled' || r.value === null) continue
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

      if (meta.maps.length > 0 && meta.maps[0].name) {
        mapName = normalizeActiveDutyMap(meta.maps[0].name) ?? undefined
      }
    }

    matchEntries.push({ matchupId, player, date, won, mapName, isHome })
  }

  if (matchEntries.length === 0) {
    return buildEmptyProfile(displayName)
  }

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
    totalKills += player.kills ?? 0
    totalDeaths += player.deaths ?? 0
    totalAssists += player.assists ?? 0
    totalDamage += player.damage ?? 0
    totalOdWon += player.opening_kills ?? 0
    totalOdAttempts += player.opening_attempts ?? 0
    weightedKast += (player.kast ?? 0) * (player.rounds ?? 0)
    weightedHs += (player.hs ?? 0) * (player.rounds ?? 0)
    totalRounds += player.rounds ?? 0

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

  const kd = totalDeaths > 0 ? totalKills / totalDeaths : totalKills
  const dpr = totalRounds > 0 ? totalDamage / totalRounds : 0
  const kast = totalRounds > 0 ? weightedKast / totalRounds : 0
  const hs = totalRounds > 0 ? weightedHs / totalRounds : 0
  const odRate = totalOdAttempts > 0 ? totalOdWon / totalOdAttempts : 0
  const flashAssistsPerRound = null
  const utilityDmgPerRound = null
  const clutchWinPct = totalOneVX > 0 ? totalClutchWon / totalOneVX : null
  const firstDeathRate = null

  const mapsPlayed = matchEntries.length
  const multiKills = mapsPlayed > 0
    ? {
        k3: totalK3,
        k4: totalK4,
        k5: totalK5,
        k3_per_map: totalK3 / mapsPlayed,
        k4_per_map: totalK4 / mapsPlayed,
        k5_per_map: totalK5 / mapsPlayed,
      }
    : null

  const score = compositeScore(dpr, kast, odRate, kd, hs)
  const ci = ci90(kast, odRate, dpr, kd, totalRounds, totalOdAttempts)

  const role = inferProfileRole(
    {
      name: displayName,
      paradise_user_id: userId,
      steam64: steam64 ?? undefined,
      avatar_url: avatarUrl,
      score,
      ci,
      rounds: totalRounds,
      assists: totalAssists,
      kd,
      kast,
      dpr,
      hs,
      od_rate: odRate,
      leetify: leetifyData,
      data_source: leetifyData ? 'combined' : 'bl',
    },
    matchEntries.length,
  )

  let sideSplit = null
  if (leetifyData) {
    const ctOd = leetifyData.ct_od
    const tOd = leetifyData.t_od
    const delta = Math.abs(ctOd - tOd)
    const verdict = delta < 0.05
      ? 'Balanced CT/T split'
      : ctOd > tOd
        ? `CT-strong (${(ctOd * 100).toFixed(0)}% vs ${(tOd * 100).toFixed(0)}%)`
        : `T-strong (${(tOd * 100).toFixed(0)}% vs ${(ctOd * 100).toFixed(0)}%)`
    sideSplit = { ct_od: ctOd, t_od: tOd, verdict }
  }

  const trendPoints = matchEntries
    .slice()
    .sort((a, b) => {
      const ad = a.date ? new Date(a.date).getTime() : 0
      const bd = b.date ? new Date(b.date).getTime() : 0
      return bd - ad
    })
    .map<PerformanceTrendPoint>(({ matchupId, date, won, mapName, player }) => ({
      matchup_id: matchupId,
      date,
      won,
      map: mapName,
      score: compositeScore(
        player.rounds > 0 ? player.damage / player.rounds : 0,
        player.kast,
        player.opening_attempts > 0 ? player.opening_kills / player.opening_attempts : 0,
        player.deaths > 0 ? player.kills / player.deaths : player.kills,
        player.hs,
      ),
      kd: player.deaths > 0 ? player.kills / player.deaths : player.kills,
      dpr: player.rounds > 0 ? player.damage / player.rounds : 0,
    }))

  const trend = {
    last5: trendPoints.slice(0, 5),
    last10: trendPoints.slice(0, 10),
    last20: trendPoints.slice(0, 20),
  }

  const mapAgg = new Map<
    string,
    {
      wins: number
      losses: number
      played: number
      totalKd: number
      totalDpr: number
      totalKast: number
    }
  >()
  for (const entry of matchEntries) {
    if (!entry.mapName) continue
    const bucket = mapAgg.get(entry.mapName) ?? {
      wins: 0,
      losses: 0,
      played: 0,
      totalKd: 0,
      totalDpr: 0,
      totalKast: 0,
    }
    bucket.played += 1
    if (entry.won === true) bucket.wins += 1
    if (entry.won === false) bucket.losses += 1
    bucket.totalKd += entry.player.deaths > 0 ? entry.player.kills / entry.player.deaths : entry.player.kills
    bucket.totalDpr += entry.player.rounds > 0 ? entry.player.damage / entry.player.rounds : 0
    bucket.totalKast += entry.player.kast ?? 0
    mapAgg.set(entry.mapName, bucket)
  }

  const mapRecords = Array.from(mapAgg.entries())
    .map<PlayerMapRecord>(([map, agg]) => ({
      map,
      played: agg.played,
      wins: agg.wins,
      losses: agg.losses,
      win_rate: agg.played > 0 ? agg.wins / agg.played : 0,
      avg_kd: agg.played > 0 ? agg.totalKd / agg.played : 0,
      avg_dpr: agg.played > 0 ? agg.totalDpr / agg.played : 0,
      avg_kast: agg.played > 0 ? agg.totalKast / agg.played : 0,
      confidence: agg.played >= 8 ? 'high' : agg.played >= 4 ? 'medium' : 'low',
    }))
    .sort((a, b) => b.played - a.played)

  const profile: PlayerProfileResponse = {
    paradise_user_id: userId,
    name: displayName,
    avatar_url: avatarUrl,
    steam64: steam64 ?? undefined,
    total_rounds: totalRounds,
    total_matches: matchEntries.length,
    kd,
    kast,
    dpr,
    hs,
    od_rate: odRate,
    flash_assists_per_round: flashAssistsPerRound,
    utility_dmg_per_round: utilityDmgPerRound,
    clutch_win_pct: clutchWinPct,
    first_death_rate: firstDeathRate,
    multi_kills: multiKills,
    side_split: sideSplit,
    score,
    ci,
    role: role.role as PlayerRole,
    role_confidence: role.confidence,
    role_signals: role.signals,
    trend,
    map_records: mapRecords,
    leetify: leetifyData,
    recent_matches: recentMatches,
    data_source: leetifyData ? 'combined' : 'bl',
    fetched_at: new Date().toISOString(),
  }

  profileCache.set(userId, { value: profile, expiresAt: Date.now() + PROFILE_CACHE_TTL_MS })
  return profile
}
