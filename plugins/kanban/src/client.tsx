import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { Context } from "@deepseek-ai/cordis";
import type { APIClient } from "@semicoder/fia/api";
import { client } from "@semicoder/fn-sdk/client";
import type Navigation from "@semicoder/fn-ui-navigation/types";
import type {} from "@semicoder/fn-ui-layout/contract";
import contract, {
  colors,
  colorNames,
  type Card,
  type Command,
  type Details,
  type State,
} from "./contract.ts";
import "./style.css";

export const inject = ["slots", "layoutSlots", "navigation", "platform", "api:kanban"];
type Remote = APIClient<typeof contract>;
function Icon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="23"
      height="23"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M8 7v10M12 7v6M16 7v8" />
    </svg>
  );
}
function Entry({ navigation }: { navigation: Navigation }) {
  const current = useSyncExternalStore(navigation.subscribe, navigation.snapshot);
  return (
    <button
      className={`activity-button ${current === "fn-kanban" ? "active" : ""}`}
      title="看板"
      aria-label="看板"
      aria-current={current === "fn-kanban" ? "page" : undefined}
      onClick={() => navigation.go("fn-kanban")}
    >
      <Icon />
    </button>
  );
}
export function apply(ctx: Context) {
  const remote = client(ctx, "kanban", contract);
  ctx.slots.register({ name: "fn.sidebar.top", id: "fn-kanban", order: 20 }, () => (
    <Entry navigation={ctx.navigation} />
  ));
  ctx.slots.register({ name: "fn.main", key: "fn-kanban" }, () => <Kanban remote={remote} />);
}

type DialogState =
  | {
      type: "board.create" | "board.rename" | "list.create" | "list.rename";
      id?: string;
      title: string;
    }
  | { type: "archive" }
  | { type: "card"; card: Card; revision: number };
