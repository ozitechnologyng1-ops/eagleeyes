export const REGISTERED_PARTIES = [
  "A",
  "AA",
  "AAC",
  "ADC",
  "ADP",
  "APC",
  "APGA",
  "APM",
  "APP",
  "BP",
  "DLA",
  "LP",
  "NDC",
  "NDP",
  "NNPP",
  "NRM",
  "PDP",
  "PRP",
  "SDP",
  "YP",
  "YPP",
  "ZLP",
] as const;

export interface PartyResult {
  party: string;
  votes_in_figures: number;
}

export function assignedPuId(
  user: { puId?: number | null; lagosPollingUnitId?: number | null } | null,
): string {
  const id = user?.puId ?? user?.lagosPollingUnitId;
  return typeof id === "number" && Number.isSafeInteger(id) && id > 0 ? String(id) : "";
}

export function resultMathValid(data: {
  political_party_results: PartyResult[];
  number_of_valid_votes: number;
  number_of_spoiled_ballot_papers: number;
  number_of_rejected_ballots: number;
  total_number_of_used_ballots: number;
  total_votes_cast: number;
}): boolean {
  const sumParties = data.political_party_results.reduce(
    (sum, party) => sum + party.votes_in_figures,
    0,
  );
  const item8 = data.total_number_of_used_ballots || data.total_votes_cast;
  const sumForm =
    data.number_of_spoiled_ballot_papers +
    data.number_of_rejected_ballots +
    data.number_of_valid_votes;
  return sumParties === data.number_of_valid_votes && sumForm === item8;
}
