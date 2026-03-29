/**
 * players.ts
 * ----------
 * Static mapping of known Bedriftsligaen paradise_user_id → Steam64 IDs.
 * Source: CLAUDE.md in the parent repository.
 */

// paradise_user_id → Steam64
export const STEAM_BY_USER_ID: Record<number, string> = {
  // aSync players
  1888:  '76561198258030105', // m4rc
  5439:  '76561198012553562', // FlyySoHigh
  15014: '76561197985807777', // Mindseth
  9924:  '76561198005571808', // m0rr0w
  // 18841: t0bben — no Steam64 in CLAUDE.md
  // 14695: Ev1   — no Steam64 in CLAUDE.md
  // 11904: MikaeliX — no Steam64 in CLAUDE.md

  // NAS players
  16542: '76561198167341329', // Hcon
  16879: '76561198993717949', // taghg
  15446: '76561197965657989', // vegg
  18793: '76561198050639756', // Walbern
  18797: '76561199495515753', // MuffinToks
  15450: '76561197965471361', // NUMERO ZINCO
  18786: '76561199004942491', // Flipz
  18967: '76561198379230401', // Satoo
}

/** Laserturken has no BL paradise_user_id — Leetify-only player. */
export const LASERTURKEN_STEAM = '76561198098169439'

/**
 * Look up the Steam64 ID for a paradise_user_id.
 * Returns undefined if not known.
 */
export function getSteam64(paradiseUserId: number): string | undefined {
  return STEAM_BY_USER_ID[paradiseUserId]
}

/**
 * All known Steam64 IDs (both teams + Laserturken).
 */
export function allKnownSteamIds(): string[] {
  return [...Object.values(STEAM_BY_USER_ID), LASERTURKEN_STEAM]
}
