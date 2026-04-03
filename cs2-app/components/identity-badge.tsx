'use client'

import { useMemo, useState } from 'react'
import { proxiedBlImageUrl } from '@/lib/bl-image-url'

type IdentityTone = 'neutral' | 'home' | 'away'
type AvatarSize = 'xs' | 'sm' | 'md'
type LogoSize = 'sm' | 'md' | 'lg'

function cx(...classes: Array<string | undefined | false>): string {
  return classes.filter(Boolean).join(' ')
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean).slice(0, 2)
  if (parts.length === 0) return '?'
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('')
}

function toneClasses(tone: IdentityTone): string {
  if (tone === 'home') return 'border-accent/40 text-accent bg-accent/10'
  if (tone === 'away') return 'border-accent2/40 text-accent2 bg-accent2/10'
  return 'border-border/45 text-muted bg-surface2/55'
}

// Explicit px values used for both the size class and inline style to guarantee sizing
// regardless of Tailwind class generation/purging in flex/grid contexts.
const AVATAR_SIZES: Record<AvatarSize, { px: number; textCls: string }> = {
  xs: { px: 18, textCls: 'text-[9px]' },
  sm: { px: 22, textCls: 'text-[10px]' },
  md: { px: 28, textCls: 'text-[11px]' },
}

const LOGO_SIZES: Record<LogoSize, { px: number; textCls: string }> = {
  sm: { px: 24, textCls: 'text-[9px]' },
  md: { px: 28, textCls: 'text-[10px]' },
  lg: { px: 34, textCls: 'text-[11px]' },
}

// ── PlayerAvatar ───────────────────────────────────────────────────────────────
// Circular — correct for player profile photos

export function PlayerAvatar({
  name,
  imageUrl,
  tone = 'neutral',
  size = 'xs',
  className,
}: {
  name: string
  imageUrl?: string
  tone?: IdentityTone
  size?: AvatarSize
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const src = useMemo(
    () => (failed ? undefined : proxiedBlImageUrl(imageUrl)),
    [failed, imageUrl],
  )
  const { px, textCls } = AVATAR_SIZES[size]
  const inlineSize = { width: `${px}px`, height: `${px}px`, minWidth: `${px}px` }

  if (!src) {
    return (
      <span
        className={cx(
          toneClasses(tone),
          'shrink-0 overflow-hidden rounded-full border font-mono flex items-center justify-center select-none',
          textCls,
          className,
        )}
        style={inlineSize}
        aria-hidden="true"
      >
        {initials(name)}
      </span>
    )
  }

  return (
    <img
      src={src}
      alt={`${name} avatar`}
      width={px}
      height={px}
      className={cx(
        'shrink-0 rounded-full border border-border/45 object-cover bg-surface',
        className,
      )}
      style={inlineSize}
      onError={() => setFailed(true)}
      loading="lazy"
      decoding="async"
    />
  )
}

// ── TeamLogo ──────────────────────────────────────────────────────────────────
// Slightly rounded square — team logos are NOT circular; object-contain preserves
// full logo, transparent-background logos get a subtle dark surface fill.
// No visible border on the wrapper — logos stand on their own.

export function TeamLogo({
  name,
  logoUrl,
  tone = 'neutral',
  size = 'sm',
  className,
}: {
  name: string
  logoUrl?: string
  tone?: IdentityTone
  size?: LogoSize
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const src = useMemo(
    () => (failed ? undefined : proxiedBlImageUrl(logoUrl)),
    [failed, logoUrl],
  )
  const { px, textCls } = LOGO_SIZES[size]
  const inlineSize = { width: `${px}px`, height: `${px}px`, minWidth: `${px}px` }

  if (!src) {
    return (
      <span
        className={cx(
          toneClasses(tone),
          'shrink-0 overflow-hidden rounded-md border font-mono flex items-center justify-center select-none',
          textCls,
          className,
        )}
        style={inlineSize}
        aria-hidden="true"
      >
        {initials(name)}
      </span>
    )
  }

  return (
    <span
      className={cx(
        'shrink-0 overflow-hidden rounded-md bg-surface2/40 flex items-center justify-center',
        className,
      )}
      style={inlineSize}
    >
      <img
        src={src}
        alt={`${name} logo`}
        width={px}
        height={px}
        className="size-full object-contain p-[1px]"
        onError={() => setFailed(true)}
        loading="lazy"
        decoding="async"
      />
    </span>
  )
}
