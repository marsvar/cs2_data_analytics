import Link from 'next/link'
import { TeamLogo } from '@/components/identity-badge'
import { resolveDivisionReference } from '@/lib/divisions'
import { DivisionServiceError, getDivisionOverview } from '@/lib/division-service'
import type { DivisionMatchSummary, DivisionResponse } from '@/lib/types'

// ── Standings computation ─────────────────────────────────────────────────────

type StandingRow = {
  teamId: number
  name: string
  logoUrl?: string
  played: number
  wins: number
  losses: number
}

function computeStandings(matches: DivisionMatchSummary[]): StandingRow[] {
  const rows = new Map<number, StandingRow>()

  function ensureTeam(id: number, name: string, logoUrl?: string) {
    if (!rows.has(id)) {
      rows.set(id, { teamId: id, name, logoUrl, played: 0, wins: 0, losses: 0 })
      return rows.get(id)!
    }
    const row = rows.get(id)!
    if (!row.logoUrl && logoUrl) row.logoUrl = logoUrl
    return row
  }

  for (const m of matches) {
    if (m.status !== 'completed') continue
    const homeId = m.home_team_id
    const awayId = m.away_team_id
    if (!homeId || !awayId) continue

    const home = ensureTeam(homeId, m.home_team, m.home_logo_url)
    const away = ensureTeam(awayId, m.away_team, m.away_logo_url)

    home.played += 1
    away.played += 1

    const hs = m.home_score ?? null
    const as_ = m.away_score ?? null

    if (hs != null && as_ != null) {
      if (hs > as_) { home.wins += 1; away.losses += 1 }
      else if (as_ > hs) { away.wins += 1; home.losses += 1 }
    }
  }

  return Array.from(rows.values()).sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins
    return a.losses - b.losses
  })
}

