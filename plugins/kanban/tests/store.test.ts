import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import { KanbanStore } from "../src/store.ts";
import type { Command, Mutation } from "../src/contract.ts";
const roots: string[] = [],
  stores: KanbanStore[] = [];
afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "fn-kanban-test-"));
  roots.push(root);
  const file = join(root, "kanban.sqlite"),
    store = new KanbanStore(file);
  stores.push(store);
  const run = (command: Command) =>
    store.mutate({ requestId: crypto.randomUUID(), revision: store.read().revision, command });
  const boardId = run({ type: "board.create", title: "项目" }).createdId!;
  const lists = store.read().lists;
  return { file, store, run, boardId, lists };
}
test("boards, cards, details, order and archived content survive reopening", () => {
  const { file, store, run, lists } = fixture();
  const first = run({ type: "card.create", listId: lists[0].id, title: "第一张" }).createdId!;
  const second = run({ type: "card.create", listId: lists[0].id, title: "第二张" }).createdId!;
  run({ type: "card.move", id: second, listId: lists[0].id, beforeId: first });
  expect(store.read().cards.map((c) => c.id)).toEqual([second, first]);
  run({ type: "card.move", id: first, listId: lists[1].id, beforeId: null });
  run({ type: "list.move", id: lists[2].id, beforeId: lists[0].id });
  const details = {
    title: "正式交付",
    description: "背景\n链接",
    labels: [store.read().labels.find((label) => label.color === "blue")!.id],
    due: "2026-11-01",
    done: true,
    checklist: [{ id: crypto.randomUUID(), text: "验证", done: true }],
  };
  run({ type: "card.edit", id: first, details });
  run({ type: "card.archive", id: second, archived: true });
  const reopened = new KanbanStore(file);
  stores.push(reopened);
  expect(reopened.read()).toEqual(store.read());
  expect(reopened.read().cards.find((c) => c.id === first)).toMatchObject({
    ...details,
    listId: lists[1].id,
  });
  expect(reopened.read().lists[0].id).toBe(lists[2].id);
});
test("concurrent windows cannot overwrite; retry receipt is atomic and durable", () => {
  const { store, file, lists } = fixture();
  const other = new KanbanStore(file);
  stores.push(other);
  const request: Mutation = {
    requestId: crypto.randomUUID(),
    revision: store.read().revision,
    command: { type: "card.create", listId: lists[0].id, title: "只创建一次" },
  };
  const result = store.mutate(request);
  expect(other.mutate(request).createdId).toBe(result.createdId);
  expect(other.read().cards).toHaveLength(1);
  const raw = new Database(file);
  expect(
    (
      raw.query("SELECT fingerprint FROM receipts WHERE id=?").get(request.requestId) as {
        fingerprint: string;
      }
    ).fingerprint,
  ).toMatch(/^[a-f0-9]{64}$/);
  raw.close();
  expect(() => other.mutate({ ...request, requestId: crypto.randomUUID() })).toThrow("其他窗口");
  expect(() =>
    other.mutate({ ...request, command: { ...request.command, title: "不同内容" } as Command }),
  ).toThrow("不一致");
});
test("invalid targets, cross-board moves and archived parents reject without partial writes", () => {
  const { store, run, boardId, lists } = fixture();
  const id = run({ type: "card.create", listId: lists[0].id, title: "卡片" }).createdId!;
  const second = run({ type: "board.create", title: "另一个看板" }).createdId!;
  const elsewhere = store.read().lists.find((l) => l.boardId === second)!;
  let before = store.read();
  expect(() => run({ type: "card.move", id, listId: elsewhere.id, beforeId: null })).toThrow(
    "当前看板",
  );
  expect(() =>
    run({ type: "card.move", id, listId: lists[1].id, beforeId: crypto.randomUUID() }),
  ).toThrow("不存在");
  expect(store.read()).toEqual(before);
  run({ type: "board.archive", id: boardId, archived: true });
  before = store.read();
  expect(() => run({ type: "card.archive", id, archived: true })).toThrow("恢复看板");
  expect(store.read()).toEqual(before);
  run({ type: "board.archive", id: boardId, archived: false });
  run({ type: "list.archive", id: lists[0].id, archived: true });
  expect(() => run({ type: "card.archive", id, archived: true })).toThrow("恢复列表");
  run({ type: "list.archive", id: lists[0].id, archived: false });
  run({ type: "card.archive", id, archived: true });
  run({ type: "card.archive", id, archived: false });
  expect(store.read().cards[0].archived).toBe(false);
});
test("storage failure rolls back mutation and receipt; same request can be retried", () => {
  const { file, store, lists } = fixture();
  const raw = new Database(file);
  raw.exec(
    "CREATE TRIGGER fail_save BEFORE UPDATE ON document BEGIN SELECT RAISE(ABORT,'disk failed'); END",
  );
  const request: Mutation = {
    requestId: crypto.randomUUID(),
    revision: store.read().revision,
    command: { type: "card.create", listId: lists[0].id, title: "不能丢失" },
  };
  expect(() => store.mutate(request)).toThrow("disk failed");
  expect(store.read().cards).toHaveLength(0);
  expect(raw.query("SELECT * FROM receipts WHERE id=?").get(request.requestId)).toBeNull();
  raw.exec("DROP TRIGGER fail_save");
  raw.close();
  expect(store.mutate(request).state.cards).toHaveLength(1);
});
test("date, empty title and duplicate checklist IDs are validated", () => {
  const { store, run, lists } = fixture();
  expect(() => run({ type: "card.create", listId: lists[0].id, title: "  " })).toThrow();
  const id = run({ type: "card.create", listId: lists[0].id, title: "记录" }).createdId!;
  const card = store.read().cards[0];
  expect(() => run({ type: "card.edit", id, details: { ...card, due: "2026-02-30" } })).toThrow();
  const item = { id: crypto.randomUUID(), text: "任务", done: false };
  expect(() =>
    run({ type: "card.edit", id, details: { ...card, checklist: [item, item] } }),
  ).toThrow("重复");
});
test("future database versions are not overwritten", () => {
  const { file, store } = fixture();
  const before = store.read();
  const raw = new Database(file);
  raw.exec("PRAGMA user_version=3");
  raw.close();
  expect(() => new KanbanStore(file)).toThrow("升级插件");
  expect(store.read()).toEqual(before);
});

