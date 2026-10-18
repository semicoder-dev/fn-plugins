import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import backend from "../src/backend";
import {
  chatText,
  splitChatText,
  summarizeEvents,
  waitForResearch,
  startResearch,
  readEvents,
  type PluginContext,
} from "../src/research";
import {
  agentCreate,
  type AgentSession,
  type AgentEvent,
  type AgentEventData,
} from "@semicoder/fn-sdk/agent";
import {
  messageSchema,
  maxRecordBytes,
  type ChatEventContext,
  type ChatUserMessage,
  type ChatResponse,
} from "@semicoder/fn-sdk/chat";

function fixture() {
  const kv = new Map<string, any>(),
    sessions = new Map<string, AgentSession>(),
    histories = new Map<string, AgentEvent[]>();
  const texts: string[] = [],
    cards: any[] = [],
    sent: string[] = [],
    cancelled: string[] = [],
    progress: string[] = [];
  const controller = new AbortController();
  let automatic = true;
  const model = { id: "model-1", name: "测试模型", configured: true };
  const ctx: ChatEventContext = {
    pluginId: "web-search",
    conversationId: "chat:host:web-search",
    eventId: "message-1",
    signal: controller.signal,
    progress: async (text) => {
      progress.push(text);
    },
    kv: {
      get: (key) => kv.get(key) ?? null,
      set: async (key, value) => {
        kv.set(key, value);
      },
      delete: async (key) => {
        kv.delete(key);
      },
    },
    models: {
      list: () => [model] as never,
      start: async () => {
        throw new Error("must use Agent loop");
      },
    },
    web: {} as never,
    chat: {
      sendText: async (text) => {
        texts.push(text);
        return `text-${texts.length}`;
      },
      request: async (input) => {
        cards.push(input);
        return `card-${cards.length}`;
      },
      cancel: async (id) => {
        cancelled.push(id);
      },
      get: async () => ({ state: { phase: "pending" } }) as never,
      list: async () => ({ items: [] }),
    },
    agents: {
      create: async (input) => {
        const session: AgentSession = {
          ...agentCreate.parse(input),
          id: `session-${sessions.size + 1}`,
          pluginId: "web-search",
          formatVersion: 1,
          status: "idle",
          turn: 0,
          step: 0,
          seq: 0,
          revision: 0,
          createdAt: 1,
          updatedAt: 1,
          error: null,
        };
        sessions.set(session.id, session);
        histories.set(session.id, []);
        return session;
      },
      send: async (id, text) => {
        const s = sessions.get(id)!;
        sent.push(text);
        s.turn++;
        s.step = 1;
        s.status = automatic ? "completed" : "running";
        const events = histories.get(id)!;
        const append = (e: AgentEventData) =>
          events.push({ ...e, sessionId: id, seq: ++s.seq, time: 1 });
        append({
          type: "user/message",
          turn: s.turn,
          step: 0,
          message: { role: "user", content: [{ type: "text", text }] },
        });
        append({
          type: "assistant/message",
          turn: s.turn,
          step: 1,
          message: {
            role: "assistant",
            model: "fixture",
            provider: "fixture",
            content: [
              { type: "reasoning", text: "PRIVATE THOUGHT" },
              { type: "text", text: "调研答案：" + text },
            ],
            finishReason: "stop",
          },
        });
        return s;
      },
      get: async (id) => {
        const s = sessions.get(id);
        if (!s) throw new Error("missing");
        return { session: structuredClone(s), partial: null, revision: s.revision };
      },
      events: async (id, after = 0) => {
        const events = histories
          .get(id)!
          .filter((e) => e.seq > after)
          .slice(0, 2);
        return {
          events,
          next: events.at(-1)?.seq ?? after,
          hasMore: (events.at(-1)?.seq ?? after) < sessions.get(id)!.seq,
        };
      },
      list: async () => [...sessions.values()],
      tools: async () => [],
      onChange: () => () => {},
      cancel: async (id) => {
        cancelled.push(id);
        const s = sessions.get(id)!;
        s.status = "cancelled";
        return s;
      },
      remove: async (id) => {
        sessions.delete(id);
      },
    },
  };
  const message = (text: string): ChatUserMessage => ({
    protocolVersion: 2,
    kind: "userText",
    id: "message-1",
    text,
    hostId: "host",
    deviceId: "phone",
    pluginId: "web-search",
    conversationId: ctx.conversationId,
    botVersion: "0.1.0:1",
    createdAt: 1,
  });
  const response = (requestId = "card-1"): ChatResponse =>
    ({
      ...message(""),
      kind: "response",
      id: "response-1",
      requestId,
      actionId: "select",
      values: { modelId: model.id },
    }) as ChatResponse;
  return {
    ctx,
    kv,
    sessions,
    texts,
    cards,
    sent,
    cancelled,
    progress,
    controller,
    model,
    message,
    response,
    pending: () => {
      automatic = false;
    },
  };
}

