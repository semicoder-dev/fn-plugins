// Optional integration acceptance: explicitly pass a compatible fn source checkout.
// Normal plugin installation/build has no dependency on that checkout.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
const source = process.argv[2];
if (!source) throw new Error("用法：bun scripts/verify-search-host.ts <fn-source> [--keep]");
const fromHost = (path: string) => import(pathToFileURL(resolve(source, path)).href);
const [
  { Store },
  { Models },
  { WebTools },
  { Agents },
  { Plugins },
  { ChatStore },
  { ChatEngine, cloudRecord, digest },
  { ChatRunner },
] = await Promise.all(
  [
    "backend/store.ts",
    "backend/models.ts",
    "backend/web.ts",
    "backend/agent/service.ts",
    "backend/plugins.ts",
    "backend/chat/store.ts",
    "backend/chat/engine.ts",
    "backend/chat/runner.ts",
  ].map(fromHost),
);
const root = await mkdtemp(join(tmpdir(), "fn-search-acceptance-"));
let clock = Date.now();
const now = () => ++clock;
const records = new Map<string, any>();
let revision = 0,
  searches = 0,
  reads = 0;
const transport = {
  read: async (id: string) => structuredClone(records.get(id)),
  commit: async (items: any[]) => {
    for (const item of items)
      if (records.get(item.id)?.systemFields !== item.systemFields)
        throw { reason: "serverRecordChanged" };
    const saved = items.map((item) => ({
      ...structuredClone(item),
      systemFields: String(++revision),
    }));
    for (const item of saved) records.set(item.id, item);
    return saved;
  },
  changes: async () => ({
    records: structuredClone([...records.values()]),
    deletedIDs: [],
    token: String(revision),
    moreComing: false,
  }),
};
const store = new Store(root);
await store.open();
const models = new Models(
  store,
  () => {},
  () => {},
);
const model = await models.save({
  name: "离线验收模型",
  provider: "fixture",
  model: "fixture",
  baseURL: "http://127.0.0.1:1/v1",
  apiKey: "",
});
const chatStore = new ChatStore(join(root, "chat-fixture.sqlite"));
const engine = new ChatEngine(chatStore, transport, () => {}, now);
const hostId = chatStore.deviceId,
  pluginId = "web-search",
  conversationId = `chat:${hostId}:${pluginId}`;
