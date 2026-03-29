"""
find_team_matches.py
--------------------
Finner alle matchup-IDer for et gitt lag i alle divisjoner
av en Bedriftsligaen-sesong, og skriver ut en vektings-konfig
klar til bruk med aggregate_player_stats.py.

Bruk:
    python find_team_matches.py --competition 1220 --team 21374

Miljøvariabler:
    BL_TOKEN
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


def get_divisions(competition_id: int, token: str) -> list[dict]:
    return bl_get(f"/competition/{competition_id}/divisions", token)


def get_matchups(division_id: int, token: str) -> list:
    data = bl_get(f"/matchup?division_id={division_id}&limit=100", token)
    return data.get("data", data) if isinstance(data, dict) else data


def team_in_matchup(matchup: dict, team_id: int) -> bool:
    for signup in matchup.get("signups", []):
        if signup.get("team", {}).get("id") == team_id:
            return True
    return False


def infer_weight_key(round_number: int, division_status: str) -> str:
    """Forsøker å utlede vekt-nøkkel basert på divisjonsstatus og rundenummer."""
    if division_status in ("finished", "ferdig"):
        return f"qual_r{round_number}"
    return f"bl_r{round_number}"


def main():
    parser = argparse.ArgumentParser(description="Finn alle matchups for et lag")
    parser.add_argument("--competition", type=int, required=True)
    parser.add_argument("--team", type=int, required=True)
    parser.add_argument("--delay", type=float, default=0.5)
    args = parser.parse_args()

    token = os.environ.get("BL_TOKEN")
    if not token:
        raise ValueError("Sett BL_TOKEN miljøvariabel")

    print(f"Søker etter team {args.team} i competition {args.competition}...\n")

    divisions = get_divisions(args.competition, token)
    time.sleep(args.delay)

    found_matchups = []

    for div in divisions:
        div_id = div["id"]
        div_name = div.get("name", "")
        div_status = div.get("status", "")

        matchups = get_matchups(div_id, token)
        time.sleep(args.delay)

        for m in matchups:
            if not team_in_matchup(m, args.team):
                continue
            if not m.get("finished_at"):
                continue

            rnd = m.get("round_number", 1)
            weight_key = infer_weight_key(rnd, div_status)
            opponent = next(
                (s.get("name", "?") for s in m.get("signups", [])
                 if s.get("team", {}).get("id") != args.team),
                "?"
            )
            home = m.get("home_score", 0)
            away = m.get("away_score", 0)

            found_matchups.append({
                "matchup_id": m["id"],
                "division_id": div_id,
                "division_name": div_name,
                "division_status": div_status,
                "round": rnd,
                "weight_key": weight_key,
                "opponent": opponent,
                "score": f"{home}–{away}",
                "finished_at": m.get("finished_at", ""),
            })

    if not found_matchups:
        print("Ingen kamper funnet.")
        return

    found_matchups.sort(key=lambda x: (x["division_id"], x["round"]))

    print(f"{'Matchup':>8}  {'Div':>5}  {'Rnd':>3}  {'Vekt':12}  {'Score':5}  Mot")
    print("-" * 70)
    for m in found_matchups:
        print(f"  {m['matchup_id']:>8}  {m['division_id']:>5}  R{m['round']:>2}  "
              f"{m['weight_key']:12}  {m['score']:5}  {m['opponent']}")

    print("\n# Klar til aggregate_player_stats.py:")
    print("python scripts/aggregate_player_stats.py \\")
    for i, m in enumerate(found_matchups):
        sep = " \\" if i < len(found_matchups) - 1 else ""
        print(f"    --matches data/raw/matchup_{m['matchup_id']}.json:{m['weight_key']}{sep}")


if __name__ == "__main__":
    main()
