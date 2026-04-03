const LOCAL_MAP_IMAGES: Record<string, string> = {
  de_ancient: '/maps/de_ancient.jpg',
  de_anubis: '/maps/de_anubis.jpg',
  de_dust2: '/maps/de_dust2.png',
  de_inferno: '/maps/de_inferno.png',
  de_mirage: '/maps/de_mirage.png',
  de_nuke: '/maps/de_nuke.jpeg',
  de_overpass: '/maps/de_overpass.png',
  de_train: '/maps/de_train.png',
  de_vertigo: '/maps/de_vertigo.jpg',
}

const MAP_IMAGE_PRESENTATION: Record<string, { objectPosition?: string; scale?: number }> = {
  de_dust2: { objectPosition: '58% 48%', scale: 1.16 },
  de_nuke: { objectPosition: '60% 46%', scale: 1.18 },
}

const MAP_ALIASES: Record<string, string> = {
  ancient: 'de_ancient',
  anubis: 'de_anubis',
  dust2: 'de_dust2',
  dustii: 'de_dust2',
  inferno: 'de_inferno',
  mirage: 'de_mirage',
  nuke: 'de_nuke',
  overpass: 'de_overpass',
  train: 'de_train',
  vertigo: 'de_vertigo',
}

function normalizeMapKey(raw?: string): string | null {
  if (!raw) return null
  const value = raw.trim().toLowerCase()
  if (!value) return null

  if (/^de_[a-z0-9]+$/.test(value)) return value

  const compact = value
    .replace(/^de_/, '')
    .replace(/[^a-z0-9]/g, '')

  return MAP_ALIASES[compact] ?? null
}

export function localMapImageForName(name?: string): string | undefined {
  const key = normalizeMapKey(name)
  if (!key) return undefined
  return LOCAL_MAP_IMAGES[key]
}

export function localMapImagePresentationForName(name?: string): {
  objectPosition?: string
  scale?: number
} | undefined {
  const key = normalizeMapKey(name)
  if (!key) return undefined
  return MAP_IMAGE_PRESENTATION[key]
}
