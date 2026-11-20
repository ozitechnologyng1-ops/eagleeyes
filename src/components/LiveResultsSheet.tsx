import { useEffect, useMemo, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import type { Location } from "../context/AppContext";
import { readAgentSession, SESSION_CHANGED_EVENT, SESSION_KEY } from "../lib/agentSession";
import { REGISTERED_PARTIES } from "../lib/resultCapture";
import type { ExportResult } from "../lib/resultExport";
import { supabase } from "../lib/supabase";

type Result = Pick<
  ExportResult,
  | "id"
  | "state_id"
  | "local_governments_id"
  | "total_valid"
  | "total_rejected"
  | "total_cast"
  | "results_json"
>;

type Lga = { id: number; name: string; state_id: number };
type Totals = {
  submissions: number;
  registered: number;
  accredited: number;
  valid: number;
  rejected: number;
  cast: number;
  parties: Map<string, number>;
};
type Summary = Totals & { key: string; name: string; stateId: number | null };
type Selection = {
  election: string;
  stateId?: number | null;
  lgaId?: number | null;
  wardId?: number | null;
  puId?: string | number | null;
  locations: Location[];
};

const PAGE_SIZE = 500;
const REFRESH_INTERVAL = 60_000;
const numberFormat = new Intl.NumberFormat();
const cell = "border-b border-r border-slate-200 px-3 py-2 whitespace-nowrap";
const rowNumber =
  "sticky left-0 z-10 w-12 min-w-12 bg-slate-100 text-center text-xs text-slate-500";
const lgaColumn = "sticky left-12 z-10 min-w-44 border-r-2 border-r-emerald-200";

const emptyTotals = (): Totals => ({
  submissions: 0,
  registered: 0,
  accredited: 0,
  valid: 0,
  rejected: 0,
  cast: 0,
  parties: new Map(),
});

export function summarizeLgaResults(lgas: Lga[], results: Result[]) {
  const directory = new Map(lgas.map((lga) => [lga.id, lga]));
  const rows = new Map<string, Summary>();
  const grandTotal = emptyTotals();
  for (const lga of lgas) {
    const key = `${lga.state_id}:${lga.id}`;
    rows.set(key, { ...emptyTotals(), key, name: lga.name, stateId: lga.state_id });
  }

  for (const result of results) {
    const lga =
      result.local_governments_id === null ? undefined : directory.get(result.local_governments_id);
    const stateId = result.state_id ?? lga?.state_id ?? null;
    const key = `${stateId}:${result.local_governments_id}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        ...emptyTotals(),
        key,
        stateId,
        name:
          result.local_governments_id === null
            ? "Unassigned LGA"
            : `LGA ${result.local_governments_id}`,
      };
      rows.set(key, row);
    }

    for (const totals of [row, grandTotal]) {
      totals.submissions++;
      const registered = result.results_json?.number_of_voters_on_register;
      const accredited = result.results_json?.number_of_accredited_voters;
      if (typeof registered === "number" && Number.isFinite(registered))
        totals.registered += registered;
      if (typeof accredited === "number" && Number.isFinite(accredited))
        totals.accredited += accredited;
      totals.valid += result.total_valid ?? 0;
      totals.rejected += result.total_rejected ?? 0;
      totals.cast += result.total_cast ?? 0;
    }

    const entries = result.results_json?.political_party_results;
    if (Array.isArray(entries)) {
      for (const entry of entries) {
        const party = typeof entry?.party === "string" ? entry.party.trim().toUpperCase() : "";
        if (!party || !Number.isFinite(entry.votes_in_figures)) continue;
        for (const totals of [row, grandTotal]) {
          totals.parties.set(party, (totals.parties.get(party) ?? 0) + entry.votes_in_figures);
        }
      }
    }
  }

  return {
    rows: [...rows.values()].sort(
      (a, b) => a.name.localeCompare(b.name) || (a.stateId ?? 0) - (b.stateId ?? 0),
    ),
    grandTotal,
    parties: [...new Set([...REGISTERED_PARTIES, ...[...grandTotal.parties.keys()].sort()])],
  };
}

function columnLetter(index: number) {
  let label = "";
  for (let position = index + 1; position > 0; position = Math.floor((position - 1) / 26)) {
    label = String.fromCharCode(65 + ((position - 1) % 26)) + label;
  }
  return label;
}

export const RESULT_ELECTIONS = ["presidential", "senate", "house", "governorship", "state_house"];

type SheetFilters = Omit<Selection, "locations">;

async function fetchSummaryLgas(
  { stateId, lgaId }: Pick<SheetFilters, "stateId" | "lgaId">,
  signal: AbortSignal,
  canRead: () => boolean,
) {
  const lgas: Lga[] = [];
  let cursor = 0;
  while (canRead()) {
    let query = supabase.from("local_governments").select("id,name,state_id");
    if (stateId) query = query.eq("state_id", stateId);
    if (lgaId) query = query.eq("id", lgaId);
    const { data, error } = await query
      .gt("id", cursor)
      .order("id")
      .limit(PAGE_SIZE)
      .abortSignal(signal);
    if (error) throw error;
    if (!data?.length) return lgas;
    lgas.push(...data);
    cursor = data[data.length - 1].id;
  }
  throw new Error("Results request cancelled.");
}

export async function fetchLgaResultSummary(
  filters: SheetFilters,
  signal: AbortSignal,
  canRead: () => boolean,
  directory?: Lga[],
) {
  const { election, stateId, lgaId, wardId, puId } = filters;
  const lgas = directory ?? (await fetchSummaryLgas(filters, signal, canRead));
  const results: Result[] = [];
  let afterId: string | undefined;
  while (canRead()) {
    let query = supabase
      .from("election_results")
      .select("id,state_id,local_governments_id,total_valid,total_rejected,total_cast,results_json")
      .eq("election_type", election);
    if (stateId) query = query.eq("state_id", stateId);
    if (lgaId) query = query.eq("local_governments_id", lgaId);
    if (wardId) query = query.eq("wards_id", wardId);
    if (puId) query = query.eq("polling_units_id", String(puId));
    if (afterId) query = query.gt("id", afterId);
    const { data, error } = await query.order("id").limit(PAGE_SIZE).abortSignal(signal);
    if (error) throw error;
    if (!canRead()) break;
    if (!data?.length) return summarizeLgaResults(lgas, results);
    results.push(...data);
    afterId = data[data.length - 1].id;
  }
  throw new Error("Results request cancelled.");
}

const summaryMetrics = [
  "Submissions",
  "Registered",
  "Accredited",
  "Valid",
  "Rejected",
  "Total cast",
];

function summaryHeaders(parties: readonly string[]) {
  return ["LGA", ...summaryMetrics, ...parties.map((party) => `${party} votes`)];
}

function summaryFigures(total: Totals, parties: readonly string[]) {
  return [
    total.submissions,
    total.registered,
    total.accredited,
    total.valid,
    total.rejected,
    total.cast,
    ...parties.map((party) => total.parties.get(party) ?? 0),
  ];
}

export function lgaSummaryTable(summary: ReturnType<typeof summarizeLgaResults>) {
  return [
    summaryHeaders(summary.parties),
    ...summary.rows.map((row) => [row.name, ...summaryFigures(row, summary.parties)]),
    ["Grand total", ...summaryFigures(summary.grandTotal, summary.parties)],
  ];
}

export function lgaSummaryPrintSections(table: ReturnType<typeof lgaSummaryTable>) {
  const metricEnd = summaryMetrics.length + 1;
  const sections = [{ title: "Ballot totals", rows: table.map((row) => row.slice(0, metricEnd)) }];
  const partiesPerSection = 9;
  for (let start = metricEnd; start < table[0].length; start += partiesPerSection) {
    sections.push({
      title: `Party votes ${sections.length}`,
      rows: table.map((row) => [row[0], ...row.slice(start, start + partiesPerSection)]),
    });
  }
  return sections;
}

export function liveResultsSheetHref(pathname: string, filters: SheetFilters) {
  const params = new URLSearchParams({ view: "live-results", election: filters.election });
  for (const key of ["stateId", "lgaId", "wardId", "puId"] as const) {
    const value = filters[key];
    if (value) params.set(key, String(value));
  }
  return pathname + "?" + params.toString();
}

export function readLiveResultsSelection(search: string): SheetFilters | null {
  const params = new URLSearchParams(search);
  if (params.get("view") !== "live-results") return null;
  const election = params.get("election") ?? "";
  const numericId = (key: string) => {
    const value = params.get(key);
    if (!value || !/^[1-9]\d*$/.test(value)) return undefined;
    const id = Number(value);
    return Number.isSafeInteger(id) ? id : undefined;
  };
  return {
    election: RESULT_ELECTIONS.includes(election) ? election : "presidential",
    stateId: numericId("stateId"),
    lgaId: numericId("lgaId"),
    wardId: numericId("wardId"),
    puId:
      numericId("puId") ??
      (/^\d{2}-\d{2}-\d{2}-\d{3}$/.test(params.get("puId") ?? "") ? params.get("puId") : undefined),
  };
}

export function LiveResultsSheet({
  selection,
  onClose,
}: {
  selection: Selection;
  onClose: () => void;
}) {
  const [sessionToken] = useState(() => readAgentSession()?.token);
  const { election, stateId, lgaId, wardId, puId, locations } = selection;
  const [snapshot, setSnapshot] = useState<
    ReturnType<typeof summarizeLgaResults> & { checkedAt: Date }
  >();
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(true);
  const [failed, setFailed] = useState(false);
  const states = useMemo(
    () =>
      new Map(locations.filter(({ type }) => type === "state").map(({ id, name }) => [id, name])),
    [locations],
  );
  const stateName = (id: number | null) =>
    id === null ? "Unassigned" : (states.get(`state_${id}`) ?? `State ${id}`);

  useEffect(() => {
    const checkSession = () => {
      if (!sessionToken || readAgentSession()?.token !== sessionToken) onClose();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === SESSION_KEY || event.key === null) checkSession();
    };
    window.addEventListener(SESSION_CHANGED_EVENT, checkSession);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SESSION_CHANGED_EVENT, checkSession);
      window.removeEventListener("storage", onStorage);
    };
  }, [sessionToken, onClose]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    let timer: ReturnType<typeof setTimeout>;
    let directory: Lga[] | undefined;
    const canRead = () => {
      if (signal.aborted) return false;
      if (sessionToken && readAgentSession()?.token === sessionToken) return true;
      controller.abort();
      onClose();
      return false;
    };
    const refresh = async () => {
      if (!canRead()) return;
      setRefreshing(true);
      try {
        directory ??= await fetchSummaryLgas({ stateId, lgaId }, signal, canRead);
        const summary = await fetchLgaResultSummary(
          { election, stateId, lgaId, wardId, puId },
          signal,
          canRead,
          directory,
        );
        if (canRead()) {
          setSnapshot({ ...summary, checkedAt: new Date() });
          setFailed(false);
        }
      } catch {
        if (!signal.aborted) setFailed(true);
      } finally {
        if (!signal.aborted) {
          setRefreshing(false);
          timer = setTimeout(() => void refresh(), REFRESH_INTERVAL);
        }
      }
    };
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [election, stateId, lgaId, wardId, puId, refreshVersion, sessionToken, onClose]);

  const parties = snapshot?.parties ?? REGISTERED_PARTIES;
  const headers = summaryHeaders(parties);
  const figures = (total: Totals) => summaryFigures(total, parties);
  return (
    <main className="fixed inset-0 z-[100] flex flex-col bg-white text-slate-900">
      <header className="flex shrink-0 items-start justify-between gap-3 bg-[#004d25] px-4 py-3 text-white sm:px-6">
        <div>
          <h1 className="text-lg font-bold">Live Results Sheet</h1>
          <p className="text-sm capitalize text-emerald-100">
            {election.replaceAll("_", " ")} · {stateId ? stateName(stateId) : "All states"}
            {(lgaId || wardId || puId) && " · Jurisdiction filtered"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Back to dashboard"
          className="cursor-pointer rounded-md p-2 hover:bg-white/15"
        >
          <X size={21} />
        </button>
      </header>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-950 sm:px-6">
        <span role="status">
          {refreshing
            ? "Updating totals…"
            : failed
              ? "Refresh failed. Retrying automatically."
              : "Auto-refresh · every minute"}
        </span>
        <div className="flex items-center gap-3">
          {snapshot && (
            <time dateTime={snapshot.checkedAt.toISOString()}>
              Last updated {snapshot.checkedAt.toLocaleTimeString()}
            </time>
          )}
          <button
            type="button"
            disabled={refreshing}
            onClick={() => setRefreshVersion((version) => version + 1)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-3 py-1.5 font-semibold hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? "motion-safe:animate-spin" : undefined} />{" "}
            Refresh
          </button>
        </div>
      </div>
      <div
        className="min-h-0 flex-1 overflow-auto"
        tabIndex={0}
        role="region"
        aria-label="Scrollable LGA totals grid"
      >
        <table
          aria-label="Election result totals by LGA"
          className="w-full border-separate border-spacing-0 text-sm"
        >
          <thead className="sticky top-0 z-20 text-left">
            <tr
              aria-hidden="true"
              className="bg-emerald-100 text-center text-xs font-semibold text-emerald-900"
            >
              <td className={`${cell} ${rowNumber}`} />
              {headers.map((heading, index) => (
                <td
                  key={heading}
                  className={`${cell} ${index === 0 ? `${lgaColumn} bg-emerald-100` : ""}`}
                >
                  {columnLetter(index)}
                </td>
              ))}
            </tr>
            <tr className="bg-slate-100 text-xs font-semibold text-slate-700">
              <th scope="col" className={`${cell} ${rowNumber}`}>
                #
              </th>
              {headers.map((heading, index) => (
                <th
                  scope="col"
                  key={heading}
                  className={`${cell} ${index === 0 ? `${lgaColumn} bg-slate-100` : ""}`}
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {snapshot?.rows.map((row, index) => (
              <tr key={row.key} className="group odd:bg-white even:bg-slate-50 hover:bg-emerald-50">
                <td className={`${cell} ${rowNumber}`}>{index + 1}</td>
                <th
                  scope="row"
                  className={`${cell} ${lgaColumn} bg-white text-left font-medium group-even:bg-slate-50 group-hover:bg-emerald-50`}
                >
                  {row.name}
                </th>
                {figures(row).map((value, column) => (
                  <td key={headers[column + 1]} className={`${cell} text-right tabular-nums`}>
                    {numberFormat.format(value)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {snapshot && (
            <tfoot className="sticky bottom-0 z-20 bg-emerald-100 font-semibold text-emerald-950">
              <tr>
                <td className={`${cell} ${rowNumber}`} />
                <th scope="row" className={`${cell} ${lgaColumn} bg-emerald-100 text-left`}>
                  Grand total
                </th>
                {figures(snapshot.grandTotal).map((value, column) => (
                  <td key={headers[column + 1]} className={`${cell} text-right tabular-nums`}>
                    {numberFormat.format(value)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
        {(!snapshot || snapshot.rows.length === 0) && (
          <p className="p-6 text-sm text-slate-600">
            {failed
              ? "Could not load LGA totals."
              : snapshot
                ? "No LGAs for this selection."
                : "Loading LGA totals…"}
          </p>
        )}
      </div>
    </main>
  );
}
