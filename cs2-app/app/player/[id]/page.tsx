import Link from 'next/link'
import { buildPlayerProfile, PlayerProfileError } from '@/lib/player-profile-service'
import { PlayerProfileDisplay } from '@/components/player-profile-display'

export const dynamic = 'force-dynamic'

type PlayerPageProps = {
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

export default async function PlayerPage({ params }: PlayerPageProps) {
  const { id } = await params
  const userId = Number(id)

  if (!Number.isInteger(userId) || userId <= 0) {
    return (
      <ErrorCard
        title="Invalid player ID"
        detail="Player not found. Check the URL and try again."
      />
    )
  }

  try {
    const profile = await buildPlayerProfile(userId)

    return (
      <section className="atlas-shell min-h-dvh">
        <div className="atlas-topline" />
        <div className="max-w-5xl mx-auto px-6 md:px-10 py-10">
          <div className="flex items-center justify-between gap-3 mb-6 fx-rise">
            <Link href="/" className="font-mono text-[11px] uppercase tracking-widest text-muted hover:text-text transition-colors">
              ← Back to search
            </Link>
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted/60">Player Profile</span>
          </div>
          <PlayerProfileDisplay profile={profile} />
        </div>
      </section>
    )
  } catch (err) {
    if (err instanceof PlayerProfileError) {
      if (err.status === 404) {
        return (
          <ErrorCard
            title="Player not found"
            detail={err.message}
          />
        )
      }
    }
    return (
      <ErrorCard
        title="Unexpected error"
        detail="An error occurred while loading the player profile. Please try again."
      />
    )
  }
}
