"""
fetch_match_stats.py
--------------------
Henter matchup-statistikk fra Bedriftsligaen-APIet for en gitt divisjon
og lagrer rådata til JSON-filer.

Bruk:
    python fetch_match_stats.py --division 1138 --outdir ./data/raw

Miljøvariabler:
    BL_TOKEN   — Bedriftsligaen Bearer token
"""

import os
import json
import time
import argparse
import urllib.request
import urllib.error

BL_BASE = "https://app.bedriftsligaen.no/api/paradise/v2"


def bl_get(endpoint: str, token: str) -> dict | list:
    url = f"{BL_BASE}{endpoint}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


def get_division_matchups(division_id: int, token: str) -> list[dict]:
    """Returnerer alle matchups i en divisjon."""
    data = bl_get(f"/matchup?division_id={division_id}&limit=100", token)
    return data.get("data", data) if isinstance(data, dict) else data


def get_matchup_stats(matchup_id: int, token: str) -> list[dict]:
    """Returnerer per-spiller statistikk for én kamp."""
    return bl_get(f"/matchup/{matchup_id}/stats", token)


def find_team_matchups(division_id: int, team_id: int, token: str) -> list[dict]:
    """Finner alle matchups der et gitt lag deltar."""
    matchups = get_division_matchups(division_id, token)
    team_matchups = []
    for m in matchups:
        signups = m.get("signups", [])
        team_ids = [s.get("team", {}).get("id") for s in signups]
        if team_id in team_ids:
            team_matchups.append(m)
    return team_matchups


def main():
    parser = argparse.ArgumentParser(description="Hent BL matchup-statistikk")
    parser.add_argument("--division", type=int, required=True, help="Division ID")
    parser.add_argument("--team", type=int, default=None, help="Filtrer på team ID (valgfritt)")
    parser.add_argument("--outdir", default="./data/raw", help="Mappe for JSON-output")
    parser.add_argument("--delay", type=float, default=1.0, help="Sekunder mellom API-kall")
    args = parser.parse_args()

    token = os.environ.get("BL_TOKEN")
    if not token:
        raise ValueError("Sett BL_TOKEN miljøvariabel")

    os.makedirs(args.outdir, exist_ok=True)

    print(f"Henter matchups fra divisjon {args.division}...")
    matchups = get_division_matchups(args.division, token)
    print(f"  Fant {len(matchups)} matchups")

    if args.team:
        matchups = [m for m in matchups
                    if args.team in [s.get("team", {}).get("id") for s in m.get("signups", [])]]
        print(f"  Filtrert til {len(matchups)} matchups for team {args.team}")

    for m in matchups:
        mid = m["id"]
        rnd = m.get("round_number", "?")
        finished = m.get("finished_at")

        if not finished:
            print(f"  Kamp {mid} (R{rnd}) — ikke spilt ennå, hopper over")
            continue

        outfile = os.path.join(args.outdir, f"matchup_{mid}.json")
        if os.path.exists(outfile):
            print(f"  Kamp {mid} (R{rnd}) — cachet, hopper over")
            continue

        print(f"  Kamp {mid} (R{rnd}) — henter stats...", end=" ")
        try:
            stats = get_matchup_stats(mid, token)
            with open(outfile, "w", encoding="utf-8") as f:
                json.dump(stats, f, indent=2, ensure_ascii=False)
            print(f"OK ({len(stats)} spillere)")
        except urllib.error.HTTPError as e:
            print(f"FEIL {e.code}")
        time.sleep(args.delay)

    print("Ferdig.")


if __name__ == "__main__":
    main()
