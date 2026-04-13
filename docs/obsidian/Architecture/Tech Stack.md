---
tags: [architecture, tech-stack, cs2]
status: active
last_updated: 2026-04-07
---

# Tech Stack

---

## Framework & Runtime

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Next.js (App Router) | 16 |
| Runtime | React | 19 |
| Language | TypeScript | 5 |
| Node.js target | Vercel serverless | — |

All pages use `force-dynamic` — no static generation or ISR currently in use.

---

## Styling

| Tool | Version | Notes |
|------|---------|-------|
| Tailwind CSS | v4 | PostCSS-based, no `tailwind.config.js` needed |
| CSS Variables | — | All design tokens via `var(--color-*)` |
| Fonts | Fira Sans + Fira Code | Body + monospace |

### Design Tokens (CSS Variables)

| Variable | Role |
|----------|------|
| `--color-accent` | Blue — home team highlight |
| `--color-accent2` | Secondary — away team highlight |
| `--color-success` | Green — positive indicators, form |
| `--color-warning` | Yellow — caution, low confidence |
| `--color-danger` | Red — negative indicators, risk |
| `--color-text` | Primary text |
| `--color-muted` | Secondary/dimmed text |
| `--color-surface` | Card/panel backgrounds |
| `--color-bg` | Page background |
| `--color-border` | Borders and dividers |

### Shell Pattern

- `.atlas-shell` — main content container class
- `.atlas-topline` — decorative coloured top border on cards
- Grid background — CSS diagonal pattern used as page backdrop

---

## Charts & Visualization

| Library | Version | Used For |
|---------|---------|---------|
| Recharts | 2.15 | Radar charts, bar charts, area charts |
| Custom CSS bars | — | Head-to-head comparison bars (no library) |

---

## UI Primitives

| Library | Version | Used For |
|---------|---------|---------|
| shadcn/ui | latest | Badge, Card, Chart, Progress, Tooltip components |
| Radix UI | — | Progress (`@radix-ui/react-progress`), Tooltip (`@radix-ui/react-tooltip`), Slot |
| Lucide React | — | All icons |
| clsx | — | Conditional class names |
| class-variance-authority | — | Component variant definitions |
| tailwind-merge | — | Merge Tailwind classes without conflicts |

---

## External APIs

### Bedriftsligaen Paradise v2
- **Base:** `https://app.bedriftsligaen.no/api/paradise/v2`
- **Auth:** `Authorization: Bearer {BL_TOKEN}`
- **Env var:** `BL_TOKEN`
- See [[API Routes]] and [[Services#bl-api]] for full endpoint list

### Leetify Public API
- **Base:** `https://api-public.cs-prod.leetify.com`
- **Auth:** `Authorization: Bearer {LEETIFY_TOKEN}`
- **Env var:** `LEETIFY_TOKEN`
- **Rate limit:** ~5 req/min
- See [[Services#leetify-api]]

---

## Scoring Model

```ts
// Composite score (0–1 scale)
compositeScore(dpr, kast, od_rate, kd, hs) =
  0.30 * dpr/100 +
  0.25 * kast +
  0.20 * od_rate +
  0.15 * min(kd/2, 1.0) +
  0.10 * hs

// BL data trust weight (0–0.75)
blWeight(effectiveRounds) =
  min(effectiveRounds * 1.5 / (effectiveRounds * 1.5 + 150), 0.75)
```

Recency weights for match history:
| Period | Window | Weight |
|--------|--------|--------|
| Qual R1 | — | 0.5 |
| Qual R2 | — | 0.6 |
| Qual R3 | — | 0.7 |
| BL R1 | — | 0.7 |
| BL R2 | — | 1.0 |
| BL R3 | — | 1.5 |

---

## Environment Variables

| Variable | Purpose | Example |
|----------|---------|---------|
| `BL_TOKEN` | Bedriftsligaen API auth | `21\|ml9Doz...` |
| `LEETIFY_TOKEN` | Leetify API auth | `460fc840-...` |
| `COMPETITION_ID` | Current season ID | — |
| `DIVISION_ID` | Main division ID | — |
| `QUAL_DIVISION_ID` | Qualifier division ID (optional) | — |

---

## Project Structure

```
app/               # Next.js App Router (pages + API routes)
components/        # Shared UI components
  ui/              # shadcn/ui primitives
lib/               # Business logic and services
public/
  maps/            # Map imagery for pool analysis
```