test("fixed development SDK has provenance and is isolated from published plugins", async () => {
  const snapshot = await Bun.file("vendor/agent-sdk.json").json();
  expect(
    createHash("sha256")
      .update(await Bun.file("vendor/agent-sdk.tgz").bytes())
      .digest("hex"),
  ).toBe(snapshot.sha256);
  expect(snapshot.published).toBe(false);
  expect(
    (await Bun.file("plugins/web-search/package.json").json()).devDependencies["@semicoder/fn-sdk"],
  ).toBe("file:../../vendor/agent-sdk.tgz");
  expect(
    (await Bun.file("marketplace.json").json()).plugins.some((p: any) => p.id === "web-search"),
  ).toBe(false);
});
test("page starts bounded host loops and follow-ups retain the session", async () => {
  const f = fixture();
  const s = (await backend.methods.start!.execute(
    { query: " 搜索问题 ", modelId: f.model.id },
    f.ctx,
  )) as AgentSession;
  expect(s.tools).toEqual(["web_search", "web_fetch"]);
  expect(s.maxSteps).toBe(8);
  expect(s.timeoutMs).toBeLessThan(600000);
  expect(f.sent).toEqual(["搜索问题"]);
  await backend.methods.start!.execute(
    { query: "追问", modelId: f.model.id, sessionId: s.id },
    f.ctx,
  );
  expect(f.sessions.size).toBe(1);
  expect(s.turn).toBe(2);
  await expect(startResearch(f.ctx, "q", "missing")).rejects.toThrow("模型不可用");
  expect(() =>
    backend.methods.start!.execute({ query: " ", modelId: f.model.id }, f.ctx),
  ).toThrow();
});
test("first Chat question survives model selection, then follows up and resets explicitly", async () => {
  const f = fixture();
  await backend.chat!.onMessage(f.message("问题 A"), f.ctx);
  expect(f.cards).toHaveLength(1);
  expect(f.sent).toHaveLength(0);
  await backend.chat!.onResponse(f.response(), f.ctx);
  expect(f.sent).toEqual(["问题 A"]);
  expect(f.texts.join("\n")).not.toContain("PRIVATE THOUGHT");
  await backend.chat!.onMessage(f.message("问题 B"), f.ctx);
  expect(f.sessions.size).toBe(1);
  expect(f.sent).toHaveLength(2);
  await backend.chat!.onMessage(f.message("/新话题"), f.ctx);
  await backend.chat!.onMessage(f.message("问题 C"), f.ctx);
  expect(f.sessions.size).toBe(2);
  await expect(backend.chat!.onResponse(f.response(), f.ctx)).rejects.toThrow("失效");
});
test("no model is actionable; stale model cards and cross-conversation responses cannot start work", async () => {
  const f = fixture();
  f.model.configured = false;
  await backend.chat!.onMessage(f.message("问题"), f.ctx);
  expect(f.cards).toHaveLength(0);
  expect(f.texts[0]).toContain("设置");
  f.model.configured = true;
  await backend.chat!.onMessage(f.message("问题"), f.ctx);
  await backend.chat!.onMessage(f.message("/模型"), f.ctx);
  expect(f.cancelled).toContain("card-1");
  await expect(backend.chat!.onResponse(f.response(), f.ctx)).rejects.toThrow("失效");
  await expect(
    backend.chat!.onResponse(f.response("card-2"), {
      ...f.ctx,
      conversationId: "chat:other:web-search",
    }),
  ).rejects.toThrow("失效");
  expect(f.sent).toHaveLength(0);
});
test("Chat abort cancels the owned Agent and never emits a late answer", async () => {
  const f = fixture();
  f.pending();
  await f.ctx.kv.set("preferences", { modelId: f.model.id });
  const run = backend.chat!.onMessage(f.message("slow"), f.ctx);
  await Bun.sleep(20);
  f.controller.abort(new Error("Chat account disconnected"));
  await expect(run).rejects.toThrow("disconnected");
  expect(f.cancelled).toContain("session-1");
  expect(f.texts).toHaveLength(0);
  expect(f.progress.length).toBeGreaterThan(0);
});
test("abort during setup never starts a model, and progress failures cancel running work", async () => {
  const f = fixture();
  await expect(
    startResearch(
      f.ctx,
      "q",
      f.model.id,
      undefined,
      async () => {
        f.controller.abort(new Error("stop"));
      },
      f.controller.signal,
    ),
  ).rejects.toThrow("stop");
  expect(f.sent).toHaveLength(0);
  const g = fixture();
  g.pending();
  const s = await startResearch(g.ctx, "q", g.model.id);
  await expect(
    waitForResearch(g.ctx, s.id, g.controller.signal, async () => {
      throw new Error("progress failed");
    }),
  ).rejects.toThrow("progress failed");
  expect(g.cancelled).toContain(s.id);
});
test("sources derive only from tool evidence, distinguish redirects, failures and snippets", async () => {
  const f = fixture();
  const session = await startResearch(f.ctx, "q", f.model.id);
  const tool = (name: string, value: unknown): AgentEvent => ({
    type: "tool/result",
    sessionId: session.id,
    seq: 1,
    time: 1,
    turn: 1,
    step: 1,
    message: {
      role: "tool",
      name,
      callId: "call",
      isError: false,
      content: [{ type: "text", text: JSON.stringify(value) }],
    },
  });
  const data = summarizeEvents(
    [
      tool("web_search", {
        results: [
          { title: "A", url: "https://example.com/a#x" },
          { title: "A2", url: "https://example.com/a" },
          { title: "bad", url: "javascript:alert(1)" },
          { title: "secret", url: "https://user:pass@example.com/" },
        ],
        engines: [{ engine: "baidu", ok: false, error: "requires human verification (captcha)" }],
      }),
      tool("web_fetch", {
        finalUrl: "https://example.com/b",
        title: "B",
        status: 200,
        truncated: true,
      }),
      tool("web_fetch", { finalUrl: "https://example.com/a", status: 404 }),
    ],
    session,
  );
  expect(data.sources).toEqual([
    { url: "https://example.com/b", title: "B", read: true, truncated: true },
    { url: "https://example.com/a", title: "A2", read: false, truncated: false },
  ]);
  expect(data.warnings).toHaveLength(2);
  expect(data.warnings[0]).toContain("要求人机验证");
  session.status = "interrupted";
  expect(chatText({ session, ...data, answer: "INCOMPLETE" })).not.toContain("INCOMPLETE");
});
test("each answer uses only its turn's sources and reports empty search results visibly", async () => {
  const f = fixture();
  const session = await startResearch(f.ctx, "天气", f.model.id);
  const event = (turn: number, results: unknown[]): AgentEvent => ({
    type: "tool/result",
    sessionId: session.id,
    seq: turn * 2,
    time: turn,
    turn,
    step: 1,
    message: {
      role: "tool",
      name: "web_search",
      callId: `call-${turn}`,
      isError: false,
      content: [{ type: "text", text: JSON.stringify({ results, engines: [] }) }],
    },
  });
  const history: AgentEvent[] = [event(1, [{ title: "天气", url: "https://weather.example.com" }])];
  expect(summarizeEvents(history, session).sources).toHaveLength(1);
  session.turn = 2;
  session.status = "running";
  expect(summarizeEvents(history, session).sources).toHaveLength(0);
  history.push({
    type: "tool/call",
    sessionId: session.id,
    seq: 3,
    time: 2,
    turn: 2,
    step: 1,
    call: {
      type: "tool-call",
      id: "call-2",
      name: "web_search",
      arguments: '{"query":"科技新闻"}',
    },
  });
  history.push(event(2, []));
  session.status = "completed";
  const empty = summarizeEvents(history, session);
  expect(empty.sources).toEqual([]);
  expect(empty.activity).toEqual(["搜索：科技新闻 · 0 条结果"]);
  expect(empty.warnings.join(" ")).toContain("本轮检索没有取得网页来源");
  expect(chatText({ session, ...empty })).not.toContain("weather.example.com");
  history.push(event(2, [{ title: "新闻", url: "https://news.example.com" }]));
  const news = summarizeEvents(history, session);
  expect(news.sources.map((s) => s.title)).toEqual(["新闻"]);
  expect(news.warnings).toEqual([]);
});

test("history pages make progress and long multilingual Chat output fits record constraints", async () => {
  const f = fixture();
  const s = await startResearch(f.ctx, "a", f.model.id);
  await startResearch(f.ctx, "b", f.model.id, s.id);
  expect(await readEvents(f.ctx.agents, s.id)).toHaveLength(4);
  f.ctx.agents.events = async () => ({ events: [], next: 0, hasMore: true });
  await expect(readEvents(f.ctx.agents, s.id)).rejects.toThrow("未前进");
  const text = '汉字😀"\\\n'.repeat(20000),
    chunks = splitChatText(text);
  expect(chunks.join("")).toBe(text);
  for (const [i, chunk] of chunks.entries()) {
    const { botVersion, ...base } = f.message("");
    const message = messageSchema.parse({
      ...base,
      kind: "botText",
      id: `bot-${i}`,
      deviceId: "host",
      text: chunk,
    });
    expect(new TextEncoder().encode(JSON.stringify(message)).length).toBeLessThan(maxRecordBytes);
  }
});
