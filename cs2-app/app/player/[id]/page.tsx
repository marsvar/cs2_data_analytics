import Link from 'next/link'
import { getPlayerPageData, PlayerServiceError } from '@/lib/player-service'
import { PlayerProfileError } from '@/lib/player-profile-service'
import { PlayerProfileDisplay } from '@/components/player-profile-display'

export const dynamic = 'force-dynamic'

type PlayerPageProps = {
  params: Promise<{ id: string }>
}

function dateLabel(value?: string | null): string {
  if (!value) return '—'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '—'
  return new Intl.DateTimeFormat('nb-NO', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed)
}

function ErrorCard({ title, detail }: { title: string; detail: string }) {
  return (
    <section className="atlas-shell min-h-dvh">
      <div className="atlas-topline" />
      <div className="max-w-5xl mx-auto px-6 md:px-10 py-12">
        <Link href="/" className="font-mono text-[11px] uppercase tracking-widest text-muted hover:text-text transition-colors">
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

export default async function PlayerPage({ params }: PlayerPageProps) {
  const { id } = await params
  const userId = Number(id)

  if (!Number.isInteger(userId) || userId <= 0) {
    return (
      <ErrorCard
        title="Ugyldig spiller-ID"
        detail="Fant ikke spilleren. Sjekk URL-en og prøv igjen."
      />
    )
  }

  try {
    const pageData = await getPlayerPageData(userId)
    if (!pageData) {
      return (
        <ErrorCard
          title="Spiller ikke funnet"
          detail="Fant ikke spilleren. Sjekk URL-en og prøv igjen."
        />
      )
    }

    const { profile, context } = pageData

    return (
      <section className="atlas-shell min-h-dvh">
        <div className="atlas-topline" />
        <div className="max-w-5xl mx-auto px-6 md:px-10 py-10">
          <div className="flex items-center justify-between gap-3 mb-6 fx-rise">
            <Link href="/" className="font-mono text-[11px] uppercase tracking-widest text-muted hover:text-text transition-colors">
              ← Til søk
            </Link>
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted/60">Spillerprofil</span>
          </div>

          {context && (
            <div className="mb-6 bg-surface/92 border border-border/40 rounded-xl px-4 py-3 fx-rise fx-rise-d1">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-muted/60 mb-1">
                    Siste analyserte kampkontekst
                  </p>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Link
                      href={`/team/${context.team.id}`}
                      className="font-mono text-text hover:text-accent hover:underline underline-offset-2 transition-colors"
                    >
                      {context.team.name}
                    </Link>
                    <span className="font-mono text-muted/50">vs</span>
                    <Link
                      href={`/team/${context.opponent.id}`}
                      className="font-mono text-text hover:text-accent2 hover:underline underline-offset-2 transition-colors"
                    >
                      {context.opponent.name}
                    </Link>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] text-muted/60">
                    {context.match_status === 'played' ? dateLabel(context.match_finished_time ?? context.match_start_time) : dateLabel(context.match_start_time)}
                  </span>
                  <Link
                    href={`/match/${context.matchup_id}`}
                    className="font-mono text-[10px] uppercase tracking-widest text-accent hover:text-text transition-colors"
                  >
                    Åpne kamp →
                  </Link>
                </div>
              </div>
            </div>
          )}

          <PlayerProfileDisplay profile={profile} />
        </div>
      </section>
    )
  } catch (err) {
    if (err instanceof PlayerProfileError || err instanceof PlayerServiceError) {
      if (err.status === 404) {
        return (
          <ErrorCard
            title="Spiller ikke funnet"
            detail={err.message}
          />
        )
      }
    }
    return (
      <ErrorCard
        title="Uventet feil"
        detail="Det oppstod en feil ved lasting av spillerprofilen. Prøv igjen om litt."
      />
    )
  }
}
