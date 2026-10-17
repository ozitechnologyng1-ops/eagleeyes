import type { User } from "../context/AppContext";

type VoterScopeUser = Pick<
  User,
  "role" | "stateId" | "lgaId" | "wardId" | "puId" | "lagosPollingUnitId" | "puid"
>;

export interface VoterScope {
  stateId?: number;
  lgaId?: number;
  wardId?: number;
  puId?: number;
  puid?: string;
}

const validId = (value: number | null | undefined): value is number =>
  Number.isSafeInteger(value) && Number(value) > 0;

export function getVoterScope(user: VoterScopeUser | null): VoterScope | null {
  if (!user) return null;
  if (user.role === "national_admin") return {};
  if (!validId(user.stateId)) return null;

  const scope: VoterScope = { stateId: user.stateId };

  if (user.role === "state_admin") return scope;
  if (user.role === "lga_admin" && !validId(user.lgaId)) return null;
  if (validId(user.lgaId)) scope.lgaId = user.lgaId;

  if (user.role === "lga_admin") return scope;
  if (user.role === "ward_admin" && !validId(user.wardId)) return null;
  if (validId(user.wardId)) scope.wardId = user.wardId;

  if (user.role === "ward_admin") return scope;
  if (user.role !== "pu_agent") return null;

  const puId = validId(user.puId)
    ? user.puId
    : validId(user.lagosPollingUnitId)
      ? user.lagosPollingUnitId
      : null;
  const puid = user.puid?.trim();
  if (!puId && !puid) return null;
  if (puId) scope.puId = puId;
  if (puid) scope.puid = puid;
  return scope;
}
