'use client'

import { useState } from 'react'
import { PlayerAvatar } from '@/components/identity-badge'
import type { AnalyzeResponse, PlayerAnalysis, PlayerMapContribution } from '@/lib/types'
import { localMapImageForName, localMapImagePresentationForName } from '@/lib/map-images'

type MapPool = NonNullable<AnalyzeResponse['landing']>['map_pool']
type MapInsight = NonNullable<MapPool>['home']['maps'][number]

function formatMapName(map: string): string {
  const normalized = map.replace(/^de_/, '')
  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

function displayRecord(map: MapInsight): { wins: number; losses: number } {
  const runtimeMap = map as MapInsight & { wins?: number; losses?: number }
  if (
    typeof runtimeMap.wins === 'number' &&
    Number.isFinite(runtimeMap.wins) &&
    typeof runtimeMap.losses === 'number' &&
    Number.isFinite(runtimeMap.losses)
  ) {
    return {
      wins: runtimeMap.wins,
      losses: runtimeMap.losses,
    }
  }

  const wins = Math.max(0, Math.min(map.sample_size, Math.round(map.win_rate * map.sample_size)))
  return {
    wins,
    losses: Math.max(map.sample_size - wins, 0),
  }
}

function playerFormTone(rate: number): {
  bucket: 'good' | 'neutral' | 'bad'
  avatarClass: string
  label: string
} {
  if (rate >= 0.6) {
    return {
      bucket: 'good',
      avatarClass: 'ring-2 ring-success/75 shadow-[0_0_0_3px_rgba(79,202,122,0.14)]',
      label: 'Strong',
    }
  }
  if (rate >= 0.45) {
    return {
      bucket: 'neutral',
      avatarClass: 'ring-2 ring-warning/75 shadow-[0_0_0_3px_rgba(247,200,79,0.14)]',
      label: 'Average',
    }
  }
  return {
    bucket: 'bad',
    avatarClass: 'ring-2 ring-danger/75 shadow-[0_0_0_3px_rgba(247,95,95,0.14)]',
    label: 'Weak',
  }
}

function BucketIcon({ bucket }: { bucket: 'good' | 'neutral' | 'bad' }) {
  if (bucket === 'good') {
    return (
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="text-success shrink-0">
        <path d="M6.7 7.1L8.8 2.6c.2-.4.6-.6 1-.5.4.1.7.5.7.9v3.1h2.6c.8 0 1.3.8 1 1.5l-1.4 4.7c-.1.5-.6.8-1.1.8H6.7V7.1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M3 7.1h2.2v6H3z" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    )
  }
  if (bucket === 'bad') {
    return (
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true" className="text-danger shrink-0">
        <path d="M6.7 8.9L8.8 13.4c.2.4.6.6 1 .5.4-.1.7-.5.7-.9V9.9h2.6c.8 0 1.3-.8 1-1.5l-1.4-4.7c-.1-.5-.6-.8-1.1-.8H6.7v6Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M3 8.9h2.2v-6H3z" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    )
  }
  return <span className="font-mono text-[11px] leading-none text-warning shrink-0">-</span>
}

function BucketRow({
  bucket,
  label,
  players,
}: {
  bucket: 'good' | 'neutral' | 'bad'
  label: string
  players: Array<{ paradise_user_id: number; name: string; avatar_url?: string; avatarClass: string; tooltip: string }>
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex w-14 shrink-0 items-center gap-1">
        <BucketIcon bucket={bucket} />
        <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted/80">{label}</span>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {players.length === 0 ? (
          <span className="font-mono text-[9px] text-muted/45">Ingen</span>
        ) : (
          players.map((player) => (
            <div key={player.paradise_user_id} className="group relative" aria-label={player.tooltip}>
              <PlayerAvatar
                name={player.name}
                imageUrl={player.avatar_url}
                tone="neutral"
                size="xs"
                className={player.avatarClass}
              />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 hidden w-max max-w-44 -translate-x-1/2 rounded-md border border-border/60 bg-bg/95 px-2 py-1.5 text-center shadow-lg backdrop-blur-sm group-hover:block">
                <p className="font-mono text-[10px] text-text">{player.name}</p>
                <p className="font-mono text-[9px] text-muted/80">{player.tooltip}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ── Simplified per-player drill-down ──────────────────────────────────────────
// Shows player avatars with color-coded form instead of numeric percentages.

function PlayerMapDrilldown({
  mapName,
  playerMaps,
  playersById,
}: {
  mapName: string
  playerMaps: PlayerMapContribution[]
  playersById: Map<number, PlayerAnalysis>
}) {
  const relevant = playerMaps
    .map((p) => {
      const mapStat = p.maps.find((m) => m.map === mapName)
      const player = playersById.get(p.paradise_user_id)
      return {
        paradise_user_id: p.paradise_user_id,
        name: p.name,
        avatar_url: p.avatar_url ?? player?.avatar_url,
        included: p.included,
        mapStat,
      }
    })
    .filter((p) => p.included && p.mapStat != null)
    .sort((a, b) => {
      const aRate = a.mapStat!.total > 0 ? a.mapStat!.wins / a.mapStat!.total : 0
      const bRate = b.mapStat!.total > 0 ? b.mapStat!.wins / b.mapStat!.total : 0
      return bRate - aRate
    })
    .map((p) => {
      const winRate = p.mapStat!.total > 0 ? p.mapStat!.wins / p.mapStat!.total : 0
      const tone = playerFormTone(winRate)
      return {
        ...p,
        ...tone,
        tooltip: `${tone.label} · ${p.mapStat!.wins}/${p.mapStat!.total} wins på ${formatMapName(mapName)}`,
      }
    })

  if (relevant.length === 0) return null

  const groups = {
    good: relevant.filter((player) => player.bucket === 'good'),
    neutral: relevant.filter((player) => player.bucket === 'neutral'),
    bad: relevant.filter((player) => player.bucket === 'bad'),
  }

  return (
    <div className="mt-2 rounded border border-border/25 bg-surface2/20 px-3 py-2.5">
      <div className="space-y-2">
        <BucketRow bucket="good" label="Good" players={groups.good} />
        <BucketRow bucket="neutral" label="Average" players={groups.neutral} />
        <BucketRow bucket="bad" label="Weak" players={groups.bad} />
      </div>
    </div>
  )
}

// ── Map row (expandable) ───────────────────────────────────────────────────────

function MapRow({
  map,
  colorClass,
  expandedMap,
  onToggle,
  playerMaps,
  playersById,
}: {
  map: MapInsight
  colorClass: string
  expandedMap: string | null
  onToggle: (mapName: string) => void
  playerMaps?: PlayerMapContribution[]
  playersById: Map<number, PlayerAnalysis>
}) {
  const isExpanded = expandedMap === map.map
  const hasPlayerData = playerMaps != null && playerMaps.some(
    (p) => p.included && p.maps.some((m) => m.map === map.map),
  )
  const record = displayRecord(map)
  const mapImage = localMapImageForName(map.map)
  const imagePresentation = localMapImagePresentationForName(map.map)

  return (
    <div
      className={`min-w-0 rounded-lg border border-border/30 bg-surface2/15 transition-colors ${
        isExpanded ? 'relative z-10' : ''
      }`}
    >
      <button
        type="button"
        className="flex w-full min-w-0 items-center gap-0 text-left transition-colors group hover:bg-surface2/30"
        onClick={() => hasPlayerData && onToggle(map.map)}
        aria-expanded={isExpanded}
      >
        {/* Map thumbnail */}
        {mapImage ? (
          <div className="relative h-12 w-20 shrink-0 overflow-hidden">
            <img
              src={mapImage}
              alt={formatMapName(map.map)}
              className={`w-full h-full object-cover transition-opacity ${isExpanded ? 'opacity-100' : 'opacity-70 group-hover:opacity-90'}`}
              style={{
                objectPosition: imagePresentation?.objectPosition,
                transform: imagePresentation?.scale ? `scale(${imagePresentation.scale})` : undefined,
                transformOrigin: imagePresentation?.scale ? 'center center' : undefined,
              }}
            />
            <div className={`absolute inset-0 bg-gradient-to-t transition-opacity ${isExpanded ? 'from-bg/95 via-bg/55 to-bg/10' : 'from-bg/95 via-bg/30 to-transparent'}`} />
            <div className="absolute left-1 top-1">
              <span className="inline-flex max-w-full rounded-sm bg-bg/70 px-1 py-0.5 font-mono text-[8px] uppercase tracking-[0.14em] text-text/95 backdrop-blur-sm">
                {formatMapName(map.map)}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex h-12 w-20 shrink-0 items-center justify-center bg-surface2/40">
            <span className="font-mono text-[8px] text-muted/40">{formatMapName(map.map).slice(0, 2)}</span>
          </div>
        )}

        <div className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2">
          {hasPlayerData && (
            <svg
              width="7" height="7" viewBox="0 0 10 10" fill="none" aria-hidden="true"
              className="shrink-0 text-muted/30 transition-transform duration-150"
              style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
            >
              <path d="M3 2L7 5L3 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          <div className="flex-1" />
          <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
            <span className={`font-mono text-[10px] tabular-nums text-right font-medium ${colorClass}`}>
              {record.wins}W-{record.losses}L
            </span>
          </div>
        </div>
      </button>
      {hasPlayerData && isExpanded && (
        <div className="px-2.5 pb-2">
          <PlayerMapDrilldown
            mapName={map.map}
            playerMaps={playerMaps!}
            playersById={playersById}
          />
        </div>
      )}
    </div>
  )
}

// ── Main export ────────────────────────────────────────────────────────────────

export function MapPoolInsights({
  mapPool,
  homeName,
  awayName,
  homePlayerMaps,
  awayPlayerMaps,
  homePlayers,
  awayPlayers,
  className = '',
}: {
  mapPool?: MapPool
  homeName: string
  awayName: string
  homePlayerMaps?: PlayerMapContribution[]
  awayPlayerMaps?: PlayerMapContribution[]
  homePlayers: PlayerAnalysis[]
  awayPlayers: PlayerAnalysis[]
  className?: string
}) {
  const [expandedHome, setExpandedHome] = useState<string | null>(null)
  const [expandedAway, setExpandedAway] = useState<string | null>(null)
  const homePlayersById = new Map(homePlayers.map((player) => [player.paradise_user_id, player]))
  const awayPlayersById = new Map(awayPlayers.map((player) => [player.paradise_user_id, player]))

  const toggleHome = (m: string) => setExpandedHome((prev) => prev === m ? null : m)
  const toggleAway = (m: string) => setExpandedAway((prev) => prev === m ? null : m)

  return (
    <article className={`rounded-xl border border-border/45 bg-surface px-4 py-4 ${className}`}>
      <div className="flex items-start justify-between mb-4 gap-3">
        <div>
          <p className="font-display text-[10px] tracking-widest uppercase text-accent mb-0.5">Kartstyrker</p>
          <p className="font-mono text-[9px] text-muted/55">
            Basert på BL-kamphistorikk i offisielle kamper
          </p>
        </div>
        {mapPool && (
          <span className="font-mono text-[9px] text-muted/50 shrink-0 text-right">
            {mapPool.recent_days}d · BL-data
          </span>
        )}
      </div>

      {!mapPool && (
        <p className="font-mono text-[11px] text-muted">
          Not enough BL map data available for this match.
        </p>
      )}

      {mapPool && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {([
            {
              label: homeName || 'Home',
              pool: mapPool.home,
              accentLabel: 'text-accent',
              expandedMap: expandedHome,
              onToggle: toggleHome,
              playerMaps: homePlayerMaps,
              playersById: homePlayersById,
            },
            {
              label: awayName || 'Away',
              pool: mapPool.away,
              accentLabel: 'text-accent2',
              expandedMap: expandedAway,
              onToggle: toggleAway,
              playerMaps: awayPlayerMaps,
              playersById: awayPlayersById,
            },
          ] as const).map((entry) => {
            const strongest = [...entry.pool.maps].sort((a, b) => b.win_rate - a.win_rate).slice(0, 3)
            const weakest = [...entry.pool.maps].sort((a, b) => a.win_rate - b.win_rate).slice(0, 3)

            return (
              <section key={entry.label} className="min-w-0 rounded-lg border border-border/35 bg-surface2/20 p-3">
                <div className="flex items-center justify-between mb-3">
                  <p className={`font-mono text-xs font-medium ${entry.accentLabel}`}>{entry.label}</p>
                  <span className="font-mono text-[9px] text-muted/50">
                    {entry.pool.included_players} series with map data
                    {entry.pool.excluded_players > 0 && ` · ${entry.pool.excluded_players} without map data`}
                  </span>
                </div>

                {entry.pool.maps.length === 0 ? (
                  <p className="font-mono text-[11px] text-muted">No qualifying map observations.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                    <div className="min-w-0">
                      <p className="font-mono text-[9px] uppercase tracking-widest text-success/70 mb-2 flex items-center gap-1">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-success/60" />
                        Strongest
                      </p>
                      <div className="space-y-1.5">
                        {strongest.map((map) => (
                          <MapRow
                            key={`strong-${entry.label}-${map.map}`}
                            map={map}
                            colorClass="text-success"
                            expandedMap={entry.expandedMap}
                            onToggle={entry.onToggle}
                            playerMaps={entry.playerMaps}
                            playersById={entry.playersById}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="min-w-0">
                      <p className="font-mono text-[9px] uppercase tracking-widest text-danger/70 mb-2 flex items-center gap-1">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-danger/60" />
                        Weakest
                      </p>
                      <div className="space-y-1.5">
                        {weakest.map((map) => (
                          <MapRow
                            key={`weak-${entry.label}-${map.map}`}
                            map={map}
                            colorClass="text-danger"
                            expandedMap={entry.expandedMap}
                            onToggle={entry.onToggle}
                            playerMaps={entry.playerMaps}
                            playersById={entry.playersById}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )
          })}
        </div>
      )}
    </article>
  )
}

export function MapPoolDebugPanel({
  matchupId,
  mapPool,
  className = '',
}: {
  matchupId: number
  mapPool?: MapPool
  className?: string
}) {
  if (process.env.NODE_ENV === 'production') return null

  return (
    <details className={`rounded-lg border border-border/45 bg-surface px-3 py-2 ${className}`}>
      <summary className="cursor-pointer select-none font-mono text-[10px] uppercase tracking-widest text-muted">
        API-debug · landing.map_pool · matchup #{matchupId}
      </summary>
      <pre className="mt-2 max-h-64 overflow-auto rounded border border-border/35 bg-surface2/45 p-2 font-mono text-[10px] text-muted whitespace-pre-wrap break-words">
        {JSON.stringify(mapPool ?? null, null, 2)}
      </pre>
    </details>
  )
}
