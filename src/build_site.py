"""Assemble the published page.

Joins the three build artefacts into one payload, writes docs/index.html with
docs/data.json for GitHub Pages, and writes a single file build in dist.
"""

import csv
import json
import os

import common

BASE_URL = "https://souheil-mouhajir.github.io/two-capitals-one-chamber/"


def agreement_and_kappa(cell, offset):
    count = cell[offset + 1]
    if count < common.MIN_SHARED_VOTES:
        return None
    observed = cell[offset] / (2 * count)
    first = [cell[offset + 2] / count, cell[offset + 3] / count, cell[offset + 4] / count]
    second = [cell[offset + 5] / count, cell[offset + 6] / count, cell[offset + 7] / count]
    expected = 0.0
    for a in range(3):
        for b in range(3):
            expected += first[a] * second[b] * common.DOUBLED_WEIGHT[(a + 1, b + 1)] / 2
    if expected >= 0.9999:
        kappa = None
    else:
        kappa = round((observed - expected) / (1 - expected), 4)
    return [round(100 * observed, 2), kappa, count]


def build_series(votes):
    series = {}
    for subject in votes["subjects"]:
        series[subject] = {}
        for pair_position, pair in enumerate(votes["pairs"]):
            record = {}
            offset = 8 * pair_position
            for position, year in enumerate(votes["years"]):
                value = agreement_and_kappa(votes["cells"][subject][position], offset)
                if value is not None:
                    record[str(year)] = value
            series[subject][pair] = record
    return series


def read_minurso():
    rows = []
    path = os.path.join(common.MANUAL, "minurso_renewals.csv")
    with open(path) as handle:
        for row in csv.DictReader(handle):
            rows.append({
                "resolution": row["resolution"],
                "adopted": int(row["adopted"]),
                "until": row["mandate_until"],
                "favour": int(row["in_favour"]),
                "against": int(row["against"]),
                "abstain": int(row["abstentions"]),
                "absent": int(row["not_voting"]),
            })
    return rows


def main():
    common.ensure_directories()
    votes = json.load(open(os.path.join(common.BUILD, "votes.json")))
    positions = json.load(open(os.path.join(common.BUILD, "positions.json")))
    speech = json.load(open(os.path.join(common.BUILD, "speech.json")))

    names = {}
    for code in positions["names"]:
        names[code] = positions["names"][code]

    payload = {
        "coverage": votes["coverage"],
        "series": build_series(votes),
        "blocs": votes["blocs"],
        "splits": votes["splits"],
        "sahara": votes["sahara"],
        "bars": votes["bars"],
        "scaling": positions["scaling"],
        "eras": positions["eras"],
        "gaps": positions["gaps"],
        "chamber": positions["chamber"],
        "names": names,
        "speech": speech,
        "minurso": read_minurso(),
        "subjectLabels": common.SUBJECT_LABELS,
    }

    template = open(os.path.join(common.ROOT, "src", "templates", "index.html")).read()
    style = open(os.path.join(common.ROOT, "src", "templates", "style.css")).read()
    script = open(os.path.join(common.ROOT, "src", "templates", "app.js")).read()
    data = json.dumps(payload, separators=(",", ":"))

    page = template.replace("__STYLE__", style).replace("__SCRIPT__", script)
    page = page.replace("__BASE__", BASE_URL)

    inline = '<script id="payload" type="application/json">' + data + "</script>\n"
    inline = inline + "<script>window.__DATA__ = JSON.parse(document.getElementById('payload').textContent);</script>"
    standalone = page.replace("__PAYLOAD__", inline)

    # Every copy of the page carries its own payload, so none of them depends on a
    # second request. data.json stays beside the Pages build as a download.
    with open(os.path.join(common.DOCS, "index.html"), "w") as handle:
        handle.write(standalone)
    with open(os.path.join(common.DOCS, "data.json"), "w") as handle:
        handle.write(data)
    with open(os.path.join(common.DOCS, ".nojekyll"), "w") as handle:
        handle.write("")
    with open(os.path.join(common.DIST, "two-capitals-one-chamber.html"), "w") as handle:
        handle.write(standalone)

    # The same single file sits at the repository root, so a Pages site served
    # from the branch root opens the paper rather than a directory listing, and
    # the file also opens from disk with no server.
    with open(os.path.join(common.ROOT, "index.html"), "w") as handle:
        handle.write(standalone)
    with open(os.path.join(common.ROOT, ".nojekyll"), "w") as handle:
        handle.write("")

    print("docs/index.html", len(standalone), "bytes")
    print("docs/data.json", len(data), "bytes")
    print("dist standalone", len(standalone), "bytes")
    print("index.html at the repository root", len(standalone), "bytes")


if __name__ == "__main__":
    main()
