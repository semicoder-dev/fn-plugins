import { expect, test } from "bun:test";
import { Context } from "@deepseek-ai/cordis";
import type { ApplicationRuntime, Json } from "@semicoder/fn-sdk";
import { buildCordisApplication } from "@semicoder/fn-sdk/build-cordis";
import { createBrowserHost } from "@semicoder/fn-sdk/cordis-client";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import * as translation from "../apps/translate/src/index.ts";
import * as notes from "../apps/quick-notes/src/index.ts";
import * as search from "../apps/web-search/src/index.ts";

function harness() {
  const ctx = new Context();
  const methods = new Map<string, (input: Json) => Json | Promise<Json>>();
  const chats: unknown[] = [];
  const tools: string[][] = [];
  const creates: unknown[] = [];
  const sends: unknown[] = [];
  const values = new Map<string, Json>();
  const app = {
    method(name, handler) { methods.set(name, handler); return () => { methods.delete(name); }; },
    chat(endpoint) { chats.push(endpoint); return () => {}; },
    useTools(names) { tools.push(names); return () => {}; },
    async createSession(input) { creates.push(input); return { ...input, id: "session-1" }; },
    async send(...args: unknown[]) { sends.push(args); return { id: "session-1" }; },
    kv: {
      get: (key: string) => values.get(key), set: (key: string, value: Json) => { values.set(key, value); },
      delete: (key: string) => { values.delete(key); },
      list: () => [...values].map(([key, value]) => ({ key, value })),
    },
  } as ApplicationRuntime;
  ctx.provide("app", app);
  ctx.provide("tools", {});
  return { ctx, methods, chats, tools, creates, sends, values };
}

test("translation validates input and binds a fresh upstream session to the explicit model connection", async () => {
  const host = harness();
  try {
    await host.ctx.plugin(translation);
    await expect(Promise.resolve().then(() => host.methods.get("translate")!(null))).rejects.toThrow();
    const result = await host.methods.get("translate")!({
      connectionId: "account-a", modelId: "model-1", targetLanguage: "中文", text: "Hello",
    });
    expect(result).toEqual({ sessionId: "session-1" });
    expect(host.creates).toEqual([{
      connectionId: "account-a", modelId: "model-1", endpointId: "translate", title: "翻译为中文",
    }]);
    expect(host.sends).toEqual([["session-1", "目标语言：中文\n\n待翻译文本：\nHello"]]);
    expect(host.tools).toEqual([]);
  } finally { await host.ctx.fiber.dispose(); }
});

test("notes need only application KV; search exposes only web tools and its Chat endpoint", async () => {
  const host = harness();
  try {
    host.values.set("note:a", { text: "a" });
    host.values.set("setting", true);
    await host.ctx.plugin(notes);
    expect(await host.methods.get("count")!(null)).toBe(1);
    await host.ctx.plugin(search);
    expect(host.tools).toEqual([["web_search", "web_fetch"]]);
    expect(host.chats).toMatchObject([{ id: "search", name: "网络搜索" }]);
  } finally { await host.ctx.fiber.dispose(); }
});

for (const slug of ["translate", "quick-notes", "web-search"]) {
  test(`${slug} builds with the fixed SDK archive and renders through host React`, async () => {
    const root = join(import.meta.dir, "../apps", slug);
    const output = await buildCordisApplication(root);
    const host = createBrowserHost({ call: async () => [] });
    try {
      const module = await import(pathToFileURL(output.client!).href);
      await host.load(`cordis-${slug}`, module);
      expect(host.pages()).toHaveLength(1);
      const page = host.pages()[0]!;
      const html = renderToStaticMarkup(React.createElement(page.component));
      expect(html).toContain("<h1>");
      expect(page.appId).toBe(`cordis-${slug}`);
    } finally { await host.dispose(); }
  });
}