test("board labels have stable identities, allow repeated colors and persist edits and display preference", () => {
  const { store, file, run, boardId, lists } = fixture();
  const first = run({
    type: "label.create",
    boardId,
    details: { name: "  重要  ", color: "red", shade: "dark" },
  }).createdId!;
  const second = run({
    type: "label.create",
    boardId,
    details: { name: "待确认", color: "red", shade: "dark" },
  }).createdId!;
  expect(first).not.toBe(second);
  const ids = [
    run({ type: "card.create", listId: lists[0].id, title: "一" }).createdId!,
    run({ type: "card.create", listId: lists[1].id, title: "二" }).createdId!,
  ];
  for (const id of ids)
    run({
      type: "card.edit",
      id,
      details: { ...store.read().cards.find((card) => card.id === id)!, labels: [first, second] },
    });
  run({
    type: "label.edit",
    id: first,
    details: { name: "发布", color: "purple", shade: "light" },
  });
  expect(store.read().cards.every((card) => card.labels.includes(first))).toBe(true);
  expect(store.read().labels.find((label) => label.id === first)).toMatchObject({
    name: "发布",
    color: "purple",
    shade: "light",
  });
  expect(store.read().labels.find((label) => label.id === second)?.name).toBe("待确认");
  run({ type: "labels.display", visible: false });
  const reopened = new KanbanStore(file);
  stores.push(reopened);
  expect(reopened.read()).toEqual(store.read());
  expect(reopened.read().labelNamesVisible).toBe(false);
});

