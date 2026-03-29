"""
aggregate_player_stats.py
--------------------------
Aggregerer per-spiller statistikk fra flere matchup JSON-filer
med rekency-vekting og Bayesiansk kombineringsstrategi.

Produserer en JSON-fil med sammensatt score + 90% konfidensintervall per spiller.

Bruk:
    python aggregate_player_stats.py \
        --matches data/raw/matchup_15810.json:bl_r1 \
                  data/raw/matchup_15817.json:bl_r2 \
                  data/raw/matchup_15831.json:bl_r3 \
        --filter-ids 18841,14695,1888,5439,15014,9924,11904 \
        --output data/processed/async_stats.json
"""

import json
import math
import argparse
import sys

# Rekency-vekter per kamp-type
WEIGHTS = {
    "qual_r1": 0.5,
    "qual_r2": 0.6,
    "qual_r3": 0.7,
    "bl_r1":   0.7,
    "bl_r2":   1.0,
    "bl_r3":   1.5,
    # Generisk fallback
    "default": 0.8,
}


def bl_weight(effective_rounds: float, context_mult: float = 1.5, prior_strength: float = 150) -> float:
    """
    Beregner BL-vekten for Bayesiansk kombinering.
    Capper på 75 % — alltid noe Leetify-prior.
    """
    if effective_rounds <= 0:
        return 0.0
    return min(
        effective_rounds * context_mult / (effective_rounds * context_mult + prior_strength),
        0.75
    )


def composite_score(dpr: float, kast: float, od_rate: float, kd: float, hs: float) -> float:
    """Beregner sammensatt score på 0–1 skala (gang med 10 for 0–10)."""
    return (
        0.30 * dpr / 100 +
        0.25 * kast +
        0.20 * od_rate +
        0.15 * min(kd / 2, 1.0) +
        0.10 * hs
    )


def ci_90(kast: float, od_rate: float, dpr: float, kd: float, raw_rounds: int, od_count: float) -> float:
    """Approksimert 90% konfidensintervall for sammensatt score (0–10 skala)."""
    z = 1.645
    n = max(raw_rounds, 1)

    kast_se = math.sqrt(kast * (1 - kast) / n)
    kd_se = 0.15 / math.sqrt(max(n / 20, 1))
    dpr_se = 15.0 / math.sqrt(n)
    od_se = math.sqrt(od_rate * (1 - od_rate) / max(od_count, 1))

    composite_se = math.sqrt(
        (0.30 / 100) ** 2 * dpr_se ** 2 +
        0.25 ** 2 * kast_se ** 2 +
        0.20 ** 2 * od_se ** 2 +
        (0.15 / 2) ** 2 * kd_se ** 2
    )
    return round(z * composite_se * 10, 2)


