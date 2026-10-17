import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

vi.mock("./supabase", () => ({
  supabase: { functions: { invoke } },
}));

import { greenApiService } from "./greenApi";

beforeEach(() => {
  invoke.mockReset();
});

describe("knowledge base calls", () => {
  it("sends the update action and returns the updated entry", async () => {
    const item = { id: "entry-1", state_id: 25, title: "Policy", content: "Text" };
    invoke.mockResolvedValue({ data: { success: true, item }, error: null });

    await expect(
      greenApiService.updateKnowledgeEntry(
        "entry-1",
        "Policy",
        "Text",
        "policy",
        "",
        "",
        "",
        "",
        25,
      ),
    ).resolves.toEqual(item);
    expect(invoke).toHaveBeenCalledWith("whatsapp-admin", {
      body: {
        action: "updateKnowledge",
        id: "entry-1",
        stateId: 25,
        title: "Policy",
        content: "Text",
        contentType: "policy",
        imageUrl: "",
        imageCaption: "",
        docUrl: "",
        docName: "",
      },
    });
  });

  it("rejects an update that the function did not confirm", async () => {
    invoke.mockResolvedValue({ data: { success: false, error: "Denied" }, error: null });
    await expect(
      greenApiService.updateKnowledgeEntry(
        "entry-1",
        "Policy",
        "Text",
        "policy",
        "",
        "",
        "",
        "",
        25,
      ),
    ).rejects.toThrow("Denied");
  });

  it("returns re-index counts and rejects malformed responses", async () => {
    invoke.mockResolvedValueOnce({
      data: { success: true, totalProcessed: 2, createdChunksCount: 4 },
      error: null,
    });
    await expect(greenApiService.reindexKnowledge(25)).resolves.toEqual({
      totalProcessed: 2,
      createdChunksCount: 4,
    });
    expect(invoke).toHaveBeenCalledWith("whatsapp-admin", {
      body: { action: "reindexKnowledge", stateId: 25 },
    });

    invoke.mockResolvedValueOnce({ data: { success: true }, error: null });
    await expect(greenApiService.reindexKnowledge(25)).rejects.toThrow(
      "Knowledge re-indexing failed",
    );
  });

  it("propagates transport failures", async () => {
    invoke.mockResolvedValue({ data: null, error: new Error("Network unavailable") });
    await expect(greenApiService.reindexKnowledge(25)).rejects.toThrow("Network unavailable");
  });
});
