'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { TeamLogo } from '@/components/identity-badge'
import type {
  DivisionMatchSummary,
  DivisionResponse,
  MatchSearchHit,
  MatchSearchResponse,
} from '@/lib/types'

type DivisionOption = { id: number; name: string }

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: DivisionMatchSummary['status'] }) {
  if (status === 'upcoming') {
    return (
      <span className="font-mono text-[8px] uppercase tracking-widest px-1.5 py-0.5 rounded border border-accent/40 text-accent bg-accent/10">
        Kommende
      </span>
    )
  }
  if (status === 'live') {
    return (
      <span className="font-mono text-[8px] uppercase tracking-widest px-1.5 py-0.5 rounded border border-success/40 text-success bg-success/10 animate-pulse">
        Live
      </span>
    )
  }
  if (status === 'completed') {
    return (
      <span className="font-mono text-[8px] uppercase tracking-widest px-1.5 py-0.5 rounded border border-border/40 text-muted">
        Spilt
      </span>
    )
  }
  return null
}

function formatMatchDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('nb-NO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d)
}

function formatResultScore(match: DivisionMatchSummary): string | null {
  if (match.home_score == null || match.away_score == null) return null
  return `${match.home_score}-${match.away_score}`
}

function getPreviousRoundMatches(matches: DivisionMatchSummary[]): {
  roundNumber: number | null
  matches: DivisionMatchSummary[]
} {
  const playedMatches = matches.filter((match) => match.phase === 'played')
  const completedRounds = playedMatches
    .map((match) => match.round_number)
    .filter((roundNumber): roundNumber is number => roundNumber != null)

  if (completedRounds.length > 0) {
    const roundNumber = Math.max(...completedRounds)
    return {
      roundNumber,
      matches: playedMatches.filter((match) => match.round_number === roundNumber),
    }
  }

  return {
    roundNumber: null,
    matches: playedMatches.slice(0, 4),
  }
}

function MatchTeamsInline({
  homeTeam,
  awayTeam,
  homeLogoUrl,
  awayLogoUrl,
  compact = false,
}: {
  homeTeam: string
  awayTeam: string
  homeLogoUrl?: string
  awayLogoUrl?: string
  compact?: boolean
}) {
  return (
    <div className={`flex items-center gap-1.5 min-w-0 ${compact ? 'text-[10px]' : 'text-[11px]'}`}>
      <TeamLogo name={homeTeam} logoUrl={homeLogoUrl} tone="home" size="sm" />
      <span className="font-mono text-text truncate">{homeTeam}</span>
      <span className="font-mono text-muted/60 shrink-0">vs</span>
      <TeamLogo name={awayTeam} logoUrl={awayLogoUrl} tone="away" size="sm" />
      <span className="font-mono text-text truncate">{awayTeam}</span>
    </div>
  )
}

// ── Division picker + recent matches ─────────────────────────────────────────

