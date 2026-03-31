import {
  getMatchupMeta,
  getMatchupStats,
  getTeamPlayers,
  getTeamMatchups,
  getUserSteamId,
} from '@/lib/bl-api'
import { fetchProfiles } from '@/lib/leetify-api'
import {
  blWeight,
  ci90,
  compositeScore,
} from '@/lib/aggregation'
import { STEAM_BY_USER_ID } from '@/lib/players'
import type {
  AnalyzeResponse,
  BLPlayerStats,
  PlayerAnalysis,
} from '@/lib/types'

export class AnalyzeServiceError extends Error {
  status: number

  constructor(message: string, status = 500) {
    super(message)
    this.name = 'AnalyzeServiceError'
    this.status = status
  }
}

type TeamMatchup = Awaited<ReturnType<typeof getTeamMatchups>>[number]

type PlayerAccumulator = {
  name: string
  rawRounds: number
  effectiveRounds: number
  effectiveRounds90: number
  effectiveRounds180: number
  weightedKills: number
  weightedDeaths: number
  weightedDamage: number
  weightedKastRounds: number
  weightedHsRounds: number
  weightedOdWon: number
  weightedOdTotal: number
}

type PlayerCandidate = {
  userId: number
  base?: BLPlayerStats
  name?: string
  steam64?: string
}

const HISTORY_WINDOW_DAYS = 180
const STRONG_WINDOW_DAYS = 90
const STRONG_RECENCY_DAYS = 30
const MEDIUM_RECENCY_DAYS = 90
const STRONG_RECENCY_WEIGHT = 1.0
const MEDIUM_RECENCY_WEIGHT = 0.7
const LONG_RECENCY_WEIGHT = 0.4
const MIN_EFFECTIVE_ROUNDS_90D = 80
const MIN_EFFECTIVE_ROUNDS_180D = 150

function safeDate(value?: string | null): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function daysBetween(older: Date, newer: Date): number {
  return (newer.getTime() - older.getTime()) / (1000 * 60 * 60 * 24)
}

function timeDecayWeight(ageDays: number): number {
  if (ageDays <= STRONG_RECENCY_DAYS) return STRONG_RECENCY_WEIGHT
  if (ageDays <= MEDIUM_RECENCY_DAYS) return MEDIUM_RECENCY_WEIGHT
  if (ageDays <= HISTORY_WINDOW_DAYS) return LONG_RECENCY_WEIGHT
  return 0
}

function addMatchToAccumulator(
  accumulator: Map<number, PlayerAccumulator>,
  players: BLPlayerStats[],
  weight: number,
  include90Window: boolean,
  include180Window: boolean,
) {
  for (const p of players) {
    if (p.paradise_user_id <= 0) continue

    const existing = accumulator.get(p.paradise_user_id) ?? {
      name: p.name,
      rawRounds: 0,
      effectiveRounds: 0,
      effectiveRounds90: 0,
      effectiveRounds180: 0,
      weightedKills: 0,
      weightedDeaths: 0,
      weightedDamage: 0,
      weightedKastRounds: 0,
      weightedHsRounds: 0,
      weightedOdWon: 0,
      weightedOdTotal: 0,
    }

    const rounds = p.rounds
    const effectiveRounds = weight * rounds
    existing.name = p.name || existing.name
    existing.rawRounds += rounds
    existing.effectiveRounds += effectiveRounds
    if (include90Window) existing.effectiveRounds90 += effectiveRounds
    if (include180Window) existing.effectiveRounds180 += effectiveRounds
    existing.weightedKills += weight * p.kills
    existing.weightedDeaths += weight * p.deaths
    existing.weightedDamage += weight * p.damage
    existing.weightedKastRounds += weight * p.kast * rounds
    existing.weightedHsRounds += weight * p.hs * rounds
    existing.weightedOdWon += weight * p.opening_kills
    existing.weightedOdTotal += weight * p.opening_attempts

    accumulator.set(p.paradise_user_id, existing)
  }
}

function requireBlToken(): string {
  const blToken = process.env.BL_TOKEN
  if (!blToken) {
    throw new AnalyzeServiceError('BL_TOKEN must be set in .env.local', 500)
  }
  return blToken
}

