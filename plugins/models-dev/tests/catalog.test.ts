import { expect, test } from "bun:test";
import { CatalogIndex, catalogSchema } from "../src/catalog.ts";
import { listing, detail } from "../src/contract.ts";
import { CatalogService, endpoint } from "../src/service.ts";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const model = {
  id: "lab/a",
  name: "Alpha",
  reasoning: true,
  modalities: { input: ["text", "image"], output: ["text"] },
  limit: { context: 100, output: 10 },
  release_date: "2026-01-02",
};
const raw = {
  models: {
    "lab/a": model,
    "lab/b": {
      id: "lab/b",
      name: "Beta",
      type: "embedding",
      limit: { context: 50 },
      open_weights: true,
    },
  },
  providers: {
    vendor: {
      id: "vendor",
      name: "Vendor",
      models: {
        one: {
          ...model,
          id: "one",
          canonical_model_id: "lab/a",
          cost: { input: 0, output: 2, tiers: [{ input: 3, tier: { size: 100 } }] },
        },
        two: { ...model, id: "two", canonical_model_id: "lab/a" },
        unlinked: { ...model, id: "other" },
      },
    },
  },
};
test("canonical models are listed once; provider variants follow canonical ID precedence", () => {
  const index = new CatalogIndex(catalogSchema.parse(raw));
  expect(index.models).toHaveLength(2);
  expect(index.detail("lab/a").offers.map((o) => o.model.id)).toEqual(["one", "two"]);
  expect(index.detail("lab/b").offers).toHaveLength(0);
  expect(index.detail("lab/a").offers[0]!.cost!.input).toBe(0);
  expect(index.detail("lab/a").offers[0]!.cost!.tiers).toEqual(
    raw.providers.vendor.models.one.cost.tiers,
  );
  expect(() => index.detail("missing")).toThrow("不存在");
});
test("search, combined filters, missing limits and stable pagination", () => {
  const index = new CatalogIndex(catalogSchema.parse(raw));
  expect(
    index
      .list({ search: " alpha LAB/a ", lab: "lab", input: "image", capability: "reasoning" })
      .items.map((m) => m.id),
  ).toEqual(["lab/a"]);
  expect(index.list({ type: "embedding", capability: "open_weights" }).total).toBe(1);
  expect(index.list({ sort: "output", direction: "asc" }).items.map((m) => m.id)).toEqual([
    "lab/a",
    "lab/b",
  ]);
  expect(index.list({ limit: 1 }).nextOffset).toBe(1);
  expect(index.list({ limit: 1, offset: 1 }).nextOffset).toBeNull();
  expect(index.list({ search: "nonexistent" }).total).toBe(0);
  expect(() => index.list({ limit: 101 })).toThrow();
});
async function fixture(run: (file: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "models-dev-test-"));
  try {
    await run(join(root, "cache.json"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
test("API requests coalesce, cache persists and fresh restart uses no network", () =>
  fixture(async (file) => {
    let calls = 0;
    const svc = new CatalogService(file, async (url) => {
      expect(url).toBe(endpoint);
      calls++;
      await Bun.sleep(10);
      return Response.json(raw);
    });
    const [a, b] = await Promise.all([svc.list({}), svc.detail("lab/a")]);
    listing.parse(a);
    detail.parse(b);
    expect(calls).toBe(1);
    expect(a.stale).toBe(false);
    expect(JSON.parse(await readFile(file, "utf8")).version).toBe(1);
    svc.close();
    const next = new CatalogService(file, async () => {
      throw Error("must not fetch");
    });
    expect((await next.list({})).total).toBe(2);
    next.close();
  }));
test("expired cache survives failed refresh and retry cooldown; recovery clears warning", () =>
  fixture(async (file) => {
    let time = 1000,
      calls = 0,
      fail = false;
    const svc = new CatalogService(
      file,
      async () => {
        calls++;
        return fail ? new Response("unavailable", { status: 503 }) : Response.json(raw);
      },
      () => time,
    );
    await svc.list({});
    const saved = await readFile(file, "utf8");
    time += 3600001;
    fail = true;
    const result = await svc.list({});
    expect(result.stale).toBe(true);
    expect(result.warning).toContain("503");
    expect(await readFile(file, "utf8")).toBe(saved);
    await svc.detail("lab/a");
    expect(calls).toBe(2);
    fail = false;
    expect((await svc.refresh()).warning).toBeNull();
    expect(calls).toBe(3);
    svc.close();
  }));
test("bad remote data never replaces valid cache; corrupt disk and first-load errors recover", () =>
  fixture(async (file) => {
    await writeFile(file, "broken");
    let response: unknown = { providers: {}, models: {} };
    const svc = new CatalogService(file, async () => Response.json(response));
    await expect(svc.list({})).rejects.toThrow("更新失败");
    response = raw;
    await svc.refresh();
    const saved = await readFile(file, "utf8");
    response = {
      models: { bad: { id: "bad", name: "Bad", limit: { context: -1 } } },
      providers: {},
    };
    expect((await svc.refresh()).warning).toContain("更新失败");
    expect(await readFile(file, "utf8")).toBe(saved);
    svc.close();
  }));
test("disposal aborts fetch and forbids subsequent calls", () =>
  fixture(async (file) => {
    let started!: () => void;
    const ready = new Promise<void>((r) => (started = r));
    const svc = new CatalogService(file, async (_url, options) => {
      started();
      return new Promise((_resolve, reject) => {
        options.signal!.addEventListener("abort", () => reject(Error("aborted")), { once: true });
      });
    });
    const pending = svc.list({});
    await ready;
    svc.close();
    await expect(pending).rejects.toThrow();
    await expect(svc.list({})).rejects.toThrow();
  }));

test("full and provider-scoped IDs resolve without guessing names; explicit ID wins", () => {
  const value = structuredClone(raw) as any;
  value.providers.lab = {
    id: "lab",
    name: "Lab",
    models: {
      b: { ...model, id: "b" },
      "lab/a": { ...model, id: "lab/a", canonical_model_id: "lab/b" },
      unrelated: { ...model, id: "unrelated", name: "Alpha" },
    },
  };
  value.providers.vendor.models["lab/a"] = { ...model, id: "lab/a", canonical_model_id: "missing" };
  const index = new CatalogIndex(catalogSchema.parse(value));
  expect(index.detail("lab/b").offers.map((o) => o.model.id)).toEqual(["b", "lab/a"]);
  expect(index.detail("lab/a").offers.map((o) => o.model.id)).toEqual(["lab/a", "one", "two"]);
});
