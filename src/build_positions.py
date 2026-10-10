"""Estimate positions on the main voting dimension and the agreement gaps.

The scaling is the first left singular vector of the column centred vote matrix,
with yes coded 1, abstain 0.5 and no 0. Scores carry unit standard deviation and
are signed so that the United States is positive. Intervals come from resampling
roll calls with replacement.
"""

import csv
import json
import os

import numpy as np
import pandas as pd
import pyreadr

import common

YEAR_REPLICATIONS = 200
PERIOD_REPLICATIONS = 300
GAP_REPLICATIONS = 2000
PERIODS = [(1962, 1975), (1976, 1991), (1992, 2005), (2006, 2019)]

generator = np.random.default_rng(20260901)


def load_matrix():
    votes = pyreadr.read_r(os.path.join(common.RAW, "un_votes.rda"))["un_votes"]
    calls = pyreadr.read_r(os.path.join(common.RAW, "un_roll_calls.rda"))["un_roll_calls"]
    calls["rcid"] = calls["rcid"].astype(int)
    votes["rcid"] = votes["rcid"].astype(int)
    calls["date"] = pd.to_datetime(calls["date"])
    calls["year"] = calls["date"].dt.year
    calls = calls[calls["year"] >= common.FIRST_YEAR]
    calls["important"] = calls["importantvote"].astype(str) == "1"
    votes["score"] = votes["vote"].astype(str).map({"yes": 1.0, "abstain": 0.5, "no": 0.0})
    votes = votes.dropna(subset=["score"])
    votes = votes[votes.rcid.isin(set(calls.rcid))]
    matrix = votes.pivot_table(index="country_code", columns="rcid", values="score", aggfunc="first")
    meta = calls.set_index("rcid")
    return matrix, meta


def contested(matrix, columns):
    kept = []
    for column in columns:
        ballots = matrix[column].dropna()
        if len(ballots) < 40:
            continue
        yes = (ballots > 0.75).sum()
        no = (ballots < 0.25).sum()
        if min(yes, no) >= max(5, 0.05 * len(ballots)):
            kept.append(column)
    return kept


def solve(frame, columns):
    block = frame[columns].to_numpy(dtype=float)
    means = np.nanmean(block, axis=0)
    block = np.where(np.isnan(block), means, block) - means
    left, values, _ = np.linalg.svd(block, full_matrices=False)
    scores = left[:, 0] * values[0]
    scores = scores / np.std(scores)
    names = list(frame.index)
    if "US" in names and scores[names.index("US")] < 0:
        scores = -scores
    return pd.Series(scores, index=frame.index)


def estimate(matrix, columns, replications):
    columns = contested(matrix, columns)
    if len(columns) < 8:
        return None
    frame = matrix[columns]
    frame = frame[frame.notna().mean(axis=1) >= 0.5]
    if frame.shape[0] < 40:
        return None
    base = solve(frame, columns)
    distances = []
    for _ in range(replications):
        sample = list(generator.choice(columns, size=len(columns), replace=True))
        try:
            replicate = solve(frame, sample)
        except np.linalg.LinAlgError:
            continue
        if np.corrcoef(replicate.fillna(0), base.fillna(0))[0, 1] < 0:
            replicate = -replicate
        if "MA" in replicate.index and "DZ" in replicate.index:
            distances.append(float(replicate["MA"] - replicate["DZ"]))
    result = {"k": len(columns), "states": int(frame.shape[0])}
    for code in common.TRACKED:
        result[code] = round(float(base[code]), 3) if code in base.index else None
    result["chamber"] = {
        "c": list(base.index),
        "s": [round(float(value), 2) for value in base.tolist()],
    }
    if len(distances) > 50:
        result["diff"] = round(float(base["MA"] - base["DZ"]), 3)
        result["diff_lo"] = round(float(np.percentile(distances, 2.5)), 3)
        result["diff_hi"] = round(float(np.percentile(distances, 97.5)), 3)
    return result


