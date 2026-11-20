import { expect, it } from "vite-plus/test";
import {
  liveResultsSheetHref,
  lgaSummaryPrintSections,
  lgaSummaryTable,
  readLiveResultsSelection,
  summarizeLgaResults,
} from "./LiveResultsSheet";

it("exports the same LGA rows and totals and keeps each PDF section narrow", () => {
  const summary = summarizeLgaResults([{ id: 1, name: "Ikeja", state_id: 24 }], []);
  const table = lgaSummaryTable(summary);
  expect(table[0].slice(0, 7)).toEqual([
    "LGA",
    "Submissions",
    "Registered",
    "Accredited",
    "Valid",
    "Rejected",
    "Total cast",
  ]);
  expect(table.slice(1).map((row) => row[0])).toEqual(["Ikeja", "Grand total"]);
  const sections = lgaSummaryPrintSections(table);
  expect(sections.length).toBeGreaterThan(1);
  expect(sections.every(({ rows }) => rows.every((row) => row.length <= 10))).toBe(true);
  expect(sections.flatMap(({ rows }) => rows[0].slice(1))).toEqual(table[0].slice(1));
  expect(sections.every(({ rows }) => rows[1][0] === "Ikeja" && rows[2][0] === "Grand total")).toBe(
    true,
  );
});

it("restores the election and jurisdiction filters from a copied sheet URL", () => {
  const selection = {
    election: "governorship",
    stateId: 24,
    lgaId: 512,
    wardId: 42,
    puId: "24-01-02-003",
  };
  const url = new URL(liveResultsSheetHref("/dashboard", selection), "https://example.test");
  expect(readLiveResultsSelection(url.search)).toEqual(selection);
  expect(readLiveResultsSelection("?stateId=24")).toBeNull();
});

it("sums all submissions by LGA and includes LGAs with no submissions", () => {
  const lgas = [
    { id: 1, name: "Abeokuta North", state_id: 27 },
    { id: 2, name: "Abeokuta South", state_id: 27 },
  ];
  const upload = {
    state_id: 27,
    local_governments_id: 1,
    total_valid: 21,
    total_rejected: 2,
    total_cast: 23,
    results_json: {
      number_of_voters_on_register: 50,
      number_of_accredited_voters: 25,
      political_party_results: [{ party: " adc ", votes_in_figures: 21 }],
    },
  };
  const summary = summarizeLgaResults(lgas, [
    { ...upload, id: "first" },
    { ...upload, id: "second" },
    { ...upload, id: "third", local_governments_id: null, results_json: null },
  ]);

  expect(summary.rows.map(({ name, submissions, cast }) => [name, submissions, cast])).toEqual([
    ["Abeokuta North", 2, 46],
    ["Abeokuta South", 0, 0],
    ["Unassigned LGA", 1, 23],
  ]);
  expect(summary.rows[0].parties.get("ADC")).toBe(42);
  expect(summary.grandTotal).toMatchObject({
    submissions: 3,
    registered: 100,
    valid: 63,
    rejected: 6,
    cast: 69,
  });
});