function RecentMatchesPanel({
  onSelectMatch,
}: {
  onSelectMatch: (match: DivisionMatchSummary) => void
}) {
  const [divisions, setDivisions] = useState<DivisionOption[]>([])
  const [selectedDivisionId, setSelectedDivisionId] = useState<number | null>(null)
  const [matchesData, setMatchesData] = useState<DivisionResponse | null>(null)
  const [loadingDivisions, setLoadingDivisions] = useState(true)
  const [loadingMatches, setLoadingMatches] = useState(false)

  // Fetch division list on mount
  useEffect(() => {
    let cancelled = false
    async function fetchDivisions() {
      try {
        const res = await fetch('/api/divisions', { cache: 'no-store' })
        if (!res.ok) return
        const data = await res.json() as { divisions: DivisionOption[] }
        if (cancelled) return
        setDivisions(data.divisions)

        // Prefer division from URL param (read client-side), then first in list
        const paramId = new URLSearchParams(window.location.search).get('division')
        const defaultId = paramId ? Number(paramId) : data.divisions[0]?.id ?? null
        setSelectedDivisionId(defaultId)
      } catch {
        // silent fail — not critical
      } finally {
        if (!cancelled) setLoadingDivisions(false)
      }
    }
    fetchDivisions()
    return () => { cancelled = true }
  }, [])

  // Fetch matches when selected division changes
  const fetchMatches = useCallback(async (divisionId: number) => {
    setLoadingMatches(true)
    setMatchesData(null)
    try {
      const res = await fetch(`/api/division?division=${divisionId}`, { cache: 'no-store' })
      if (!res.ok) return
      const data = await res.json() as DivisionResponse
      setMatchesData(data)
    } catch {
      // silent fail
    } finally {
      setLoadingMatches(false)
    }
  }, [])

  useEffect(() => {
    if (selectedDivisionId != null) fetchMatches(selectedDivisionId)
  }, [selectedDivisionId, fetchMatches])

  const allMatches = matchesData?.matches ?? []
  const notPlayedYet = allMatches
    .filter((match) => match.phase === 'not_played_yet')
    .slice(0, 12)
  const previousRound = getPreviousRoundMatches(allMatches)
  const previousRoundMatches = previousRound.matches

  return (
    <div className="rounded-xl border border-border/45 bg-surface/65 backdrop-blur-sm p-5 md:p-6">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="font-display text-xs tracking-widest uppercase text-accent">Kommende kamper</h2>
          <p className="font-mono text-[11px] text-muted mt-1">Velg kamp fra listen eller søk direkte under.</p>
        </div>

        {/* Division selector */}
        {loadingDivisions ? (
          <div className="h-7 w-40 rounded bg-surface2 animate-pulse" />
        ) : divisions.length > 1 ? (
          <select
            value={selectedDivisionId ?? ''}
            onChange={(e) => setSelectedDivisionId(Number(e.target.value))}
            className="font-mono text-[10px] text-muted bg-surface border border-border/50 rounded px-2 py-1 focus:outline-none focus:border-accent/50"
            aria-label="Velg divisjon"
          >
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        ) : divisions.length === 1 ? (
          <span className="font-mono text-[10px] text-muted">{divisions[0].name}</span>
        ) : null}
      </div>

      {loadingMatches && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-surface2" />
          ))}
        </div>
      )}

      {!loadingMatches && allMatches.length === 0 && (
        <p className="font-mono text-[11px] text-muted">
          {selectedDivisionId ? 'Ingen kamper funnet for denne divisjonen.' : 'Velg en divisjon for å se kamper.'}
        </p>
      )}

      {!loadingMatches && allMatches.length > 0 && (
        <div className="space-y-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-accent mb-2">Ikke spilt ennå</p>
            {notPlayedYet.length === 0 ? (
              <p className="font-mono text-[11px] text-muted">Ingen kommende eller live-kamper i utvalget.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {notPlayedYet.map((match) => (
                  <button
                    key={match.matchup_id}
                    type="button"
                    onClick={() => onSelectMatch(match)}
                    className="text-left px-3 py-2.5 rounded-lg border border-border/35 bg-surface hover:bg-surface2/60 hover:border-accent/30 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="min-w-0 flex-1">
                        <MatchTeamsInline
                          homeTeam={match.home_team}
                          awayTeam={match.away_team}
                          homeLogoUrl={match.home_logo_url}
                          awayLogoUrl={match.away_logo_url}
                        />
                      </div>
                      <StatusBadge status={match.status} />
                    </div>
                    {match.date && (
                      <p className="font-mono text-[9px] text-muted/60">{formatMatchDate(match.date)}</p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="font-mono text-[10px] uppercase tracking-widest text-success">Forrige runde</p>
              {previousRound.roundNumber != null && (
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted/70">
                  Runde {previousRound.roundNumber}
                </p>
              )}
            </div>
            {previousRoundMatches.length === 0 ? (
              <p className="font-mono text-[11px] text-muted">Ingen kamper fra forrige runde i utvalget.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {previousRoundMatches.map((match) => {
                  const score = formatResultScore(match)
                  return (
                    <button
                      key={match.matchup_id}
                      type="button"
                      onClick={() => onSelectMatch(match)}
                      className="text-left px-3 py-2.5 rounded-lg border border-border/35 bg-surface hover:bg-surface2/60 hover:border-accent/30 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="min-w-0 flex-1">
                          <MatchTeamsInline
                            homeTeam={match.home_team}
                            awayTeam={match.away_team}
                            homeLogoUrl={match.home_logo_url}
                            awayLogoUrl={match.away_logo_url}
                          />
                        </div>
                        <StatusBadge status={match.status} />
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        {match.date && (
                          <p className="font-mono text-[9px] text-muted/60">{formatMatchDate(match.date)}</p>
                        )}
                        {score && (
                          <p className="font-mono text-[10px] text-success tabular-nums">{score}</p>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {selectedDivisionId && matchesData && (
        <div className="mt-3 pt-3 border-t border-border/25 flex items-center justify-between">
          <Link
            href={`/division/${selectedDivisionId}`}
            className="font-mono text-[10px] text-muted hover:text-accent transition-colors"
          >
            Se alle kamper i divisjonen →
          </Link>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const router = useRouter()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<MatchSearchHit[]>([])
  const [selectedMatch, setSelectedMatch] = useState<MatchSearchHit | null>(null)

  const trimmedInput = input.trim()

  useEffect(() => {
    if (selectedMatch && trimmedInput === selectedMatch.label) {
      setSearchLoading(false)
      setSearchError(null)
      return
    }

    if (trimmedInput.length < 2) {
      setSuggestions([])
      setSearchError(null)
      setSearchLoading(false)
      if (!/^\d+$/.test(trimmedInput)) setSelectedMatch(null)
      return
    }

    if (/^\d+$/.test(trimmedInput)) {
      setSearchError(null)
      setSearchLoading(false)
      setSuggestions([])
      setSelectedMatch(null)
      return
    }

    const controller = new AbortController()
    const timeout = window.setTimeout(async () => {
      setSearchLoading(true)
      setSearchError(null)
      try {
        const response = await fetch(
          `/api/match-search?q=${encodeURIComponent(trimmedInput)}&limit=8`,
          { signal: controller.signal, cache: 'no-store' },
        )
        const payload = (await response.json()) as MatchSearchResponse | { error: string }
        if (!response.ok || 'error' in payload) {
          setSuggestions([])
          setSearchError('Kunne ikke søke i kamper akkurat nå.')
          return
        }

        setSuggestions(payload.matches)
      } catch {
        if (controller.signal.aborted) return
        setSuggestions([])
        setSearchError('Kunne ikke søke i kamper akkurat nå.')
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false)
      }
    }, 220)

    return () => {
      controller.abort()
      window.clearTimeout(timeout)
    }
  }, [selectedMatch, trimmedInput])

  function resolveMatchupId(): number | null {
    if (selectedMatch) return selectedMatch.matchup_id

    if (/^\d+$/.test(trimmedInput)) {
      const numeric = Number(trimmedInput)
      if (Number.isInteger(numeric) && numeric > 0) return numeric
    }

    if (suggestions.length === 1) return suggestions[0].matchup_id
    return null
  }

  function runAnalysis() {
    const matchupId = resolveMatchupId()
    if (loading) return

    if (!matchupId) {
      setError('Søk etter lag og velg riktig kamp fra listen før du går videre.')
      return
    }

    setError(null)
    setLoading(true)
    router.push(`/match/${matchupId}`)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') runAnalysis()
  }

  function handlePickSuggestion(match: MatchSearchHit) {
    setSelectedMatch(match)
    setInput(match.label)
    setSuggestions([])
    setSearchError(null)
    setError(null)
  }

  function handleSelectRecentMatch(match: DivisionMatchSummary) {
    // Navigate directly to the match page on click
    router.push(`/match/${match.matchup_id}`)
  }

  return (
    <main className="min-h-dvh atlas-shell">
      <div className="atlas-topline" />
      <section
        className="py-16 px-6 md:px-10 relative overflow-hidden"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(42,48,68,0.18) 1px, transparent 1px),' +
            'linear-gradient(to bottom, rgba(42,48,68,0.18) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      >
        <div className="max-w-3xl mx-auto w-full">
          <div className="flex items-center justify-between mb-10">
            <span className="font-display text-[11px] tracking-widest uppercase text-accent">
              CS2 Analyse
            </span>
            <span className="font-mono text-[10px] text-muted uppercase tracking-widest hidden sm:block">
              Bedriftsligaen · Vår 2026
            </span>
          </div>

          <div>
            <h1 className="font-display font-bold uppercase leading-none tracking-tight mb-5">
              <span className="block text-4xl md:text-6xl text-text">TAKTISK</span>
              <span
                className="block text-5xl md:text-7xl"
                style={{
                  color: 'var(--color-accent)',
                  textShadow: '0 0 48px rgba(37,99,235,0.3), 0 0 12px rgba(37,99,235,0.15)',
                }}
              >
                KAMPANALYSE.
              </span>
            </h1>
            <p className="font-mono text-sm text-muted max-w-md leading-relaxed">
              Oversikt over kommende kamper i valgt divisjon.
              <br />
              Søk direkte på kamp nederst i oversikten.
            </p>
          </div>
        </div>
      </section>

      {/* Recent matches from division */}
      <section className="px-6 md:px-10 pb-6 max-w-5xl mx-auto w-full">
        <RecentMatchesPanel onSelectMatch={handleSelectRecentMatch} />
      </section>

      {/* Direct match search */}
      <section className="px-6 md:px-10 pb-16 max-w-5xl mx-auto w-full">
        <div className="rounded-xl border border-border/45 bg-surface/65 backdrop-blur-sm p-5 md:p-6">
          <div className="mb-3">
            <h2 className="font-display text-xs tracking-widest uppercase text-accent">Søk direkte på kamp</h2>
            <p className="font-mono text-[11px] text-muted mt-1">
              Finn kamp på lagnavn, eller lim inn matchup-ID.
            </p>
          </div>

          <div className="mb-3">
            <label htmlFor="matchup-input" className="sr-only">Søk direkte på kamp</label>
            <div
              className="flex items-center border border-border rounded-lg bg-surface overflow-hidden"
              style={{
                boxShadow: '0 0 0 1px rgba(37,99,235,0.05), 0 4px 24px rgba(0,0,0,0.3)',
                transition: 'border-color 200ms ease, box-shadow 200ms ease',
              }}
            >
              <span className="font-mono text-sm px-4 py-3.5 border-r border-border select-none shrink-0" style={{ color: 'var(--color-accent)' }} aria-hidden="true">
                ›
              </span>

              <input
                id="matchup-input"
                type="text"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  setSelectedMatch(null)
                  setError(null)
                }}
                onKeyDown={handleKeyDown}
                placeholder="f.eks. Sopra vs GlobalConnect"
                disabled={loading}
                className="flex-1 bg-transparent font-mono text-base text-text px-3 py-3.5 focus:outline-none disabled:opacity-50 placeholder:text-muted/30 min-w-0"
              />

              <button
                type="button"
                onClick={runAnalysis}
                disabled={loading || input.trim() === ''}
                aria-label="Gå til kamp"
                className="px-5 py-3.5 font-mono text-sm border-l border-border shrink-0 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'rgba(37,99,235,0.08)', color: 'var(--color-accent)' }}
              >
                {loading ? <span className="animate-pulse">…</span> : '→'}
              </button>
            </div>
          </div>

          {searchLoading && (
            <p className="font-mono text-[10px] text-muted mb-2 animate-pulse">Søker i kampnavn…</p>
          )}

          {!searchLoading && suggestions.length > 0 && (
            <div className="mb-3 rounded-lg border border-border/40 bg-surface2/30 p-2 space-y-1">
              {suggestions.map((match) => (
                <button
                  key={match.matchup_id}
                  type="button"
                  onClick={() => handlePickSuggestion(match)}
                  className="w-full text-left px-2 py-2 rounded border border-border/30 bg-surface hover:bg-surface2/60 transition-colors"
                >
                  <MatchTeamsInline
                    homeTeam={match.home_team}
                    awayTeam={match.away_team}
                    homeLogoUrl={match.home_logo_url}
                    awayLogoUrl={match.away_logo_url}
                    compact
                  />
                  <p className="font-mono text-[10px] text-muted mt-0.5">{match.label}</p>
                </button>
              ))}
            </div>
          )}

          <div className="h-4">
            {loading && (
              <p className="font-mono text-[11px] text-muted animate-pulse">
                Navigerer til kampanalyse…
              </p>
            )}
            {error && (
              <p className="font-mono text-[11px] text-danger">✗ {error}</p>
            )}
            {!loading && !error && !searchError && (
              <p className="font-mono text-[11px] text-muted/40">Tips: Velg kamp fra forslagene for raskere treff.</p>
            )}
            {!loading && !error && searchError && (
              <p className="font-mono text-[11px] text-warning">{searchError}</p>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