test("label assignment rejects missing, duplicate and cross-board labels; colorless labels require a name", () => {
  const { store, run, boardId, lists } = fixture();
  const other = run({ type: "board.create", title: "其他看板" }).createdId!;
  const foreign = store.read().labels.find((label) => label.boardId === other)!.id;
  const own = store.read().labels.find((label) => label.boardId === boardId)!.id;
  const id = run({ type: "card.create", listId: lists[0].id, title: "验证关联" }).createdId!;
  const card = store.read().cards[0];
  const before = store.read();
  for (const labels of [[foreign], [crypto.randomUUID()], [own, own]])
    expect(() => run({ type: "card.edit", id, details: { ...card, labels } })).toThrow();
  expect(() =>
    run({ type: "label.create", boardId, details: { name: "  ", color: null, shade: "normal" } }),
  ).toThrow("名称");
  expect(store.read()).toEqual(before);
  const colorless = run({
    type: "label.create",
    boardId,
    details: { name: "内部", color: null, shade: "normal" },
  }).createdId!;
  run({ type: "card.edit", id, details: { ...card, labels: [colorless] } });
  run({ type: "board.archive", id: boardId, archived: true });
  expect(() =>
    run({
      type: "label.edit",
      id: own,
      details: { name: "不能改", color: "blue", shade: "normal" },
    }),
  ).toThrow("恢复看板");
  expect(() => run({ type: "label.delete", id: own })).toThrow("恢复看板");
});

test("label deletion removes active and archived assignments atomically and retries only once", () => {
  const { store, file, run, lists } = fixture();
  const labelId = store.read().labels[0].id;
  for (const title of ["活动卡片", "归档卡片"]) {
    const id = run({ type: "card.create", listId: lists[0].id, title }).createdId!;
    run({
      type: "card.edit",
      id,
      details: { ...store.read().cards.find((card) => card.id === id)!, labels: [labelId] },
    });
    if (title === "归档卡片") run({ type: "card.archive", id, archived: true });
  }
  const request: Mutation = {
    requestId: crypto.randomUUID(),
    revision: store.read().revision,
    command: { type: "label.delete", id: labelId },
  };
  const before = store.read();
  const raw = new Database(file);
  raw.exec(
    "CREATE TRIGGER fail_label_save BEFORE UPDATE ON document BEGIN SELECT RAISE(ABORT,'disk failed'); END",
  );
  expect(() => store.mutate(request)).toThrow("disk failed");
  expect(store.read()).toEqual(before);
  expect(raw.query("SELECT * FROM receipts WHERE id=?").get(request.requestId)).toBeNull();
  raw.exec("DROP TRIGGER fail_label_save");
  raw.close();
  const result = store.mutate(request);
  expect(result.state.labels.some((label) => label.id === labelId)).toBe(false);
  expect(result.state.cards.every((card) => card.labels.length === 0)).toBe(true);
  expect(store.mutate(request)).toEqual(result);
});

test("stale label edits cannot overwrite another window and old schema is not migrated", () => {
  const { store, file, run } = fixture();
  const label = store.read().labels[0];
  const request: Mutation = {
    requestId: crypto.randomUUID(),
    revision: store.read().revision,
    command: {
      type: "label.edit",
      id: label.id,
      details: { name: "过期", color: "green", shade: "light" },
    },
  };
  run({
    type: "label.edit",
    id: label.id,
    details: { name: "最新", color: "blue", shade: "dark" },
  });
  expect(() => store.mutate(request)).toThrow("其他窗口");
  expect(store.read().labels[0].name).toBe("最新");
  const raw = new Database(file);
  raw.exec("PRAGMA user_version=1");
  const before = raw.query("SELECT body FROM document WHERE id=1").get();
  expect(() => new KanbanStore(file)).toThrow("不进行兼容或迁移");
  expect(raw.query("SELECT body FROM document WHERE id=1").get()).toEqual(before);
  expect(raw.query("PRAGMA user_version").get()).toEqual({ user_version: 1 });
  raw.close();
});
