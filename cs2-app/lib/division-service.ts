import { getDivisionMatchups } from '@/lib/bl-api'
import type { DivisionMatchSummary, DivisionResponse } from '@/lib/types'

export class DivisionServiceError extends Error {
  status: number

  constructor(message: string, status = 500) {
    super(message)
    this.name = 'DivisionServiceError'
    this.status = status
  }
}

type DivisionMatchupRaw = {
  id?: number
  start_time?: string | null
  finished_at?: string | null
  status?: string | null
  home_signup?: { team?: { name?: string | null } }
  away_signup?: { team?: { name?: string | null } }
  signups?: Array<{ team?: { name?: string | null } }>
}

function safeDate(value?: string | null): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function teamName(raw: DivisionMatchupRaw, index: 0 | 1): string {
  const fromSignup = index === 0
    ? raw.home_signup?.team?.name
    : raw.away_signup?.team?.name
  if (fromSignup && fromSignup.trim().length > 0) return fromSignup

  const fallback = raw.signups?.[index]?.team?.name
  if (fallback && fallback.trim().length > 0) return fallback

  return 'Ukjent lag'
}

function matchStatus(raw: DivisionMatchupRaw, now: Date): DivisionMatchSummary['status'] {
  if (raw.finished_at) return 'completed'

  const status = (raw.status ?? '').toLowerCase()
  if (status.includes('live') || status.includes('progress') || status.includes('playing')) {
    return 'live'
  }
  if (status.includes('upcoming') || status.includes('scheduled') || status.includes('pending')) {
    return 'upcoming'
  }

  const start = safeDate(raw.start_time)
  if (start && start > now) return 'upcoming'
  if (start && start <= now) return 'live'
  return 'unknown'
}

function sortMatches(a: DivisionMatchSummary, b: DivisionMatchSummary): number {
  const rank = (status: DivisionMatchSummary['status']): number => {
    if (status === 'upcoming') return 0
    if (status === 'live') return 1
    if (status === 'unknown') return 2
    return 3
  }

  const ra = rank(a.status)
  const rb = rank(b.status)
  if (ra !== rb) return ra - rb

  const da = safeDate(a.date)
  const db = safeDate(b.date)

  if (a.status === 'completed') {
    return (db?.getTime() ?? 0) - (da?.getTime() ?? 0)
  }

  return (da?.getTime() ?? Number.MAX_SAFE_INTEGER) - (db?.getTime() ?? Number.MAX_SAFE_INTEGER)
}

function requireBlToken(): string {
  const blToken = process.env.BL_TOKEN
  if (!blToken) {
    throw new DivisionServiceError('BL_TOKEN must be set in .env.local', 500)
  }
  return blToken
}

export async function getDivisionOverview(divisionId: number): Promise<DivisionResponse> {
  if (!Number.isInteger(divisionId) || divisionId <= 0) {
    throw new DivisionServiceError('division_id must be a positive integer', 400)
  }

  const blToken = requireBlToken()
  let rawMatches: DivisionMatchupRaw[]

  try {
    rawMatches = (await getDivisionMatchups(divisionId, blToken)) as DivisionMatchupRaw[]
  } catch (err) {
    throw new DivisionServiceError(`Failed to fetch division ${divisionId}: ${err}`, 502)
  }

  const now = new Date()
  const matches = rawMatches
    .filter((m) => Number.isInteger(m.id) && (m.id ?? 0) > 0)
    .map((m) => {
      const date = m.start_time ?? m.finished_at ?? null
      return {
        matchup_id: m.id as number,
        home_team: teamName(m, 0),
        away_team: teamName(m, 1),
        date,
        status: matchStatus(m, now),
      } satisfies DivisionMatchSummary
    })
    .sort(sortMatches)

  return {
    division_id: divisionId,
    matches,
    fetched_at: new Date().toISOString(),
  }
}
