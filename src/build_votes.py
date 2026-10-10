"""Build the roll call layer.

Reads the Voeten roll call file as packaged by the unvotes R package and writes
the agreement cells, the caucus defection counts, the opposed roll calls, the
Sahara tables and the ballot barcode.
"""

import collections
import csv
import json
import os

import pandas as pd
import pyreadr

import common


def read_sources():
    votes = pyreadr.read_r(os.path.join(common.RAW, "un_votes.rda"))["un_votes"]
    calls = pyreadr.read_r(os.path.join(common.RAW, "un_roll_calls.rda"))["un_roll_calls"]
    issues = pyreadr.read_r(os.path.join(common.RAW, "un_roll_call_issues.rda"))["un_roll_call_issues"]
    calls["rcid"] = calls["rcid"].astype(int)
    votes["rcid"] = votes["rcid"].astype(int)
    issues["rcid"] = issues["rcid"].astype(int)
    calls["date"] = pd.to_datetime(calls["date"])
    calls["year"] = calls["date"].dt.year
    calls = calls[calls["year"] >= common.FIRST_YEAR]
    calls["important"] = calls["importantvote"].astype(str) == "1"
    votes["ballot"] = votes["vote"].astype(str).map({"yes": 1, "abstain": 2, "no": 3})
    votes = votes.dropna(subset=["ballot"])
    votes["ballot"] = votes["ballot"].astype(int)
    votes = votes[votes.rcid.isin(set(calls.rcid))]
    return votes, calls, issues


def clean_title(row):
    text = row["short"]
    if not isinstance(text, str) or not text.strip():
        text = row["descr"] if isinstance(row["descr"], str) else ""
    text = " ".join(str(text).split())
    text = text.split(" : resolution")[0]
    return text[:130]


def build_cells(tracked_votes, issue_tags, years):
    year_index = {}
    for position, year in enumerate(years):
        year_index[year] = position
    width = 8 * len(common.PAIRS)
    cells = {}
    for subject in common.SUBJECTS:
        cells[subject] = []
        for _ in years:
            cells[subject].append([0] * width)
    for rcid, row in tracked_votes.iterrows():
        position = year_index[int(row["year"])]
        subjects = ["all"]
        for tag in issue_tags.get(rcid, set()):
            if tag in common.SUBJECTS:
                subjects.append(tag)
        if row["important"]:
            subjects.append("important")
        for pair_position, pair in enumerate(common.PAIRS):
            first_code, second_code = pair.split("-")
            first = row.get(first_code)
            second = row.get(second_code)
            if pd.isna(first) or pd.isna(second):
                continue
            first = int(first)
            second = int(second)
            offset = 8 * pair_position
            for subject in subjects:
                cell = cells[subject][position]
                cell[offset] += common.DOUBLED_WEIGHT[(first, second)]
                cell[offset + 1] += 1
                cell[offset + 1 + first] += 1
                cell[offset + 4 + second] += 1
    return cells


def caucus_defection(all_votes, bloc, member):
    columns = []
    for code in bloc:
        if code in all_votes.columns and code != member:
            columns.append(code)
    counts = collections.defaultdict(lambda: [0, 0])
    frame = all_votes[columns + [member, "year"]]
    for _, row in frame.iterrows():
        own = row.get(member)
        if pd.isna(own):
            continue
        ballots = []
        for code in columns:
            if not pd.isna(row[code]):
                ballots.append(int(row[code]))
        if len(ballots) < 8:
            continue
        tally = collections.Counter(ballots)
        mode, mode_count = tally.most_common(1)[0]
        if mode_count / len(ballots) < 0.6:
            continue
        record = counts[int(row["year"])]
        record[1] += 1
        if int(own) != mode:
            record[0] += 1
    return dict(sorted(counts.items()))


