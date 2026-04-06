export type DivisionPreset = {
  id: number
  slug: string
  name: string
}

export const DIVISION_PRESETS: DivisionPreset[] = [
  {
    id: 1138,
    slug: 'bedriftsligaen-cs2-var-2026',
    name: 'Bedriftsligaen CS2 Vår 2026',
  },
]

export const DEFAULT_DIVISION = DIVISION_PRESETS[0]

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
}

export function findDivisionPreset(value: string | number | null | undefined): DivisionPreset | null {
  if (value == null) return null
  const raw = String(value).trim()
  if (!raw) return null

  const numeric = Number(raw)
  if (Number.isInteger(numeric) && numeric > 0) {
    const byId = DIVISION_PRESETS.find((entry) => entry.id === numeric)
    return byId ?? null
  }

  const normalized = normalize(raw)
  const bySlug = DIVISION_PRESETS.find((entry) => normalize(entry.slug) === normalized)
  if (bySlug) return bySlug

  const byName = DIVISION_PRESETS.find((entry) => normalize(entry.name) === normalized)
  if (byName) return byName

  return null
}

export function resolveDivisionReference(value: string | number | null | undefined): {
  id: number
  slug: string
  name: string
} | null {
  const preset = findDivisionPreset(value)
  if (preset) return preset

  if (value == null) return null
  const raw = String(value).trim()
  if (!raw) return null

  const numeric = Number(raw)
  if (!Number.isInteger(numeric) || numeric <= 0) return null

  return {
    id: numeric,
    slug: String(numeric),
    name: `Division ${numeric}`,
  }
}
