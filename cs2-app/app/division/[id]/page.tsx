import Link from 'next/link'
import { DivisionServiceError, getDivisionOverview } from '@/lib/division-service'
import type { DivisionMatchSummary } from '@/lib/types'

export const dynamic = 'force-dynamic'

type DivisionPageProps = {
  params: Promise<{ id: string }>
}

function statusLabel(status: DivisionMatchSummary['status']): { text: string; cls: string } {
  if (status === 'upcoming') return { text: 'Kommende', cls: 'text-accent border-accent/30 bg-accent/10' }
  if (status === 'live') return { text: 'Pågår', cls: 'text-warning border-warning/30 bg-warning/10' }
  if (status === 'completed') return { text: 'Ferdig', cls: 'text-success border-success/30 bg-success/10' }
  return { text: 'Ukjent', cls: 'text-muted border-border/40 bg-surface2/40' }
}

function dateLabel(value: string | null): string {
  if (!value) return 'Ukjent tid'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'Ukjent tid'
  return new Intl.DateTimeFormat('nb-NO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

function ErrorCard({ title, detail }: { title: string; detail: string }) {
  return (
    <section className="max-w-5xl mx-auto px-6 md:px-10 py-12">
      <Link
        href="/"
        className="font-mono text-[11px] uppercase tracking-widest text-muted hover:text-text"
      >
        ← Til søk
      </Link>
      <div className="mt-5 bg-surface border border-danger/40 rounded-lg p-5">
        <h1 className="font-display text-sm tracking-widest uppercase text-danger mb-2">{title}</h1>
        <p className="font-mono text-xs text-muted">{detail}</p>
      </div>
    </section>
  )
}

export default async function DivisionPage({ params }: DivisionPageProps) {
  const { id } = await params
  const divisionId = Number(id)

  if (!Number.isInteger(divisionId) || divisionId <= 0) {
    return (
      <ErrorCard
        title="Ugyldig divisjons-id"
        detail="URL må være på formen /division/<positivt tall>, for eksempel /division/1138."
      />
    )
  }

  try {
    const result = await getDivisionOverview(divisionId)

    return (
      <section className="max-w-5xl mx-auto px-6 md:px-10 py-10">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/"
            className="font-mono text-[11px] uppercase tracking-widest text-muted hover:text-text"
          >
            ← Til søk
          </Link>
          <span className="font-display text-[11px] uppercase tracking-widest text-muted">
            Divisjon #{divisionId}
          </span>
        </div>

        <div className="bg-surface border border-border/40 rounded-lg overflow-hidden">
          <div className="hidden md:grid grid-cols-[140px_1fr_120px_96px] gap-3 px-4 py-3 border-b border-border/30 font-mono text-[10px] uppercase tracking-widest text-muted">
            <span>Dato</span>
            <span>Match</span>
            <span>Status</span>
            <span className="text-right">Analyse</span>
          </div>

          {result.matches.length === 0 && (
            <div className="px-4 py-5 font-mono text-xs text-muted">Ingen kamper funnet.</div>
          )}

          {result.matches.map((match) => {
            const status = statusLabel(match.status)
            return (
              <div key={match.matchup_id} className="px-4 py-3 border-b border-border/20 last:border-0">
                <div className="md:hidden space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-[11px] text-muted tabular-nums">{dateLabel(match.date)}</span>
                    <span className={`font-mono text-[10px] uppercase tracking-widest px-2 py-1 rounded border text-center ${status.cls}`}>
                      {status.text}
                    </span>
                  </div>
                  <div className="font-mono text-xs text-text break-words">
                    {match.home_team} vs {match.away_team}
                  </div>
                  <div>
                    <Link
                      href={`/match/${match.matchup_id}`}
                      className="font-mono text-[11px] uppercase tracking-widest text-accent hover:text-text"
                    >
                      Analyser →
                    </Link>
                  </div>
                </div>

                <div className="hidden md:grid grid-cols-[140px_1fr_120px_96px] gap-3 items-center">
                  <span className="font-mono text-[11px] text-muted tabular-nums">{dateLabel(match.date)}</span>
                  <span className="font-mono text-xs text-text truncate">
                    {match.home_team} vs {match.away_team}
                  </span>
                  <span className={`font-mono text-[10px] uppercase tracking-widest px-2 py-1 rounded border text-center ${status.cls}`}>
                    {status.text}
                  </span>
                  <div className="text-right">
                    <Link
                      href={`/match/${match.matchup_id}`}
                      className="font-mono text-[11px] uppercase tracking-widest text-accent hover:text-text"
                    >
                      Analyser →
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
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
