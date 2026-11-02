import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Host } from "@semicoder/fn-sdk/backend";
import definition from "../src/backend.ts";
import { resource } from "./fixtures.ts";
test("translation sends explicit protocol message types and commits only completed model streams", async () => {
  const directory = await mkdtemp(join(tmpdir(), "fn-translate-protocol-"));
  let fail = false;
  const calls: unknown[] = [];
  const host = {
    paths: { data: directory, cache: directory, logs: directory },
    application: {
      setSummary: async () => {},
      notifyDataChanged: async () => {},
    },
    models: {
      default: async () => ({
        id: "test",
        name: "Test",
        connectionId: "connection",
      }),
      responses: async function* (
        request: unknown,
        options: { connectionId: string; signal: AbortSignal },
      ) {
        calls.push(request);
        expect(options.connectionId).toBe("connection");
        expect(options.signal).toBeInstanceOf(AbortSignal);
        yield {
          type: "response.output_text.delta",
          sequence_number: 1,
          item_id: "msg_test",
          output_index: 0,
          content_index: 0,
          delta: "Hello",
        };
        if (fail) throw new Error("Model stream ended before completion");
        yield {
          type: "response.completed",
          sequence_number: 2,
          response: resource(),
        };
      },
    },
  } as unknown as Host;
  const app = await definition.setup({ host });
  const context = { requestId: "test", signal: new AbortController().signal };
  try {
    const chunks = await Array.fromAsync(
      (await app.handlers.translate(
        { source: "你好", target: "en" },
        context,
      )) as AsyncIterable<unknown>,
    );
    expect(calls[0]).toMatchObject({
      model: "test",
      stream: true,
      store: false,
      input: [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "你好" }],
        },
      ],
    });
    expect(chunks.at(-1)).toMatchObject({
      type: "completed",
      record: { text: "Hello" },
    });
    fail = true;
    await expect(
      Array.fromAsync(
        (await app.handlers.translate(
          { source: "partial", target: "en" },
          context,
        )) as AsyncIterable<unknown>,
      ),
    ).rejects.toThrow("before completion");
    expect(await app.handlers.history({}, context)).toHaveLength(1);
  } finally {
    await app.stop?.();
    await rm(directory, { recursive: true, force: true });
  }
});
