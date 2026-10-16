import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { loginAgent, logoutAgent, restoreAgent } from "./agentAuth";
import {
  agentRequestHeaders,
  readAgentSession,
  saveAgentSession,
  SESSION_KEY,
} from "./agentSession";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("./supabase", () => ({ supabase: { functions: { invoke } } }));

function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };
}
const token = "a".repeat(64);
beforeEach(() => {
  vi.stubGlobal("localStorage", storage());
  vi.stubGlobal("sessionStorage", storage());
  vi.stubGlobal("window", new EventTarget());
  invoke.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("persistent custom-agent login", () => {
  it.each([
    ["Lagos", 24],
    ["Ogun", 27],
  ])("stores and restores the verified %s profile", async (name, state_id) => {
    const agent = { id: `test-${name}`, name, state_id, role: "state_admin", status: "Active" };
    invoke.mockResolvedValueOnce({ data: { token, expiresAt: null, agent }, error: null });
    expect(await loginAgent("08000000000", "synthetic-password")).toEqual(agent);
    expect(invoke).toHaveBeenCalledWith("agent-auth", {
      body: { action: "login", phone: "08000000000", password: "synthetic-password" },
      headers: undefined,
    });
    // A fresh tab/browser has empty sessionStorage; localStorage survives.
    sessionStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2036-01-01"));
    expect(readAgentSession()).toEqual({ token, expiresAt: null });
    invoke.mockResolvedValueOnce({ data: { agent }, error: null });
    expect(await restoreAgent()).toEqual(agent);
    expect(localStorage.getItem(SESSION_KEY)).not.toContain("synthetic-password");
  });

  it("clears the durable session on explicit logout and sends the old token for revocation", async () => {
    saveAgentSession(token, null);
    localStorage.setItem("eagleeye_user", JSON.stringify({ id: "cached" }));
    invoke.mockResolvedValueOnce({ data: { success: true }, error: null });
    await logoutAgent();
    expect(readAgentSession()).toBeNull();
    expect(localStorage.getItem("eagleeye_user")).toBeNull();
    expect(invoke).toHaveBeenCalledWith("agent-auth", {
      body: { action: "logout" },
      headers: { "x-agent-session": token },
    });
  });

  it("retains the saved session on temporary network and server failures", async () => {
    saveAgentSession(token, null);
    invoke.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(restoreAgent()).rejects.toThrow();
    expect(readAgentSession()?.token).toBe(token);
    invoke.mockResolvedValueOnce({
      data: null,
      error: { context: new Response('{"error":"Temporary outage"}', { status: 503 }) },
    });
    await expect(restoreAgent()).rejects.toThrow("Temporary outage");
    expect(readAgentSession()?.token).toBe(token);
  });

  it("clears a revoked session on a verified unauthorized response", async () => {
    saveAgentSession(token, null);
    invoke.mockResolvedValueOnce({
      data: null,
      error: { context: new Response('{"error":"Session revoked"}', { status: 401 }) },
    });
    await expect(restoreAgent()).rejects.toThrow("Session revoked");
    expect(readAgentSession()).toBeNull();
  });

  it("does not clear a new session when an older request fails", async () => {
    saveAgentSession(token, null);
    let complete!: (value: unknown) => void;
    invoke.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const request = restoreAgent();
    saveAgentSession("b".repeat(64), null);
    complete({ data: null, error: { context: new Response("{}", { status: 401 }) } });
    await expect(request).rejects.toThrow();
    expect(readAgentSession()?.token).toBe("b".repeat(64));
  });

  it("rejects malformed and credential-bearing login responses", async () => {
    for (const data of [
      { token, agent: { id: "test" } },
      { token: "invalid", expiresAt: null, agent: { id: "test" } },
      { token, expiresAt: null, agent: { id: "test", password_hash: "sensitive" } },
    ]) {
      invoke.mockResolvedValueOnce({ data, error: null });
      await expect(loginAgent("08000000000", "synthetic-password")).rejects.toThrow(
        "Invalid login response",
      );
      expect(readAgentSession()).toBeNull();
    }
  });

  it("does not trust cached identity or forward spoofable identity headers", () => {
    localStorage.setItem("eagleeye_user", JSON.stringify({ id: "admin", role: "national_admin" }));
    expect(readAgentSession()).toBeNull();
    saveAgentSession(token, null);
    const headers = agentRequestHeaders({ "x-agent-id": "forged", "x-agent-phone": "forged" });
    expect(headers.get("x-agent-session")).toBe(token);
    expect(headers.has("x-agent-id")).toBe(false);
    expect(headers.has("x-agent-phone")).toBe(false);
  });
});