type Drag = { kind: "card" | "list"; id: string };
function Kanban({ remote }: { remote: Remote }) {
  const [data, setData] = useState<State | null>(null),
    latest = useRef<State | null>(null);
  const [boardId, setBoardId] = useState(""),
    [query, setQuery] = useState(""),
    [label, setLabel] = useState("");
  const [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [online, setOnline] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null),
    [drag, setDrag] = useState<Drag | null>(null);
  const [dropId, setDropId] = useState(""),
    busy = useRef(false),
    mounted = useRef(false);
  const pending = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const accept = useCallback((next: State) => {
    if (!mounted.current || (latest.current && next.revision < latest.current.revision)) return;
    latest.current = next;
    setData(next);
    setOnline(true);
  }, []);
  const refresh = useCallback(async () => {
    try {
      accept(await remote.call("read", {}));
    } catch (error) {
      if (mounted.current) {
        setOnline(false);
        setError(message(error));
      }
    }
  }, [remote, accept]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const off = remote.on("changed", () => void refresh()),
      reconnect = remote.onReconnect(() => void refresh());
    return () => {
      mounted.current = false;
      off();
      reconnect();
    };
  }, [remote, refresh]);
  const boards = data?.boards.filter((item) => !item.archived) ?? [];
  const board = boards.find((item) => item.id === boardId) ?? boards[0];
  const lists = data?.lists.filter((item) => item.boardId === board?.id && !item.archived) ?? [];
  const filtered = Boolean(query.trim() || label);
  const matches = (card: Card) =>
    (!label || card.labels.includes(label as (typeof colors)[number])) &&
    `${card.title}\n${card.description}\n${card.checklist.map((item) => item.text).join("\n")}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase());
  async function mutate(command: Command, revision = latest.current?.revision) {
    if (busy.current || revision === undefined) return null;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      const fingerprint = JSON.stringify(command);
      if (pending.current?.fingerprint !== fingerprint)
        pending.current = { fingerprint, requestId: crypto.randomUUID() };
      const result = await remote.call("mutate", {
        command,
        revision,
        requestId: pending.current.requestId,
      });
      pending.current = null;
      accept(result.state);
      return result;
    } catch (error) {
      if (mounted.current) setError(message(error));
      await refresh();
      return null;
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  function startDrag(event: React.DragEvent, value: Drag) {
    if (filtered || saving) {
      event.preventDefault();
      return;
    }
    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-fn-kanban", JSON.stringify(value));
    setDrag(value);
  }
  function over(event: React.DragEvent, id: string, kind: Drag["kind"]) {
    if (!drag || drag.kind !== kind || filtered) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setDropId(id);
  }
  function drop(
    event: React.DragEvent,
    target: string,
    beforeId: string | null,
    kind: Drag["kind"],
  ) {
    if (!drag || drag.kind !== kind || filtered) return;
    event.preventDefault();
    event.stopPropagation();
    void mutate(
      kind === "card"
        ? { type: "card.move", id: drag.id, listId: target, beforeId }
        : { type: "list.move", id: drag.id, beforeId },
    );
    setDrag(null);
    setDropId("");
  }
  const total =
    data?.cards.filter((card) => !card.archived && lists.some((list) => list.id === card.listId))
      .length ?? 0;
  return (
    <div className="fn-kanban" aria-label="看板工作区">
      <header className="kb-topbar">
        <div className="kb-brand">
          <Icon />
          <h1>看板</h1>
          <span className="kb-local">仅存储在本机</span>
        </div>
        <div className="kb-actions">
          <span role="status" className="kb-muted">
            {saving ? "正在保存…" : online ? "已保存到本机" : "正在连接…"}
          </span>
          <button onClick={() => setDialog({ type: "archive" })}>归档</button>
          <button
            className="kb-primary"
            disabled={!online}
            onClick={() => setDialog({ type: "board.create", title: "" })}
          >
            ＋ 新建看板
          </button>
        </div>
      </header>
      {error && (
        <div className="kb-error" role="alert">
          <span>{error}</span>
          <button
            onClick={() => {
              setError("");
              void refresh();
            }}
          >
            刷新
          </button>
        </div>
      )}
      {!data ? (
        <div className="kb-empty">
          <h2>正在打开本地看板…</h2>
        </div>
      ) : !board ? (
        <div className="kb-empty">
          <div className="kb-empty-icon">
            <Icon />
          </div>
          <h2>把想法变成下一步</h2>
          <p>创建一个看板，用列表安排进度，用卡片记录要做的事。</p>
          <button
            className="kb-primary"
            onClick={() => setDialog({ type: "board.create", title: "我的看板" })}
          >
            创建第一个看板
          </button>
          <small>无需账号，内容保存在这台电脑上。</small>
        </div>
      ) : (
        <>
          <div className="kb-boardbar">
            <div className="kb-board-name">
              <select
                aria-label="切换看板"
                value={board.id}
                onChange={(event) => {
                  setBoardId(event.target.value);
                  setQuery("");
                  setLabel("");
                }}
              >
                {boards.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
              <span className="kb-count">{total} 张卡片</span>
              <button
                className="kb-icon-button"
                aria-label="重命名看板"
                title="重命名看板"
                onClick={() =>
                  setDialog({ type: "board.rename", id: board.id, title: board.title })
                }
              >
                ✎
              </button>
              <button
                className="kb-quiet"
                disabled={saving}
                onClick={() => void mutate({ type: "board.archive", id: board.id, archived: true })}
              >
                归档看板
              </button>
            </div>
            <div className="kb-filters">
              <input
                type="search"
                aria-label="搜索卡片"
                placeholder="搜索卡片…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <select
                aria-label="筛选标签"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              >
                <option value="">所有标签</option>
                {colors.map((color) => (
                  <option key={color} value={color}>
                    {colorNames[color]}
                  </option>
                ))}
              </select>
              {filtered && (
                <button
                  onClick={() => {
                    setQuery("");
                    setLabel("");
                  }}
                >
                  清除筛选
                </button>
              )}
            </div>
          </div>
          {filtered && <p className="kb-filter-note">正在筛选卡片；清除筛选后可拖动排序。</p>}
          <div
            className="kb-board"
            aria-label={board.title}
            onDragEnd={() => {
              setDrag(null);
              setDropId("");
            }}
          >
            {lists.map((list, listIndex) => {
              const cards = data.cards.filter((card) => card.listId === list.id && !card.archived);
              return (
                <section
                  key={list.id}
                  className={`kb-list ${dropId === list.id ? "kb-drop" : ""}`}
                  aria-label={`${list.title}列表`}
                  data-list-id={list.id}
                  onDragOver={(e) => over(e, list.id, "list")}
                  onDrop={(e) => drop(e, list.id, list.id, "list")}
                >
                  <header
                    className="kb-list-head"
                    draggable={!filtered && !saving}
                    onDragStart={(e) => startDrag(e, { kind: "list", id: list.id })}
                    title="拖动以调整列表顺序"
                  >
                    <button
                      className="kb-list-title"
                      onClick={() =>
                        setDialog({ type: "list.rename", id: list.id, title: list.title })
                      }
                    >
                      {list.title}
                    </button>
                    <span className="kb-count">{cards.length}</span>
                    <details className="kb-menu">
                      <summary aria-label={`${list.title}列表操作`}>···</summary>
                      <div>
                        <button
                          disabled={!listIndex || saving}
                          onClick={() =>
                            void mutate({
                              type: "list.move",
                              id: list.id,
                              beforeId: lists[listIndex - 1]?.id ?? null,
                            })
                          }
                        >
                          向左移动
                        </button>
                        <button
                          disabled={listIndex === lists.length - 1 || saving}
                          onClick={() =>
                            void mutate({
                              type: "list.move",
                              id: list.id,
                              beforeId: lists[listIndex + 2]?.id ?? null,
                            })
                          }
                        >
                          向右移动
                        </button>
                        <button
                          disabled={saving}
                          onClick={() =>
                            void mutate({ type: "list.archive", id: list.id, archived: true })
                          }
                        >
                          归档列表
                        </button>
                      </div>
                    </details>
                  </header>
                  <div
                    className={`kb-cards ${dropId === `end:${list.id}` ? "kb-drop" : ""}`}
                    aria-label={`${list.title}卡片区域`}
                    onDragOver={(e) => over(e, `end:${list.id}`, "card")}
                    onDrop={(e) => drop(e, list.id, null, "card")}
                  >
                    {cards.filter(matches).map((card) => (
                      <button
                        key={card.id}
                        className={`kb-card ${dropId === card.id ? "kb-drop" : ""} ${drag?.id === card.id ? "kb-dragging" : ""}`}
                        data-card-id={card.id}
                        draggable={!filtered && !saving}
                        onDragStart={(e) => startDrag(e, { kind: "card", id: card.id })}
                        onDragOver={(e) => over(e, card.id, "card")}
                        onDrop={(e) => drop(e, list.id, card.id, "card")}
                        onClick={() => setDialog({ type: "card", card, revision: data.revision })}
                      >
                        {card.labels.length > 0 && (
                          <span className="kb-labels">
                            {card.labels.map((color) => (
                              <span
                                key={color}
                                className={`kb-label kb-${color}`}
                                title={colorNames[color]}
                                aria-label={colorNames[color]}
                              />
                            ))}
                          </span>
                        )}
                        <span className={`kb-card-title ${card.done ? "kb-done" : ""}`}>
                          {card.title}
                        </span>
                        {(card.due ||
                          card.description ||
                          card.checklist.length > 0 ||
                          card.done) && (
                          <span className="kb-card-meta">
                            {card.done && <span className="kb-complete">✓ 已完成</span>}
                            {card.due && (
                              <span
                                className={!card.done && card.due < today() ? "kb-overdue" : ""}
                              >
                                ◷ {card.due.slice(5).replace("-", "/")}
                              </span>
                            )}
                            {card.description && <span aria-label="有描述">≡</span>}
                            {card.checklist.length > 0 && (
                              <span>
                                ☑ {card.checklist.filter((item) => item.done).length}/
                                {card.checklist.length}
                              </span>
                            )}
                          </span>
                        )}
                      </button>
                    ))}
                    {!cards.length && <div className="kb-list-empty">将卡片拖到这里</div>}
                    {cards.length > 0 && !cards.some(matches) && (
                      <div className="kb-list-empty">没有匹配的卡片</div>
                    )}
                  </div>
                  <AddCard
                    disabled={saving || !online}
                    listId={list.id}
                    onAdd={async (title) =>
                      Boolean(await mutate({ type: "card.create", listId: list.id, title }))
                    }
                  />
                </section>
              );
            })}
            <button
              className={`kb-add-list ${dropId === "last-list" ? "kb-drop" : ""}`}
              onDragOver={(e) => over(e, "last-list", "list")}
              onDrop={(e) => drop(e, "", null, "list")}
              onClick={() => setDialog({ type: "list.create", id: board.id, title: "" })}
            >
              ＋ 添加列表
            </button>
          </div>
        </>
      )}
      {dialog?.type === "card" && data && (
        <CardDialog
          key={dialog.card.id}
          card={dialog.card}
          data={data}
          saving={saving}
          error={error}
          close={() => setDialog(null)}
          save={async (details) =>
            Boolean(
              await mutate({ type: "card.edit", id: dialog.card.id, details }, dialog.revision),
            )
          }
          move={async (listId, beforeId) =>
            Boolean(
              await mutate(
                { type: "card.move", id: dialog.card.id, listId, beforeId },
                dialog.revision,
              ),
            )
          }
          archive={async () =>
            Boolean(
              await mutate(
                { type: "card.archive", id: dialog.card.id, archived: true },
                dialog.revision,
              ),
            )
          }
        />
      )}
      {dialog?.type === "archive" && data && (
        <Modal title="归档" close={() => setDialog(null)}>
          <p className="kb-muted">归档内容仍保存在本机。先恢复看板和列表，再恢复其中的卡片。</p>
          <div className="kb-archive">
            {data.boards
              .filter((item) => item.archived)
              .map((item) => (
                <ArchiveRow
                  key={item.id}
                  title={item.title}
                  kind="看板"
                  disabled={saving}
                  restore={() =>
                    void mutate({ type: "board.archive", id: item.id, archived: false })
                  }
                />
              ))}
            {data.lists
              .filter((item) => item.archived)
              .map((item) => (
                <ArchiveRow
                  key={item.id}
                  title={item.title}
                  kind={`列表 · ${data.boards.find((b) => b.id === item.boardId)?.title}`}
                  disabled={
                    saving || Boolean(data.boards.find((b) => b.id === item.boardId)?.archived)
                  }
                  restore={() =>
                    void mutate({ type: "list.archive", id: item.id, archived: false })
                  }
                />
              ))}
            {data.cards
              .filter((item) => item.archived)
              .map((item) => {
                const list = data.lists.find((l) => l.id === item.listId)!;
                return (
                  <ArchiveRow
                    key={item.id}
                    title={item.title}
                    kind={`卡片 · ${list.title}`}
                    disabled={
                      saving ||
                      list.archived ||
                      Boolean(data.boards.find((b) => b.id === list.boardId)?.archived)
                    }
                    restore={() =>
                      void mutate({ type: "card.archive", id: item.id, archived: false })
                    }
                  />
                );
              })}
            {![...data.boards, ...data.lists, ...data.cards].some((item) => item.archived) && (
              <p className="kb-empty-inline">还没有归档内容。</p>
            )}
          </div>
        </Modal>
      )}
      {dialog && "title" in dialog && (
        <NameDialog
          key={`${dialog.type}:${dialog.id}`}
          title={
            {
              "board.create": "新建看板",
              "board.rename": "重命名看板",
              "list.create": "添加列表",
              "list.rename": "重命名列表",
            }[dialog.type]
          }
          initial={dialog.title}
          saving={saving}
          error={error}
          close={() => setDialog(null)}
          submit={async (title) => {
            let command: Command;
            if (dialog.type === "board.create") command = { type: dialog.type, title };
            else if (dialog.type === "list.create")
              command = { type: dialog.type, boardId: dialog.id!, title };
            else command = { type: dialog.type, id: dialog.id!, title };
            const result = await mutate(command);
            if (result) {
              if (dialog.type === "board.create") setBoardId(result.createdId!);
              setDialog(null);
            }
          }}
        />
      )}
    </div>
  );
}

function AddCard({
  disabled,
  listId,
  onAdd,
}: {
  disabled: boolean;
  listId: string;
  onAdd: (title: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false),
    [title, setTitle] = useState("");
  return open ? (
    <form
      className="kb-add-card-form"
      onSubmit={async (event) => {
        event.preventDefault();
        if (title.trim() && (await onAdd(title))) setTitle("");
      }}
    >
      <textarea
        autoFocus
        aria-label="卡片名称"
        maxLength={200}
        value={title}
        placeholder="输入卡片名称…"
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            e.currentTarget.form?.requestSubmit();
          }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      <div className="kb-actions">
        <button className="kb-primary" disabled={disabled || !title.trim()}>
          添加卡片
        </button>
        <button type="button" aria-label="取消添加卡片" onClick={() => setOpen(false)}>
          ×
        </button>
      </div>
    </form>
  ) : (
    <button
      className="kb-add-card"
      disabled={disabled}
      data-add-list={listId}
      onClick={() => setOpen(true)}
    >
      ＋ 添加卡片
    </button>
  );
}
function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="fn-kanban-dialog"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <header className="kb-modal-head">
        <h2>{title}</h2>
        <button aria-label="关闭对话框" onClick={close}>
          ×
        </button>
      </header>
      {children}
    </dialog>
  );
}
function NameDialog({
  title,
  initial,
  saving,
  error,
  close,
  submit,
}: {
  title: string;
  initial: string;
  saving: boolean;
  error: string;
  close: () => void;
  submit: (title: string) => Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  return (
    <Modal title={title} close={close}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(value);
        }}
      >
        <label className="kb-field">
          名称
          <input
            autoFocus
            required
            maxLength={200}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="kb-error">
            {error}
          </p>
        )}
        <footer className="kb-modal-footer">
          <button type="button" onClick={close}>
            取消
          </button>
          <button className="kb-primary" disabled={saving || !value.trim()}>
            保存
          </button>
        </footer>
      </form>
    </Modal>
  );
}
function CardDialog({
  card,
  data,
  saving,
  error,
  close,
  save,
  move,
  archive,
}: {
  card: Card;
  data: State;
  saving: boolean;
  error: string;
  close: () => void;
  save: (details: Details) => Promise<boolean>;
  move: (listId: string, beforeId: string | null) => Promise<boolean>;
  archive: () => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<Details>({
    title: card.title,
    description: card.description,
    labels: card.labels,
    due: card.due,
    done: card.done,
    checklist: card.checklist,
  });
  const [checkText, setCheckText] = useState(""),
    [target, setTarget] = useState(card.listId),
    [before, setBefore] = useState("");
  const list = data.lists.find((item) => item.id === card.listId)!;
  const lists = data.lists.filter((item) => item.boardId === list.boardId && !item.archived);
  const dirty =
    JSON.stringify(draft) !==
    JSON.stringify({
      title: card.title,
      description: card.description,
      labels: card.labels,
      due: card.due,
      done: card.done,
      checklist: card.checklist,
    });
  const [confirmClose, setConfirmClose] = useState(false);
  const requestClose = () => (dirty ? setConfirmClose(true) : close());
  const set = <K extends keyof Details>(key: K, value: Details[K]) =>
    setDraft((old) => ({ ...old, [key]: value }));
  const addCheck = () => {
    if (checkText.trim() && draft.checklist.length < 100) {
      set("checklist", [
        ...draft.checklist,
        { id: crypto.randomUUID(), text: checkText.trim(), done: false },
      ]);
      setCheckText("");
    }
  };
  return (
    <Modal title="卡片详情" close={requestClose}>
      {confirmClose && (
        <div className="kb-error" role="alert">
          卡片有未保存的修改。<button onClick={() => setConfirmClose(false)}>继续编辑</button>
          <button onClick={close}>放弃修改</button>
        </div>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await save(draft)) close();
        }}
      >
        <p className="kb-muted">位于「{list.title}」列表</p>
        <label className="kb-field">
          卡片名称
          <input
            autoFocus
            required
            maxLength={200}
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </label>
        <label className="kb-field">
          描述
          <textarea
            rows={4}
            maxLength={20000}
            placeholder="补充背景、链接或要点…"
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </label>
        <fieldset className="kb-field">
          <legend>标签</legend>
          <div className="kb-label-options">
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                className={`kb-label-option kb-${color}`}
                aria-pressed={draft.labels.includes(color)}
                onClick={() =>
                  set(
                    "labels",
                    draft.labels.includes(color)
                      ? draft.labels.filter((item) => item !== color)
                      : [...draft.labels, color],
                  )
                }
              >
                {draft.labels.includes(color) ? "✓ " : ""}
                {colorNames[color]}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="kb-detail-row">
          <label className="kb-field">
            截止日期
            <input
              type="date"
              value={draft.due ?? ""}
              onInput={(e) => set("due", e.currentTarget.value || null)}
              onChange={(e) => set("due", e.target.value || null)}
            />
          </label>
          <label className="kb-checkbox">
            <input
              type="checkbox"
              checked={draft.done}
              onChange={(e) => set("done", e.target.checked)}
            />
            标记为已完成
          </label>
        </div>
        <fieldset className="kb-field">
          <legend>
            检查清单{" "}
            <span className="kb-muted">
              {draft.checklist.filter((item) => item.done).length}/{draft.checklist.length}
            </span>
          </legend>
          {draft.checklist.length > 0 && (
            <progress
              value={draft.checklist.filter((item) => item.done).length}
              max={draft.checklist.length}
            />
          )}
          {draft.checklist.map((item) => (
            <div className="kb-check-item" key={item.id}>
              <input
                aria-label={`完成 ${item.text}`}
                type="checkbox"
                checked={item.done}
                onChange={(e) =>
                  set(
                    "checklist",
                    draft.checklist.map((value) =>
                      value.id === item.id ? { ...value, done: e.target.checked } : value,
                    ),
                  )
                }
              />
              <input
                aria-label="检查项内容"
                maxLength={200}
                required
                value={item.text}
                onChange={(e) =>
                  set(
                    "checklist",
                    draft.checklist.map((value) =>
                      value.id === item.id ? { ...value, text: e.target.value } : value,
                    ),
                  )
                }
              />
              <button
                type="button"
                aria-label={`删除 ${item.text}`}
                onClick={() =>
                  set(
                    "checklist",
                    draft.checklist.filter((value) => value.id !== item.id),
                  )
                }
              >
                ×
              </button>
            </div>
          ))}
          <div className="kb-check-item">
            <input
              aria-label="新检查项"
              placeholder="添加一项…"
              value={checkText}
              maxLength={200}
              onChange={(e) => setCheckText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  addCheck();
                }
              }}
            />
            <button
              type="button"
              disabled={!checkText.trim() || draft.checklist.length >= 100}
              onClick={addCheck}
            >
              添加
            </button>
          </div>
        </fieldset>
        {error && (
          <p className="kb-error" role="alert">
            {error}（编辑内容已保留；关闭后重新打开卡片可获取最新版本。）
          </p>
        )}
        <footer className="kb-modal-footer">
          <button type="button" onClick={requestClose}>
            取消
          </button>
          <button className="kb-primary" disabled={saving || !draft.title.trim()}>
            保存卡片
          </button>
        </footer>
      </form>
      <details className="kb-card-tools">
        <summary>移动与归档</summary>
        {dirty && <p className="kb-muted">请先保存当前修改，再移动或归档。</p>}
        <div className="kb-detail-row">
          <label className="kb-field">
            移至列表
            <select
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                setBefore("");
              }}
            >
              {lists.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <label className="kb-field">
            位置
            <select value={before} onChange={(e) => setBefore(e.target.value)}>
              <option value="">列表末尾</option>
              {data.cards
                .filter((item) => item.listId === target && !item.archived && item.id !== card.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title} 之前
                  </option>
                ))}
            </select>
          </label>
          <button
            disabled={dirty || saving}
            onClick={async () => {
              if (await move(target, before || null)) close();
            }}
          >
            移动卡片
          </button>
        </div>
        <button
          disabled={dirty || saving}
          onClick={async () => {
            if (await archive()) close();
          }}
        >
          归档卡片
        </button>
      </details>
    </Modal>
  );
}
function ArchiveRow({
  title,
  kind,
  disabled,
  restore,
}: {
  title: string;
  kind: string;
  disabled: boolean;
  restore: () => void;
}) {
  return (
    <div className="kb-archive-row">
      <div>
        <strong>{title}</strong>
        <small>{kind}</small>
      </div>
      <button disabled={disabled} onClick={restore}>
        恢复
      </button>
    </div>
  );
}
function today() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
