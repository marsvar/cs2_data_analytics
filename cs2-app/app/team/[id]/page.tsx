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
          ← Back to search
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
        title="Invalid team ID"
        detail="Team not found. Check the URL and try again."
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
              ← Back to search
            </Link>
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted/60">Team Profile</span>
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
            title="Team not found"
            detail={err.message}
          />
        )
      }
    }
    return (
      <ErrorCard
        title="Unexpected error"
        detail="An error occurred while loading the team profile. Please try again."
      />
    )
  }
}
