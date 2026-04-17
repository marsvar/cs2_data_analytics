import {
  getMatchupMeta,
  getMatchupStats,
  type MatchupMeta,
  getCompetitions,
  getCompetitionSignupTeams,
  getTeamPlayers,
  getTeamMatchups,
  getDivisionMatchups,
} from '@/lib/bl-api'
import { fetchProfiles } from '@/lib/leetify-api'
import {
  blWeight,
  ci90,
  compositeScore,
} from '@/lib/aggregation'
import { deriveLandingAnalytics } from '@/lib/landing-analytics'
import { inferAnalyzeMatchStatus } from '@/lib/match-phase'
import {
  buildTeamMapPoolFromBlSeries,
  getActiveDutyMaps,
  normalizeActiveDutyMap,
} from '@/lib/map-pool'
import {
  buildMapsPlayed,
  buildPostAnalysis,
  buildResultSummary,
} from '@/lib/post-analysis'
import { resolveLineupMembers } from '@/lib/lineup-resolution'
import { STEAM_BY_USER_ID } from '@/lib/players'
import type {
  AnalyzeResponse,
  BLAdvancedStats,
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
  weightedAssists: number
  weightedDamage: number
  weightedKastRounds: number
  weightedHsRounds: number
  weightedOdWon: number
  weightedOdTotal: number
  weightedSurvivalRounds: number
  weightedTradeKills: number
  weightedTradedDeaths: number
  weightedFirstkills: number
  weightedClutchesWon: number
  weightedOneVX: number
  weightedExplosiveRounds: number
  weightedRatingSum: number
  weightedRatingRounds: number
}

type PlayerCandidate = {
  userId: number
  base?: BLPlayerStats
  name?: string
  steam64?: string
  avatarUrl?: string
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
const VETO_MIN_SAMPLE = 8
const VETO_MIN_EDGE = 0.12
const ANALYZE_CACHE_TTL_MS = 5 * 60 * 1000
const MAP_POOL_RECENT_DAYS = 180
const LINEUP_SIZE = 5

type CachedAnalyzeEntry = {
  value: AnalyzeResponse
  expiresAt: number
}

type AnalyzeOptions = {
  includeLeetify?: boolean
}

const analyzeCache = new Map<string, CachedAnalyzeEntry>()
const analyzeInflight = new Map<string, Promise<AnalyzeResponse>>()

function getAnalyzeCacheKey(matchupId: number, options?: AnalyzeOptions): string {
  const includeLeetify = options?.includeLeetify !== false
  return `${matchupId}:${includeLeetify ? 'leetify' : 'bl-only'}`
}

function cachedPlayedMapsMissingImages(result: AnalyzeResponse): boolean {
  if (result.meta.match_status !== 'played') return false
  const maps = result.maps_played?.maps
  if (!maps || maps.length === 0) return false
  const hasMapWithScore = maps.some((map) => map.home_score != null || map.away_score != null)
  if (!hasMapWithScore) return false
  return maps.some((map) => {
    if (!map.image_url) return true
    try {
      const parsed = new URL(map.image_url)
      if (parsed.hostname === 'i.bo3.no') return true
      if (parsed.pathname.startsWith('/b/image/')) return true
    } catch {
      // Keep conservative behavior for malformed URLs.
      return true
    }
    return false
  })
}

function cachedMapPoolMissingWinLoss(result: AnalyzeResponse): boolean {
  if (result.meta.match_status !== 'upcoming') return false
  const mapPool = result.landing?.map_pool
  if (!mapPool) return false

  const maps = [...mapPool.home.maps, ...mapPool.away.maps]
  if (maps.length === 0) return false

  return maps.some((map) => map.wins == null || map.losses == null)
}

function safeDate(value?: string | null): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function daysBetween(older: Date, newer: Date): number {
  return (newer.getTime() - older.getTime()) / (1000 * 60 * 60 * 24)
}

function normalizeTeamName(value?: string | null): string {
  if (!value) return ''
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '')
}

