import { DEFAULT_DIVISION, resolveDivisionReference } from '@/lib/divisions'
import { DivisionServiceError, getDivisionOverview } from '@/lib/division-service'
import type {
  MatchSearchHit,
  MatchSearchResponse,
} from '@/lib/types'

export class MatchSearchServiceError extends Error {
  status: number

  constructor(message: string, status = 500) {
    super(message)
    this.name = 'MatchSearchServiceError'
    this.status = status
  }
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function tokenize(query: string): string[] {
  return normalize(query)
    .split(/\s+/)
    .filter((token) => token.length >= 2)
}

function rankStatus(status: MatchSearchHit['status']): number {
  if (status === 'upcoming') return 0
  if (status === 'live') return 1
  if (status === 'unknown') return 2
  return 3
}

function scoreMatch(tokens: string[], homeTeam: string, awayTeam: string): number {
  if (tokens.length === 0) return 0

  const home = normalize(homeTeam)
  const away = normalize(awayTeam)
  const combined = `${home} ${away}`.trim()
  const fullQuery = tokens.join(' ')

  let score = 0
  if (combined.includes(fullQuery)) score += 8

  for (const token of tokens) {
    if (home.includes(token)) score += 3
    if (away.includes(token)) score += 3
    if (combined.includes(token)) score += 1
  }
  return score
}

function toSearchLabel(match: {
  home_team: string
  away_team: string
  date: string | null
}): string {
  if (!match.date) return `${match.home_team} vs ${match.away_team}`
  const date = new Date(match.date)
  if (Number.isNaN(date.getTime())) return `${match.home_team} vs ${match.away_team}`
  return `${match.home_team} vs ${match.away_team} · ${new Intl.DateTimeFormat('nb-NO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)}`
}

export async function searchMatchesByName({
  query,
  division,
  limit = 8,
}: {
  query: string
  division?: string | null
  limit?: number
}): Promise<MatchSearchResponse> {
  const trimmedQuery = query.trim()
  if (trimmedQuery.length < 2) {
    return {
      query: trimmedQuery,
      division_id: DEFAULT_DIVISION.id,
      division_name: DEFAULT_DIVISION.name,
      matches: [],
      fetched_at: new Date().toISOString(),
    }
  }

  const resolvedDivision = resolveDivisionReference(division ?? DEFAULT_DIVISION.slug)
  if (!resolvedDivision) {
    throw new MatchSearchServiceError('Ukjent divisjon.', 400)
  }

  let overview
  try {
    overview = await getDivisionOverview(resolvedDivision.id)
  } catch (err) {
    if (err instanceof DivisionServiceError) {
      throw new MatchSearchServiceError(err.message, err.status)
    }
    throw new MatchSearchServiceError('Kunne ikke hente kamper for søk.', 502)
  }

  const tokens = tokenize(trimmedQuery)
  const ranked = overview.matches
    .map((match) => ({
      ...match,
      _score: scoreMatch(tokens, match.home_team, match.away_team),
    }))
    .filter((match) => match._score > 0)
    .sort((a, b) => {
      if (b._score !== a._score) return b._score - a._score
      const statusDiff = rankStatus(a.status) - rankStatus(b.status)
      if (statusDiff !== 0) return statusDiff

      const aTime = matchTime(a.date, a.status)
      const bTime = matchTime(b.date, b.status)
      if (aTime !== bTime) return aTime - bTime

      return a.matchup_id - b.matchup_id
    })
    .slice(0, Math.max(1, Math.min(limit, 20)))
    .map(({ _score, ...match }) => ({
      ...match,
      label: toSearchLabel(match),
    }))

  return {
    query: trimmedQuery,
    division_id: resolvedDivision.id,
    division_name: resolvedDivision.name,
    matches: ranked,
    fetched_at: new Date().toISOString(),
  }
}

function matchTime(date: string | null, status: MatchSearchHit['status']): number {
  const timestamp = date ? new Date(date).getTime() : NaN
  if (!Number.isFinite(timestamp)) return Number.MAX_SAFE_INTEGER

  if (status === 'completed') return -timestamp
  return timestamp
}
