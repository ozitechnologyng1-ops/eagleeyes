export interface ExportResult {
  id: string;
  election_type: string;
  state_id: number | null;
  local_governments_id: number | null;
  wards_id: number | null;
  polling_units_id: string;
  agent_id: string | null;
  created_at: string;
  status: string | null;
  total_valid: number;
  total_rejected: number;
  total_cast: number;
  image_url: string | null;
  results_json: {
    number_of_voters_on_register?: number;
    number_of_accredited_voters?: number;
    political_party_results?: { party: string; votes_in_figures: number }[];
  } | null;
}

const baseHeaders = [
  "Result ID",
  "Election",
  "State ID",
  "LGA ID",
  "Ward ID",
  "Polling Unit ID",
  "Agent ID",
  "Captured At",
  "Status",
  "Registered",
  "Accredited",
  "Valid Votes",
  "Rejected Votes",
  "Total Cast",
  "Image URL",
];

export function resultExportTable(results: ExportResult[]): (string | number)[][] {
  const parties = Array.from(
    new Set(
      results.flatMap((result) =>
        (result.results_json?.political_party_results || [])
          .map((party) => party.party.trim().toUpperCase())
          .filter(Boolean),
      ),
    ),
  ).sort();
  return [
    [...baseHeaders, ...parties.map((party) => `${party} Votes`)],
    ...results.map((result) => {
      const votes = new Map(
        (result.results_json?.political_party_results || []).map((party) => [
          party.party.trim().toUpperCase(),
          party.votes_in_figures,
        ]),
      );
      return [
        result.id,
        result.election_type,
        result.state_id ?? "",
        result.local_governments_id ?? "",
        result.wards_id ?? "",
        result.polling_units_id,
        result.agent_id ?? "",
        result.created_at,
        result.status ?? "",
        result.results_json?.number_of_voters_on_register ?? "",
        result.results_json?.number_of_accredited_voters ?? "",
        result.total_valid,
        result.total_rejected,
        result.total_cast,
        result.image_url ?? "",
        ...parties.map((party) => votes.get(party) ?? 0),
      ];
    }),
  ];
}

function safeCell(value: string | number): string | number {
  if (typeof value !== "string") return value;
  let index = 0;
  while (index < value.length && (value.charCodeAt(index) < 32 || /\s/.test(value[index]))) {
    index++;
  }
  return index < value.length && "=+-@".includes(value[index]) ? `'${value}` : value;
}

export function resultCsv(table: (string | number)[][]): string {
  return (
    "\uFEFF" +
    table
      .map((row) => row.map((cell) => `"${String(safeCell(cell)).replace(/"/g, '""')}"`).join(","))
      .join("\r\n")
  );
}
