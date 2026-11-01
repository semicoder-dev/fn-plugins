import { expect, test, spyOn } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Host } from "@semicoder/fn-sdk/backend";
import type { ApplicationSummary } from "@semicoder/fn-sdk/summary";
import notesDefinition from "../src/backend.ts";
import kanbanDefinition from "../../kanban/src/backend.ts";
import translateDefinition from "../../translate/src/backend.ts";
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "fn-app-summary-"));
  const snapshots: ApplicationSummary[] = [];
  let notifications = 0,
    fail = false;
  const host = {
    paths: { data: root, cache: root, logs: root },
    preferences: async () => ({ locale: "en" }),
    application: {
      setSummary: async (value: ApplicationSummary | null) => {
        if (fail) throw Error("summary storage unavailable");
        if (value) snapshots.push(value);
      },
      notifyDataChanged: async () => {
        notifications++;
      },
    },
    models: {
      default: async () => ({ connectionId: "test", id: "test" }),
      responses: async function* () {
        yield { type: "response.output_text.delta", delta: "Test translation" };
        yield { type: "response.completed" };
      },
    },
  } as unknown as Host;
  return {
    host,
    snapshots,
    notifications: () => notifications,
    fail: () => {
      fail = true;
    },
    dispose: () => rm(root, { recursive: true, force: true }),
  };
}
const context = () => ({
  signal: new AbortController().signal,
  requestId: crypto.randomUUID(),
});
test("note writes notify views even when summary persistence fails", async () => {
  const f = await fixture(),
    log = spyOn(console, "error").mockImplementation(() => {});
  const app = await notesDefinition.setup({ host: f.host });
  try {
    expect(f.snapshots[0]?.metrics?.[0]?.value).toBe(0);
    f.fail();
    const saved = await app.handlers.save(
      {
        id: crypto.randomUUID(),
        title: "Saved despite summary failure",
        body: "Data",
        revision: 0,
      },
      context(),
    );
    expect(saved).toMatchObject({ title: "Saved despite summary failure" });
    expect(await app.handlers.list({}, context())).toHaveLength(1);
    expect(f.notifications()).toBe(1);
    expect(log).toHaveBeenCalledTimes(1);
  } finally {
    await app.stop?.();
    log.mockRestore();
    await f.dispose();
  }
});
test("kanban mutation and view notification do not depend on summary publication", async () => {
  const f = await fixture(),
    log = spyOn(console, "error").mockImplementation(() => {});
  const app = await kanbanDefinition.setup({ host: f.host });
  try {
    const before = (await app.handlers.read({}, context())) as any;
    f.fail();
    const result = await app.handlers.mutate(
      {
        requestId: crypto.randomUUID(),
        revision: before.revision,
        command: { type: "board.create", title: "Summary independent" },
      },
      context(),
    );
    expect(result).toHaveProperty("createdId");
    expect(
      ((await app.handlers.read({}, context())) as any).boards,
    ).toHaveLength(1);
    expect(f.notifications()).toBe(1);
  } finally {
    await app.stop?.();
    log.mockRestore();
    await f.dispose();
  }
});
test("translation keeps its completed record when the derived summary fails", async () => {
  const f = await fixture(),
    log = spyOn(console, "error").mockImplementation(() => {});
  const app = await translateDefinition.setup({ host: f.host });
  try {
    f.fail();
    const chunks = await Array.fromAsync(
      (await app.handlers.translate(
        { source: "测试", target: "en" },
        context(),
      )) as AsyncIterable<any>,
    );
    expect(chunks.at(-1)).toMatchObject({
      type: "completed",
      record: { text: "Test translation" },
    });
    expect(await app.handlers.history({}, context())).toHaveLength(1);
    expect(f.notifications()).toBe(1);
  } finally {
    await app.stop?.();
    log.mockRestore();
    await f.dispose();
  }
});
