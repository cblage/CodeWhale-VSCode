import { describe, it, expect, vi } from "vitest";
import { CodeWhaleApiClient } from "../api/api-client";
import type { EngineRef } from "../types";

function createBoundClient(opts?: {
  baseUrl?: string;
  token?: string | null;
  ensureRunning?: () => Promise<void>;
}) {
  let currentBaseUrl = opts?.baseUrl ?? "http://127.0.0.1:54321";
  let currentToken = opts?.token ?? null;

  const engine: EngineRef = {
    ensureRunning: vi.fn(opts?.ensureRunning ?? (async () => undefined)),
    get baseUrl() {
      return currentBaseUrl;
    },
    get token() {
      return currentToken;
    },
  };

  const client = new CodeWhaleApiClient("http://initial.invalid", "initial-token");
  client.bindEngine(engine);

  const setBaseUrl = vi.spyOn(client, "setBaseUrl");
  const setToken = vi.spyOn(client, "setToken");

  return {
    client,
    engine,
    setBaseUrl,
    setToken,
    updateEngine(next: { baseUrl?: string; token?: string | null }) {
      if (next.baseUrl !== undefined) currentBaseUrl = next.baseUrl;
      if ("token" in next) currentToken = next.token ?? null;
    },
  };
}

describe("CodeWhaleApiClient.ensureReady()", () => {
  it("calls engine.ensureRunning() before syncing", async () => {
    const callOrder: string[] = [];
    const { client } = createBoundClient({
      ensureRunning: async () => {
        callOrder.push("ensureRunning");
      },
    });

    vi.spyOn(client, "setBaseUrl").mockImplementation((url: string) => {
      callOrder.push("setBaseUrl");
      CodeWhaleApiClient.prototype.setBaseUrl.call(client, url);
    });
    vi.spyOn(client, "setToken").mockImplementation((token: string | null) => {
      callOrder.push("setToken");
      CodeWhaleApiClient.prototype.setToken.call(client, token);
    });

    await client.ensureReady();

    expect(callOrder).toEqual(["ensureRunning", "setBaseUrl", "setToken"]);
  });

  it("syncs baseUrl and token from the bound engine", async () => {
    const { client, engine, setBaseUrl, setToken } = createBoundClient({
      baseUrl: "http://127.0.0.1:9999",
      token: "sk-test-token",
    });

    await client.ensureReady();

    expect(engine.ensureRunning).toHaveBeenCalledOnce();
    expect(setBaseUrl).toHaveBeenCalledWith("http://127.0.0.1:9999");
    expect(setToken).toHaveBeenCalledWith("sk-test-token");
  });

  it("syncs a null token when the engine has no auth token", async () => {
    const { client, setToken } = createBoundClient({ token: null });

    await client.ensureReady();

    expect(setToken).toHaveBeenCalledWith(null);
  });

  it("uses the post-startup baseUrl when ensureRunning changes the port", async () => {
    const { client, setBaseUrl, updateEngine } = createBoundClient({
      baseUrl: "http://127.0.0.1:7878",
      ensureRunning: async () => {
        updateEngine({ baseUrl: "http://127.0.0.1:43210" });
      },
    });

    await client.ensureReady();

    expect(setBaseUrl).toHaveBeenCalledWith("http://127.0.0.1:43210");
  });

  it("propagates ensureRunning errors without syncing client state", async () => {
    const { client, setBaseUrl, setToken } = createBoundClient({
      ensureRunning: async () => {
        throw new Error("Engine failed to start");
      },
    });

    await expect(client.ensureReady()).rejects.toThrow("Engine failed to start");
    expect(setBaseUrl).not.toHaveBeenCalled();
    expect(setToken).not.toHaveBeenCalled();
  });

  it("is a no-op when no engine is bound", async () => {
    const client = new CodeWhaleApiClient("http://127.0.0.1:54321");
    const setBaseUrl = vi.spyOn(client, "setBaseUrl");
    const setToken = vi.spyOn(client, "setToken");

    await expect(client.ensureReady()).resolves.toBeUndefined();
    expect(setBaseUrl).not.toHaveBeenCalled();
    expect(setToken).not.toHaveBeenCalled();
  });
});

describe("CodeWhaleApiClient.syncFromEngine()", () => {
  it("syncs without calling ensureRunning()", () => {
    const { client, engine, setBaseUrl, setToken } = createBoundClient({
      baseUrl: "http://127.0.0.1:7878",
      token: "sk-abc",
    });

    client.syncFromEngine();

    expect(engine.ensureRunning).not.toHaveBeenCalled();
    expect(setBaseUrl).toHaveBeenCalledWith("http://127.0.0.1:7878");
    expect(setToken).toHaveBeenCalledWith("sk-abc");
  });

  it("does not reapply unchanged baseUrl or token", () => {
    const { client, setBaseUrl, setToken } = createBoundClient({
      baseUrl: "http://127.0.0.1:54321",
      token: null,
    });

    client.syncFromEngine();
    client.syncFromEngine();

    expect(setBaseUrl).toHaveBeenCalledTimes(1);
    expect(setToken).toHaveBeenCalledTimes(1);
  });

  it("updates the client when engine connection details change", () => {
    const { client, setBaseUrl, setToken, updateEngine } = createBoundClient({
      baseUrl: "http://127.0.0.1:54321",
      token: null,
    });

    client.syncFromEngine();
    updateEngine({
      baseUrl: "http://127.0.0.1:9999",
      token: "sk-new-token",
    });
    client.syncFromEngine();

    expect(setBaseUrl).toHaveBeenNthCalledWith(2, "http://127.0.0.1:9999");
    expect(setToken).toHaveBeenNthCalledWith(2, "sk-new-token");
  });
});
