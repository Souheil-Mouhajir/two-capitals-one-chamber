"""Shared paths, constants and the colour palette for the whole pipeline."""

import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
MANUAL = os.path.join(ROOT, "data", "manual")
PROCESSED = os.path.join(ROOT, "data", "processed")
BUILD = os.path.join(ROOT, "build")
DOCS = os.path.join(ROOT, "docs")
FIGURES = os.path.join(ROOT, "figures")
DIST = os.path.join(ROOT, "dist")
FONTS = os.path.join(ROOT, "assets", "fonts")

FIRST_YEAR = 1962

MOROCCO = "MA"
ALGERIA = "DZ"
REFERENCE_STATES = ["US", "FR", "CN", "RU", "ES", "GB"]
TRACKED = [MOROCCO, ALGERIA] + REFERENCE_STATES

PAIRS = ["MA-DZ"]
for code in REFERENCE_STATES:
    PAIRS.append("MA-" + code)
for code in REFERENCE_STATES:
    PAIRS.append("DZ-" + code)

SUBJECTS = ["all", "important", "me", "co", "hr", "di", "nu", "ec"]

SUBJECT_LABELS = {
    "all": "All roll calls",
    "important": "Votes Washington calls important",
    "me": "Palestine and the Middle East",
    "co": "Colonialism and self determination",
    "hr": "Human rights",
    "di": "Disarmament",
    "nu": "Nuclear weapons",
    "ec": "Economic development",
}

STATE_NAMES = {
    "MA": "Morocco",
    "DZ": "Algeria",
    "US": "United States",
    "FR": "France",
    "CN": "China",
    "RU": "Russia",
    "ES": "Spain",
    "GB": "United Kingdom",
}

ARAB_LEAGUE = ["DZ", "BH", "KM", "DJ", "EG", "IQ", "JO", "KW", "LB", "LY", "MR", "MA", "OM", "QA", "SA", "SO", "SD", "SY", "TN", "AE", "YE", "YD"]

AFRICAN_GROUP = ["DZ", "AO", "BJ", "BW", "BF", "BI", "CM", "CV", "CF", "TD", "KM", "CG", "CD", "CI", "DJ", "EG", "GQ", "ER", "ET", "GA", "GM", "GH", "GN", "GW", "KE", "LS", "LR", "LY", "MG", "MW", "ML", "MR", "MU", "MA", "MZ", "NA", "NE", "NG", "RW", "ST", "SN", "SC", "SL", "SO", "ZA", "SS", "SD", "SZ", "TZ", "TG", "TN", "UG", "ZM", "ZW"]

# Ballot codes used throughout: 1 yes, 2 abstain, 3 no.
BALLOT_NAMES = {1: "yes", 2: "abstain", 3: "no"}

# Agreement weights, doubled so that every cell stays an integer.
# Same ballot scores 2, one abstention against a yes or a no scores 1, opposition scores 0.
DOUBLED_WEIGHT = {}
for first in [1, 2, 3]:
    for second in [1, 2, 3]:
        if first == second:
            DOUBLED_WEIGHT[(first, second)] = 2
        elif first == 2 or second == 2:
            DOUBLED_WEIGHT[(first, second)] = 1
        else:
            DOUBLED_WEIGHT[(first, second)] = 0

MIN_SHARED_VOTES = 5

PALETTE = {
    "crimson": "#c4123f",
    "teal": "#0d7a68",
    "ink": "#0f1417",
    "mute": "#6a747c",
    "steel": "#94a0aa",
    "line": "#e2e5e7",
    "hair": "#eef0f1",
    "sheet": "#ffffff",
    "field": "#eceeef",
    "ochre": "#b07d20",
    "navy": "#1f4e79",
}

FONT_FILES = {
    "InstrumentSerif-Regular.ttf": "instrumentserif/InstrumentSerif-Regular.ttf",
    "Archivo.ttf": "archivo/Archivo%5Bwdth,wght%5D.ttf",
    "JetBrainsMono.ttf": "jetbrainsmono/JetBrainsMono%5Bwght%5D.ttf",
}


def ensure_directories():
    for path in [PROCESSED, BUILD, DOCS, FIGURES, DIST, FONTS, MANUAL]:
        os.makedirs(path, exist_ok=True)
