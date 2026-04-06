'use client'

import { useEffect, useState } from 'react'
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
        <div className="mb-3 h-6 rounded bg-surface" />
        <div className="mb-2 flex gap-2">
          <div className="h-6 w-24 rounded bg-surface" />
          <div className="h-6 w-24 rounded bg-surface" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="h-9 rounded bg-surface" />
          <div className="h-9 rounded bg-surface" />
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
        <span className="font-mono text-[9px] text-muted/55">pre-match snapshot</span>
      </div>

      <div className="mb-2">
        <div className="relative h-1.5 overflow-hidden rounded-full bg-surface">
          <div
            className="absolute inset-y-0 left-0 bg-accent"
            style={{ width: `${preview.homeWinPct}%` }}
          />
          <div className="absolute inset-y-0 left-1/2 w-px bg-border/80" />
        </div>
        <div className="mt-1.5 flex items-center justify-between font-mono text-[10px]">
          <span className="text-accent tabular-nums">{preview.homeWinPct}%</span>
          <span className="text-muted/45">win band</span>
          <span className="text-accent2 tabular-nums">{preview.awayWinPct}%</span>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap gap-2">
        {preview.bestMap && (
          <span className="font-mono text-[9px] uppercase tracking-widest rounded border border-accent/25 bg-accent/8 px-2 py-1 text-accent">
            Press: {preview.bestMap}
          </span>
        )}
        {preview.cautionMap && (
          <span className="font-mono text-[9px] uppercase tracking-widest rounded border border-warning/25 bg-warning/8 px-2 py-1 text-warning">
            Risk: {preview.cautionMap}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 font-mono text-[10px]">
        <div>
          <p className="mb-1 text-muted/55">Key home</p>
          <p className="truncate text-text">{preview.homeKeyPlayer ?? '–'}</p>
        </div>
        <div>
          <p className="mb-1 text-muted/55">Key away</p>
          <p className="truncate text-text">{preview.awayKeyPlayer ?? '–'}</p>
        </div>
      </div>
    </div>
  )
}
