import { describe, expect, it } from "vite-plus/test";
import { assignedPuId, REGISTERED_PARTIES, resultMathValid } from "../../src/lib/resultCapture";

describe("result capture", () => {
  it("uses the assigned polling-unit ID and never a display name", () => {
    expect(assignedPuId({ puId: 131753 })).toBe("131753");
    expect(assignedPuId({ lagosPollingUnitId: 42 })).toBe("42");
    expect(assignedPuId({ puId: null })).toBe("");
  });
  it("limits the visible list to the 22 parties in the supplied INEC screenshots", () => {
    expect(REGISTERED_PARTIES).toHaveLength(22);
    expect(REGISTERED_PARTIES).toContain("ADC");
    expect(REGISTERED_PARTIES).toContain("ZLP");
  });

  it("counts all extracted party votes, including parties outside the displayed roster", () => {
    const result = {
      political_party_results: [
        { party: "ADC", votes_in_figures: 4 },
        { party: "NEW", votes_in_figures: 6 },
      ],
      number_of_valid_votes: 10,
      number_of_spoiled_ballot_papers: 1,
      number_of_rejected_ballots: 2,
      total_number_of_used_ballots: 13,
      total_votes_cast: 13,
    };
    expect(resultMathValid(result)).toBe(true);
    expect(resultMathValid({ ...result, number_of_valid_votes: 9 })).toBe(false);
  });
});
