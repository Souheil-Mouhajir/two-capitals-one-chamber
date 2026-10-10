"""Render the static cards.

Three social cards and the link preview image, drawn in the same type and colour
system as the page. Fonts are fetched once into assets/fonts and are not stored
in the repository.
"""

import json
import os
import urllib.request

import matplotlib

matplotlib.use("Agg")

import matplotlib.font_manager as font_manager
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import Rectangle

import common

GOOGLE_FONTS = "https://raw.githubusercontent.com/google/fonts/main/ofl/"

CRIMSON = common.PALETTE["crimson"]
TEAL = common.PALETTE["teal"]
INK = common.PALETTE["ink"]
MUTE = common.PALETTE["mute"]
HAIR = common.PALETTE["hair"]
LINE = common.PALETTE["line"]
SHEET = common.PALETTE["sheet"]
OCHRE = common.PALETTE["ochre"]
BAR = "#d8dcde"

MONO = {"fontname": "JetBrains Mono"}
DISPLAY = {"fontname": "Instrument Serif"}


def install_fonts():
    for name, suffix in common.FONT_FILES.items():
        path = os.path.join(common.FONTS, name)
        if not os.path.exists(path):
            urllib.request.urlretrieve(GOOGLE_FONTS + suffix, path)
    pin_weights()
    for name in os.listdir(common.FONTS):
        if name.endswith(".ttf"):
            font_manager.fontManager.addfont(os.path.join(common.FONTS, name))
    plt.rcParams.update({
        "font.family": "Archivo",
        "font.size": 11,
        "text.color": INK,
        "axes.edgecolor": LINE,
        "axes.labelcolor": INK,
        "xtick.color": MUTE,
        "ytick.color": INK,
        "figure.facecolor": SHEET,
        "axes.facecolor": SHEET,
        "savefig.facecolor": SHEET,
    })


def pin_weights():
    """Archivo ships as a variable font, which matplotlib reads at its default
    weight of 600. The regular and semibold instances are pinned once."""
    from fontTools.ttLib import TTFont
    from fontTools.varLib.instancer import instantiateVariableFont

    source = os.path.join(common.FONTS, "Archivo.ttf")
    wanted = {"Archivo-Regular.ttf": 400, "Archivo-SemiBold.ttf": 600}
    for name, weight in wanted.items():
        target = os.path.join(common.FONTS, name)
        if os.path.exists(target):
            continue
        font = TTFont(source)
        instance = instantiateVariableFont(font, {"wght": weight, "wdth": 100})
        instance.save(target)


def head(figure, kicker, title, subtitle, source, size=30):
    figure.text(0.062, 0.968, kicker.upper(), size=8.5, color=MUTE, va="top", **MONO)
    figure.text(0.062, 0.935, title, size=size, va="top", **DISPLAY)
    figure.text(0.062, 0.862, subtitle, size=11.5, color=INK, va="top", linespacing=1.5)
    figure.text(0.062, 0.038, source, size=8.5, color=MUTE, va="center")
    rule = plt.Line2D([0.062, 0.94], [0.078, 0.078], color=LINE, lw=0.8, transform=figure.transFigure)
    figure.lines.append(rule)


def mono_ticks(axis):
    for label in axis.get_xticklabels():
        label.set_fontname("JetBrains Mono")


