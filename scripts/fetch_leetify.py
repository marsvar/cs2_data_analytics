"""
fetch_leetify.py
----------------
Henter Leetify-profiler for spillere og lagrer til JSON.
Respekterer rate-limit med konfigurerbar forsinkelse.

Bruk:
    python fetch_leetify.py \
        --steam-ids 76561198005571808 76561197985807777 \
        --outdir ./data/leetify

Miljøvariabler:
    LEETIFY_TOKEN   — Leetify API Bearer token
"""

import os
import json
import time
import argparse
import urllib.request
import urllib.error
import sys

LEETIFY_BASE = "https://api-public.cs-prod.leetify.com"


def leetify_get_profile(steam64_id: str, token: str) -> dict:
    url = f"{LEETIFY_BASE}/api/profile/steam/{steam64_id}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


def extract_relevant(data: dict) -> dict:
    """Trekker ut de relevante feltene fra Leetify-profil."""
    rating = data.get("rating") or {}
    stats = data.get("stats") or {}
    ranks = data.get("ranks") or {}

    return {
        "name": data.get("name"),
        "steam64_id": data.get("steam64_id"),
        "privacy_mode": data.get("privacy_mode"),
        "total_matches": data.get("total_matches"),
        "winrate": data.get("winrate"),
        "ranks": {
            "leetify": ranks.get("leetify"),
            "premier": ranks.get("premier"),
            "faceit_elo": ranks.get("faceit_elo"),
        },
        "rating": {
            "aim": rating.get("aim"),
            "positioning": rating.get("positioning"),
            "utility": rating.get("utility"),
            "clutch": rating.get("clutch"),
            "opening": rating.get("opening"),
        },
        "stats": {
            # CT/T split — nøkkeldata for taktisk analyse
            "ct_opening_duel_success_percentage": stats.get("ct_opening_duel_success_percentage"),
            "t_opening_duel_success_percentage": stats.get("t_opening_duel_success_percentage"),
            "ct_opening_aggression_success_rate": stats.get("ct_opening_aggression_success_rate"),
            "t_opening_aggression_success_rate": stats.get("t_opening_aggression_success_rate"),
            # Aim
            "accuracy_head": stats.get("accuracy_head"),
            "accuracy_enemy_spotted": stats.get("accuracy_enemy_spotted"),
            "reaction_time_ms": stats.get("reaction_time_ms"),
            "spray_accuracy": stats.get("spray_accuracy"),
            # Utility
            "flashbang_leading_to_kill": stats.get("flashbang_leading_to_kill"),
            "he_foes_damage_avg": stats.get("he_foes_damage_avg"),
        },
    }


def main():
    parser = argparse.ArgumentParser(description="Hent Leetify-profiler")
    parser.add_argument("--steam-ids", nargs="+", required=True, help="Steam64-IDer")
    parser.add_argument("--outdir", default="./data/leetify", help="Output-mappe")
    parser.add_argument("--delay", type=float, default=3.0, help="Sekunder mellom kall (rate limit)")
    parser.add_argument("--full", action="store_true", help="Lagre full profil (ikke bare relevante felt)")
    args = parser.parse_args()

    token = os.environ.get("LEETIFY_TOKEN")
    if not token:
        raise ValueError("Sett LEETIFY_TOKEN miljøvariabel")

    os.makedirs(args.outdir, exist_ok=True)

    for i, steam_id in enumerate(args.steam_ids):
        outfile = os.path.join(args.outdir, f"{steam_id}.json")

        if os.path.exists(outfile):
            print(f"  {steam_id} — cachet, hopper over")
            continue

        print(f"  [{i+1}/{len(args.steam_ids)}] {steam_id} — henter...", end=" ", flush=True)
        try:
            data = leetify_get_profile(steam_id, token)

            if "error" in data:
                print(f"FEIL: {data['error']}")
                continue

            to_save = data if args.full else extract_relevant(data)
            with open(outfile, "w", encoding="utf-8") as f:
                json.dump(to_save, f, indent=2, ensure_ascii=False)

            name = data.get("name", "ukjent")
            aim = (data.get("rating") or {}).get("aim", 0)
            print(f"OK ({name}, aim={aim:.1f})")

        except urllib.error.HTTPError as e:
            print(f"HTTP {e.code}")
        except Exception as e:
            print(f"FEIL: {e}", file=sys.stderr)

        if i < len(args.steam_ids) - 1:
            time.sleep(args.delay)

    print("Ferdig.")


if __name__ == "__main__":
    main()
