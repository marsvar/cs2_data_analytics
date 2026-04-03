import type { PlayerAnalysis } from './types'

export type Role = 'ENTRY' | 'AWP' | 'SUPP' | 'FRAG' | 'ANCH'

export function detectRole(p: PlayerAnalysis): Role | null {
  const firstkillRate = p.rounds > 0 ? (p.bl_extended?.firstkills ?? 0) / p.rounds : 0
  const tradedDeathsPerRound = p.rounds > 0 ? (p.bl_extended?.traded_deaths ?? 0) / p.rounds : 0
  const tradeKillsPerRound = p.rounds > 0 ? (p.bl_extended?.trade_kills ?? 0) / p.rounds : 0
  const survival = p.bl_extended?.survival_ratio ?? null

  // Entry fragger: commits to opening duels, doesn't always survive
  if ((p.od_rate > 0.52 || firstkillRate > 0.09) && (p.kast < 0.72 || tradedDeathsPerRound > 0.08)) return 'ENTRY'
  // AWPer: high headshot rate + high damage (one-shot kills skew HS up)
  if (p.hs > 0.55 && p.dpr > 80) return 'AWP'
  // Support: high KAST (assists, survives) but not top fragger
  if ((p.kast > 0.75 || (survival != null && survival > 0.36)) && tradeKillsPerRound > 0.08 && p.kd < 1.15) return 'SUPP'
  // Fragger: consistent kills without being the entry
  if (p.kd > 1.2 && p.kast > 0.65 && p.od_rate < 0.52) return 'FRAG'
  // Anchor: CT specialist — only detectable with Leetify side-split data
  if (p.leetify && p.leetify.ct_od > 0.55 && p.leetify.t_od < 0.45 && (survival == null || survival > 0.34)) return 'ANCH'
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
