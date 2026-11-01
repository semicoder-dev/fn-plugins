import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import backend from "../src/backend.ts";
import api from "../src/contract.ts";

test("backend uses host cache directory and closes its catalog service", async () => {
  const root = await mkdtemp("/tmp/fn-models-backend-");
  const cache = join(root, "cache");
  await mkdir(cache);
  await Bun.write(
    join(cache, "catalog-v1.json"),
    JSON.stringify({
      version: 1,
      fetchedAt: Date.now(),
      data: {
        models: { "lab/a": { id: "lab/a", name: "Cached model" } },
        providers: {},
      },
    }),
  );
  const instance = await backend.setup({
    host: {
      paths: { cache, data: join(root, "data"), logs: join(root, "logs") },
    } as any,
  });
  const context = { signal: new AbortController().signal, requestId: "test" };
  try {
    const rows = api.list.output.parse(
      await instance.handlers.list({}, context),
    );
    expect(rows.items[0]?.name).toBe("Cached model");
    expect(
      api.detail.output.parse(
        await instance.handlers.detail({ id: "lab/a" }, context),
      ).offers,
    ).toEqual([]);
    await instance.stop?.();
    await expect(
      Promise.resolve().then(() => instance.handlers.list({}, context)),
    ).rejects.toThrow();
  } finally {
    await instance.stop?.();
    await rm(root, { recursive: true, force: true });
  }
});
