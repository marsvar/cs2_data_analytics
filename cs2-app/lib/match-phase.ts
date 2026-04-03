import type { DivisionMatchSummary } from '@/lib/types'

export type MatchPhase = 'not_played_yet' | 'played'

function safeDate(value?: string | null): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

export function inferDivisionStatus(
  raw: {
    finished_at?: string | null
    status?: string | null
    start_time?: string | null
  },
  now: Date,
): DivisionMatchSummary['status'] {
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

export function phaseFromDivisionStatus(status: DivisionMatchSummary['status']): MatchPhase {
  return status === 'completed' ? 'played' : 'not_played_yet'
}

export function inferAnalyzeMatchStatus(
  finishedAt?: string | null,
  now: Date = new Date(),
): 'upcoming' | 'played' {
  const finished = safeDate(finishedAt)
  if (finished && finished <= now) return 'played'
  return 'upcoming'
}

export function phaseFromAnalyzeStatus(status: 'upcoming' | 'played'): MatchPhase {
  return status === 'played' ? 'played' : 'not_played_yet'
}