def main():
    common.ensure_directories()
    votes, calls, issues = read_sources()
    meta = calls.set_index("rcid")

    tracked = votes[votes.country_code.isin(common.TRACKED)]
    tracked = tracked.pivot_table(index="rcid", columns="country_code", values="ballot", aggfunc="first")
    tracked = tracked.join(meta[["year", "important", "session", "unres", "short", "descr"]], how="inner")

    all_votes = votes.pivot_table(index="rcid", columns="country_code", values="ballot", aggfunc="first")
    all_votes = all_votes.join(meta[["year"]], how="inner")

    issue_tags = collections.defaultdict(set)
    for rcid, tag in zip(issues["rcid"], issues["short_name"]):
        issue_tags[rcid].add(tag)

    years = sorted(set(int(year) for year in tracked["year"].dropna().unique()))
    cells = build_cells(tracked, issue_tags, years)

    blocs = {}
    blocs["arab_MA"] = caucus_defection(all_votes, common.ARAB_LEAGUE, "MA")
    blocs["arab_DZ"] = caucus_defection(all_votes, common.ARAB_LEAGUE, "DZ")
    blocs["africa_MA"] = caucus_defection(all_votes, common.AFRICAN_GROUP, "MA")
    blocs["africa_DZ"] = caucus_defection(all_votes, common.AFRICAN_GROUP, "DZ")

    shared = tracked.dropna(subset=["MA", "DZ"]).sort_values(["year", "unres"])
    opposed_mask = ((shared["MA"] == 1) & (shared["DZ"] == 3)) | ((shared["MA"] == 3) & (shared["DZ"] == 1))
    splits = []
    for rcid, row in shared[opposed_mask].iterrows():
        splits.append({
            "year": int(row["year"]),
            "unres": str(row["unres"] or "").strip(),
            "title": clean_title(row),
            "ma": int(row["MA"]),
            "dz": int(row["DZ"]),
            "us": None if pd.isna(row.get("US")) else int(row["US"]),
            "fr": None if pd.isna(row.get("FR")) else int(row["FR"]),
            "important": bool(row["important"]),
        })

    barcode = collections.OrderedDict()
    marks = []
    for rcid, row in shared.iterrows():
        first = int(row["MA"])
        second = int(row["DZ"])
        if first == second:
            code = "2"
        elif set([first, second]) == set([1, 3]):
            code = "0"
        else:
            code = "1"
        key = str(int(row["year"]))
        barcode.setdefault(key, "")
        index = len(barcode[key])
        barcode[key] = barcode[key] + code
        if code == "0":
            marks.append({
                "y": int(row["year"]),
                "i": index,
                "u": str(row["unres"] or "").strip(),
                "t": clean_title(row)[:90],
            })

    text = (calls["descr"].fillna("") + " | " + calls["short"].fillna("")).str.upper()
    named = set(calls.loc[text.str.contains("SAHARA|IFNI|RIO DE ORO|SAGUIA"), "rcid"])
    proxy = set(calls.loc[text.str.contains("GRANTING OF INDEPENDENCE") & (calls["year"] >= 1991), "rcid"])
    sahara = []
    for rcid in sorted(named | proxy):
        if rcid not in tracked.index or rcid not in all_votes.index:
            continue
        row = tracked.loc[rcid]
        chamber = all_votes.loc[rcid].drop(labels=["year"], errors="ignore").dropna().astype(int)
        tally = collections.Counter(chamber.tolist())
        ballots = {}
        for code in common.TRACKED:
            value = row.get(code)
            ballots[code] = None if pd.isna(value) else int(value)
        sahara.append({
            "tier": "named" if rcid in named else "proxy",
            "year": int(row["year"]),
            "unres": str(row["unres"] or "").strip(),
            "title": clean_title(row),
            "v": ballots,
            "tally": [tally.get(1, 0), tally.get(2, 0), tally.get(3, 0)],
        })
    sahara.sort(key=lambda item: (item["year"], item["unres"]))

    coverage = {
        "minYear": years[0],
        "maxYear": years[-1],
        "maxSession": int(tracked["session"].max()),
        "rollcalls": int(len(shared)),
        "splitCount": len(splits),
        "saharaCount": len([row for row in sahara if row["tier"] == "named"]),
        "proxyCount": len([row for row in sahara if row["tier"] == "proxy"]),
    }

    payload = {
        "years": years,
        "pairs": common.PAIRS,
        "subjects": common.SUBJECTS,
        "cells": cells,
        "blocs": blocs,
        "splits": splits,
        "sahara": sahara,
        "bars": {"byYear": barcode, "opposed": marks},
        "coverage": coverage,
    }
    with open(os.path.join(common.BUILD, "votes.json"), "w") as handle:
        json.dump(payload, handle, separators=(",", ":"))

    write_agreement_csv(years, cells)
    write_table_csv(splits, sahara, blocs)
    print("roll calls", coverage["rollcalls"], "splits", coverage["splitCount"], "sahara", coverage["saharaCount"], "proxy", coverage["proxyCount"])


