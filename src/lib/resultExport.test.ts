import { describe, expect, it } from "vite-plus/test";
import { resultCsv, resultExportTable, type ExportResult } from "./resultExport";

const sample: ExportResult = {
  id: "result-1",
  election_type: "presidential",
  state_id: 27,
  local_governments_id: 564,
  wards_id: 6425,
  polling_units_id: "131753",
  agent_id: "agent-1",
  created_at: "2026-11-20T10:00:00Z",
  status: "verified",
  total_valid: 100,
  total_rejected: 2,
  total_cast: 102,
  image_url: "https://example.test/image.jpg",
  results_json: {
    number_of_voters_on_register: 150,
    number_of_accredited_voters: 105,
    political_party_results: [
      { party: "ADC", votes_in_figures: 60 },
      { party: "APC", votes_in_figures: 40 },
    ],
  },
};

describe("election result export", () => {
  it("includes every party and result field in stable columns", () => {
    const table = resultExportTable([sample]);
    expect(table[0].slice(-2)).toEqual(["ADC Votes", "APC Votes"]);
    expect(table[1].slice(-2)).toEqual([60, 40]);
    expect(table[1].slice(0, 6)).toEqual(["result-1", "presidential", 27, 564, 6425, "131753"]);
  });

  it("escapes quotes and spreadsheet formulas in CSV", () => {
    expect(
      resultCsv([
        ["Label", "Count"],
        ['=HYPERLINK("bad")', 2],
      ]),
    ).toContain('"\'=HYPERLINK(""bad"")","2"');
  });
});