def card_gaps(data):
    order = [("US", "United States"), ("ES", "Spain"), ("GB", "United Kingdom"), ("FR", "France"), ("CN", "China"), ("RU", "Russia")]
    rows = []
    for code, name in order:
        rows.append((name, data["gaps"][code + "_imp"]))
    rows.sort(key=lambda row: row[1]["gap"])
    figure, axis = plt.subplots(figsize=(8, 8), dpi=150)
    figure.subplots_adjust(left=0.29, right=0.94, top=0.74, bottom=0.16)
    for index, row in enumerate(rows):
        name = row[0]
        record = row[1]
        colour = CRIMSON if record["gap"] > 0 else TEAL
        axis.plot([record["lo"], record["hi"]], [index, index], color=colour, lw=1.8, solid_capstyle="butt")
        axis.plot([record["lo"], record["lo"]], [index - 0.14, index + 0.14], color=colour, lw=1.4)
        axis.plot([record["hi"], record["hi"]], [index - 0.14, index + 0.14], color=colour, lw=1.4)
        axis.plot(record["gap"], index, "o", color=colour, ms=8)
        side = "left" if record["gap"] > 0 else "right"
        anchor = record["hi"] + 0.8 if record["gap"] > 0 else record["lo"] - 0.8
        axis.text(anchor, index, "%+.1f" % record["gap"], va="center", ha=side, size=10, color=colour, **MONO)
    axis.axvline(0, color=INK, lw=1)
    axis.set_yticks(range(len(rows)))
    axis.set_yticklabels([row[0] for row in rows], size=11.5)
    axis.set_xlim(-20, 20)
    axis.set_xlabel("Morocco minus Algeria, percentage points", size=10)
    axis.tick_params(axis="y", length=0)
    axis.tick_params(axis="x", labelsize=9.5)
    mono_ticks(axis)
    axis.grid(axis="x", color=HAIR, lw=0.8)
    axis.set_axisbelow(True)
    for side in ["top", "right", "left"]:
        axis.spines[side].set_visible(False)
    axis.text(-19.4, len(rows) - 0.3, "Algeria closer", size=9.5, color=TEAL)
    axis.text(19.4, len(rows) - 0.3, "Morocco closer", size=9.5, color=CRIMSON, ha="right")
    head(figure, "Fig. 1   UN General Assembly", "Where Rabat and Algiers actually split",
         "Agreement with each capital on the roll calls Washington designates as important,\n2000 to 2019. Whiskers are 95 percent bootstrap intervals over 201 votes.",
         "Data: Voeten, Strezhnev and Bailey (2009). Index after Bailey et al. (2017). Souheil Mouhajir")
    figure.savefig(os.path.join(common.FIGURES, "important-votes.png"))
    plt.close(figure)


def barcode_axis(axis, data, bar_colour):
    by_year = data["bars"]["byYear"]
    years = sorted(int(year) for year in by_year)
    longest = max(len(by_year[str(year)]) for year in years)
    for row, year in enumerate(years):
        for position, code in enumerate(by_year[str(year)]):
            colour = {"2": bar_colour, "1": OCHRE, "0": CRIMSON}[code]
            width = 1.0 if code != "0" else 2.0
            axis.add_patch(Rectangle((position, -row - 0.45), width, 0.9, color=colour, lw=0))
    axis.set_xlim(0, longest)
    axis.set_ylim(-len(years), 0.6)
    return years


def card_barcode(data):
    figure, axis = plt.subplots(figsize=(8, 8), dpi=150)
    figure.subplots_adjust(left=0.115, right=0.955, top=0.72, bottom=0.13)
    years = barcode_axis(axis, data, BAR)
    axis.set_xticks([])
    axis.set_yticks([-years.index(year) for year in years if year % 10 == 0])
    axis.set_yticklabels([year for year in years if year % 10 == 0], size=9, fontname="JetBrains Mono")
    axis.tick_params(axis="y", length=0)
    for spine in axis.spines.values():
        spine.set_visible(False)
    axis.set_xlabel("Each line is one roll call, in the order the Assembly took them", size=9.5, color=MUTE)
    identical = sum(row.count("2") for row in data["bars"]["byYear"].values())
    partial = sum(row.count("1") for row in data["bars"]["byYear"].values())
    opposed = len(data["bars"]["opposed"])
    figure.text(0.115, 0.762, "identical ballot %s" % format(identical, ","), size=9.5, color="#9aa5ac")
    figure.text(0.44, 0.762, "one abstention %d" % partial, size=9.5, color=OCHRE)
    figure.text(0.72, 0.762, "open opposition %d" % opposed, size=9.5, color=CRIMSON)
    head(figure, "Fig. 2   UN General Assembly", "Fifty eight years of ballots",
         "Every roll call where both states voted, 1962 to 2020. They cast the same ballot\n90 percent of the time and opposed each other 88 times.",
         "Data: Voeten, Strezhnev and Bailey (2009). Souheil Mouhajir")
    figure.savefig(os.path.join(common.FIGURES, "ballot-barcode.png"))
    plt.close(figure)


