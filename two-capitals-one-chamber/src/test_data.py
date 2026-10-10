"""Integrity tests for the published numbers.

Run with: python3 src/test_data.py
Every assertion here is a claim the page or the README makes in prose.
"""

import csv
import json
import os
import sys

import common

FAILURES = []


def check(label, condition, detail=""):
    if condition:
        print("pass  " + label + ("  " + detail if detail else ""))
    else:
        print("FAIL  " + label + ("  " + detail if detail else ""))
        FAILURES.append(label)


def read_csv(name):
    path = os.path.join(common.PROCESSED, name)
    handle = open(path)
    rows = list(csv.DictReader(handle))
    handle.close()
    return rows


def main():
    data = json.load(open(os.path.join(common.DOCS, "data.json")))
    coverage = data["coverage"]

    check("window opens in 1962", coverage["minYear"] == 1962, str(coverage["minYear"]))
    check("roll calls", coverage["rollcalls"] == 5086, str(coverage["rollcalls"]))
    check("opposed roll calls", coverage["splitCount"] == 88, str(coverage["splitCount"]))
    check("named Sahara votes", coverage["saharaCount"] == 25, str(coverage["saharaCount"]))
    check("Declaration votes", coverage["proxyCount"] == 68, str(coverage["proxyCount"]))
    check("speeches", data["speech"]["coverage"]["speeches"] == 10069, str(data["speech"]["coverage"]["speeches"]))

    gaps = data["gaps"]
    check("Washington gap on important votes", 10.0 < gaps["US_imp"]["gap"] < 12.0, str(gaps["US_imp"]["gap"]))
    check("Washington interval excludes zero", gaps["US_imp"]["lo"] > 0, str(gaps["US_imp"]["lo"]))
    check("Beijing gap turns over", gaps["CN_imp"]["gap"] < 0 and gaps["CN_imp"]["hi"] < 0, str(gaps["CN_imp"]["gap"]))
    check("Moscow gap turns over", gaps["RU_imp"]["gap"] < 0 and gaps["RU_imp"]["hi"] < 0, str(gaps["RU_imp"]["gap"]))
    check("full agenda gap is smaller", abs(gaps["US_all"]["gap"]) < abs(gaps["US_imp"]["gap"]), str(gaps["US_all"]["gap"]))

    eras = {row["era"]: row for row in data["eras"]}
    check("four periods", len(eras) == 4, ", ".join(sorted(eras)))
    cold_war = eras["1962-1975"]
    check("the distance opens wide", cold_war["diff_lo"] > 0, str(cold_war["diff"]))
    after = eras["1992-2005"]
    check("the distance closes after 1992", after["diff_lo"] < 0 < after["diff_hi"], str(after["diff"]))
    recent = eras["2006-2019"]
    check("the distance reopens after 2006", recent["diff_lo"] > 0, str(recent["diff"]))

    marks = data["bars"]["opposed"]
    check("barcode marks match the splits", len(marks) == coverage["splitCount"], str(len(marks)))
    recent_splits = [row for row in data["splits"] if row["year"] >= 2015]
    declaration = [row for row in recent_splits if "Granting of Independence" in row["title"]]
    check("recent splits reach the Declaration file", len(declaration) >= 4, str(len(declaration)) + " of " + str(len(recent_splits)))

    morocco_no = [row for row in data["sahara"] if row["tier"] == "proxy" and row["year"] >= 2015 and row["v"]["MA"] == 3]
    check("Morocco votes no on the Declaration after 2015", len(morocco_no) >= 4, str(len(morocco_no)))
    algeria_yes = [row for row in data["sahara"] if row["tier"] == "proxy" and row["v"]["DZ"] == 1]
    check("Algeria votes yes on every Declaration text", len(algeria_yes) == coverage["proxyCount"], str(len(algeria_yes)))

    minurso = data["minurso"]
    check("MINURSO renewals", len(minurso) == 12, str(len(minurso)))
    unanimous = [row for row in minurso if row["against"] == 0 and row["abstain"] == 0]
    check("one unanimous renewal since 2016", len(unanimous) == 1, str(len(unanimous)))

    terms = data["speech"]["terms"]
    words = {"MA": 0, "DZ": 0}
    counts = {"MA": [0] * len(terms), "DZ": [0] * len(terms)}
    for row in data["speech"]["kw"]:
        words[row["c"]] += row["w"]
        for index, value in enumerate(row["n"]):
            counts[row["c"]][index] += value
    rate = lambda state, term: 10000 * counts[state][terms.index(term)] / words[state]
    check("Morocco says territorial integrity more often",
          rate("MA", "territorial integrity") > 2 * rate("DZ", "territorial integrity"),
          "%.1f against %.1f" % (rate("MA", "territorial integrity"), rate("DZ", "territorial integrity")))
    check("Algeria says self determination more often",
          rate("DZ", "self-determination") > 2 * rate("MA", "self-determination"),
          "%.1f against %.1f" % (rate("DZ", "self-determination"), rate("MA", "self-determination")))
    check("Palestine rates are close",
          abs(rate("MA", "Palestine") - rate("DZ", "Palestine")) < 3,
          "%.1f against %.1f" % (rate("MA", "Palestine"), rate("DZ", "Palestine")))

    opposed_rows = read_csv("opposed_roll_calls.csv")
    check("opposed csv matches the payload", len(opposed_rows) == coverage["splitCount"], str(len(opposed_rows)))
    sahara_rows = read_csv("sahara_roll_calls.csv")
    check("sahara csv matches the payload", len(sahara_rows) == coverage["saharaCount"] + coverage["proxyCount"], str(len(sahara_rows)))
    period_rows = read_csv("positions_by_period.csv")
    check("period csv matches the payload", len(period_rows) == len(data["eras"]), str(len(period_rows)))
    gap_rows = read_csv("agreement_gaps.csv")
    check("gap csv covers six capitals twice", len(gap_rows) == 12, str(len(gap_rows)))

    out_of_range = 0
    thin = 0
    cells = 0
    for subject in data["series"]:
        for pair in data["series"][subject]:
            for year in data["series"][subject][pair]:
                record = data["series"][subject][pair][year]
                cells += 1
                if not 0 <= record[0] <= 100:
                    out_of_range += 1
                if record[2] < common.MIN_SHARED_VOTES:
                    thin += 1
    check("every agreement value is a share", out_of_range == 0, str(cells) + " cells")
    check("no cell below the five vote threshold", thin == 0, str(cells) + " cells")

    if FAILURES:
        print("\n" + str(len(FAILURES)) + " check(s) failed")
        sys.exit(1)
    print("\nall checks passed")


if __name__ == "__main__":
    main()