def aggregate(match_specs: list[tuple[str, str]], filter_ids: set[int] | None = None) -> dict:
    """
    Aggregerer stats fra liste av (filepath, match_type) par.
    Returnerer dict: player_name -> aggregert statistikk
    """
    players: dict[str, dict] = {}

    for filepath, match_type in match_specs:
        weight = WEIGHTS.get(match_type, WEIGHTS["default"])
        try:
            with open(filepath, encoding="utf-8") as f:
                data = json.load(f)
        except (FileNotFoundError, json.JSONDecodeError) as e:
            print(f"  [hopper over] {filepath}: {e}", file=sys.stderr)
            continue

        for p in data:
            uid = p.get("paradise_user_id", 0)
            if filter_ids and uid not in filter_ids:
                continue

            name = p.get("player_name", "")
            rp = p.get("rounds_played", 0)
            if rp == 0:
                continue

            if name not in players:
                players[name] = {
                    "id": uid, "name": name, "matches": [],
                    "w_rounds": 0.0,
                    "w_kills": 0.0, "w_deaths": 0.0,
                    "w_damage": 0.0, "w_kast": 0.0,
                    "w_hs": 0.0,
                    "w_od_won": 0.0, "w_od_total": 0.0,
                    "w_firstkills": 0.0,
                    "raw_rounds": 0, "raw_kills": 0, "raw_deaths": 0,
                }

            d = players[name]
            d["matches"].append(match_type)
            d["raw_rounds"] += rp
            d["raw_kills"] += p.get("kills", 0)
            d["raw_deaths"] += p.get("deaths", 0)

            d["w_rounds"] += weight * rp
            d["w_kills"] += weight * p.get("kills", 0)
            d["w_deaths"] += weight * p.get("deaths", 0)
            d["w_damage"] += weight * float(p.get("damage_per_round") or 0) * rp
            d["w_kast"] += weight * float(p.get("kast_ratio") or 0) * rp
            d["w_hs"] += weight * float(p.get("headshot_ratio") or 0) * rp
            od_won = p.get("opening_duels_won") or 0
            od_lost = p.get("opening_duels_lost") or 0
            d["w_od_won"] += weight * od_won
            d["w_od_total"] += weight * (od_won + od_lost)
            d["w_firstkills"] += weight * (p.get("firstkills") or 0)

    results = {}
    for name, d in players.items():
        wr = d["w_rounds"]
        if wr == 0:
            continue

        kd = d["w_kills"] / d["w_deaths"] if d["w_deaths"] > 0 else d["w_kills"]
        dpr = d["w_damage"] / wr
        kast = d["w_kast"] / wr
        hs = d["w_hs"] / wr
        od_rate = d["w_od_won"] / d["w_od_total"] if d["w_od_total"] > 0 else 0.0
        od_count = d["w_od_total"] / max(wr / 20, 1)

        score_raw = composite_score(dpr, kast, od_rate, kd, hs)
        ci = ci_90(kast, od_rate, dpr, kd, d["raw_rounds"], od_count)
        w_bl = bl_weight(wr)

        results[name] = {
            "id": d["id"],
            "name": name,
            "matches": list(dict.fromkeys(d["matches"])),
            "raw_rounds": d["raw_rounds"],
            "effective_rounds": round(wr, 1),
            "bl_weight": round(w_bl, 3),
            "kd": round(kd, 3),
            "dpr": round(dpr, 1),
            "kast": round(kast, 4),
            "hs": round(hs, 4),
            "od_rate": round(od_rate, 4),
            "composite_raw": round(score_raw, 4),
            "composite_10": round(score_raw * 10, 2),
            "ci_90": ci,
        }

    return dict(sorted(results.items(), key=lambda x: -x[1]["composite_10"]))


def main():
    parser = argparse.ArgumentParser(description="Aggreger spillerstatistikk fra BL matchup-filer")
    parser.add_argument(
        "--matches", nargs="+", required=True,
        metavar="FILEPATH:TYPE",
        help="Matchup-filer med type (f.eks. data/raw/matchup_15810.json:bl_r1)",
    )
    parser.add_argument("--filter-ids", default=None, help="Komma-separerte paradise_user_id-er å inkludere")
    parser.add_argument("--output", default="-", help="Output JSON-fil (- for stdout)")
    args = parser.parse_args()

    match_specs = []
    for spec in args.matches:
        if ":" not in spec:
            print(f"Ugyldig format '{spec}' — forventet FILEPATH:TYPE", file=sys.stderr)
            sys.exit(1)
        filepath, match_type = spec.rsplit(":", 1)
        match_specs.append((filepath, match_type))

    filter_ids = None
    if args.filter_ids:
        filter_ids = {int(x.strip()) for x in args.filter_ids.split(",")}

    results = aggregate(match_specs, filter_ids)

    output = json.dumps(results, indent=2, ensure_ascii=False)
    if args.output == "-":
        print(output)
    else:
        import os
        os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output)
        print(f"Lagret {len(results)} spillere til {args.output}")


if __name__ == "__main__":
    main()
