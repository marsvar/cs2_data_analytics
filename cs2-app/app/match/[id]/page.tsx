import { AnalysisDisplay } from '@/components/analysis-display'
import { PlayerAvatar, TeamLogo } from '@/components/identity-badge'
import { analyzeMatchup, AnalyzeServiceError } from '@/lib/analyze-service'
import { ErrorCard } from '@/components/ui/error-card'
import { NavBreadcrumb } from '@/components/ui/nav-breadcrumb'
import type { AnalyzeResponse, PlayerAnalysis } from '@/lib/types'

export const dynamic = 'force-dynamic'

type MatchPageProps = {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ division?: string }>
}

function buildHomeHref(divisionId?: string): string {
  return divisionId ? `/?division=${encodeURIComponent(divisionId)}` : '/'
}

// ── Headline card ─────────────────────────────────────────────────────────────

function topPlayer(players: PlayerAnalysis[]): PlayerAnalysis | null {
  return players.reduce<PlayerAnalysis | null>(
    (best, p) => (best == null || p.score > best.score ? p : best),
    null,
  )
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('nb-NO', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d)
}

function TeamNameWithLogo({
  name,
  logoUrl,
  tone,
}: {
  name: string
  logoUrl?: string
  tone: 'home' | 'away'
}) {
  const toneClass = tone === 'home' ? 'text-accent' : 'text-accent2'

  return (
    <span className={`inline-flex items-center gap-2.5 ${toneClass}`}>
      <TeamLogo name={name} logoUrl={logoUrl} tone={tone} size="md" />
      <span>{name}</span>
    </span>
  )
}

function PlayerInlineAvatar({ player, tone }: { player: PlayerAnalysis; tone: 'home' | 'away' }) {
  return <PlayerAvatar name={player.name} imageUrl={player.avatar_url} tone={tone} size="xs" />
}

