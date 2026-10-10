"""Build the General Debate layer.

Counts stemmed terms in the Moroccan and Algerian addresses and measures the
cosine similarity of the two speeches in each year against the distribution of
all dyads that year.
"""

import csv
import glob
import json
import os
import re

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer

import common

CORPUS = os.path.join(common.RAW, "ungdc", "Text Files")

TERMS = {
    "Sahara": r"sahara",
    "self-determination": r"self[- ]determination",
    "territorial integrity": r"territorial integrity",
    "referendum": r"referendum",
    "autonomy": r"autonom",
    "Maghreb": r"maghreb|maghrib",
    "Palestine": r"palestin",
    "decolonization": r"decoloni",
    "the other capital": None,
    "sovereignty": r"sovereign",
    "African Union": r"african union|organization of african unity",
    "MINURSO or peacekeeping": r"minurso|peacekeeping",
}

OTHER_CAPITAL = {"MA": r"algeria", "DZ": r"morocc"}


def load_documents():
    documents = []
    pattern = re.compile(r"([A-Z]{3})_(\d+)_(\d{4})\.txt$")
    for path in glob.glob(os.path.join(CORPUS, "**", "*.txt"), recursive=True):
        name = os.path.basename(path)
        if name.startswith("._"):
            continue
        match = pattern.match(name)
        if match is None:
            continue
        year = int(match.group(3))
        if year < common.FIRST_YEAR:
            continue
        handle = open(path, encoding="utf8", errors="ignore")
        text = handle.read()
        handle.close()
        documents.append({"iso": match.group(1), "year": year, "text": text})
    return documents


def main():
    common.ensure_directories()
    documents = load_documents()
    codes = {"MAR": "MA", "DZA": "DZ"}

    counts = []
    for document in documents:
        state = codes.get(document["iso"])
        if state is None:
            continue
        lowered = document["text"].lower()
        row = []
        for term, pattern in TERMS.items():
            if pattern is None:
                pattern = OTHER_CAPITAL[state]
            row.append(len(re.findall(pattern, lowered)))
        counts.append({"c": state, "year": document["year"], "w": len(document["text"].split()), "n": row})
    counts.sort(key=lambda item: (item["c"], item["year"]))

    similarity = []
    years = sorted(set(document["year"] for document in documents))
    for year in years:
        subset = [document for document in documents if document["year"] == year]
        isos = [document["iso"] for document in subset]
        if "MAR" not in isos or "DZA" not in isos:
            continue
        vectorizer = TfidfVectorizer(stop_words="english", min_df=2, max_features=20000)
        block = vectorizer.fit_transform([document["text"] for document in subset])
        norms = np.sqrt(block.multiply(block).sum(axis=1))
        normalised = block.multiply(1 / norms).tocsr()
        gram = (normalised @ normalised.T).toarray()
        index = {}
        for position, iso in enumerate(isos):
            index[iso] = position
        upper = np.triu_indices(gram.shape[0], 1)
        similarity.append({
            "year": int(year),
            "ma_dz": round(float(gram[index["MAR"], index["DZA"]]), 4),
            "median": round(float(np.median(gram[upper])), 4),
            "p90": round(float(np.percentile(gram[upper], 90)), 4),
            "n": int(gram.shape[0]),
        })

    coverage = {
        "speeches": len(documents),
        "minYear": min(document["year"] for document in documents),
        "maxYear": max(document["year"] for document in documents),
        "ma": len([document for document in documents if document["iso"] == "MAR"]),
        "dz": len([document for document in documents if document["iso"] == "DZA"]),
    }
    payload = {"terms": list(TERMS.keys()), "kw": counts, "sims": similarity, "coverage": coverage}
    with open(os.path.join(common.BUILD, "speech.json"), "w") as handle:
        json.dump(payload, handle, separators=(",", ":"))

    path = os.path.join(common.PROCESSED, "general_debate_terms.csv")
    with open(path, "w", newline="") as handle:
        writer = csv.writer(handle)
        header = ["year", "state", "words"]
        for term in TERMS:
            header.append(term.replace(" ", "_"))
        writer.writerow(header)
        for row in counts:
            writer.writerow([row["year"], common.STATE_NAMES[row["c"]].lower(), row["w"]] + row["n"])

    path = os.path.join(common.PROCESSED, "speech_similarity.csv")
    with open(path, "w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["year", "morocco_algeria_cosine", "median_dyad", "p90_dyad", "speeches_that_year"])
        for row in similarity:
            writer.writerow([row["year"], row["ma_dz"], row["median"], row["p90"], row["n"]])

    totals = {"MA": [0] * len(TERMS), "DZ": [0] * len(TERMS)}
    words = {"MA": 0, "DZ": 0}
    for row in counts:
        words[row["c"]] += row["w"]
        for position, value in enumerate(row["n"]):
            totals[row["c"]][position] += value
    print("speeches", coverage["speeches"], coverage["minYear"], "to", coverage["maxYear"], "similarity years", len(similarity))
    for position, term in enumerate(TERMS):
        first = 10000 * totals["MA"][position] / words["MA"]
        second = 10000 * totals["DZ"][position] / words["DZ"]
        print("%-24s morocco %5.1f  algeria %5.1f" % (term, first, second))


if __name__ == "__main__":
    main()
