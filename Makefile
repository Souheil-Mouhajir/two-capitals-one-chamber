PYTHON ?= python3
NODE ?= node
RAW := data/raw

.PHONY: all fetch votes positions speech site figures test check serve clean distclean

all: fetch votes positions speech site figures test check

fetch: $(RAW)/un_votes.rda $(RAW)/ungdc

$(RAW)/un_votes.rda:
	mkdir -p $(RAW)
	curl -sL -o $(RAW)/un_votes.rda https://raw.githubusercontent.com/dgrtwo/unvotes/master/data/un_votes.rda
	curl -sL -o $(RAW)/un_roll_calls.rda https://raw.githubusercontent.com/dgrtwo/unvotes/master/data/un_roll_calls.rda
	curl -sL -o $(RAW)/un_roll_call_issues.rda https://raw.githubusercontent.com/dgrtwo/unvotes/master/data/un_roll_call_issues.rda

$(RAW)/ungdc:
	mkdir -p $(RAW)
	git clone --depth 1 https://github.com/nicolasdz/UNGDC.git $(RAW)/ungdc

votes:
	$(PYTHON) src/build_votes.py

positions:
	$(PYTHON) src/build_positions.py

speech:
	$(PYTHON) src/build_speech.py

site:
	$(PYTHON) src/build_site.py

figures:
	$(PYTHON) src/build_figures.py

test:
	$(PYTHON) src/test_data.py

check:
	$(NODE) src/check_site.js

serve:
	$(PYTHON) -m http.server 8000 --directory docs

clean:
	rm -rf build docs/index.html docs/data.json dist figures

distclean: clean
	rm -rf $(RAW) assets/fonts