const base = () => ({
  protocolVersion: 2,
  id: crypto.randomUUID(),
  hostId,
  pluginId,
  conversationId,
  deviceId: hostId,
  createdAt: now(),
});
let plugins: any;
const chat = {
  sendText: async (text: string) => engine.create({ ...base(), kind: "botText", text }).id,
  request: async ({ card, expiresAt }: any) =>
    engine.create({
      ...base(),
      kind: "request",
      card,
      expiresAt: expiresAt ?? now() + 86400000,
      botVersion: plugins.chatVersion(pluginId).version,
    }).id,
  get: async (id: string) => {
    const message = engine.messages().find((m: any) => m.id === id);
    return message ? { message, state: engine.state(id) } : null;
  },
  list: async () => ({ items: engine.messages().map((message: any) => ({ message })) }),
  cancel: async (id: string) => {
    const request = engine.messages().find((m: any) => m.id === id);
    assert.equal(request?.kind, "request");
    engine.cancel(request);
  },
};
const web = new WebTools(() => {}, {
  now: Date.now,
  search: async () => {
    searches++;
    return {
      text: "离线验收资料",
      results: [
        {
          id: 1,
          url: "https://example.com/",
          title: "离线验收资料",
          snippet: "仅用于验证插件数据流",
          score: 1,
          engines: ["duckduckgo"],
          meta: {},
          fetched: false,
        },
      ],
      engines: [{ engine: "duckduckgo", status: "success", ok: true, count: 1, rawCount: 1 }],
    };
  },
  fetch: async (input: any) => {
    reads++;
    return {
      url: input.url,
      finalUrl: input.url,
      status: 200,
      contentType: "text/html",
      title: "离线验收资料",
      format: "markdown",
      text: "fixture evidence",
      truncated: false,
    };
  },
});
const generate = async (request: any) => {
  const lastUser = request.messages.findLastIndex((m: any) => m.role === "user");
  const results = request.messages.slice(lastUser).filter((m: any) => m.role === "tool");
  const message = {
    role: "assistant",
    model: "fixture",
    provider: "fixture",
    finishReason: "tool-calls",
    content: [] as any[],
  };
  if (!results.length)
    message.content.push({
      type: "tool-call",
      id: crypto.randomUUID(),
      name: "web_search",
      arguments: '{"query":"offline acceptance","limit":5}',
    });
  else if (results.length === 1)
    message.content.push({
      type: "tool-call",
      id: crypto.randomUUID(),
      name: "web_fetch",
      arguments: '{"url":"https://example.com/","maxBytes":12000}',
    });
  else {
    message.finishReason = "stop";
    message.content.push({
      type: "text",
      text: "这是一条离线验收答案。\n\n搜索、阅读和来源展示已通过完整宿主流程。真实模型回答与公网资料质量仍需另行验收。\n\n来源：https://example.com/",
    });
  }
  request.partial(message);
  return message;
};
const agents = new Agents(
  root,
  models,
  web,
  (id: string) => plugins.agentTools(id),
  () => {},
  generate,
);
await agents.open();
plugins = new Plugins(
  store,
  models,
  () => {},
  undefined,
  fetch,
  web,
  () => chat,
  agents,
);
const runner = new ChatRunner(engine, plugins, () => {}, now);
const until = async (condition: () => boolean, label: string) => {
  const deadline = Date.now() + 10000;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(label + " timed out");
    await Bun.sleep(20);
  }
};
try {
  await plugins.open();
  const job = plugins.install(resolve("artifacts/web-search-0.1.0.tgz"));
  await until(
    () => plugins.listJobs().find((j: any) => j.id === job.id)?.status !== "installing",
    "archive installation",
  );
  assert.equal(plugins.listJobs().find((j: any) => j.id === job.id)?.status, "completed");
  assert.equal(plugins.list()[0].status, "active");
  assert.equal(plugins.chatCatalog()[0].pluginId, pluginId);
  await transport.commit([
    cloudRecord("FnChatBot", {
      protocolVersion: 2,
      ...plugins.chatCatalog()[0],
      hostId,
      conversationId,
      updatedAt: now(),
    }),
  ]);

  // A Chat message first creates a durable native choice card.
  const user = engine.create({
    ...base(),
    kind: "userText",
    deviceId: "fixture-phone",
    botVersion: plugins.chatVersion(pluginId).version,
    text: "验证网络搜索与 fn Chat 的集成",
  });
  await engine.sync();
  await runner.scan();
  await runner.settled();
  await engine.sync();
  const card = engine.messages().find((m: any) => m.kind === "request");
  assert(card);
  assert.equal(card.card.template, "choice");
  const reply = {
    ...base(),
    kind: "response",
    deviceId: "fixture-phone",
    requestId: card.id,
    actionId: "select",
    values: { modelId: model.id },
    botVersion: card.botVersion,
  };
  chatStore.enqueue(reply.id, "respond", {
    kind: "respond",
    requestId: card.id,
    requestDigest: digest(card),
    message: reply,
  });
  await engine.sync();
  await runner.scan();
  await runner.settled();
  await engine.sync();
  assert.equal(engine.delivery(reply.id).status, "completed");
  const answers = engine.messages().filter((m: any) => m.kind === "botText");
  assert.equal(answers.length, 1);
  assert(answers[0].text.includes("已读正文"));
  assert.equal(searches, 1);
  assert.equal(reads, 1);
  const session = agents.list(pluginId)[0];
  assert.equal(session.status, "completed");
  const report = await plugins.invoke(pluginId, "report", { sessionId: session.id });
  assert.equal(report.sources[0].read, true);
  assert.equal(report.session.step, 3);
  // Scan again: neither the question nor the card response may be executed twice.
  await runner.scan();
  await runner.settled();
  assert.equal(searches, 1);
  // A page follow-up uses precisely the same host session and evidence projection.
  await plugins.invoke(pluginId, "start", {
    query: "继续验证追问与来源",
    modelId: model.id,
    sessionId: session.id,
  });
  await until(() => !agents.busy(), "page follow-up");
  assert.equal(agents.get(pluginId, session.id).session.turn, 2);
  assert.equal(searches, 2);
  assert.equal(reads, 2);
  assert.equal(engine.delivery(user.id).status, "completed");
  console.log(
    JSON.stringify({
      ok: true,
      root,
      sessionId: session.id,
      checks: [
        "packed-plugin-install",
        "chat-bot-discovery",
        "native-model-choice",
        "chat-runner-dispatch",
        "host-agent-search-read-answer",
        "source-report",
        "no-chat-replay",
        "page-follow-up",
      ],
    }),
  );
} finally {
  runner.stop();
  await runner.settled();
  await agents.stop();
  await web.stop();
  await plugins.stop();
  await models.stop();
  chatStore.close();
  if (!process.argv.includes("--keep")) await rm(root, { recursive: true, force: true });
}
