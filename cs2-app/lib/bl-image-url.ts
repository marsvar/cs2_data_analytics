const BL_WEB_BASE = 'https://app.bedriftsligaen.no'
const BL_ALLOWED_HOSTS = new Set(['app.bedriftsligaen.no', 'i.bo3.no'])

function toAbsoluteBlUrl(pathOrUrl: string): string | undefined {
  const value = pathOrUrl.trim()
  if (!value) return undefined

  if (value.startsWith('/')) {
    return `${BL_WEB_BASE}${value}`
  }

  try {
    const parsed = new URL(value)
    if (!BL_ALLOWED_HOSTS.has(parsed.hostname)) return undefined
    return parsed.toString()
  } catch {
    return undefined
  }
}

function normalizePath(pathname: string): string {
  // /b/image/ is a BL-internal path prefix that should be /image/ when fetched directly
  if (pathname.startsWith('/b/image/')) {
    return pathname.replace('/b/image/', '/image/')
  }
  return pathname
}

export function normalizeBlImageUrl(
  urlValue?: unknown,
  relativeValue?: unknown,
): string | undefined {
  const relative =
    typeof relativeValue === 'string' && relativeValue.trim().length > 0
      ? relativeValue.trim()
      : null

  if (relative) {
    const absolute = toAbsoluteBlUrl(relative)
    if (!absolute) return undefined
    const parsed = new URL(absolute)
    if (!BL_ALLOWED_HOSTS.has(parsed.hostname)) return undefined
    parsed.pathname = normalizePath(parsed.pathname)
    return parsed.toString()
  }

  const directUrl =
    typeof urlValue === 'string' && urlValue.trim().length > 0
      ? urlValue.trim()
      : null
  if (!directUrl) return undefined

  const absolute = toAbsoluteBlUrl(directUrl)
  if (!absolute) return undefined

  try {
    const parsed = new URL(absolute)
    if (!BL_ALLOWED_HOSTS.has(parsed.hostname)) return undefined
    parsed.pathname = normalizePath(parsed.pathname)
    return parsed.toString()
  } catch {
    return undefined
  }
}

export function isAllowedBlImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return BL_ALLOWED_HOSTS.has(parsed.hostname)
  } catch {
    return false
  }
}

export function proxiedBlImageUrl(url?: string): string | undefined {
  if (!url) return undefined
  const normalized = normalizeBlImageUrl(url)
  if (!normalized) return undefined
  return `/api/bl-image?url=${encodeURIComponent(normalized)}`
}
