import { describe, expect, it } from "vite-plus/test";
import {
  canManageAgent,
  createSessionToken,
  hashPassword,
  readJsonObject,
  readSessionToken,
  sha256,
  verifyPassword,
  type AgentIdentity,
} from "../../supabase/functions/_shared/agent-security";

describe("server credential and request checks", () => {
  it("validates existing SHA-256 passwords without allowing missing hashes", async () => {
    const hash = await sha256("synthetic-existing-password");
    expect(await verifyPassword("synthetic-existing-password", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
    for (const value of [null, undefined, "", "malformed"])
      expect(await verifyPassword("anything", value)).toBe(false);
  });
  it("salts new password hashes and checks them", async () => {
    const hash = await hashPassword("synthetic-new-password");
    expect(hash).toMatch(/^pbkdf2-sha256\$600000\$/);
    expect(await verifyPassword("synthetic-new-password", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
    expect(await hashPassword("synthetic-new-password")).not.toBe(hash);
  }, 15000);
  it("requires unguessable session tokens and ignores identity headers", () => {
    const token = createSessionToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(createSessionToken()).not.toBe(token);
    expect(readSessionToken(new Headers({ "x-agent-id": "spoofed" }))).toBeNull();
    expect(readSessionToken(new Headers({ "x-agent-session": "bad" }))).toBeNull();
    expect(readSessionToken(new Headers({ "x-agent-session": token }))).toBe(token);
  });
  it("enforces the role hierarchy and every assigned parent boundary", () => {
    const caller: AgentIdentity = {
      id: "synthetic-admin",
      role: "lga_admin",
      status: "Active",
      state_id: 24,
      local_governments_id: 241,
      wards_id: null,
      polling_units_id: null,
    };
    const target: AgentIdentity = {
      ...caller,
      id: "synthetic-agent",
      role: "ward_admin",
      wards_id: 2411,
    };
    expect(canManageAgent(caller, target)).toBe(true);
    expect(canManageAgent(caller, { ...target, state_id: 27 })).toBe(false);
    expect(canManageAgent(caller, { ...target, local_governments_id: 242 })).toBe(false);
    expect(canManageAgent(caller, { ...target, role: "national_admin" })).toBe(false);
    expect(canManageAgent({ ...caller, status: "Suspended" }, target)).toBe(false);
  });
  it("rejects oversized, malformed and non-object JSON before processing", async () => {
    const request = (body: string) =>
      new Request("https://example.test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
    expect(await readJsonObject(request('{"action":"me"}'))).toEqual({ action: "me" });
    await expect(readJsonObject(request("[]"))).rejects.toThrow();
    await expect(readJsonObject(request("{"))).rejects.toThrow();
    await expect(
      readJsonObject(request('{"padding":"' + "a".repeat(100) + '"}'), 16),
    ).rejects.toThrow("Request too large");
  });
});
