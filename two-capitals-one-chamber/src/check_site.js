/* Headless check of the standalone build: every figure draws, every table fills,
   every control fires, and the console stays clean. Run with: node src/check_site.js */

const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const file = path.join(__dirname, "..", "dist", "two-capitals-one-chamber.html");
const errors = [];
const reporter = new VirtualConsole();
reporter.on("jsdomError", function (error) { errors.push(error.message); });

const dom = new JSDOM(fs.readFileSync(file, "utf8"), {
  runScripts: "dangerously",
  virtualConsole: reporter,
  pretendToBeVisual: true
});

const window = dom.window;
const document = window.document;
const failures = [];

function check(label, condition, detail) {
  if (!condition) { failures.push(label); }
  console.log((condition ? "pass  " : "FAIL  ") + label + (detail === undefined ? "" : "  " + detail));
}

function fire(selector, index, type) {
  const nodes = document.querySelectorAll(selector);
  if (!nodes[index]) { return false; }
  nodes[index].dispatchEvent(new window.Event(type || "click", { bubbles: true }));
  return true;
}

function count(selector) {
  return document.querySelectorAll(selector).length;
}

function structure() {
  for (let index = 1; index <= 9; index += 1) {
    check("figure " + index + " drawn", Boolean(document.querySelector("#fig" + index + " svg")));
  }
  for (const selector of ["#tab1", "#tab2", "#tab3", "#tab4", "#tab5"]) {
    check("table " + selector + " filled", count(selector + " tbody tr") > 0, count(selector + " tbody tr") + " rows");
  }
  check("coverage drawn", Boolean(document.querySelector("#coverage svg")));
  check("abstract written", document.querySelector("#abstract").textContent.length > 400);
  check("lede figures", count("#lede .stat") === 4);
  check("opposed marks", count("#fig6 rect") === 88, count("#fig6 rect") + " marks");
}

function controls() {
  fire("#gapCtl button", 1);
  check("gap chart redrawn", count("#fig4 circle") === 6);
  fire("#blocCtl button", 1);
  check("caucus redrawn", Boolean(document.querySelector("#fig5 svg")));
  fire("#sahCtl button", 1);
  check("declaration tier", count("#tab2 tbody tr") === 68, count("#tab2 tbody tr") + " rows");
  fire("#tab2 th.sortable", 1);
  check("sahara sorted", count("#tab2 tbody tr") === 68);

  const terms = document.querySelector("#termSelect");
  check("term select filled", terms.options.length === 12, terms.options.length + " options");
  terms.value = "2";
  terms.dispatchEvent(new window.Event("change", { bubbles: true }));
  check("term chart redrawn", Boolean(document.querySelector("#fig7 svg")));

  const subjects = document.querySelector("#subjectSelect");
  subjects.value = "important";
  subjects.dispatchEvent(new window.Event("change", { bubbles: true }));
  fire("#powerCtl button", 2);
  fire("#measureCtl button", 1);
  check("explorer redrawn", Boolean(document.querySelector("#fig9 svg")));

  const marks = document.querySelectorAll("#fig6 rect");
  marks[marks.length - 1].dispatchEvent(new window.Event("click", { bubbles: true }));
  check("barcode links to table", count("#tab4 tr.hit") === 1);

  const field = document.querySelector("#addState");
  field.value = "Egypt";
  field.dispatchEvent(new window.Event("change", { bubbles: true }));
  check("comparison picker", count("#picked .pill") === 1);

  const slider = document.querySelector("#chYear");
  slider.value = 1975;
  slider.dispatchEvent(new window.Event("input", { bubbles: true }));
  check("chamber year", document.querySelector("#chLabel").textContent === "1975",
    document.querySelector("#chLabel").textContent);
  check("chamber nodes persist across years", count("#fig3 circle") > 300, count("#fig3 circle") + " nodes");
}

function debounced(done) {
  const before = count("#tab4 tbody tr");
  const search = document.querySelector("#splitFind");
  search.value = "syria";
  search.dispatchEvent(new window.Event("input", { bubbles: true }));
  setTimeout(function () {
    const after = count("#tab4 tbody tr");
    check("split filter applies after the debounce", after > 0 && after < before, after + " of " + before + " rows");
    fire("#splitClear", 0);
    check("split filter clears", count("#tab4 tbody tr") === before, count("#tab4 tbody tr") + " rows");
    done();
  }, 320);
}

setTimeout(function () {
  structure();
  controls();
  debounced(function () {
    check("no console errors", errors.length === 0, errors.slice(0, 2).join(" | "));
    if (failures.length) {
      console.log("\n" + failures.length + " check(s) failed");
      process.exit(1);
    }
    console.log("\nall checks passed");
    process.exit(0);
  });
}, 1200);
