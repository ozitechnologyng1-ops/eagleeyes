import type { SupabaseClient } from "@supabase/supabase-js";
import type { VoterScope } from "./voterScope";

export const VOTER_PAGE_SIZE = 500;
const VOTER_COLUMNS =
  "id,first_name,last_name,phone_number,image,puid,dob,state_id,localgovernment_id,ward_id,polling_unit_id,status,notes,contact_logs";

export interface VoterFilters {
  stateId?: number | null;
  lgaId?: number | null;
  wardId?: number | null;
  puId?: number | null;
  puid?: string | null;
  searchTerm?: string | null;
  status?: string | null;
  party?: string | null;
}

export interface VoterPage {
  voters: Record<string, any>[];
  hasNextPage: boolean;
}

interface VoterQueryOptions {
  afterId?: number;
  knownTotal?: number;
  onPage?: (page: VoterPage) => void;
}

function filteredQuery(
  client: SupabaseClient,
  scope: VoterScope,
  filters: VoterFilters,
  count = false,
) {
  let query = count
    ? client.from("voters").select("id", { count: "exact", head: true })
    : client.from("voters").select(VOTER_COLUMNS);
  // Assigned boundaries remain independent of selected filters.
  for (const source of [scope, filters]) {
    if (source.stateId) query = query.eq("state_id", source.stateId);
    if (source.lgaId) query = query.eq("localgovernment_id", source.lgaId);
    if (source.wardId) query = query.eq("ward_id", source.wardId);
  }
  const puId = scope.puId || filters.puId;
  const puid = scope.puid || filters.puid;
  if (puid && puId) query = query.or(`puid.eq.${JSON.stringify(puid)},polling_unit_id.eq.${puId}`);
  else if (puid) query = query.eq("puid", puid);
  else if (puId) query = query.eq("polling_unit_id", puId);
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.party && filters.party !== "all") query = query.eq("party", filters.party);
  for (const token of filters.searchTerm?.trim().split(/\s+/).filter(Boolean) || []) {
    const pattern = JSON.stringify(`%${token.replace(/[\\%_*]/g, "\\$&")}%`);
    query = query.or(
      `first_name.ilike.${pattern},last_name.ilike.${pattern},phone_number.ilike.${pattern}`,
    );
  }
  return query;
}

function retryDelay(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException("Search cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, 750);
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}

async function withRetry<T>(request: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw new DOMException("Search cancelled", "AbortError");
    try {
      return await request();
    } catch (error) {
      const status = (error as { status?: number }).status;
      const transient = status !== undefined && [0, 408, 429, 502, 503, 504].includes(status);
      if (signal?.aborted || !transient || attempt >= 1) throw error;
      await retryDelay(signal);
    }
  }
}

export async function queryVoterRegister(
  client: SupabaseClient,
  scope: VoterScope,
  filters: VoterFilters,
  page: number,
  signal?: AbortSignal,
  options: VoterQueryOptions = {},
) {
  if (!Number.isSafeInteger(page) || page < 1) throw new Error("Invalid voter page");
  if (
    options.afterId !== undefined &&
    (!Number.isSafeInteger(options.afterId) || options.afterId < 0)
  ) {
    throw new Error("Invalid voter cursor");
  }
  const result = await withRetry(async () => {
    let query = filteredQuery(client, scope, filters).order("id", { ascending: true });
    if (options.afterId !== undefined)
      query = query.gt("id", options.afterId).limit(VOTER_PAGE_SIZE + 1);
    else {
      const start = (page - 1) * VOTER_PAGE_SIZE;
      query = query.range(start, start + VOTER_PAGE_SIZE);
    }
    const { data, error, status } = await (signal ? query.abortSignal(signal) : query).retry(false);
    if (error) throw Object.assign(new Error(error.message), { status, code: error.code });
    const rows = data || [];
    return { voters: rows.slice(0, VOTER_PAGE_SIZE), hasNextPage: rows.length > VOTER_PAGE_SIZE };
  }, signal);
  if (signal?.aborted) throw new DOMException("Search cancelled", "AbortError");
  options.onPage?.(result);
  if (page === 1 && !result.hasNextPage)
    return { ...result, total: result.voters.length, countError: null };
  if (options.knownTotal !== undefined)
    return { ...result, total: options.knownTotal, countError: null };
  try {
    const total = await withRetry(async () => {
      const query = filteredQuery(client, scope, filters, true);
      const { count, error, status } = await (signal ? query.abortSignal(signal) : query).retry(
        false,
      );
      if (error) throw Object.assign(new Error(error.message), { status, code: error.code });
      if (count === null) throw new Error("Voter total was not returned");
      return count;
    }, signal);
    return { ...result, total, countError: null };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { ...result, total: null, countError: error };
  }
}

export function formatVoterProgress(page: number, rows: number, total: number | null) {
  const reached = rows === 0 ? 0 : (page - 1) * VOTER_PAGE_SIZE + rows;
  if (total === null) return reached.toLocaleString();
  return total <= VOTER_PAGE_SIZE
    ? total.toLocaleString()
    : `${Math.min(reached, total).toLocaleString()} / ${total.toLocaleString()}`;
}
