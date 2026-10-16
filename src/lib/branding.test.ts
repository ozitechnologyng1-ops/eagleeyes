import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { getBrandConfig } from "./branding";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("state branding", () => {
  it.each([
    ["lagosadc.com", "lagos", "Lagos 2027"],
    ["portal.ogunadc.com", "ogun", "Ogun 2027"],
    ["example.com", "default", "EagleEye 2027"],
  ])("resolves %s to %s", (hostname, id, appName) => {
    vi.stubGlobal("window", { location: { hostname } });
    const brand = getBrandConfig();
    expect(brand.id).toBe(id);
    expect(brand.appName).toBe(appName);
  });

  it("uses default branding when no browser hostname is available", () => {
    vi.stubGlobal("window", undefined);
    expect(getBrandConfig().id).toBe("default");
  });
});