function MatchHeadlineCard({ result }: { result: AnalyzeResponse }) {
  const { home, away } = result.teams
  const isPlayed = result.meta.match_status === 'played'
  const tactical = result.landing?.tactical_edge
  const reliability = result.landing?.reliability
  const gamePlan = result.landing?.game_plan ?? []
  const homeTop = topPlayer(home.players)
  const awayTop = topPlayer(away.players)
  const playedScore = (
    result.result_summary?.home_score != null &&
    result.result_summary?.away_score != null
  )
    ? `${result.result_summary.home_score}-${result.result_summary.away_score}`
    : null

  return (
    <div className="card-1 px-5 py-4 fx-pulse-glow">
      {/* Status pill */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="font-display text-[11px] uppercase tracking-[0.2em] text-accent">
          {isPlayed ? 'Kampanalyse — spilt' : 'Pre-match analyse'}
        </p>
        <div className="flex items-center gap-2">
          {(result.meta.match_start_time || result.meta.match_finished_time) && (
            <span className="font-mono text-[9px] text-muted/60">
              {formatDate(isPlayed ? result.meta.match_finished_time : result.meta.match_start_time)}
            </span>
          )}
          <span className={`status-pill ${
            isPlayed
              ? 'border-border/40 text-muted bg-surface2/40'
              : 'border-accent/40 text-accent bg-accent/10'
          }`}>
            {isPlayed ? 'Spilt' : 'Kommende'}
          </span>
        </div>
      </div>

      {/* Team names */}
      <h1 className="font-display text-2xl md:text-3xl leading-none tracking-tight mb-4 flex items-center gap-3 flex-wrap">
        <TeamNameWithLogo name={home.name || 'Hjemmelag'} logoUrl={home.logo_url} tone="home" />
        <span className="text-muted/50 text-xl">vs</span>
        <TeamNameWithLogo name={away.name || 'Bortelag'} logoUrl={away.logo_url} tone="away" />
      </h1>

      {isPlayed && playedScore && (
        <p className="font-mono text-sm text-success mb-3 tabular-nums">
          Sluttresultat: {playedScore}
        </p>
      )}

      {/* Win probability — only for upcoming */}
      {!isPlayed && tactical && (
        <div className="flex items-stretch mb-4 border border-border/25 rounded-lg overflow-hidden">
          <div className="flex-1 text-center py-3 border-r border-border/20">
            <div className="font-mono text-2xl font-bold tabular-nums leading-none text-accent">
              {tactical.home_win_pct}%
            </div>
            <div className="font-mono text-[9px] text-muted uppercase tracking-widest mt-1">
              {home.name || 'Hjem'} seier
            </div>
          </div>
          <div className="flex items-center px-3">
            <span className="font-mono text-[9px] text-muted/50">{tactical.confidence_note}</span>
          </div>
          <div className="flex-1 text-center py-3 border-l border-border/20">
            <div className="font-mono text-2xl font-bold tabular-nums leading-none text-accent2">
              {tactical.away_win_pct}%
            </div>
            <div className="font-mono text-[9px] text-muted uppercase tracking-widest mt-1">
              {away.name || 'Borte'} seier
            </div>
          </div>
        </div>
      )}

      {!isPlayed && gamePlan.length > 0 && (
        <div className="mb-4 card-2 px-3 py-2.5">
          <p className="label-micro text-muted/55 mb-1.5">Matchup read</p>
          <p className="font-mono text-[11px] text-text/90">{gamePlan[0]}</p>
        </div>
      )}

      {/* Bottom row: key players + reliability */}
      <div className="flex items-end justify-between gap-4 flex-wrap mt-1">
        <div className="flex items-center gap-4">
          {homeTop && (
            <div className="flex items-center gap-1.5">
              <span className="label-micro text-muted/60">Nøkkel:</span>
              <PlayerInlineAvatar player={homeTop} tone="home" />
              <span className="font-mono text-[10px] text-accent">{homeTop.name}</span>
              <span className="font-mono text-[9px] text-muted/50 tabular-nums">{(homeTop.score * 10).toFixed(1)}</span>
            </div>
          )}
          {awayTop && (
            <div className="flex items-center gap-1.5">
              <span className="label-micro text-muted/60">Nøkkel:</span>
              <PlayerInlineAvatar player={awayTop} tone="away" />
              <span className="font-mono text-[10px] text-accent2">{awayTop.name}</span>
              <span className="font-mono text-[9px] text-muted/50 tabular-nums">{(awayTop.score * 10).toFixed(1)}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 font-mono text-[9px] text-muted/60">
          {reliability && (
            <span className={reliability.low_sample ? 'text-warning' : ''}>
              {reliability.avg_rounds.toFixed(0)} runder snitt
            </span>
          )}
          <span>{result.meta.leetify_count}/{home.players.length + away.players.length} Leetify</span>
        </div>
      </div>
    </div>
  )
}

export default async function MatchPage({ params, searchParams }: MatchPageProps) {
  const { id } = await params
  const resolvedSearchParams = searchParams ? await searchParams : undefined
  const divisionId = resolvedSearchParams?.division
  const matchupId = Number(id)

  if (!Number.isInteger(matchupId) || matchupId <= 0) {
    return (
      <ErrorCard
        title="Ugyldig kamp"
        detail="Lenken peker ikke til en gyldig kamp."
        backHref={buildHomeHref(divisionId)}
      />
    )
  }

  try {
    const result = await analyzeMatchup(matchupId)

    return (
      <section className="atlas-shell min-h-dvh">
        <div className="atlas-topline" />
        <div className="max-w-5xl mx-auto px-6 md:px-10 py-10">
          <div className="mb-7 fx-rise">
            <NavBreadcrumb backHref={buildHomeHref(divisionId)} contextLabel={`Kamp #${matchupId}`} />
            <MatchHeadlineCard result={result} />
          </div>

          <div className="fx-rise fx-rise-d1">
            <AnalysisDisplay result={result} showCopyReport />
          </div>
        </div>
      </section>
    )
  } catch (err) {
    if (err instanceof AnalyzeServiceError) {
      return <ErrorCard title="Kunne ikke hente analyse" detail={err.message} backHref={buildHomeHref(divisionId)} />
    }
    return (
      <ErrorCard
        title="Uventet feil"
        detail="Det oppstod en feil under lasting av analysen. Prøv igjen om litt."
        backHref={buildHomeHref(divisionId)}
      />
    )
  }
}