function StandingsTable({ result }: { result: DivisionResponse }) {
  const standings = computeStandings(result.matches)
  const hasScores = result.matches.some(
    (m) => m.status === 'completed' && m.home_score != null && m.away_score != null,
  )
  const completedCount = result.matches.filter((m) => m.status === 'completed').length
  const hasTeamIds = result.matches.some((m) => m.status === 'completed' && m.home_team_id != null)

  if (!hasTeamIds || completedCount === 0) return null

  return (
    <div className="mb-6 fx-rise fx-rise-d1">
      <div className="flex items-center gap-2 mb-3 px-1">
        <span className="font-display text-[10px] uppercase tracking-[0.2em] text-accent">Tabell</span>
        {!hasScores && (
          <span className="font-mono text-[9px] text-muted/50">· score ikke tilgjengelig</span>
        )}
      </div>
      <div className="bg-surface/92 border border-border/40 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[1.5rem_1fr_2.5rem_2.5rem_2.5rem] gap-3 px-4 py-2 border-b border-border/25 font-mono text-[9px] uppercase tracking-widest text-muted/60">
          <span>#</span>
          <span>Lag</span>
          <span className="text-center">K</span>
          <span className="text-center text-success/70">V</span>
          <span className="text-center text-danger/70">T</span>
        </div>
        {standings.map((row, i) => (
          <div
            key={row.teamId}
            className="grid grid-cols-[1.5rem_1fr_2.5rem_2.5rem_2.5rem] gap-3 items-center px-4 py-2.5 border-b border-border/12 last:border-0"
          >
            <span className="font-mono text-[10px] tabular-nums text-muted/50">{i + 1}</span>
            <div className="flex items-center gap-2 min-w-0">
              <TeamLogo name={row.name} logoUrl={row.logoUrl} tone="neutral" size="sm" />
              <span className="font-mono text-xs text-text truncate">{row.name}</span>
            </div>
            <span className="font-mono text-[10px] tabular-nums text-muted text-center">{row.played}</span>
            <span className="font-mono text-[11px] tabular-nums text-success text-center font-medium">
              {hasScores ? row.wins : '–'}
            </span>
            <span className="font-mono text-[11px] tabular-nums text-danger text-center">
              {hasScores ? row.losses : '–'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export const dynamic = 'force-dynamic'

type DivisionPageProps = {
  params: Promise<{ id: string }>
}

function statusPill(status: DivisionMatchSummary['status']): { text: string; cls: string } {
  if (status === 'upcoming') return { text: 'Kommende', cls: 'text-accent border-accent/30 bg-accent/8' }
  if (status === 'live') return { text: 'Live', cls: 'text-warning border-warning/30 bg-warning/8' }
  if (status === 'completed') return { text: 'Ferdig', cls: 'text-success border-success/30 bg-success/8' }
  return { text: 'Ukjent', cls: 'text-muted border-border/40 bg-surface2/40' }
}

function dateLabel(value: string | null): string {
  if (!value) return '–'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '–'
  return new Intl.DateTimeFormat('nb-NO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

function MatchCard({
  match,
  index,
  section,
}: {
  match: DivisionMatchSummary
  index: number
  section: 'upcoming' | 'played'
}) {
  const pill = statusPill(match.status)
  const hasScore = match.home_score != null && match.away_score != null
  const homewon = hasScore && (match.home_score ?? 0) > (match.away_score ?? 0)
  const awaywon = hasScore && (match.away_score ?? 0) > (match.home_score ?? 0)

  return (
    <div
      className="border-b border-border/15 last:border-0 px-4 py-3.5 hover:bg-surface2/18 transition-colors fx-rise"
      style={{ animationDelay: `${(section === 'upcoming' ? 120 : 260) + index * 30}ms` }}
    >
      {/* Top row: date + status */}
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <span className="font-mono text-[10px] text-muted/60 tabular-nums">{dateLabel(match.date)}</span>
        <span className={`font-mono text-[9px] uppercase tracking-widest px-2 py-0.5 rounded border ${pill.cls}`}>
          {pill.text}
        </span>
      </div>

      {/* Match row: teams + score + action */}
      <div className="flex items-center gap-3">
        {/* Home team */}
        <div className="flex-1 flex items-center gap-2 min-w-0 justify-end">
          <span className={`font-mono text-xs truncate text-right ${homewon ? 'text-text font-medium' : 'text-text/75'}`}>
            {match.home_team}
          </span>
          <TeamLogo name={match.home_team} logoUrl={match.home_logo_url} tone="home" size="md" />
        </div>

        {/* Score / VS divider */}
        <div className="shrink-0 w-14 flex items-center justify-center">
          {hasScore ? (
            <span className="font-display tabular-nums text-sm font-semibold">
              <span className={homewon ? 'text-success' : 'text-text/60'}>{match.home_score}</span>
              <span className="text-muted/40 mx-0.5">–</span>
              <span className={awaywon ? 'text-success' : 'text-text/60'}>{match.away_score}</span>
            </span>
          ) : (
            <span className="font-mono text-[11px] text-muted/40">vs</span>
          )}
        </div>

        {/* Away team */}
        <div className="flex-1 flex items-center gap-2 min-w-0">
          <TeamLogo name={match.away_team} logoUrl={match.away_logo_url} tone="away" size="md" />
          <span className={`font-mono text-xs truncate ${awaywon ? 'text-text font-medium' : 'text-text/75'}`}>
            {match.away_team}
          </span>
        </div>

        {/* Action link */}
        <Link
          href={`/match/${match.matchup_id}`}
          className="shrink-0 font-mono text-[10px] uppercase tracking-widest text-accent/80 hover:text-accent border border-accent/20 hover:border-accent/50 bg-accent/5 hover:bg-accent/10 px-2.5 py-1.5 rounded transition-colors"
        >
          {section === 'played' ? 'Analyse' : 'Forhåndsvis'} →
        </Link>
      </div>
    </div>
  )
}

function ErrorCard({ title, detail }: { title: string; detail: string }) {
  return (
    <section className="atlas-shell min-h-dvh">
      <div className="atlas-topline" />
      <div className="max-w-5xl mx-auto px-6 md:px-10 py-12">
        <Link href="/" className="font-mono text-[11px] uppercase tracking-widest text-muted hover:text-text">
          ← Til søk
        </Link>
        <div className="mt-5 bg-surface border border-danger/40 rounded-lg p-5">
          <h1 className="font-display text-sm tracking-widest uppercase text-danger mb-2">{title}</h1>
          <p className="font-mono text-xs text-muted">{detail}</p>
        </div>
      </div>
    </section>
  )
}

export default async function DivisionPage({ params }: DivisionPageProps) {
  const { id } = await params
  const divisionRef = resolveDivisionReference(id)

  if (!divisionRef) {
    return (
      <ErrorCard
        title="Ugyldig divisjon"
        detail="Fant ikke divisjonen. Gå tilbake til forsiden og velg en kjent divisjon."
      />
    )
  }

  try {
    const result = await getDivisionOverview(divisionRef.id)
    const title = result.division_name || divisionRef.name
    const notPlayedMatches = result.matches.filter((m) => m.phase === 'not_played_yet')
    const playedMatches = result.matches.filter((m) => m.phase === 'played')

    return (
      <section className="atlas-shell min-h-dvh">
        <div className="atlas-topline" />
        <div className="max-w-5xl mx-auto px-6 md:px-10 py-10">

          {/* Page header */}
          <div className="mb-7 fx-rise">
            <div className="flex items-center justify-between gap-3 mb-5">
              <Link href="/" className="font-mono text-[11px] uppercase tracking-widest text-muted hover:text-text">
                ← Til søk
              </Link>
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted/70">Kampoversikt</span>
            </div>
            <div className="bg-surface/85 border border-border/45 rounded-xl px-5 py-4">
              <p className="font-display text-[11px] uppercase tracking-[0.2em] text-accent mb-1.5">Divisjon</p>
              <h1 className="font-display text-2xl md:text-3xl leading-none tracking-tight">{title}</h1>
            </div>
          </div>

          {/* Standings */}
          <StandingsTable result={result} />

          {/* Match lists */}
          {result.matches.length === 0 && (
            <div className="bg-surface/92 border border-border/40 rounded-xl px-4 py-5 font-mono text-xs text-muted">
              Ingen kamper funnet.
            </div>
          )}

          {notPlayedMatches.length > 0 && (
            <div className="mb-6 fx-rise fx-rise-d2">
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className="font-display text-[10px] uppercase tracking-[0.2em] text-accent">Kommende kamper</span>
                <span className="font-mono text-[9px] text-muted/50">· {notPlayedMatches.length} kamp{notPlayedMatches.length !== 1 ? 'er' : ''}</span>
              </div>
              <div className="bg-surface/92 border border-border/40 rounded-xl overflow-hidden">
                {notPlayedMatches.map((match, i) => (
                  <MatchCard key={match.matchup_id} match={match} index={i} section="upcoming" />
                ))}
              </div>
            </div>
          )}

          {playedMatches.length > 0 && (
            <div className="fx-rise fx-rise-d3">
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className="font-display text-[10px] uppercase tracking-[0.2em] text-success/80">Ferdigspilte kamper</span>
                <span className="font-mono text-[9px] text-muted/50">· {playedMatches.length} kamp{playedMatches.length !== 1 ? 'er' : ''}</span>
              </div>
              <div className="bg-surface/92 border border-border/40 rounded-xl overflow-hidden">
                {playedMatches.map((match, i) => (
                  <MatchCard key={match.matchup_id} match={match} index={i} section="played" />
                ))}
              </div>
            </div>
          )}

        </div>
      </section>
    )
  } catch (err) {
    if (err instanceof DivisionServiceError) {
      return <ErrorCard title="Kunne ikke hente divisjon" detail={err.message} />
    }
    return (
      <ErrorCard
        title="Uventet feil"
        detail="Det oppstod en feil ved lasting av divisjonen. Prøv igjen om litt."
      />
    )
  }
}
