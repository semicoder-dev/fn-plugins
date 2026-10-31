import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  defaultColors,
  mutation,
  state as stateSchema,
  type Mutation,
  type State,
} from "./contract.ts";

function defaultLabels(boardId: string): State["labels"] {
  return defaultColors.map((color) => ({
    id: crypto.randomUUID(),
    boardId,
    name: "",
    color,
    shade: "normal",
  }));
}

/** Plugin-owned document in SQLite: a mutation, revision and retry receipt commit together. */
export class KanbanStore {
  private db: Database;
  constructor(filename: string) {
    mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
    this.db = new Database(filename, { create: true, strict: true });
    try {
      this.db.exec(
        "PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=3000;",
      );
      const version = this.db.query("PRAGMA user_version").get() as {
        user_version: number;
      };
      if (version.user_version > 2)
        throw new Error("看板数据由更新版本创建，请升级插件");
      if (version.user_version === 1) throw new Error("数据格式无法读取");
      this.db
        .transaction(() => {
          this.db.exec(
            "CREATE TABLE IF NOT EXISTS document (id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS receipts (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, created_id TEXT);",
          );
          this.db.query("INSERT OR IGNORE INTO document VALUES (1, ?)").run(
            JSON.stringify({
              revision: 0,
              boards: [],
              lists: [],
              cards: [],
              labels: [],
              labelNamesVisible: true,
            }),
          );
          const row = this.db
            .query("SELECT body FROM document WHERE id=1")
            .get() as {
            body: string;
          };
          stateSchema.parse(JSON.parse(row.body));
          this.db.exec("PRAGMA user_version=2");
        })
        .immediate();
      this.read();
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  close() {
    this.db.close();
  }
  read(): State {
    const row = this.db.query("SELECT body FROM document WHERE id=1").get() as {
      body: string;
    };
    return stateSchema.parse(JSON.parse(row.body));
  }
  mutate(
    input: Mutation,
    locale = "zh-CN",
  ): { state: State; createdId?: string } {
    const request = mutation.parse(input);
    return this.db
      .transaction(() => {
        const fingerprint = createHash("sha256")
          .update(JSON.stringify(request.command))
          .digest("hex");
        const receipt = this.db
          .query("SELECT fingerprint, created_id FROM receipts WHERE id=?")
          .get(request.requestId) as {
          fingerprint: string;
          created_id: string | null;
        } | null;
        const state = this.read();
        if (receipt) {
          if (receipt.fingerprint !== fingerprint)
            throw new Error("重复请求的内容不一致");
          return {
            state,
            ...(receipt.created_id ? { createdId: receipt.created_id } : {}),
          };
        }
        if (request.revision !== state.revision)
          throw new Error("内容已在其他窗口更新，请刷新后再保存");
        let createdId: string | undefined;
        const c = request.command;
        const board = (id: string) => required(state.boards, id);
        const list = (id: string) => required(state.lists, id);
        const card = (id: string) => required(state.cards, id);
        const activeBoard = (id: string) => {
          const value = board(id);
          if (value.archived) throw new Error("请先恢复看板");
          return value;
        };
        const activeList = (id: string) => {
          const value = list(id);
          activeBoard(value.boardId);
          if (value.archived) throw new Error("请先恢复列表");
          return value;
        };
        const activeCard = (id: string) => {
          const value = card(id);
          activeList(value.listId);
          if (value.archived) throw new Error("请先恢复卡片");
          return value;
        };
        switch (c.type) {
          case "board.create": {
            createdId = crypto.randomUUID();
            state.boards.push({
              id: createdId,
              title: c.title,
              archived: false,
            });
            state.labels.push(...defaultLabels(createdId));
            for (const title of locale === "en"
              ? ["To do", "In progress", "Done"]
              : ["待办", "进行中", "已完成"])
              state.lists.push({
                id: crypto.randomUUID(),
                boardId: createdId,
                title,
                archived: false,
              });
            break;
          }
          case "board.rename":
            activeBoard(c.id).title = c.title;
            break;
          case "board.archive":
            board(c.id).archived = c.archived;
            break;
          case "label.create":
            activeBoard(c.boardId);
            if (
              state.labels.filter((label) => label.boardId === c.boardId)
                .length >= 100
            )
              throw new Error("每个看板最多 100 个标签");
            createdId = crypto.randomUUID();
            state.labels.push({
              id: createdId,
              boardId: c.boardId,
              ...c.details,
            });
            break;
          case "label.edit": {
            const label = required(state.labels, c.id);
            activeBoard(label.boardId);
            Object.assign(label, c.details);
            break;
          }
          case "label.delete": {
            const label = required(state.labels, c.id);
            activeBoard(label.boardId);
            state.labels.splice(state.labels.indexOf(label), 1);
            for (const card of state.cards) {
              if (card.labels.includes(c.id)) {
                card.labels = card.labels.filter((id) => id !== c.id);
                card.updatedAt = Date.now();
              }
            }
            break;
          }
          case "labels.display":
            state.labelNamesVisible = c.visible;
            break;
          case "list.create":
            activeBoard(c.boardId);
            createdId = crypto.randomUUID();
            state.lists.push({
              id: createdId,
              boardId: c.boardId,
              title: c.title,
              archived: false,
            });
            break;
          case "list.rename":
            activeList(c.id).title = c.title;
            break;
          case "list.archive": {
            const value = list(c.id);
            activeBoard(value.boardId);
            value.archived = c.archived;
            break;
          }
          case "list.move": {
            const value = activeList(c.id);
            if (c.beforeId && activeList(c.beforeId).boardId !== value.boardId)
              throw new Error("列表不属于同一看板");
            move(state.lists, c.id, c.beforeId);
            break;
          }
          case "card.create":
            activeList(c.listId);
            createdId = crypto.randomUUID();
            state.cards.push({
              id: createdId,
              listId: c.listId,
              title: c.title,
              description: "",
              labels: [],
              due: null,
              done: false,
              checklist: [],
              archived: false,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            });
            break;
          case "card.edit": {
            const value = activeCard(c.id);
            const boardId = list(value.listId).boardId;
            for (const id of c.details.labels)
              if (required(state.labels, id).boardId !== boardId)
                throw new Error("标签不属于当前看板");
            Object.assign(value, c.details, { updatedAt: Date.now() });
            break;
          }
          case "card.archive": {
            const value = card(c.id);
            activeList(value.listId);
            value.archived = c.archived;
            value.updatedAt = Date.now();
            break;
          }
          case "card.move": {
            const value = activeCard(c.id),
              target = activeList(c.listId);
            if (list(value.listId).boardId !== target.boardId)
              throw new Error("请在当前看板内移动卡片");
            if (c.beforeId && activeCard(c.beforeId).listId !== c.listId)
              throw new Error("目标卡片不在该列表");
            if (c.id === c.beforeId) break;
            value.listId = c.listId;
            value.updatedAt = Date.now();
            move(state.cards, c.id, c.beforeId);
            break;
          }
        }
        state.revision++;
        const body = JSON.stringify(stateSchema.parse(state));
        if (Buffer.byteLength(body) > 8 * 1024 * 1024)
          throw new Error("看板内容超过 8 MB 存储上限，请精简卡片描述");
        this.db.query("UPDATE document SET body=? WHERE id=1").run(body);
        this.db
          .query("INSERT INTO receipts VALUES (?, ?, ?)")
          .run(request.requestId, fingerprint, createdId ?? null);
        return { state, ...(createdId ? { createdId } : {}) };
      })
      .immediate();
  }
}
function required<T extends { id: string }>(items: T[], id: string): T {
  const item = items.find((item) => item.id === id);
  if (!item) throw new Error("内容已不存在，请刷新看板");
  return item;
}
function move<T extends { id: string }>(
  items: T[],
  id: string,
  beforeId: string | null,
) {
  if (id === beforeId) return;
  const item = required(items, id);
  items.splice(items.indexOf(item), 1);
  items.splice(
    beforeId ? items.indexOf(required(items, beforeId)) : items.length,
    0,
    item,
  );
}