def gap_interval(matrix, meta, reference, first_year, last_year, important_only):
    rows = []
    for column in matrix.columns:
        year = meta["year"].get(column)
        if year is None or year < first_year or year > last_year:
            continue
        if important_only and not bool(meta["important"].get(column)):
            continue
        if reference not in matrix.index:
            continue
        first = matrix.at["MA", column]
        second = matrix.at["DZ", column]
        anchor = matrix.at[reference, column]
        if pd.isna(first) or pd.isna(second) or pd.isna(anchor):
            continue
        rows.append((weight(first, anchor), weight(second, anchor)))
    if len(rows) < 20:
        return None
    block = np.array(rows)
    point = 100 * (block[:, 0].mean() - block[:, 1].mean())
    draws = []
    for _ in range(GAP_REPLICATIONS):
        sample = block[generator.integers(0, len(block), len(block))]
        draws.append(100 * (sample[:, 0].mean() - sample[:, 1].mean()))
    return {
        "n": len(block),
        "gap": round(float(point), 2),
        "lo": round(float(np.percentile(draws, 2.5)), 2),
        "hi": round(float(np.percentile(draws, 97.5)), 2),
        "ma": round(float(100 * block[:, 0].mean()), 1),
        "dz": round(float(100 * block[:, 1].mean()), 1),
    }


def weight(first, second):
    ballots = {1.0: 1, 0.5: 2, 0.0: 3}
    return common.DOUBLED_WEIGHT[(ballots[first], ballots[second])] / 2


def main():
    common.ensure_directories()
    matrix, meta = load_matrix()
    years = sorted(set(int(year) for year in meta["year"].dropna().unique()))

    series = []
    chamber = {}
    for year in years:
        columns = [column for column in matrix.columns if meta["year"].get(column) == year]
        if len(columns) < 10:
            continue
        result = estimate(matrix, columns, YEAR_REPLICATIONS)
        if result is None:
            continue
        chamber[str(year)] = result.pop("chamber")
        result["year"] = year
        series.append(result)

    periods = []
    for first_year, last_year in PERIODS:
        columns = []
        for column in matrix.columns:
            year = meta["year"].get(column)
            if year is not None and first_year <= year <= last_year:
                columns.append(column)
        result = estimate(matrix, columns, PERIOD_REPLICATIONS)
        if result is None:
            continue
        result.pop("chamber")
        result["era"] = str(first_year) + "-" + str(last_year)
        periods.append(result)

    gaps = {}
    for reference in common.REFERENCE_STATES:
        gaps[reference + "_all"] = gap_interval(matrix, meta, reference, 2000, 2019, False)
        gaps[reference + "_imp"] = gap_interval(matrix, meta, reference, 2000, 2019, True)

    names = {}
    pairs = pyreadr.read_r(os.path.join(common.RAW, "un_votes.rda"))["un_votes"]
    pairs = pairs[["country_code", "country"]].drop_duplicates().dropna()
    for code, name in pairs.values:
        names[code] = name

    payload = {"scaling": series, "eras": periods, "gaps": gaps, "chamber": chamber, "names": names}
    with open(os.path.join(common.BUILD, "positions.json"), "w") as handle:
        json.dump(payload, handle, separators=(",", ":"))

    path = os.path.join(common.PROCESSED, "positions_by_year.csv")
    with open(path, "w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["year", "morocco", "algeria", "united_states", "distance", "distance_low", "distance_high", "contested_roll_calls", "states"])
        for row in series:
            writer.writerow([row["year"], row.get("MA", ""), row.get("DZ", ""), row.get("US", ""), row.get("diff", ""), row.get("diff_lo", ""), row.get("diff_hi", ""), row["k"], row["states"]])

    path = os.path.join(common.PROCESSED, "positions_by_period.csv")
    with open(path, "w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["period", "morocco", "algeria", "distance", "distance_low", "distance_high", "contested_roll_calls"])
        for row in periods:
            writer.writerow([row["era"], row["MA"], row["DZ"], row["diff"], row["diff_lo"], row["diff_hi"], row["k"]])

    path = os.path.join(common.PROCESSED, "agreement_gaps.csv")
    with open(path, "w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["capital", "sample", "morocco", "algeria", "gap", "ci_low", "ci_high", "shared_roll_calls"])
        for key, value in gaps.items():
            if value is None:
                continue
            reference, sample = key.split("_")
            label = "important" if sample == "imp" else "all"
            writer.writerow([common.STATE_NAMES[reference], label, value["ma"], value["dz"], value["gap"], value["lo"], value["hi"], value["n"]])

    print("years", len(series), "periods", len(periods))
    for row in periods:
        print(row["era"], row["MA"], row["DZ"], row.get("diff"), row.get("diff_lo"), row.get("diff_hi"), row["k"])
    print("US important", gaps["US_imp"])


if __name__ == "__main__":
    main()