export async function analyzeMatchup(matchupId: number): Promise<AnalyzeResponse> {
  if (!Number.isInteger(matchupId) || matchupId <= 0) {
    throw new AnalyzeServiceError('matchup_id must be a positive integer', 400)
  }

  const start = Date.now()
  const blToken = requireBlToken()
  const leetifyToken = process.env.LEETIFY_TOKEN

  let matchupStats
  try {
    matchupStats = await getMatchupStats(matchupId, blToken)
  } catch (err) {
    throw new AnalyzeServiceError(`Failed to fetch matchup ${matchupId}: ${err}`, 502)
  }

  const matchupMeta = await getMatchupMeta(matchupId, blToken)
  const hasMatchPlayers =
    matchupStats.home_players.length + matchupStats.away_players.length > 0

  const relevantTeamIds = new Set<number>([
    matchupMeta?.home.id ?? 0,
    matchupMeta?.away.id ?? 0,
  ].filter((id) => id > 0))

  const referenceTime =
    safeDate(matchupMeta?.startTime) ??
    safeDate(matchupMeta?.finishedAt) ??
    new Date()

  const historicalById = new Map<number, TeamMatchup>()
  if (relevantTeamIds.size > 0) {
    const teamHistories = await Promise.allSettled(
      Array.from(relevantTeamIds).map((teamId) => getTeamMatchups(teamId, blToken)),
    )

    for (const result of teamHistories) {
      if (result.status !== 'fulfilled') continue
      for (const matchup of result.value) {
        if (!matchup.finished_at) continue
        const finishedAt = safeDate(matchup.finished_at)
        if (!finishedAt || finishedAt > referenceTime) continue
        const ageDays = daysBetween(finishedAt, referenceTime)
        if (ageDays > HISTORY_WINDOW_DAYS) continue
        historicalById.set(matchup.id, matchup)
      }
    }
  }

  if (
    hasMatchPlayers &&
    !historicalById.has(matchupId)
  ) {
    historicalById.set(matchupId, {
      id: matchupId,
      round_number: matchupMeta?.roundNumber ?? undefined,
      start_time: matchupMeta?.startTime ?? undefined,
      finished_at: matchupMeta?.finishedAt ?? new Date().toISOString(),
      signups: [],
    })
  }

  const historicalMatchups = Array.from(historicalById.values())

  const historicalStats = await Promise.allSettled(
    historicalMatchups.map(async (m) => ({
      matchup: m,
      stats: m.id === matchupId
        ? matchupStats
        : await getMatchupStats(m.id, blToken),
    })),
  )

  const playerAccumulator = new Map<number, PlayerAccumulator>()
  let roundsFetched = 0
  for (const result of historicalStats) {
    if (result.status !== 'fulfilled') continue
    const { matchup, stats } = result.value
    const finishedAt = safeDate(matchup.finished_at)
    if (!finishedAt) continue
    const ageDays = daysBetween(finishedAt, referenceTime)
    if (ageDays < 0 || ageDays > HISTORY_WINDOW_DAYS) continue

    const weight = timeDecayWeight(ageDays)
    if (weight <= 0) continue
    roundsFetched += stats.total_rounds
    addMatchToAccumulator(
      playerAccumulator,
      [...stats.home_players, ...stats.away_players],
      weight,
      ageDays <= STRONG_WINDOW_DAYS,
      ageDays <= HISTORY_WINDOW_DAYS,
    )
  }

  const homeLineupIds = matchupMeta
    ? Array.from(matchupMeta.playerTeams.entries())
      .filter(([, teamId]) => teamId === matchupMeta.home.id)
      .map(([userId]) => userId)
    : []
  const awayLineupIds = matchupMeta
    ? Array.from(matchupMeta.playerTeams.entries())
      .filter(([, teamId]) => teamId === matchupMeta.away.id)
      .map(([userId]) => userId)
    : []

  const homeTeamRoster =
    !hasMatchPlayers && matchupMeta?.home.id
      ? await getTeamPlayers(matchupMeta.home.id, blToken)
      : []
  const awayTeamRoster =
    !hasMatchPlayers && matchupMeta?.away.id
      ? await getTeamPlayers(matchupMeta.away.id, blToken)
      : []
  const homeRosterByUserId = new Map(homeTeamRoster.map((p) => [p.userId, p]))
  const awayRosterByUserId = new Map(awayTeamRoster.map((p) => [p.userId, p]))

  const homeCandidates: PlayerCandidate[] = hasMatchPlayers
    ? matchupStats.home_players
      .filter((p) => p.paradise_user_id > 0)
      .map((p) => ({ userId: p.paradise_user_id, base: p }))
    : (
      homeLineupIds.length > 0
        ? Array.from(new Set(homeLineupIds))
          .filter((id) => id > 0)
          .map((userId) => {
            const roster = homeRosterByUserId.get(userId)
            return {
              userId,
              name: roster?.userName,
              steam64: roster?.steam64,
            } satisfies PlayerCandidate
          })
        : homeTeamRoster.map((p) => ({
          userId: p.userId,
          name: p.userName,
          steam64: p.steam64,
        }))
    )
  const awayCandidates: PlayerCandidate[] = hasMatchPlayers
    ? matchupStats.away_players
      .filter((p) => p.paradise_user_id > 0)
      .map((p) => ({ userId: p.paradise_user_id, base: p }))
    : (
      awayLineupIds.length > 0
        ? Array.from(new Set(awayLineupIds))
          .filter((id) => id > 0)
          .map((userId) => {
            const roster = awayRosterByUserId.get(userId)
            return {
              userId,
              name: roster?.userName,
              steam64: roster?.steam64,
            } satisfies PlayerCandidate
          })
        : awayTeamRoster.map((p) => ({
          userId: p.userId,
          name: p.userName,
          steam64: p.steam64,
        }))
    )

  const hasRecentBlData = (userId: number): boolean => {
    const history = playerAccumulator.get(userId)
    if (!history) return false
    return (
      history.effectiveRounds90 >= MIN_EFFECTIVE_ROUNDS_90D ||
      history.effectiveRounds180 >= MIN_EFFECTIVE_ROUNDS_180D
    )
  }

  const eligibleHomeCandidates = homeCandidates.filter((c) =>
    c.base ? true : hasRecentBlData(c.userId),
  )
  const eligibleAwayCandidates = awayCandidates.filter((c) =>
    c.base ? true : hasRecentBlData(c.userId),
  )

  const uniquePlayerIds = Array.from(new Set([
    ...eligibleHomeCandidates.map((c) => c.userId),
    ...eligibleAwayCandidates.map((c) => c.userId),
  ]))
  const steamByUserId = new Map<number, string>()

  for (const candidate of [...eligibleHomeCandidates, ...eligibleAwayCandidates]) {
    if (candidate.steam64) steamByUserId.set(candidate.userId, candidate.steam64)
  }

  for (const userId of uniquePlayerIds) {
    const staticSteam = STEAM_BY_USER_ID[userId]
    if (staticSteam && !steamByUserId.has(userId)) steamByUserId.set(userId, staticSteam)
  }

  const missingSteamIds = uniquePlayerIds.filter((id) => !steamByUserId.has(id))
  const steamLookupResults = await Promise.all(
    missingSteamIds.map(async (userId) => ({
      userId,
      steam64: await getUserSteamId(userId, blToken),
    })),
  )

  for (const row of steamLookupResults) {
    if (row.steam64) steamByUserId.set(row.userId, row.steam64)
  }

  const steamIds = Array.from(new Set([...steamByUserId.values()]))
  const leetifyAttempts = leetifyToken ? steamIds.length : 0

  let leetifyProfiles: Awaited<ReturnType<typeof fetchProfiles>>
  if (!leetifyToken || steamIds.length === 0) {
    leetifyProfiles = new Map()
  } else {
    try {
      leetifyProfiles = await fetchProfiles(steamIds, leetifyToken)
    } catch {
      console.warn('Leetify fetch failed entirely, proceeding with BL-only data')
      leetifyProfiles = new Map()
    }
  }

  const analyzeCandidate = (candidate: PlayerCandidate): PlayerAnalysis | null => {
    const historical = playerAccumulator.get(candidate.userId)
    if (!candidate.base && !historical) return null

    const steam64 = steamByUserId.get(candidate.userId)
    const leetify = steam64 ? leetifyProfiles.get(steam64) : undefined

    const effectiveRounds =
      historical?.effectiveRounds ??
      (candidate.base ? candidate.base.rounds : 0)
    const rawRounds = historical?.rawRounds ?? candidate.base?.rounds ?? 0
    if (rawRounds <= 0) return null

    const weightedKills = historical?.weightedKills ?? (candidate.base?.kills ?? 0)
    const weightedDeaths = historical?.weightedDeaths ?? (candidate.base?.deaths ?? 0)
    const weightedDamage = historical?.weightedDamage ?? (candidate.base?.damage ?? 0)
    const weightedKastRounds =
      historical?.weightedKastRounds ??
      ((candidate.base?.kast ?? 0) * effectiveRounds)
    const weightedHsRounds =
      historical?.weightedHsRounds ??
      ((candidate.base?.hs ?? 0) * effectiveRounds)
    const weightedOdWon = historical?.weightedOdWon ?? (candidate.base?.opening_kills ?? 0)
    const weightedOdTotal =
      historical?.weightedOdTotal ??
      (candidate.base?.opening_attempts ?? 0)

    const kd =
      weightedDeaths > 0
        ? weightedKills / weightedDeaths
        : weightedKills
    const dpr =
      effectiveRounds > 0
        ? weightedDamage / effectiveRounds
        : 0
    const kast =
      effectiveRounds > 0
        ? weightedKastRounds / effectiveRounds
        : 0
    const hs =
      effectiveRounds > 0
        ? weightedHsRounds / effectiveRounds
        : 0
    const odRate =
      weightedOdTotal > 0
        ? weightedOdWon / weightedOdTotal
        : 0
    const odCount =
      effectiveRounds > 0
        ? weightedOdTotal / Math.max(effectiveRounds / 20, 1)
        : 0

    const blScore = compositeScore(dpr, kast, odRate, kd, hs)
    const ci = ci90(kast, odRate, dpr, kd, rawRounds, odCount)
    const wBl = blWeight(effectiveRounds)

    let finalScore = blScore
    let leetifyPrior: number | undefined
    let dataSource: PlayerAnalysis['data_source'] = 'bl'

    if (leetify) {
      leetifyPrior =
        (leetify.aim / 100) * 0.4 +
        (leetify.positioning / 100) * 0.3 +
        ((leetify.ct_od + leetify.t_od) / 2) * 0.3
      finalScore = wBl * blScore + (1 - wBl) * leetifyPrior
      dataSource = 'combined'
    }

    return {
      name:
        candidate.base?.name ??
        historical?.name ??
        candidate.name ??
        `User ${candidate.userId}`,
      paradise_user_id: candidate.userId,
      steam64,
      score: Math.round(finalScore * 10000) / 10000,
      leetify_prior: leetifyPrior != null ? Math.round(leetifyPrior * 10000) / 10000 : undefined,
      ci,
      rounds: rawRounds,
      kd: Math.round(kd * 1000) / 1000,
      kast: Math.round(kast * 10000) / 10000,
      dpr: Math.round(dpr * 10) / 10,
      hs: Math.round(hs * 10000) / 10000,
      od_rate: Math.round(odRate * 10000) / 10000,
      leetify,
      data_source: dataSource,
    } satisfies PlayerAnalysis
  }

  const analyzeTeam = (candidates: PlayerCandidate[]): PlayerAnalysis[] =>
    candidates
      .map((candidate) => analyzeCandidate(candidate))
      .filter((p): p is PlayerAnalysis => p != null)

  return {
    matchup_id: matchupId,
    teams: {
      home: {
        id: matchupMeta?.home.id ?? matchupStats.home_team.id,
        name: matchupMeta?.home.name ?? matchupStats.home_team.name,
        players: analyzeTeam(eligibleHomeCandidates),
      },
      away: {
        id: matchupMeta?.away.id ?? matchupStats.away_team.id,
        name: matchupMeta?.away.name ?? matchupStats.away_team.name,
        players: analyzeTeam(eligibleAwayCandidates),
      },
    },
    meta: {
      rounds_fetched: roundsFetched || matchupStats.total_rounds,
      leetify_count: leetifyProfiles.size,
      leetify_attempts: leetifyAttempts,
      data_sources: leetifyProfiles.size > 0 ? ['BL API', 'Leetify'] : ['BL API'],
      match_start_time: matchupMeta?.startTime ?? null,
      match_finished_time: matchupMeta?.finishedAt ?? null,
      fetched_at: new Date().toISOString(),
      duration_ms: Date.now() - start,
    },
  }
}
