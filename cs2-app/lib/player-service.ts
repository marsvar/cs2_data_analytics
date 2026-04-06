import { analyzeMatchup, AnalyzeServiceError } from '@/lib/analyze-service'
import { getUserMatchups } from '@/lib/bl-api'
import { buildPlayerProfile } from '@/lib/player-profile-service'
import type {
  AnalyzeResponse,
  PlayerAnalysis,
  PlayerProfileResponse,
  Team,
} from '@/lib/types'

export class PlayerServiceError extends Error {
  status: number

  constructor(message: string, status = 500) {
    super(message)
    this.name = 'PlayerServiceError'
    this.status = status
  }
}

export type PlayerPageData = {
  profile: PlayerProfileResponse
  context: {
    player: PlayerAnalysis
    team: Team
    opponent: Team
    matchup_id: number
    match_status: AnalyzeResponse['meta']['match_status']
    match_start_time?: string | null
    match_finished_time?: string | null
  } | null
}

type UserMatchupRef = Awaited<ReturnType<typeof getUserMatchups>>[number]
type CachedEntry = { value: PlayerPageData; expiresAt: number }

const PLAYER_PAGE_CACHE_TTL_MS = 10 * 60 * 1000
const MAX_CONTEXT_MATCHUPS = 12
const playerPageCache = new Map<number, CachedEntry>()

function requireBlToken(): string {
  const blToken = process.env.BL_TOKEN
  if (!blToken) {
    throw new PlayerServiceError('BL_TOKEN must be set in .env.local', 500)
  }
  return blToken
}

function safeTime(value?: string): number {
  if (!value) return 0
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function sortUserMatchups(a: UserMatchupRef, b: UserMatchupRef): number {
  return (
    safeTime(b.start_time ?? b.finished_at) -
    safeTime(a.start_time ?? a.finished_at)
  )
}

function findPlayer(
  result: AnalyzeResponse,
  userId: number,
): PlayerPageData['context'] {
  const homePlayer = result.teams.home.players.find((player) => player.paradise_user_id === userId)
  if (homePlayer) {
    return {
      player: homePlayer,
      team: result.teams.home,
      opponent: result.teams.away,
      matchup_id: result.matchup_id,
      match_status: result.meta.match_status,
      match_start_time: result.meta.match_start_time,
      match_finished_time: result.meta.match_finished_time,
    }
  }

  const awayPlayer = result.teams.away.players.find((player) => player.paradise_user_id === userId)
  if (awayPlayer) {
    return {
      player: awayPlayer,
      team: result.teams.away,
      opponent: result.teams.home,
      matchup_id: result.matchup_id,
      match_status: result.meta.match_status,
      match_start_time: result.meta.match_start_time,
      match_finished_time: result.meta.match_finished_time,
    }
  }

  return null
}

export async function getPlayerPageData(userId: number): Promise<PlayerPageData | null> {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new PlayerServiceError('player_id must be a positive integer', 400)
  }

  const cached = playerPageCache.get(userId)
  if (cached && cached.expiresAt > Date.now()) return cached.value

  const blToken = requireBlToken()

  const profile = await buildPlayerProfile(userId)

  let matchups: UserMatchupRef[]
  try {
    matchups = await getUserMatchups(userId, blToken)
  } catch (err) {
    throw new PlayerServiceError(`Failed to fetch matchups for player ${userId}: ${err}`, 502)
  }

  const orderedMatchups = matchups
    .filter((matchup) => Number.isInteger(matchup.id) && matchup.id > 0)
    .sort(sortUserMatchups)
    .slice(0, MAX_CONTEXT_MATCHUPS)

  let context: PlayerPageData['context'] = null
  for (const matchup of orderedMatchups) {
    try {
      const analysis = await analyzeMatchup(matchup.id)
      const player = findPlayer(analysis, userId)
      if (player) {
        context = player
        break
      }
    } catch (err) {
      if (err instanceof AnalyzeServiceError) {
        continue
      }
      continue
    }
  }

  const pageData: PlayerPageData = {
    profile,
    context,
  }
  playerPageCache.set(userId, { value: pageData, expiresAt: Date.now() + PLAYER_PAGE_CACHE_TTL_MS })
  return pageData
}
