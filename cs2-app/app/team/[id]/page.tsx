import Link from 'next/link'
import { buildTeamProfile, TeamProfileError } from '@/lib/team-profile-service'
import { TeamProfileDisplay } from '@/components/team-profile-display'

export const dynamic = 'force-dynamic'

type TeamPageProps = {
  params: Promise<{ id: string }>
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

export default async function TeamPage({ params }: TeamPageProps) {
  const { id } = await params
  const teamId = Number(id)

  if (!Number.isInteger(teamId) || teamId <= 0) {
    return (
      <ErrorCard
        title="Ugyldig lag-ID"
        detail="Fant ikke laget. Sjekk URL-en og prøv igjen."
      />
    )
  }

  try {
    const profile = await buildTeamProfile(teamId)

    return (
      <section className="atlas-shell min-h-dvh">
        <div className="atlas-topline" />
        <div className="max-w-5xl mx-auto px-6 md:px-10 py-10">
          <div className="flex items-center justify-between gap-3 mb-6 fx-rise">
            <Link href="/" className="font-mono text-[11px] uppercase tracking-widest text-muted hover:text-text transition-colors">
              ← Til søk
            </Link>
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted/60">Lagprofil</span>
          </div>
          <TeamProfileDisplay profile={profile} />
        </div>
      </section>
    )
  } catch (err) {
    if (err instanceof TeamProfileError) {
      if (err.status === 404) {
        return (
          <ErrorCard
            title="Lag ikke funnet"
            detail={err.message}
          />
        )
      }
    }
    return (
      <ErrorCard
        title="Uventet feil"
        detail="Det oppstod en feil ved lasting av lagprofilen. Prøv igjen om litt."
      />
    )
  }
}
