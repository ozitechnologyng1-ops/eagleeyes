import { describe, expect, it } from "vite-plus/test";
import { getVoterScope } from "./voterScope";

describe("voter request scope", () => {
  it("does not allow a request before login or with an invalid state", () => {
    expect(getVoterScope(null)).toBeNull();
    expect(getVoterScope({ role: "state_admin" })).toBeNull();
    expect(getVoterScope({ role: "state_admin", stateId: 0 })).toBeNull();
    expect(getVoterScope({ role: "state_admin", stateId: Number.NaN })).toBeNull();
  });

  it("keeps state administrators in their own state", () => {
    expect(getVoterScope({ role: "state_admin", stateId: 24 })).toEqual({ stateId: 24 });
    expect(getVoterScope({ role: "state_admin", stateId: 27 })).toEqual({ stateId: 27 });
  });

  it("requires and preserves assigned LGA and ward boundaries", () => {
    expect(getVoterScope({ role: "lga_admin", stateId: 24 })).toBeNull();
    expect(getVoterScope({ role: "lga_admin", stateId: 24, lgaId: 5 })).toEqual({
      stateId: 24,
      lgaId: 5,
    });
    expect(getVoterScope({ role: "ward_admin", stateId: 24, lgaId: 5 })).toBeNull();
    expect(getVoterScope({ role: "ward_admin", stateId: 24, lgaId: 5, wardId: 8 })).toEqual({
      stateId: 24,
      lgaId: 5,
      wardId: 8,
    });
  });

  it("requires an assigned polling unit and keeps all known parent boundaries", () => {
    expect(getVoterScope({ role: "pu_agent", stateId: 24 })).toBeNull();
    expect(
      getVoterScope({
        role: "pu_agent",
        stateId: 24,
        lgaId: 5,
        wardId: 8,
        lagosPollingUnitId: 12,
        puid: " PU-001 ",
      }),
    ).toEqual({ stateId: 24, lgaId: 5, wardId: 8, puId: 12, puid: "PU-001" });
    expect(getVoterScope({ role: "pu_agent", stateId: 27, puid: "OG-1" })).toEqual({
      stateId: 27,
      puid: "OG-1",
    });
  });

  it("allows an explicitly national administrator to query nationally", () => {
    expect(getVoterScope({ role: "national_admin" })).toEqual({});
  });
});