def card_vocabulary(data):
    terms = data["speech"]["terms"]
    words = {"MA": 0, "DZ": 0}
    counts = {"MA": [0] * len(terms), "DZ": [0] * len(terms)}
    for row in data["speech"]["kw"]:
        words[row["c"]] += row["w"]
        for index, value in enumerate(row["n"]):
            counts[row["c"]][index] += value
    chosen = ["territorial integrity", "sovereignty", "MINURSO or peacekeeping", "referendum", "autonomy",
              "Sahara", "Maghreb", "Palestine", "decolonization", "African Union", "self-determination"]
    rows = []
    for term in chosen:
        index = terms.index(term)
        rows.append((term, 10000 * counts["MA"][index] / words["MA"], 10000 * counts["DZ"][index] / words["DZ"]))
    rows.sort(key=lambda row: row[1] - row[2])
    figure, axis = plt.subplots(figsize=(8, 8), dpi=150)
    figure.subplots_adjust(left=0.35, right=0.94, top=0.74, bottom=0.13)
    positions = np.arange(len(rows))
    axis.barh(positions + 0.19, [row[1] for row in rows], height=0.34, color=CRIMSON, label="Morocco")
    axis.barh(positions - 0.19, [row[2] for row in rows], height=0.34, color=TEAL, label="Algeria")
    for index, row in enumerate(rows):
        axis.text(row[1] + 0.3, index + 0.19, "%.1f" % row[1], va="center", size=9, color=CRIMSON, **MONO)
        axis.text(row[2] + 0.3, index - 0.19, "%.1f" % row[2], va="center", size=9, color=TEAL, **MONO)
    axis.set_yticks(positions)
    axis.set_yticklabels([row[0] for row in rows], size=10.5)
    axis.tick_params(axis="y", length=0)
    axis.set_xlim(0, 21)
    mono_ticks(axis)
    axis.set_xlabel("Mentions per 10,000 words", size=10)
    axis.grid(axis="x", color=HAIR, lw=0.8)
    axis.set_axisbelow(True)
    for side in ["top", "right", "left"]:
        axis.spines[side].set_visible(False)
    axis.legend(frameon=False, loc="lower right", fontsize=10)
    head(figure, "Fig. 3   UN General Debate", "Same file, opposite vocabulary",
         "Word use in Moroccan and Algerian addresses, 1962 to 2024,\n62 Moroccan and 62 Algerian statements.",
         "Data: Mikhaylov, Baturo and Dasandi (2017), UN General Debate Corpus. Souheil Mouhajir")
    figure.savefig(os.path.join(common.FIGURES, "vocabulary.png"))
    plt.close(figure)


def card_preview(data):
    figure = plt.figure(figsize=(12, 6.3), dpi=100, facecolor=SHEET)
    axis = figure.add_axes([0.055, 0.11, 0.90, 0.42])
    axis.set_facecolor(SHEET)
    barcode_axis(axis, data, BAR)
    axis.set_xticks([])
    axis.set_yticks([])
    for spine in axis.spines.values():
        spine.set_visible(False)
    figure.text(0.055, 0.945, "WORKING PAPER   2026", size=9.5, color=MUTE, va="top", **MONO)
    figure.text(0.055, 0.895, "Two capitals, one chamber", size=58, color=INK, va="top", **DISPLAY)
    figure.text(0.055, 0.715, "Moroccan and Algerian positions in the United Nations, 1962 to 2025",
                size=16, color=INK, va="top")
    counts = "%s shared roll calls    %d of open opposition    %s General Debate speeches" % (
        format(data["coverage"]["rollcalls"], ","), data["coverage"]["splitCount"],
        format(data["speech"]["coverage"]["speeches"], ","))
    figure.text(0.055, 0.632, counts, size=11.5, color=MUTE, va="top", **MONO)
    figure.text(0.055, 0.045, "Souheil Mouhajir", size=12, color=INK, va="center")
    figure.text(0.945, 0.045, "Voeten, Strezhnev and Bailey (2009)    UN General Debate Corpus",
                size=10, color=MUTE, va="center", ha="right", **MONO)
    rule = plt.Line2D([0.055, 0.945], [0.085, 0.085], color=LINE, lw=0.9, transform=figure.transFigure)
    figure.lines.append(rule)
    os.makedirs(os.path.join(common.DOCS, "assets"), exist_ok=True)
    figure.savefig(os.path.join(common.DOCS, "assets", "og-image.png"), facecolor=SHEET)
    figure.savefig(os.path.join(common.FIGURES, "preview.png"), facecolor=SHEET)
    plt.close(figure)


def main():
    common.ensure_directories()
    install_fonts()
    data = json.load(open(os.path.join(common.DOCS, "data.json")))
    card_gaps(data)
    card_barcode(data)
    card_vocabulary(data)
    card_preview(data)
    print("figures written to", common.FIGURES)


if __name__ == "__main__":
    main()
