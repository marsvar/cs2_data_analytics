'use client'

import { useEffect, useState } from 'react'
import { PlayerAvatar } from '@/components/identity-badge'
import type { UpcomingMatchPreview } from '@/lib/upcoming-preview'

type UpcomingPreviewPanelProps = {
  matchupId: number
}

const previewMemoryCache = new Map<number, UpcomingMatchPreview | null>()
const previewInflight = new Map<number, Promise<UpcomingMatchPreview | null>>()
const PREVIEW_STORAGE_PREFIX = 'upcoming-preview:'

function readStoredPreview(matchupId: number): UpcomingMatchPreview | null | undefined {
  if (typeof window === 'undefined') return undefined

  const raw = window.sessionStorage.getItem(`${PREVIEW_STORAGE_PREFIX}${matchupId}`)
  if (!raw) return undefined

  try {
    return JSON.parse(raw) as UpcomingMatchPreview | null
  } catch {
    window.sessionStorage.removeItem(`${PREVIEW_STORAGE_PREFIX}${matchupId}`)
    return undefined
  }
}

function storePreview(matchupId: number, preview: UpcomingMatchPreview | null) {
  previewMemoryCache.set(matchupId, preview)
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(`${PREVIEW_STORAGE_PREFIX}${matchupId}`, JSON.stringify(preview))
}

async function fetchPreview(matchupId: number, signal: AbortSignal): Promise<UpcomingMatchPreview | null> {
  const cached = previewMemoryCache.get(matchupId)
  if (cached !== undefined) return cached

  const stored = readStoredPreview(matchupId)
  if (stored !== undefined) {
    previewMemoryCache.set(matchupId, stored)
    return stored
  }

  const inflight = previewInflight.get(matchupId)
  if (inflight) return inflight

  const request = fetch(`/api/upcoming-preview?matchup_id=${matchupId}`, {
    signal,
    cache: 'force-cache',
  })
    .then(async (response) => {
      if (!response.ok) return null
      const nextPreview = (await response.json()) as UpcomingMatchPreview | null
      storePreview(matchupId, nextPreview)
      return nextPreview
    })
    .finally(() => {
      previewInflight.delete(matchupId)
    })

  previewInflight.set(matchupId, request)
  return request
}

export function UpcomingPreviewPanel({ matchupId }: UpcomingPreviewPanelProps) {
  const initialPreview = previewMemoryCache.get(matchupId) ?? null
  const [preview, setPreview] = useState<UpcomingMatchPreview | null>(initialPreview)
  const [loading, setLoading] = useState(initialPreview === null)

  useEffect(() => {
    const controller = new AbortController()

    async function loadPreview() {
      const cached = previewMemoryCache.get(matchupId)
      if (cached !== undefined) {
        setPreview(cached)
        setLoading(false)
        return
      }

      const stored = readStoredPreview(matchupId)
      if (stored !== undefined) {
        previewMemoryCache.set(matchupId, stored)
        setPreview(stored)
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const nextPreview = await fetchPreview(matchupId, controller.signal)
        setPreview(nextPreview)
      } catch {
        if (!controller.signal.aborted) {
          setPreview(null)
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false)
        }
      }
    }

    void loadPreview()
    return () => controller.abort()
  }, [matchupId])

  if (loading) {
    return (
      <div className="mt-3 rounded-lg border border-border/20 bg-surface2/15 p-3 animate-pulse">
        <div className="mb-2 h-4 w-24 rounded bg-surface" />
        <div className="mb-3 h-14 rounded bg-surface" />
        <div className="mb-2 flex gap-2">
          <div className="h-6 w-24 rounded bg-surface" />
          <div className="h-6 w-24 rounded bg-surface" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="h-11 rounded bg-surface" />
          <div className="h-11 rounded bg-surface" />
        </div>
      </div>
    )
  }

  if (!preview) return null

  return (
    <div className="mt-3 rounded-lg border border-border/20 bg-surface2/15 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className={`font-mono text-[8px] uppercase tracking-widest px-2 py-0.5 rounded border ${preview.confidenceClass}`}>
          {preview.confidenceLabel}
        </span>
        <span className="font-mono text-[9px] text-muted/55">preview snapshot</span>
      </div>

      <div className="mb-3 flex items-stretch overflow-hidden rounded-lg border border-border/20">
        <div className="flex-1 border-r border-border/20 px-2.5 py-2 text-center">
          <div className="font-mono text-[9px] uppercase tracking-widest text-accent/75 truncate">
            {preview.homeTeam}
          </div>
          <div className="mt-1 font-mono text-xl font-semibold leading-none tabular-nums text-accent">
            {preview.homeWinPct}%
          </div>
        </div>
        <div className="flex items-center justify-center px-2 text-center">
          <span className="font-mono text-[9px] text-muted/55">
            {preview.confidenceNote ?? 'win band'}
          </span>
        </div>
        <div className="flex-1 border-l border-border/20 px-2.5 py-2 text-center">
          <div className="font-mono text-[9px] uppercase tracking-widest text-accent2/75 truncate">
            {preview.awayTeam}
          </div>
          <div className="mt-1 font-mono text-xl font-semibold leading-none tabular-nums text-accent2">
            {preview.awayWinPct}%
          </div>
        </div>
      </div>

      <div className="mb-2">
        <div className="relative h-1.5 overflow-hidden rounded-full bg-surface">
          <div
            className="absolute inset-y-0 left-0 bg-accent"
            style={{ width: `${preview.homeWinPct}%` }}
          />
          <div
            className="absolute inset-y-0 right-0 bg-accent2/65"
            style={{ width: `${preview.awayWinPct}%` }}
          />
          <div className="absolute inset-y-0 left-1/2 w-px bg-border/80" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 font-mono text-[10px]">
        <div className="rounded-md border border-border/15 bg-surface/30 px-2.5 py-2">
          <p className="mb-1 text-muted/55">Home key player</p>
          <div className="flex items-center gap-2 min-w-0">
            <PlayerAvatar
              name={preview.homeKeyPlayer ?? 'Home'}
              imageUrl={preview.homeKeyPlayerAvatarUrl}
              tone="home"
              size="xs"
            />
            <p className="truncate text-text">{preview.homeKeyPlayer ?? '–'}</p>
          </div>
        </div>
        <div className="rounded-md border border-border/15 bg-surface/30 px-2.5 py-2">
          <p className="mb-1 text-muted/55">Away key player</p>
          <div className="flex items-center gap-2 min-w-0">
            <PlayerAvatar
              name={preview.awayKeyPlayer ?? 'Away'}
              imageUrl={preview.awayKeyPlayerAvatarUrl}
              tone="away"
              size="xs"
            />
            <p className="truncate text-text">{preview.awayKeyPlayer ?? '–'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
