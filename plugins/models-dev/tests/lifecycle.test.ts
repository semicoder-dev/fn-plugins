import { expect, test } from "bun:test";
import { Context } from "@deepseek-ai/cordis";
import { APIRegistry } from "@semicoder/fia/api";
import Rpc from "@semicoder/fn-rpc";
import Activity from "@semicoder/fn-activity";
import * as plugin from "../src/index.ts";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("Cordis releases registered catalog API on plugin disposal", async () => {
  const root = await mkdtemp(join(tmpdir(), "models-dev-lifecycle-"));
  const ctx = new Context(),
    api = new APIRegistry();
  ctx.provide("host", { dataDirectory: root, api, platform: { emit() {} } } as any);
  try {
    await ctx.plugin(Rpc);
    await ctx.plugin(Activity);
    const fiber = ctx.plugin(plugin);
    await fiber;
    expect(JSON.stringify(api.contract)).toContain("modelsDev.list");
    await fiber.dispose();
    expect(JSON.stringify(api.contract)).not.toContain("modelsDev.list");
    const second = ctx.plugin(plugin);
    await second;
    expect(JSON.stringify(api.contract)).toContain("modelsDev.list");
  } finally {
    await ctx.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
