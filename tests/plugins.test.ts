import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import translate from "../plugins/translate/src/backend";
import { indexSchema } from "../scripts/catalog";

test("all independent plugins share the verified development SDK archive", async () => {
  const root = await Bun.file("package.json").json();
  const version = root.devDependencies["@semicoder/fn-sdk"];
  expect(version).toBe("file:./vendor/agent-sdk.tgz");
  const installed = await Bun.file(new URL("./package.json", import.meta.resolve("@semicoder/fn-sdk/plugin"))).json();
  expect(installed.name).toBe("@semicoder/fn-sdk");
  const snapshot = await Bun.file("vendor/agent-sdk.json").json();
  expect(installed.version).toBe(snapshot.version);
  expect(snapshot.published).toBe(false);
  expect(createHash("sha256").update(await Bun.file("vendor/agent-sdk.tgz").bytes()).digest("hex")).toBe(snapshot.sha256);
  for (const path of ["plugins/translate/package.json", "plugins/quick-notes/package.json", "plugins/web-search/package.json"]) {
    const pkg = await Bun.file(path).json();
    expect(pkg.devDependencies[installed.name]).toBe("file:../../vendor/agent-sdk.tgz");
    expect(pkg.fn.iconSvg).toBe("dist/icon.svg");
  }
  for (const path of ["package.json", "plugins/translate/package.json", "plugins/quick-notes/package.json", "plugins/web-search/package.json"]) {
    const sdk = dirname(createRequire(resolve(path)).resolve("@semicoder/fn-sdk/plugin"));
    for (const [name, sha256] of Object.entries(snapshot.sourceFilesSha256 as Record<string, string>)) {
      expect(createHash("sha256").update(await Bun.file(join(sdk, name)).bytes()).digest("hex")).toBe(sha256);
    }
  }
});

test("historical SDK archive still matches its original provenance", async () => {
  const snapshot = await Bun.file("vendor/snapshot.json").json();
  const digest = createHash("sha256").update(await Bun.file("vendor/fn-sdk.tgz").bytes()).digest("hex");
  expect(digest).toBe(snapshot.sha256);
});

test("translation stores preferences and delegates to the selected host model", async () => {
  const writes: unknown[] = [];
  const calls: unknown[] = [];
  const result = await translate.methods.translate!.execute({ text: " Hello ", target: "English", modelId: "chosen" }, {
    pluginId: "translate", agents: {} as never, web: {} as never,
    kv: { get: () => null, set: async (...args) => { writes.push(args); }, delete: async () => {} },
    models: { list: () => [], start: async input => { calls.push(input); return { id: "run" } as never; } },
  });
  expect(result).toEqual({ id: "run" });
  expect(writes).toEqual([["preferences", { target: "English", modelId: "chosen" }]]);
  expect(calls[0]).toMatchObject({ modelId: "chosen", prompt: "Hello" });
  expect(() => translate.methods.translate!.execute({ text: " ", target: "English", modelId: "chosen" }, {} as never)).toThrow();
});

test("official index has no unpublished archive entries", async () => {
  const index = indexSchema.parse(await Bun.file("marketplace.json").json());
  expect(index.schemaVersion).toBe(1);
  for (const entry of index.plugins) expect(entry.url).toBe(`https://github.com/semicoder-dev/fn-plugins/releases/download/${entry.id}-v${entry.version}/${entry.id}-${entry.version}.tgz`);
});