def write_agreement_csv(years, cells):
    path = os.path.join(common.PROCESSED, "agreement_by_year.csv")
    with open(path, "w", newline="") as handle:
        writer = csv.writer(handle)
        header = ["year", "subject"]
        for pair in common.PAIRS:
            header.append("agreement_" + pair.replace("-", "_"))
        header.append("shared_roll_calls")
        writer.writerow(header)
        for subject in common.SUBJECTS:
            for position, year in enumerate(years):
                row = [year, subject]
                shared = ""
                cell = cells[subject][position]
                for pair_position, pair in enumerate(common.PAIRS):
                    offset = 8 * pair_position
                    count = cell[offset + 1]
                    if count >= common.MIN_SHARED_VOTES:
                        row.append(round(100 * cell[offset] / (2 * count), 3))
                    else:
                        row.append("")
                    if pair == "MA-DZ" and count >= common.MIN_SHARED_VOTES:
                        shared = count
                row.append(shared)
                if any(value != "" for value in row[2:-1]):
                    writer.writerow(row)


def write_table_csv(splits, sahara, blocs):
    path = os.path.join(common.PROCESSED, "opposed_roll_calls.csv")
    with open(path, "w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["year", "symbol", "title", "morocco", "algeria", "united_states", "france", "important_vote"])
        for row in splits:
            writer.writerow([
                row["year"], row["unres"], row["title"],
                common.BALLOT_NAMES[row["ma"]], common.BALLOT_NAMES[row["dz"]],
                common.BALLOT_NAMES.get(row["us"], ""), common.BALLOT_NAMES.get(row["fr"], ""),
                "yes" if row["important"] else "no",
            ])

    path = os.path.join(common.PROCESSED, "sahara_roll_calls.csv")
    with open(path, "w", newline="") as handle:
        writer = csv.writer(handle)
        header = ["tier", "year", "symbol", "title"]
        for code in common.TRACKED:
            header.append(common.STATE_NAMES[code].lower().replace(" ", "_"))
        header = header + ["yes", "abstain", "no"]
        writer.writerow(header)
        for row in sahara:
            line = [row["tier"], row["year"], row["unres"], row["title"]]
            for code in common.TRACKED:
                line.append(common.BALLOT_NAMES.get(row["v"][code], ""))
            writer.writerow(line + row["tally"])

    path = os.path.join(common.PROCESSED, "caucus_defection.csv")
    with open(path, "w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["year", "state", "bloc", "departures", "qualifying_roll_calls", "rate_percent"])
        bloc_names = {"arab": "arab league", "africa": "african group"}
        state_names = {"MA": "morocco", "DZ": "algeria"}
        for key, record in blocs.items():
            bloc, state = key.split("_")
            for year, counts in record.items():
                rate = round(100 * counts[0] / counts[1], 2) if counts[1] else ""
                writer.writerow([year, state_names[state], bloc_names[bloc], counts[0], counts[1], rate])


if __name__ == "__main__":
    main()
