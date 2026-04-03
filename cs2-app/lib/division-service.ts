import { getDivisionMatchups } from '@/lib/bl-api'
import { normalizeBlImageUrl } from '@/lib/bl-image-url'
import { findDivisionPreset } from '@/lib/divisions'
import { inferDivisionStatus, phaseFromDivisionStatus } from '@/lib/match-phase'
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
  round_number?: number | null
  start_time?: string | null
  finished_at?: string | null
  status?: string | null
  home_signup?: {
    team?: {
      id?: number
      name?: string | null
      logo?: { url?: string | null; relative_url?: string | null }
    }
  }
  away_signup?: {
    team?: {
      id?: number
      name?: string | null
      logo?: { url?: string | null; relative_url?: string | null }
    }
  }
  signups?: Array<{
    team?: {
      id?: number
      name?: string | null
      logo?: { url?: string | null; relative_url?: string | null }
    }
  }>
  // Score fields — present when match is completed
  home_score?: number | null
  away_score?: number | null
  // Some API variants expose winner_id or result
  winner_id?: number | null
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

function teamId(raw: DivisionMatchupRaw, index: 0 | 1): number | undefined {
  const id = index === 0
    ? raw.home_signup?.team?.id
    : raw.away_signup?.team?.id
  if (id != null && id > 0) return id
  return raw.signups?.[index]?.team?.id ?? undefined
}

function teamLogo(raw: DivisionMatchupRaw, index: 0 | 1): string | undefined {
  const signupTeam = index === 0
    ? raw.home_signup?.team
    : raw.away_signup?.team
  const signupLogo = normalizeBlImageUrl(
    signupTeam?.logo?.url,
    signupTeam?.logo?.relative_url,
  )
  if (signupLogo) return signupLogo

  const fallbackTeam = raw.signups?.[index]?.team
  return normalizeBlImageUrl(
    fallbackTeam?.logo?.url,
    fallbackTeam?.logo?.relative_url,
  )
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
      const status = inferDivisionStatus(m, now)
      return {
        matchup_id: m.id as number,
        round_number:
          Number.isInteger(m.round_number) && (m.round_number ?? 0) > 0
            ? (m.round_number as number)
            : undefined,
        home_team: teamName(m, 0),
        away_team: teamName(m, 1),
        home_team_id: teamId(m, 0),
        away_team_id: teamId(m, 1),
        home_logo_url: teamLogo(m, 0),
        away_logo_url: teamLogo(m, 1),
        date,
        status,
        phase: phaseFromDivisionStatus(status),
        home_score: m.home_score ?? null,
        away_score: m.away_score ?? null,
      } satisfies DivisionMatchSummary
    })
    .sort(sortMatches)

  return {
    division_id: divisionId,
    division_name: findDivisionPreset(divisionId)?.name,
    matches,
    fetched_at: new Date().toISOString(),
  }
}
