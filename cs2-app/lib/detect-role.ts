import type { PlayerAnalysis } from './types'

export type Role = 'ENTRY' | 'AWP' | 'SUPP' | 'FRAG' | 'ANCH'

export function detectRole(p: PlayerAnalysis): Role | null {
  // Entry fragger: commits to opening duels, doesn't always survive
  if (p.od_rate > 0.52 && p.kast < 0.70) return 'ENTRY'
  // AWPer: high headshot rate + high damage (one-shot kills skew HS up)
  if (p.hs > 0.55 && p.dpr > 80) return 'AWP'
  // Support: high KAST (assists, survives) but not top fragger
  if (p.kast > 0.75 && p.kd < 1.1) return 'SUPP'
  // Fragger: consistent kills without being the entry
  if (p.kd > 1.2 && p.kast > 0.65 && p.od_rate < 0.52) return 'FRAG'
  // Anchor: CT specialist — only detectable with Leetify side-split data
  if (p.leetify && p.leetify.ct_od > 0.55 && p.leetify.t_od < 0.45) return 'ANCH'
  return null
}

export const ROLE_META: Record<
  Role,
  { label: string; desc: string; colorClass: string }
> = {
  ENTRY: { label: 'ENTRY', desc: 'Åpner runder, høy OD-rate', colorClass: 'text-accent2' },
  AWP:   { label: 'AWP',   desc: 'Høy presisjon, stor DPR',    colorClass: 'text-success' },
  SUPP:  { label: 'SUPP',  desc: 'Høy KAST, teamspiller',       colorClass: 'text-accent' },
  FRAG:  { label: 'FRAG',  desc: 'Konsistent draper',           colorClass: 'text-warning' },
  ANCH:  { label: 'ANCH',  desc: 'CT-spesialist',               colorClass: 'text-muted' },
}