function competitionFallsWithinHistoryWindow(
  competition: Awaited<ReturnType<typeof getCompetitions>>[number],
  referenceTime: Date,
): boolean {
  const windowStart = new Date(referenceTime.getTime() - HISTORY_WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const startsAt = safeDate(competition.starts_at)
  const endsAt = safeDate(competition.ends_at)

  if (startsAt && endsAt) {
    return endsAt >= windowStart && startsAt <= referenceTime
  }
  if (endsAt) return endsAt >= windowStart
  if (startsAt) return startsAt <= referenceTime
  return true
}

function toOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function getMatchupTeamIds(matchup: TeamMatchup): number[] {
  const row = matchup as TeamMatchup & {
    home_signup?: { team?: { id?: unknown } }
    away_signup?: { team?: { id?: unknown } }
    signups?: Array<{ team?: { id?: unknown } }>
  }

  const ids = [
    toOptionalNumber(row.home_signup?.team?.id),
    toOptionalNumber(row.away_signup?.team?.id),
    ...(Array.isArray(row.signups)
      ? row.signups.map((signup: { team?: { id?: unknown } }) =>
        toOptionalNumber(signup.team?.id),
      )
      : []),
  ].filter((id): id is number => id != null && id > 0)

  return Array.from(new Set(ids))
}

function matchupIncludesAnyTeam(
  matchup: TeamMatchup,
  teamIds: ReadonlySet<number>,
): boolean {
  return getMatchupTeamIds(matchup).some((teamId) => teamIds.has(teamId))
}

function extractDirectTeamSeriesMaps(
  matchup: TeamMatchup,
  teamId: number,
): Array<{ map: string; won: boolean }> | null {
  const row = matchup as TeamMatchup & {
    home_score?: unknown
    away_score?: unknown
    team1_score?: unknown
    team2_score?: unknown
    score_home?: unknown
    score_away?: unknown
    home_rounds?: unknown
    away_rounds?: unknown
    map_name?: unknown
    resource_name?: unknown
    name?: unknown
    map?: unknown
    slug?: unknown
    home_signup?: { team?: { id?: unknown } }
    away_signup?: { team?: { id?: unknown } }
    signups?: Array<{ team?: { id?: unknown } }>
  }

  const directMapName = [
    row.resource_name,
    row.map_name,
    row.name,
    row.map,
    row.slug,
  ].find((value) => typeof value === 'string' && value.trim().length > 0)

  const canonicalDirectMap = typeof directMapName === 'string'
    ? normalizeActiveDutyMap(directMapName)
    : null

  const homeTeamId = toOptionalNumber(row.home_signup?.team?.id)
  const awayTeamId = toOptionalNumber(row.away_signup?.team?.id)
  const signupTeamIds = getMatchupTeamIds(matchup)

  const inferredIsHome =
    homeTeamId != null && awayTeamId != null
      ? teamId === homeTeamId
      : signupTeamIds.length >= 2
        ? signupTeamIds[0] === teamId
        : null

  if (canonicalDirectMap && inferredIsHome != null) {
    const teamScore = inferredIsHome
      ? toOptionalNumber(row.home_score ?? row.team1_score ?? row.score_home ?? row.home_rounds)
      : toOptionalNumber(row.away_score ?? row.team2_score ?? row.score_away ?? row.away_rounds)
    const opponentScore = inferredIsHome
      ? toOptionalNumber(row.away_score ?? row.team2_score ?? row.score_away ?? row.away_rounds)
      : toOptionalNumber(row.home_score ?? row.team1_score ?? row.score_home ?? row.home_rounds)

    if (teamScore != null && opponentScore != null) {
      return [{
        map: canonicalDirectMap,
        won: teamScore > opponentScore,
      }]
    }
  }

  return null
}

function extractTeamSeriesMaps(
  matchup: TeamMatchup,
  teamId: number,
  metaByMatchupId: Map<number, MatchupMeta | null>,
): Array<{ map: string; won: boolean }> {
  const direct = extractDirectTeamSeriesMaps(matchup, teamId)
  if (direct) return direct

  const meta = metaByMatchupId.get(matchup.id)
  if (!meta) return []

  const isHome = meta.home.id === teamId
  const isAway = meta.away.id === teamId
  if (!isHome && !isAway) return []

  return meta.maps.flatMap((map) => {
    const canonicalMap = map.name ? normalizeActiveDutyMap(map.name) : null
    if (!canonicalMap) return []

    const teamScore = isHome ? map.home_score : map.away_score
    const opponentScore = isHome ? map.away_score : map.home_score
    if (teamScore == null || opponentScore == null) return []

    return [{
      map: canonicalMap,
      won: teamScore > opponentScore,
    }]
  })
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
      weightedAssists: 0,
      weightedDamage: 0,
      weightedKastRounds: 0,
      weightedHsRounds: 0,
      weightedOdWon: 0,
      weightedOdTotal: 0,
      weightedSurvivalRounds: 0,
      weightedTradeKills: 0,
      weightedTradedDeaths: 0,
      weightedFirstkills: 0,
      weightedClutchesWon: 0,
      weightedOneVX: 0,
      weightedExplosiveRounds: 0,
      weightedRatingSum: 0,
      weightedRatingRounds: 0,
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
    existing.weightedAssists += weight * p.assists
    existing.weightedDamage += weight * p.damage
    existing.weightedKastRounds += weight * p.kast * rounds
    existing.weightedHsRounds += weight * p.hs * rounds
    existing.weightedOdWon += weight * p.opening_kills
    existing.weightedOdTotal += weight * p.opening_attempts
    existing.weightedSurvivalRounds += weight * (p.bl_extended?.survival_ratio ?? 0) * rounds
    existing.weightedTradeKills += weight * (p.bl_extended?.trade_kills ?? 0)
    existing.weightedTradedDeaths += weight * (p.bl_extended?.traded_deaths ?? 0)
    existing.weightedFirstkills += weight * (p.bl_extended?.firstkills ?? 0)
    existing.weightedClutchesWon += weight * (p.bl_extended?.clutches_won ?? 0)
    existing.weightedOneVX += weight * (
      (p.bl_extended?.won_1v1 ?? 0) +
      (p.bl_extended?.won_1v2 ?? 0) +
      (p.bl_extended?.won_1v3 ?? 0) +
      (p.bl_extended?.won_1v4 ?? 0) +
      (p.bl_extended?.won_1v5 ?? 0)
    )
    existing.weightedExplosiveRounds += weight * (
      (p.bl_extended?.multi_kills?.rounds_with_3k ?? 0) +
      (p.bl_extended?.multi_kills?.rounds_with_4k ?? 0) +
      (p.bl_extended?.multi_kills?.rounds_with_5k ?? 0)
    )
    if (p.bl_extended?.rating != null && Number.isFinite(p.bl_extended.rating) && rounds > 0) {
      existing.weightedRatingSum += weight * rounds * p.bl_extended.rating
      existing.weightedRatingRounds += weight * rounds
    }

    accumulator.set(p.paradise_user_id, existing)
  }
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function estimateMapsFromRounds(rounds: number): number {
  if (rounds <= 0) return 0
  return Math.max(rounds / 24, 1)
}

function hasMeaningfulExtendedStats(stats: BLAdvancedStats): boolean {
  return [
    stats.survival_ratio,
    stats.trade_kills,
    stats.traded_deaths,
    stats.firstkills,
    stats.clutches_won,
    stats.won_1v1,
    stats.won_1v2,
    stats.won_1v3,
    stats.won_1v4,
    stats.won_1v5,
    stats.one_v_x_total,
    stats.rating,
    stats.damage_diff,
    stats.explosive_rounds_total,
    stats.multi_kills?.rounds_with_2k,
    stats.multi_kills?.rounds_with_3k,
    stats.multi_kills?.rounds_with_4k,
    stats.multi_kills?.rounds_with_5k,
  ].some((value) => value != null && value !== 0)
}

function buildHistoricalExtended(
  historical: PlayerAccumulator | undefined,
  effectiveRounds: number,
): BLAdvancedStats | undefined {
  if (!historical || effectiveRounds <= 0) return undefined

  const estimatedMaps = estimateMapsFromRounds(effectiveRounds)
  const stats: BLAdvancedStats = {
    survival_ratio: historical.weightedSurvivalRounds > 0 ? round4(historical.weightedSurvivalRounds / effectiveRounds) : undefined,
    trade_kills: historical.weightedTradeKills > 0 ? round1(historical.weightedTradeKills) : undefined,
    traded_deaths: historical.weightedTradedDeaths > 0 ? round1(historical.weightedTradedDeaths) : undefined,
    firstkills: historical.weightedFirstkills > 0 ? round1(historical.weightedFirstkills) : undefined,
    clutches_won: historical.weightedClutchesWon > 0 ? round1(historical.weightedClutchesWon) : undefined,
    one_v_x_total: historical.weightedOneVX > 0 ? round1(historical.weightedOneVX) : undefined,
    explosive_rounds_total: historical.weightedExplosiveRounds > 0 ? round1(historical.weightedExplosiveRounds) : undefined,
    rating: historical.weightedRatingRounds > 0 ? round3(historical.weightedRatingSum / historical.weightedRatingRounds) : undefined,
    multi_kills: historical.weightedExplosiveRounds > 0
      ? { rounds_with_3k: round1(historical.weightedExplosiveRounds) }
      : undefined,
  }

  if (stats.clutches_won != null && estimatedMaps > 0) {
    stats.clutches_won = round3(stats.clutches_won)
  }

  return hasMeaningfulExtendedStats(stats) ? stats : undefined
}

function requireBlToken(): string {
  const blToken = process.env.BL_TOKEN
  if (!blToken) {
    throw new AnalyzeServiceError('BL_TOKEN must be set in .env.local', 500)
  }
  return blToken
}

type VetoHint = NonNullable<NonNullable<AnalyzeResponse['landing']>['map_pool']>['veto_hint']

function deriveVetoHint(
  homeMaps: NonNullable<NonNullable<AnalyzeResponse['landing']>['map_pool']>['home']['maps'],
  awayMaps: NonNullable<NonNullable<AnalyzeResponse['landing']>['map_pool']>['away']['maps'],
): VetoHint | undefined {
  const homeByMap = new Map(homeMaps.map((map) => [map.map, map]))
  const awayByMap = new Map(awayMaps.map((map) => [map.map, map]))

  const activeMaps = getActiveDutyMaps()
  if (activeMaps.length === 0) return undefined

  const edgeForTeam = (
    team: { win_rate: number; sample_size: number } | undefined,
    opp: { win_rate: number; sample_size: number } | undefined,
  ): number => {
    if (team && opp) return team.win_rate - opp.win_rate

    if (team && !opp) {
      const sampleFactor = Math.min(team.sample_size / VETO_MIN_SAMPLE, 1)
      return (team.win_rate - 0.5) * 0.6 * sampleFactor
    }

    if (!team && opp) {
      const sampleFactor = Math.min(opp.sample_size / VETO_MIN_SAMPLE, 1)
      return (0.5 - opp.win_rate) * 0.6 * sampleFactor
    }

    return 0
  }

  const mapStates = activeMaps.map((map) => {
    const home = homeByMap.get(map)
    const away = awayByMap.get(map)
    const homeSample = home?.sample_size ?? 0
    const awaySample = away?.sample_size ?? 0
    return {
      map,
      home,
      away,
      homeEdge: edgeForTeam(home, away),
      awayEdge: edgeForTeam(away, home),
      homeSample,
      awaySample,
      combinedSample: homeSample + awaySample,
    }
  })

  const hasUsableSignal = mapStates.some((state) =>
    state.homeSample >= VETO_MIN_SAMPLE || state.awaySample >= VETO_MIN_SAMPLE,
  )
  if (!hasUsableSignal) return undefined

  const byMap = new Map(mapStates.map((state) => [state.map, state]))
  const remaining = new Set<string>(activeMaps)

  const choosePick = (team: 'home' | 'away'): string | undefined => {
    const candidates = Array.from(remaining)
      .map((map) => byMap.get(map))
      .filter((entry): entry is NonNullable<typeof entry> => entry != null)
      .sort((a, b) => {
        const aEdge = team === 'home' ? a.homeEdge : a.awayEdge
        const bEdge = team === 'home' ? b.homeEdge : b.awayEdge
        if (bEdge !== aEdge) return bEdge - aEdge
        const aOwnSample = team === 'home' ? a.homeSample : a.awaySample
        const bOwnSample = team === 'home' ? b.homeSample : b.awaySample
        if (bOwnSample !== aOwnSample) return bOwnSample - aOwnSample
        if (b.combinedSample !== a.combinedSample) return b.combinedSample - a.combinedSample
        return a.map.localeCompare(b.map)
      })

    return candidates[0]?.map
  }

  const chooseBan = (team: 'home' | 'away'): string | undefined => {
    const candidates = Array.from(remaining)
      .map((map) => byMap.get(map))
      .filter((entry): entry is NonNullable<typeof entry> => entry != null)
      .sort((a, b) => {
        const aEdge = team === 'home' ? a.homeEdge : a.awayEdge
        const bEdge = team === 'home' ? b.homeEdge : b.awayEdge
        if (aEdge !== bEdge) return aEdge - bEdge
        const aOppSample = team === 'home' ? a.awaySample : a.homeSample
        const bOppSample = team === 'home' ? b.awaySample : b.homeSample
        if (bOppSample !== aOppSample) return bOppSample - aOppSample
        if (b.combinedSample !== a.combinedSample) return b.combinedSample - a.combinedSample
        return a.map.localeCompare(b.map)
      })

    return candidates[0]?.map
  }

  const take = (map: string | undefined): string | undefined => {
    if (!map || !remaining.has(map)) return undefined
    remaining.delete(map)
    return map
  }

  const result: VetoHint = {}
  result.suggested_ban1_for_home = take(chooseBan('home'))
  result.suggested_ban1_for_away = take(chooseBan('away'))
  result.suggested_pick_for_home = take(choosePick('home'))
  result.suggested_pick_for_away = take(choosePick('away'))
  result.suggested_ban2_for_home = take(chooseBan('home'))
  result.suggested_ban2_for_away = take(chooseBan('away'))
  result.decider_map = Array.from(remaining)[0]

  // Backward-compatible fields for existing UI/readers.
  result.avoid_for_home = result.suggested_ban1_for_home
  result.avoid_for_away = result.suggested_ban1_for_away

  return Object.values(result).some(Boolean) ? result : undefined
}

export async function analyzeMatchup(
  matchupId: number,
  options?: AnalyzeOptions,
): Promise<AnalyzeResponse> {
  if (!Number.isInteger(matchupId) || matchupId <= 0) {
    throw new AnalyzeServiceError('matchup_id must be a positive integer', 400)
  }

  const includeLeetify = options?.includeLeetify !== false
  const cacheKey = getAnalyzeCacheKey(matchupId, options)
  const now = Date.now()
  const cached = analyzeCache.get(cacheKey)
  if (
    cached &&
    cached.expiresAt > now &&
    !cachedPlayedMapsMissingImages(cached.value) &&
    !cachedMapPoolMissingWinLoss(cached.value)
  ) {
    return cached.value
  }

  const inflight = analyzeInflight.get(cacheKey)
  if (inflight) return inflight

  const task = (async (): Promise<AnalyzeResponse> => {
    const start = Date.now()
    const blToken = requireBlToken()

    let matchupStats: Awaited<ReturnType<typeof getMatchupStats>>
    let matchupMeta: Awaited<ReturnType<typeof getMatchupMeta>>
    try {
      const [fetchedMatchupStats, fetchedMatchupMeta] = await Promise.all([
        getMatchupStats(matchupId, blToken),
        getMatchupMeta(matchupId, blToken),
      ])
      matchupStats = fetchedMatchupStats
      matchupMeta = fetchedMatchupMeta
    } catch (err) {
      throw new AnalyzeServiceError(`Failed to fetch matchup ${matchupId}: ${err}`, 502)
    }

    // Reconcile stats home/away with meta home/away.
    // getMatchupStats assigns sides by "first side seen in flat array", which may be
    // the away team if the API returns them first. Cross-check using playerTeams from
    // meta (derived from matchup_users, which has explicit team_id per player).
    if (
      matchupMeta &&
      matchupStats.home_players.length > 0 &&
      matchupStats.away_players.length > 0
    ) {
      const homeMetaId = matchupMeta.home.id
      const awayMetaId = matchupMeta.away.id
      if (homeMetaId && awayMetaId) {
        // Count how many "home" stats players actually belong to the away meta team
        let homeMisassigned = 0
        for (const p of matchupStats.home_players) {
          const teamId = matchupMeta.playerTeams.get(p.paradise_user_id)
          if (teamId === awayMetaId) homeMisassigned++
        }
        // If the majority of home_players are on the away team, flip the sides
        if (homeMisassigned > matchupStats.home_players.length / 2) {
          const tmp = matchupStats.home_players
          matchupStats.home_players = matchupStats.away_players
          matchupStats.away_players = tmp
        }
      }
    }

    const hasMatchPlayers =
      matchupStats.home_players.length + matchupStats.away_players.length > 0
    // BL /stats can sometimes expose non-finalized player rows before a match is
    // actually completed, so we only trust finished_at for played/upcoming state.
    const matchStatus: AnalyzeResponse['meta']['match_status'] =
      inferAnalyzeMatchStatus(matchupMeta?.finishedAt)
    const leetifyToken =
      includeLeetify && matchStatus === 'upcoming'
        ? process.env.LEETIFY_TOKEN
        : undefined

    const relevantTeamIds = new Set<number>([
      matchupMeta?.home.id ?? 0,
      matchupMeta?.away.id ?? 0,
    ].filter((id) => id > 0))
    const historicalTeamIds = new Set<number>(relevantTeamIds)
    const currentTeams = [
      { id: matchupMeta?.home.id ?? 0, name: matchupMeta?.home.name ?? '' },
      { id: matchupMeta?.away.id ?? 0, name: matchupMeta?.away.name ?? '' },
    ].filter((team): team is { id: number; name: string } => team.id > 0 && team.name.trim().length > 0)

    const referenceTime =
      safeDate(matchupMeta?.startTime) ??
      safeDate(matchupMeta?.finishedAt) ??
      new Date()
    let divisionMatchupsPromise: Promise<Awaited<ReturnType<typeof getDivisionMatchups>>> | null = null

    const getDivisionMatchupRows = async () => {
      if (!matchupMeta?.divisionId) return null
      if (!divisionMatchupsPromise) {
        divisionMatchupsPromise = getDivisionMatchups(matchupMeta.divisionId, blToken)
      }
      return divisionMatchupsPromise
    }

    if (currentTeams.length > 0) {
      try {
        const competitions = await getCompetitions(blToken)
        const relevantCompetitions = competitions
          .filter((competition) => competitionFallsWithinHistoryWindow(competition, referenceTime))
          .sort((a, b) => b.id - a.id)
          .slice(0, 12)

        const normalizedCurrentTeams = new Map(
          currentTeams.map((team) => [normalizeTeamName(team.name), team.id]),
        )

        const signupResults = await Promise.allSettled(
          relevantCompetitions.map((competition) => getCompetitionSignupTeams(competition.id, blToken)),
        )

        for (const result of signupResults) {
          if (result.status !== 'fulfilled') continue
          for (const signupTeam of result.value) {
            const matchedCurrentTeamId = normalizedCurrentTeams.get(normalizeTeamName(signupTeam.team_name))
            if (!matchedCurrentTeamId) continue
            historicalTeamIds.add(signupTeam.team_id)
          }
        }
      } catch {
        // Non-fatal: we still fall back to the current matchup team ids.
      }
    }

    const historicalById = new Map<number, TeamMatchup>()
    if (historicalTeamIds.size > 0) {
      const relevantTeamIdList = Array.from(historicalTeamIds)
      const teamHistories = await Promise.allSettled(
        relevantTeamIdList.map((teamId) => getTeamMatchups(teamId, blToken)),
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

    // The team history endpoint is capped and can omit the current season for old
    // legacy teams. Merge finished matchups from the active division so upcoming
    // lineup resolution always sees the players who have actually played this season.
    if (matchupMeta?.divisionId && relevantTeamIds.size > 0) {
      try {
        const divisionMatchups = await getDivisionMatchupRows()
        if (!divisionMatchups) throw new Error('Missing division matchups')
        for (const matchup of divisionMatchups) {
          if (!matchup.finished_at) continue
          if (!matchupIncludesAnyTeam(matchup, relevantTeamIds)) continue

          const finishedAt = safeDate(matchup.finished_at)
          if (!finishedAt || finishedAt > referenceTime) continue
          const ageDays = daysBetween(finishedAt, referenceTime)
          if (ageDays > HISTORY_WINDOW_DAYS) continue

          historicalById.set(matchup.id, matchup)
        }
      } catch {
        // Non-fatal: the team history fallback above still provides older baseline data.
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
    const baselineAccumulator = new Map<number, PlayerAccumulator>()
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
      if (!(matchStatus === 'played' && matchup.id === matchupId)) {
        addMatchToAccumulator(
          baselineAccumulator,
          [...stats.home_players, ...stats.away_players],
          weight,
          ageDays <= STRONG_WINDOW_DAYS,
          ageDays <= HISTORY_WINDOW_DAYS,
        )
      }
    }

    // Always fetch team rosters: for upcoming matches they drive lineup candidates;
    // for played matches they supply steam64 IDs (2 calls vs one-per-player).
    const [homeTeamRoster, awayTeamRoster] = await Promise.all([
      matchupMeta?.home.id ? getTeamPlayers(matchupMeta.home.id, blToken) : Promise.resolve([]),
      matchupMeta?.away.id ? getTeamPlayers(matchupMeta.away.id, blToken) : Promise.resolve([]),
    ])
    const homeRosterByUserId = new Map(homeTeamRoster.map((p) => [p.userId, p]))
    const awayRosterByUserId = new Map(awayTeamRoster.map((p) => [p.userId, p]))

  const homeLineupIds = matchupMeta?.home.id
    ? Array.from(matchupMeta.playerTeams.entries())
      .filter(([, tid]) => tid === matchupMeta.home.id)
      .map(([userId]) => userId)
    : []
  const awayLineupIds = matchupMeta?.away.id
    ? Array.from(matchupMeta.playerTeams.entries())
      .filter(([, tid]) => tid === matchupMeta.away.id)
      .map(([userId]) => userId)
    : []

  // Helper: resolve avatarUrl for a userId — prefers matchup_users data,
  // then falls back to roster-provided avatars.
  const getAvatarUrl = (userId: number): string | undefined =>
    matchupMeta?.playerImages.get(userId) ??
    homeRosterByUserId.get(userId)?.avatarUrl ??
    awayRosterByUserId.get(userId)?.avatarUrl

  const buildLineupCandidates = (
    lineupIds: number[],
    rosterByUserId: Map<number, { userId: number; userName: string; steam64?: string; avatarUrl?: string }>,
    teamRoster: Array<{ userId: number; userName: string; steam64?: string; avatarUrl?: string }>,
  ): PlayerCandidate[] => {
    return resolveLineupMembers({
      lineupIds,
      rosterByUserId,
      teamRoster,
    }).map((player) => ({
      userId: player.userId,
      name: player.userName,
      steam64: player.steam64,
      avatarUrl: getAvatarUrl(player.userId),
    }))
  }

  const homeCandidates: PlayerCandidate[] = hasMatchPlayers
    ? matchupStats.home_players
      .filter((p) => p.paradise_user_id > 0)
      .map((p) => ({
        userId: p.paradise_user_id,
        base: p,
        avatarUrl: getAvatarUrl(p.paradise_user_id),
      }))
    : buildLineupCandidates(homeLineupIds, homeRosterByUserId, homeTeamRoster)

  const awayCandidates: PlayerCandidate[] = hasMatchPlayers
    ? matchupStats.away_players
      .filter((p) => p.paradise_user_id > 0)
      .map((p) => ({
        userId: p.paradise_user_id,
        base: p,
        avatarUrl: getAvatarUrl(p.paradise_user_id),
      }))
    : buildLineupCandidates(awayLineupIds, awayRosterByUserId, awayTeamRoster)

  const hasRecentBlData = (userId: number): boolean => {
    const history = playerAccumulator.get(userId)
    if (!history) return false
    return (
      history.effectiveRounds90 >= MIN_EFFECTIVE_ROUNDS_90D ||
      history.effectiveRounds180 >= MIN_EFFECTIVE_ROUNDS_180D
    )
  }

  const hasAnyBlData = (userId: number): boolean => {
    const history = playerAccumulator.get(userId)
    return (history?.rawRounds ?? 0) > 0
  }

  // Return all candidates with any BL data. If any have recent data, that's a
  // signal the lineup is real, but we include all with ANY data so newer team
  // members (fewer rounds) are not silently dropped. For amateur leagues, the
  // relevant pool can be larger than five players, so we rank candidates by
  // evidence strength but leave the full pool available for the lineup simulator.
  const selectEligibleCandidates = (candidates: PlayerCandidate[]): PlayerCandidate[] => {
    const withData = candidates.filter((c) =>
      c.base ? true : hasAnyBlData(c.userId),
    )
    const selected = withData.length > 0 ? withData : candidates
    if (matchStatus !== 'upcoming' || selected.length <= 1) {
      return selected
    }

    return selected
      .map((candidate, index) => {
        const history = playerAccumulator.get(candidate.userId)
        return {
          candidate,
          index,
          hasRecent: hasRecentBlData(candidate.userId),
          hasAny: hasAnyBlData(candidate.userId),
          rounds90: history?.effectiveRounds90 ?? 0,
          rounds180: history?.effectiveRounds180 ?? 0,
          rawRounds: history?.rawRounds ?? 0,
        }
      })
      .sort((a, b) => {
        if (a.hasRecent !== b.hasRecent) return Number(b.hasRecent) - Number(a.hasRecent)
        if (a.hasAny !== b.hasAny) return Number(b.hasAny) - Number(a.hasAny)
        if (b.rounds90 !== a.rounds90) return b.rounds90 - a.rounds90
        if (b.rounds180 !== a.rounds180) return b.rounds180 - a.rounds180
        if (b.rawRounds !== a.rawRounds) return b.rawRounds - a.rawRounds
        return a.index - b.index
      })
      .map((entry) => entry.candidate)
  }

  const eligibleHomeCandidates = selectEligibleCandidates(homeCandidates)
  const eligibleAwayCandidates = selectEligibleCandidates(awayCandidates)

  if (matchupId === 16138 || matchupId === 16158) {
    console.log('[lineup-debug]', {
      matchupId,
      matchStatus,
      homeTeamId: matchupMeta?.home.id,
      awayTeamId: matchupMeta?.away.id,
      historicalMatchupIds: historicalMatchups.map((m) => m.id),
      homeLineupIds,
      awayLineupIds,
      homeCandidates: homeCandidates.map((c) => ({
        userId: c.userId,
        name: c.base?.name ?? c.name,
        hasHistorical: hasAnyBlData(c.userId),
      })),
      awayCandidates: awayCandidates.map((c) => ({
        userId: c.userId,
        name: c.base?.name ?? c.name,
        hasHistorical: hasAnyBlData(c.userId),
      })),
      eligibleHomeIds: eligibleHomeCandidates.map((c) => c.userId),
      eligibleAwayIds: eligibleAwayCandidates.map((c) => c.userId),
    })
  }

    const allEligibleCandidates = [
      ...eligibleHomeCandidates,
      ...eligibleAwayCandidates,
    ]
    const analyzableCandidates = allEligibleCandidates.filter((candidate) =>
      candidate.base || (playerAccumulator.get(candidate.userId)?.rawRounds ?? 0) > 0,
    )
    const analysisPlayerIds = Array.from(new Set(
      analyzableCandidates.map((candidate) => candidate.userId),
    ))
    const steamByUserId = new Map<number, string>()

  // Source 1: steam64 already on the candidate (lineup path for upcoming matches)
  for (const candidate of allEligibleCandidates) {
    if (candidate.steam64) steamByUserId.set(candidate.userId, candidate.steam64)
  }

  // Source 2: static hardcoded map
  for (const userId of analysisPlayerIds) {
    const staticSteam = STEAM_BY_USER_ID[userId]
    if (staticSteam && !steamByUserId.has(userId)) steamByUserId.set(userId, staticSteam)
  }

  // Source 3: matchup_users embed (accounts may be included in the BL response)
  if (matchupMeta) {
    for (const [userId, steam64] of matchupMeta.playerSteam64) {
      if (!steamByUserId.has(userId)) steamByUserId.set(userId, steam64)
    }
  }

  // Source 4: team roster — 2 API calls instead of one per player
  for (const p of [...homeTeamRoster, ...awayTeamRoster]) {
    if (p.steam64 && !steamByUserId.has(p.userId)) steamByUserId.set(p.userId, p.steam64)
  }

  const analysisSteamIds = Array.from(new Set(
    analysisPlayerIds
      .map((userId) => steamByUserId.get(userId))
      .filter((steam64): steam64 is string => Boolean(steam64)),
  ))
  const steamIds = analysisSteamIds
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
    const baselineHistorical = baselineAccumulator.get(candidate.userId)
    if (matchStatus === 'played' && !candidate.base) return null
    if (!candidate.base && !historical) return null

    const steam64 = steamByUserId.get(candidate.userId)
    const leetifyProfile = steam64 ? leetifyProfiles.get(steam64) : undefined
    const leetify = leetifyProfile?.summary
    const recentMatches = leetifyProfile?.recent_matches

    const useHistorical = matchStatus === 'upcoming'
    const effectiveRounds =
      useHistorical
        ? (
          historical?.effectiveRounds ??
          (candidate.base ? candidate.base.rounds : 0)
        )
        : (
          candidate.base?.rounds ??
          historical?.effectiveRounds ??
          0
        )
    const rawRounds =
      useHistorical
        ? (historical?.rawRounds ?? candidate.base?.rounds ?? 0)
        : (candidate.base?.rounds ?? historical?.rawRounds ?? 0)
    if (rawRounds <= 0) return null

    const weightedKills =
      useHistorical
        ? (historical?.weightedKills ?? (candidate.base?.kills ?? 0))
        : (candidate.base?.kills ?? historical?.weightedKills ?? 0)
    const weightedDeaths =
      useHistorical
        ? (historical?.weightedDeaths ?? (candidate.base?.deaths ?? 0))
        : (candidate.base?.deaths ?? historical?.weightedDeaths ?? 0)
    const weightedAssists =
      useHistorical
        ? (historical?.weightedAssists ?? (candidate.base?.assists ?? 0))
        : (candidate.base?.assists ?? historical?.weightedAssists ?? 0)
    const weightedDamage =
      useHistorical
        ? (historical?.weightedDamage ?? (candidate.base?.damage ?? 0))
        : (candidate.base?.damage ?? historical?.weightedDamage ?? 0)
    const weightedKastRounds =
      useHistorical
        ? (
          historical?.weightedKastRounds ??
          ((candidate.base?.kast ?? 0) * effectiveRounds)
        )
        : ((candidate.base?.kast ?? 0) * effectiveRounds)
    const weightedHsRounds =
      useHistorical
        ? (
          historical?.weightedHsRounds ??
          ((candidate.base?.hs ?? 0) * effectiveRounds)
        )
        : ((candidate.base?.hs ?? 0) * effectiveRounds)
    const weightedOdWon =
      useHistorical
        ? (historical?.weightedOdWon ?? (candidate.base?.opening_kills ?? 0))
        : (candidate.base?.opening_kills ?? historical?.weightedOdWon ?? 0)
    const weightedOdTotal =
      useHistorical
        ? (
          historical?.weightedOdTotal ??
          (candidate.base?.opening_attempts ?? 0)
        )
        : (candidate.base?.opening_attempts ?? historical?.weightedOdTotal ?? 0)

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
    const historicalExtended = buildHistoricalExtended(historical, effectiveRounds)
    const baselineExtended = buildHistoricalExtended(
      baselineHistorical,
      baselineHistorical?.effectiveRounds ?? 0,
    )
    const baseExtended = candidate.base?.bl_extended
    const mergedExtended = useHistorical
      ? (historicalExtended ?? baseExtended)
      : (baseExtended ?? historicalExtended)
    const resolvedExtended: BLAdvancedStats | undefined = mergedExtended
      ? {
        ...historicalExtended,
        ...baseExtended,
        ...mergedExtended,
      }
      : undefined

    const blScore = compositeScore(dpr, kast, odRate, kd, hs)
    const ci = ci90(kast, odRate, dpr, kd, rawRounds, odCount)
    const wBl = blWeight(effectiveRounds)

    let finalScore = blScore
    let leetifyPrior: number | undefined
    let dataSource: PlayerAnalysis['data_source'] = 'bl'

    if (leetify && matchStatus === 'upcoming') {
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
      avatar_url: candidate.avatarUrl,
      score: Math.round(finalScore * 10000) / 10000,
      leetify_prior: leetifyPrior != null ? Math.round(leetifyPrior * 10000) / 10000 : undefined,
      bl_weight: Math.round(wBl * 10000) / 10000,
      effective_rounds: Math.round(effectiveRounds * 10) / 10,
      bl_rating: candidate.base?.bl_extended?.rating ?? resolvedExtended?.rating,
      bl_rating_baseline: baselineExtended?.rating,
      ci,
      rounds: rawRounds,
      assists: Math.round(weightedAssists * 10) / 10,
      kd: Math.round(kd * 1000) / 1000,
      kast: Math.round(kast * 10000) / 10000,
      dpr: Math.round(dpr * 10) / 10,
      hs: Math.round(hs * 10000) / 10000,
      od_rate: Math.round(odRate * 10000) / 10000,
      bl_extended: resolvedExtended && hasMeaningfulExtendedStats(resolvedExtended)
        ? resolvedExtended
        : undefined,
      leetify,
      recent_matches: recentMatches,
      data_source: dataSource,
    } satisfies PlayerAnalysis
  }

  const analyzeTeam = (candidates: PlayerCandidate[]): PlayerAnalysis[] =>
    candidates
      .map((candidate) => analyzeCandidate(candidate))
      .filter((p): p is PlayerAnalysis => p != null)

  const buildSimulationFallback = (candidate: PlayerCandidate): PlayerAnalysis => ({
    name:
      candidate.base?.name ??
      candidate.name ??
      `User ${candidate.userId}`,
    paradise_user_id: candidate.userId,
    steam64: steamByUserId.get(candidate.userId),
    avatar_url: candidate.avatarUrl,
    score: 0,
    bl_weight: 0,
    effective_rounds: 0,
    ci: 1,
    rounds: 0,
    assists: 0,
    kd: 0,
    kast: 0,
    dpr: 0,
    hs: 0,
    od_rate: 0,
    data_source: 'bl',
  })

  const buildSimulationPool = (candidates: PlayerCandidate[]): PlayerAnalysis[] =>
    candidates.map((candidate) => analyzeCandidate(candidate) ?? buildSimulationFallback(candidate))

  const simulationHomePool = matchStatus === 'upcoming'
    ? buildSimulationPool(eligibleHomeCandidates)
    : undefined
  const simulationAwayPool = matchStatus === 'upcoming'
    ? buildSimulationPool(eligibleAwayCandidates)
    : undefined

  const teams = {
    home: {
      id: matchupMeta?.home.id ?? matchupStats.home_team.id,
      name: matchupMeta?.home.name ?? matchupStats.home_team.name,
      logo_url: matchupMeta?.home.logoUrl,
      players: analyzeTeam(eligibleHomeCandidates),
    },
    away: {
      id: matchupMeta?.away.id ?? matchupStats.away_team.id,
      name: matchupMeta?.away.name ?? matchupStats.away_team.name,
      logo_url: matchupMeta?.away.logoUrl,
      players: analyzeTeam(eligibleAwayCandidates),
    },
  }

  const currentTeamIds = [teams.home.id, teams.away.id].filter((teamId): teamId is number => teamId > 0)
  const historicalMapMetaResults = matchStatus === 'upcoming'
    ? await Promise.allSettled(
      historicalMatchups
        .filter((matchup) => {
          const matchupTeamIds = getMatchupTeamIds(matchup)
          if (matchupTeamIds.length === 0) return true

          const relevantCurrentTeamIds = currentTeamIds.filter((teamId) =>
            matchupTeamIds.includes(teamId),
          )
          if (relevantCurrentTeamIds.length === 0) return false

          return relevantCurrentTeamIds.some((teamId) =>
            extractDirectTeamSeriesMaps(matchup, teamId) == null,
          )
        })
        .map(async (matchup) => ({
        matchupId: matchup.id,
        meta: await getMatchupMeta(matchup.id, blToken),
      })),
    )
    : []

  const metaByHistoricalMatchupId = new Map<number, MatchupMeta | null>(
    historicalMapMetaResults
      .filter((result): result is PromiseFulfilledResult<{ matchupId: number; meta: MatchupMeta | null }> => result.status === 'fulfilled')
      .map((result) => [result.value.matchupId, result.value.meta]),
  )

  const buildTeamBlSeries = (teamId: number) => {
    const series: Array<{ maps: Array<{ map: string; won: boolean }> }> = []

    for (const matchup of historicalMatchups) {
      if (!matchup.finished_at) continue
      const finishedAt = safeDate(matchup.finished_at)
      if (!finishedAt) continue
      const ageDays = daysBetween(finishedAt, referenceTime)
      if (ageDays < 0 || ageDays > MAP_POOL_RECENT_DAYS) continue

      const maps = extractTeamSeriesMaps(matchup, teamId, metaByHistoricalMatchupId)
      if (maps.length === 0) continue
      series.push({ maps })
    }

    return series
  }

  const homeMapPool = matchStatus === 'upcoming'
    ? buildTeamMapPoolFromBlSeries(buildTeamBlSeries(teams.home.id))
    : { maps: [], included_players: 0, excluded_players: 0 }
  const awayMapPool = matchStatus === 'upcoming'
    ? buildTeamMapPoolFromBlSeries(buildTeamBlSeries(teams.away.id))
    : { maps: [], included_players: 0, excluded_players: 0 }

  const leetifyCount = steamIds.reduce(
    (sum, steam64) => sum + (leetifyProfiles.has(steam64) ? 1 : 0),
    0,
  )
  const hasMapPoolData =
    matchStatus === 'upcoming' &&
    (homeMapPool.maps.length > 0 || awayMapPool.maps.length > 0)
  const vetoHint = hasMapPoolData
    ? deriveVetoHint(homeMapPool.maps, awayMapPool.maps)
    : undefined

    const landing = matchStatus === 'upcoming'
      ? deriveLandingAnalytics(teams, {
        mapPool: hasMapPoolData
          ? {
            recent_days: MAP_POOL_RECENT_DAYS,
            min_matches_per_player: 0,
            home: homeMapPool,
            away: awayMapPool,
            veto_hint: vetoHint,
          }
          : undefined,
      })
      : undefined

    const resultSummary = matchStatus === 'played'
      ? buildResultSummary({
        homeScore: matchupMeta?.homeScore ?? null,
        awayScore: matchupMeta?.awayScore ?? null,
        winner: matchupMeta?.winner,
        finishedAt: matchupMeta?.finishedAt ?? null,
      })
      : undefined

    const mapsPlayed = matchStatus === 'played'
      ? buildMapsPlayed({
        mapsFromApi: matchupMeta?.maps ?? [],
        apiCompleteness: matchupMeta?.mapDataCompleteness ?? 'missing',
        apiNote: matchupMeta?.mapDataNote,
        playerStats: [...matchupStats.home_players, ...matchupStats.away_players],
        bestOf: matchupMeta?.bestOf ?? null,
        homeSeriesScore: matchupMeta?.homeScore ?? null,
        awaySeriesScore: matchupMeta?.awayScore ?? null,
      })
      : undefined

    const postAnalysis = matchStatus === 'played'
      ? buildPostAnalysis(teams)
      : undefined

    return {
      matchup_id: matchupId,
      teams,
      result_summary: resultSummary,
      maps_played: mapsPlayed,
      post_analysis: postAnalysis,
      landing,
      simulation: matchStatus === 'upcoming'
        ? {
          lineup_size: LINEUP_SIZE,
          active_maps: getActiveDutyMaps(),
          home_pool: simulationHomePool ?? [],
          away_pool: simulationAwayPool ?? [],
          map_pool: {
            recent_days: MAP_POOL_RECENT_DAYS,
            min_matches_per_player: 0,
            home_player_maps: [],
            away_player_maps: [],
          },
        }
        : undefined,
      meta: {
        match_status: matchStatus,
        rounds_fetched: roundsFetched || matchupStats.total_rounds,
        leetify_count: leetifyCount,
        leetify_attempts: leetifyAttempts,
        data_sources: leetifyCount > 0 ? ['BL API', 'Leetify'] : ['BL API'],
        match_start_time: matchupMeta?.startTime ?? null,
        match_finished_time: matchupMeta?.finishedAt ?? null,
        fetched_at: new Date().toISOString(),
        duration_ms: Date.now() - start,
      },
    }
  })()

  analyzeInflight.set(cacheKey, task)
  try {
    const result = await task
    analyzeCache.set(cacheKey, {
      value: result,
      expiresAt: Date.now() + ANALYZE_CACHE_TTL_MS,
    })
    return result
  } finally {
    analyzeInflight.delete(cacheKey)
  }
}
