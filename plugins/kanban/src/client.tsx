import { classes } from "@semicoder/fn-ui";
import styles from "./style.module.css";
const cx = (...values: (string | false | undefined)[]) => classes(styles, ...values);
import { Button, Select, Input, Textarea } from "@semicoder/fn-ui";
import {
  Modal,
  Menu,
  Checkbox,
  IconEllipsisOutlineRegular,
  IconEditOutlineRegular,
  IconCloseOutlineRegular,
  IconPlusOutlineRegular,
  IconSearchOutlineRegular,
  IconChecklistOutlineRegular,
  IconCheckOutlineRegular,
  IconArchiveOutlineRegular,
  IconChevronDownOutlineRegular,
} from "@semicoder/fn-ui";
import { NavigationButton, useNavigation } from "@semicoder/fn-ui-navigation/view";
import React, { useCallback, useEffect, useRef, useState } from "react";
import type { Context } from "@deepseek-ai/cordis";
import type { APIClient } from "@semicoder/fia/api";
import { client } from "@semicoder/fn-sdk/client";
import type Navigation from "@semicoder/fn-ui-navigation/types";
import type {} from "@semicoder/fn-ui-layout/contract";
import contract, {
  type Card,
  type Command,
  type Details,
  type State,
  type MutationResult,
} from "./contract.ts";
import { LabelBadge, LabelsDialog, labelTitle, type LabelCommand } from "./labels.tsx";
import { BoardHome, BoardHeader } from "./boards.tsx";
import { useBoardDrag } from "./drag.ts";
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
  return (
    <NavigationButton navigation={navigation} path="fn-kanban" label="看板" compact>
      <Icon />
    </NavigationButton>
  );
}
export function apply(ctx: Context) {
  const remote = client(ctx, "kanban", contract);
  ctx.slots.register({ name: "fn.sidebar.top", id: "fn-kanban", order: 20 }, () => (
    <Entry navigation={ctx.navigation} />
  ));
  ctx.slots.register({ name: "fn.main", key: "fn-kanban" }, () => (
    <Kanban remote={remote} navigation={ctx.navigation} />
  ));
}
type DialogState =
  | {
      type: "board.create" | "board.rename" | "list.create" | "list.rename";
      id?: string;
      title: string;
    }
  | {
      type: "archive";
      boardId?: string;
    }
  | { type: "filters" }
  | { type: "labels"; boardId: string }
  | {
      type: "card";
      card: Card;
      revision: number;
    };
function Kanban({ remote, navigation }: { remote: Remote; navigation: Navigation }) {
  const path = useNavigation(navigation);
  const boardId = path.split("/")[1] ?? "";
  const [data, setData] = useState<State | null>(null),
    latest = useRef<State | null>(null);
  const [query, setQuery] = useState(""),
    [label, setLabel] = useState("");
  const [menu, setMenu] = useState("");
  const [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [online, setOnline] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const busy = useRef(false),
    mounted = useRef(false);
  const pending = useRef<{
    fingerprint: string;
    requestId: string;
  } | null>(null);
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
  const board = boards.find((item) => item.id === boardId);
  const openBoard = (id: string) => navigation.go(`fn-kanban/${id}`);
  useEffect(() => {
    setQuery("");
    setLabel("");
    setMenu("");
    setDialog(null);
    setError("");
  }, [boardId]);
  useEffect(() => {
    if (data && boardId && !board) navigation.go("fn-kanban");
  }, [data, boardId, board, navigation]);
  const lists = data?.lists.filter((item) => item.boardId === board?.id && !item.archived) ?? [];
  const boardLabels = data?.labels.filter((item) => item.boardId === board?.id) ?? [];
  const labelMap = new Map(data?.labels.map((item) => [item.id, item]));
  useEffect(() => {
    if (label && !data?.labels.some((item) => item.id === label && item.boardId === board?.id))
      setLabel("");
  }, [data, board?.id, label]);
  const filtered = Boolean(query.trim() || label);
  const matches = (card: Card) =>
    (!label || card.labels.includes(label)) &&
    `${card.title}\n${card.description}\n${card.checklist.map((item) => item.text).join("\n")}\n${card.labels.map((id) => labelMap.get(id)?.name ?? "").join("\n")}`
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
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        event.key !== ";" ||
        event.repeat ||
        event.isComposing ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        dialog ||
        !board ||
        !data ||
        saving ||
        target.closest("input,textarea,select,[contenteditable=true],[role=dialog],[role=menu]")
      )
        return;
      event.preventDefault();
      void mutate({ type: "labels.display", visible: !data.labelNamesVisible });
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [dialog, board?.id, data, saving]);
  const drag = useBoardDrag({
    boardId,
    revision: data?.revision ?? 0,
    lists,
    cards: data?.cards ?? [],
    disabled: filtered || saving || !online || Boolean(dialog || menu),
    move: async (command, revision) => Boolean(await mutate(command, revision)),
  });
  const listMap = new Map(lists.map((list) => [list.id, list]));
  const cardMap = new Map(data?.cards.map((card) => [card.id, card]));
  const visibleLists = drag.preview
    ? drag.preview.layout.lists.flatMap((id) => listMap.get(id) ?? [])
    : lists;
  const archiveBoardId = dialog?.type === "archive" ? dialog.boardId : undefined;
  const archivedBoards = data?.boards.filter((item) => item.archived && !archiveBoardId) ?? [];
  const archivedLists =
    data?.lists.filter((item) => item.archived && item.boardId === archiveBoardId) ?? [];
  const archivedCards =
    data?.cards.filter(
      (item) =>
        item.archived &&
        data.lists.some((list) => list.id === item.listId && list.boardId === archiveBoardId),
    ) ?? [];
  return (
    <div className={cx("fn-kanban")} aria-label="看板工作区">
      {board && data && (
        <BoardHeader
          key={board.id}
          title={board.title}
          query={query}
          onQuery={setQuery}
          filtered={filtered}
          onFilters={() => setDialog({ type: "filters" })}
          saving={saving}
          online={online}
          back={() => navigation.go("fn-kanban")}
          manageLabels={() => setDialog({ type: "labels", boardId: board.id })}
          labelNamesVisible={data.labelNamesVisible}
          toggleLabels={() =>
            void mutate({ type: "labels.display", visible: !data.labelNamesVisible })
          }
          showArchived={() => setDialog({ type: "archive", boardId: board.id })}
        />
      )}
      {error && (
        <div className={cx("kb-error")} role="alert">
          <span>{error}</span>
          <Button
            onClick={() => {
              setError("");
              void refresh();
            }}
            type="button"
          >
            刷新
          </Button>
        </div>
      )}
      {!data ? (
        <div className={cx("kb-empty")}>
          <h2>正在打开本地看板…</h2>
        </div>
      ) : !board ? (
        <BoardHome
          data={data}
          saving={saving}
          online={online}
          open={openBoard}
          create={() => setDialog({ type: "board.create", title: "" })}
          rename={(board) => setDialog({ type: "board.rename", id: board.id, title: board.title })}
          archive={(board) => void mutate({ type: "board.archive", id: board.id, archived: true })}
          showArchived={() => setDialog({ type: "archive" })}
        />
      ) : (
        <>
          <div
            ref={drag.root}
            className={cx("kb-board", Boolean(drag.preview) && "kb-board-dragging")}
            aria-label={board.title}
            onPointerDown={drag.onPointerDown}
            onClickCapture={drag.onClickCapture}
            onDragStart={(event) => event.preventDefault()}
          >
            {visibleLists.map((list) => {
              const listIndex = lists.findIndex((item) => item.id === list.id);
              const cards = drag.preview
                ? (drag.preview.layout.cards[list.id] ?? []).flatMap((id) => cardMap.get(id) ?? [])
                : data.cards.filter((card) => card.listId === list.id && !card.archived);
              return (
                <section
                  key={list.id}
                  className={cx("kb-list", drag.preview?.item.id === list.id && "kb-placeholder")}
                  aria-label={`${list.title}列表`}
                  data-list-id={list.id}
                  data-drag-placeholder={drag.preview?.item.id === list.id || undefined}
                >
                  <header
                    className={cx("kb-list-head")}
                    data-list-handle
                    data-drag-disabled={filtered || saving || undefined}
                    title="拖动以调整列表顺序"
                  >
                    <Button
                      className={cx("kb-list-title")}
                      onClick={() =>
                        setDialog({ type: "list.rename", id: list.id, title: list.title })
                      }
                      type="button"
                    >
                      {list.title}
                    </Button>
                    <span className={cx("kb-count")}>{cards.length}</span>
                    <Menu
                      open={menu === list.id}
                      onClose={() => setMenu("")}
                      portal
                      autoFocus
                      align="end"
                      anchor={
                        <Button
                          size="sm"
                          aria-label={`${list.title}列表操作`}
                          aria-haspopup="menu"
                          aria-expanded={menu === list.id}
                          onClick={(event) => {
                            event.currentTarget.focus();
                            setMenu(menu === list.id ? "" : list.id);
                          }}
                        >
                          <IconEllipsisOutlineRegular />
                        </Button>
                      }
                      items={[
                        { id: "left", label: "向左移动", disabled: !listIndex || saving },
                        {
                          id: "right",
                          label: "向右移动",
                          disabled: listIndex === lists.length - 1 || saving,
                        },
                        { id: "archive", label: "归档列表", disabled: saving },
                      ]}
                      onSelect={(id) => {
                        setMenu("");
                        void mutate(
                          id === "archive"
                            ? { type: "list.archive", id: list.id, archived: true }
                            : {
                                type: "list.move",
                                id: list.id,
                                beforeId:
                                  (id === "left" ? lists[listIndex - 1] : lists[listIndex + 2])
                                    ?.id ?? null,
                              },
                        );
                      }}
                    />
                  </header>
                  <div
                    className={cx("kb-cards")}
                    aria-label={`${list.title}卡片区域`}
                    data-card-area
                  >
                    {cards.filter(matches).map((card) => (
                      <article
                        key={card.id}
                        className={cx(
                          "kb-card",
                          drag.preview?.item.id === card.id && "kb-placeholder",
                        )}
                        data-card-id={card.id}
                        data-drag-placeholder={drag.preview?.item.id === card.id || undefined}
                        data-drag-disabled={filtered || saving || undefined}
                        onClick={(event) => {
                          if (event.target === event.currentTarget)
                            setDialog({ type: "card", card, revision: data.revision });
                        }}
                      >
                        {card.labels.some((id) => labelMap.get(id)?.color) && (
                          <span className={cx("kb-labels")}>
                            {card.labels.map((id) => {
                              const item = labelMap.get(id);
                              return item?.color ? (
                                <Button
                                  key={id}
                                  type="button"
                                  data-label-toggle
                                  className={cx("kb-label-toggle")}
                                  disabled={saving}
                                  aria-label={`${labelTitle(item)}，${data.labelNamesVisible ? "隐藏" : "显示"}标签文字`}
                                  onClick={() =>
                                    void mutate({
                                      type: "labels.display",
                                      visible: !data.labelNamesVisible,
                                    })
                                  }
                                >
                                  <LabelBadge label={item} showName={data.labelNamesVisible} />
                                </Button>
                              ) : null;
                            })}
                          </span>
                        )}
                        <Button
                          className={cx("kb-card-open")}
                          type="button"
                          aria-label={`打开卡片 ${card.title}`}
                          onClick={() => setDialog({ type: "card", card, revision: data.revision })}
                        >
                          <span className={cx(`kb-card-title ${card.done ? "kb-done" : ""}`)}>
                            {card.title}
                          </span>
                          {(card.due ||
                            card.description ||
                            card.checklist.length > 0 ||
                            card.done) && (
                            <span className={cx("kb-card-meta")}>
                              {card.done && (
                                <span className={cx("kb-complete")}>
                                  <IconCheckOutlineRegular aria-hidden="true" /> 已完成
                                </span>
                              )}
                              {card.due && (
                                <span
                                  className={cx(
                                    !card.done && card.due < today() ? "kb-overdue" : "",
                                  )}
                                  aria-label={`截止日期 ${card.due}`}
                                >
                                  {card.due.slice(5).replace("-", "/")}
                                </span>
                              )}
                              {card.description && (
                                <span aria-label="有描述" title="有描述">
                                  <IconEditOutlineRegular aria-hidden="true" />
                                </span>
                              )}
                              {card.checklist.length > 0 && (
                                <span
                                  aria-label={`检查清单 ${card.checklist.filter((item) => item.done).length}/${card.checklist.length}`}
                                >
                                  <IconChecklistOutlineRegular aria-hidden="true" />
                                  {card.checklist.filter((item) => item.done).length}/
                                  {card.checklist.length}
                                </span>
                              )}
                            </span>
                          )}
                        </Button>
                      </article>
                    ))}
                    {!cards.length && <div className={cx("kb-list-empty")}>将卡片拖到这里</div>}
                    {cards.length > 0 && !cards.some(matches) && (
                      <div className={cx("kb-list-empty")}>没有匹配的卡片</div>
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
            <Button
              className={cx("kb-add-list")}
              onClick={() => setDialog({ type: "list.create", id: board.id, title: "" })}
              type="button"
            >
              <IconPlusOutlineRegular /> 添加列表
            </Button>
          </div>
        </>
      )}
      <span className={cx("kb-sr-only")} role="status" aria-live="polite">
        {drag.announcement}
      </span>
      {dialog?.type === "filters" && board && (
        <Modal
          open
          title="搜索与筛选"
          closeLabel="关闭筛选"
          className={cx("kb-name-dialog")}
          contentClassName={cx("kb-dialog-content")}
          onClose={() => setDialog(null)}
        >
          <label className={cx("kb-field")}>
            搜索卡片
            <Input
              data-modal-autofocus
              type="search"
              aria-label="筛选中搜索卡片"
              placeholder="搜索名称、描述、标签…"
              icon={<IconSearchOutlineRegular />}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <div className={cx("kb-field")}>
            <span>标签</span>
            <Select
              value={label}
              onValueChange={setLabel}
              label="筛选标签"
              options={[
                { value: "", label: "所有标签" },
                ...boardLabels.map((item) => ({
                  value: item.id,
                  label: <LabelBadge label={item} fallback />,
                })),
              ]}
            />
          </div>
          <p className={cx("kb-muted")}>筛选即时生效；清除筛选后可拖动排序。</p>
          <div className={cx("kb-modal-footer")}>
            <Button
              type="button"
              disabled={!filtered}
              onClick={() => {
                setQuery("");
                setLabel("");
              }}
            >
              清除筛选
            </Button>
            <Button type="button" variant="primary" onClick={() => setDialog(null)}>
              完成
            </Button>
          </div>
        </Modal>
      )}
      {dialog?.type === "card" && data && (
        <CardDialog
          key={dialog.card.id}
          card={dialog.card}
          data={data}
          saving={saving}
          error={error}
          close={() => setDialog(null)}
          changeLabels={async (command) => {
            const result = await mutate(command, dialog.revision);
            if (result)
              setDialog((current) =>
                current?.type === "card" && current.card.id === dialog.card.id
                  ? {
                      ...current,
                      revision: result.state.revision,
                      card: result.state.cards.find((card) => card.id === current.card.id)!,
                    }
                  : current,
              );
            return result;
          }}
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
      {dialog?.type === "labels" && data && (
        <LabelsDialog
          boardId={dialog.boardId}
          data={data}
          saving={saving}
          error={error}
          mutate={mutate}
          close={() => setDialog(null)}
        />
      )}
      {dialog?.type === "archive" && data && (
        <Modal
          open
          closeLabel="关闭对话框"
          className={cx("kb-dialog")}
          contentClassName={cx("kb-dialog-content")}
          title={archiveBoardId ? "归档内容" : "归档看板"}
          onClose={() => setDialog(null)}
        >
          <p className={cx("kb-muted")}>
            {archiveBoardId
              ? "归档内容仍保存在本机。先恢复列表，再恢复其中的卡片。"
              : "归档的看板仍保存在本机，恢复后会重新出现在首页。"}
          </p>
          <div className={cx("kb-archive")}>
            {archivedBoards.map((item) => (
              <ArchiveRow
                key={item.id}
                title={item.title}
                kind="看板"
                disabled={saving}
                restore={() => void mutate({ type: "board.archive", id: item.id, archived: false })}
              />
            ))}
            {archivedLists.map((item) => (
              <ArchiveRow
                key={item.id}
                title={item.title}
                kind={`列表 · ${data.boards.find((b) => b.id === item.boardId)?.title}`}
                disabled={
                  saving || Boolean(data.boards.find((b) => b.id === item.boardId)?.archived)
                }
                restore={() => void mutate({ type: "list.archive", id: item.id, archived: false })}
              />
            ))}
            {archivedCards.map((item) => {
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
            {!archivedBoards.length && !archivedLists.length && !archivedCards.length && (
              <p className={cx("kb-empty-inline")}>还没有归档内容。</p>
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
              if (dialog.type === "board.create") openBoard(result.createdId!);
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
      className={cx("kb-add-card-form")}
      onSubmit={async (event) => {
        event.preventDefault();
        if (title.trim() && (await onAdd(title))) setTitle("");
      }}
    >
      <Textarea
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
      <div className={cx("kb-actions")}>
        <Button
          className={cx("kb-primary")}
          disabled={disabled || !title.trim()}
          type="submit"
          variant="primary"
        >
          添加卡片
        </Button>
        <Button type="button" aria-label="取消添加卡片" onClick={() => setOpen(false)}>
          <IconCloseOutlineRegular />
        </Button>
      </div>
    </form>
  ) : (
    <Button
      className={cx("kb-add-card")}
      disabled={disabled}
      data-add-list={listId}
      onClick={() => setOpen(true)}
      type="button"
    >
      <IconPlusOutlineRegular /> 添加卡片
    </Button>
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
    <Modal
      open
      closeLabel="关闭对话框"
      className={cx("kb-dialog kb-name-dialog")}
      contentClassName={cx("kb-dialog-content")}
      title={title}
      onClose={close}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit(value);
        }}
      >
        <label className={cx("kb-field")}>
          名称
          <Input
            data-modal-autofocus
            required
            maxLength={200}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className={cx("kb-error")}>
            {error}
          </p>
        )}
        <footer className={cx("kb-modal-footer")}>
          <Button type="button" onClick={close}>
            取消
          </Button>
          <Button
            className={cx("kb-primary")}
            disabled={saving || !value.trim()}
            type="submit"
            variant="primary"
          >
            保存
          </Button>
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
  changeLabels,
}: {
  card: Card;
  data: State;
  saving: boolean;
  error: string;
  close: () => void;
  save: (details: Details) => Promise<boolean>;
  move: (listId: string, beforeId: string | null) => Promise<boolean>;
  archive: () => Promise<boolean>;
  changeLabels: (command: LabelCommand) => Promise<MutationResult | null>;
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
  const labels = data.labels.filter((item) => item.boardId === list.boardId);
  const [labelsOpen, setLabelsOpen] = useState(false);
  useEffect(() => {
    setDraft((old) => {
      const ids = old.labels.filter((id) => data.labels.some((label) => label.id === id));
      return ids.length === old.labels.length ? old : { ...old, labels: ids };
    });
  }, [data.labels]);
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
  const [toolsOpen, setToolsOpen] = useState(false);
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
    <Modal
      open
      closeLabel="关闭对话框"
      className={cx("kb-dialog")}
      contentClassName={cx("kb-dialog-content")}
      title="卡片详情"
      onClose={requestClose}
    >
      {confirmClose && (
        <div className={cx("kb-error")} role="alert">
          卡片有未保存的修改。
          <Button onClick={() => setConfirmClose(false)} type="button">
            继续编辑
          </Button>
          <Button onClick={close} type="button">
            放弃修改
          </Button>
        </div>
      )}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (await save(draft)) close();
        }}
      >
        <p className={cx("kb-muted")}>位于「{list.title}」列表</p>
        <label className={cx("kb-field")}>
          卡片名称
          <Input
            data-modal-autofocus
            required
            maxLength={200}
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </label>
        <label className={cx("kb-field")}>
          描述
          <Textarea
            rows={4}
            maxLength={20000}
            placeholder="补充背景、链接或要点…"
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </label>
        <fieldset className={cx("kb-field")}>
          <legend>标签</legend>
          <div className={cx("kb-label-options")}>
            {draft.labels.map((id) => {
              const label = labels.find((label) => label.id === id);
              return label ? (
                <Button
                  type="button"
                  key={id}
                  className={cx("kb-label-toggle")}
                  aria-label={`管理标签 ${labelTitle(label)}`}
                  onClick={() => setLabelsOpen(true)}
                >
                  <LabelBadge label={label} fallback />
                </Button>
              ) : null;
            })}
            <Button
              type="button"
              size="sm"
              aria-label="选择标签"
              onClick={() => setLabelsOpen(true)}
            >
              <IconPlusOutlineRegular />
              {draft.labels.length ? "标签" : "添加标签"}
            </Button>
          </div>
        </fieldset>
        <div className={cx("kb-detail-row")}>
          <label className={cx("kb-field")}>
            截止日期
            <Input
              className={cx("kb-date")}
              type="date"
              value={draft.due ?? ""}
              onInput={(e) => set("due", e.currentTarget.value || null)}
              onChange={(e) => set("due", e.target.value || null)}
            />
          </label>
          <Checkbox
            className={cx("kb-checkbox")}
            checked={draft.done}
            onChange={(checked) => set("done", checked)}
            label={"标记为已完成"}
          />
        </div>
        <fieldset className={cx("kb-field")}>
          <legend>
            检查清单{" "}
            <span className={cx("kb-muted")}>
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
            <div className={cx("kb-check-item")} key={item.id}>
              <Checkbox
                label={`完成 ${item.text}`}
                className={cx("kb-check-toggle")}
                checked={item.done}
                onChange={(checked) =>
                  set(
                    "checklist",
                    draft.checklist.map((value) =>
                      value.id === item.id ? { ...value, done: checked } : value,
                    ),
                  )
                }
              />
              <Input
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
              <Button
                type="button"
                aria-label={`删除 ${item.text}`}
                onClick={() =>
                  set(
                    "checklist",
                    draft.checklist.filter((value) => value.id !== item.id),
                  )
                }
              >
                <IconCloseOutlineRegular />
              </Button>
            </div>
          ))}
          <div className={cx("kb-check-item")}>
            <Input
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
            <Button
              type="button"
              disabled={!checkText.trim() || draft.checklist.length >= 100}
              onClick={addCheck}
            >
              添加
            </Button>
          </div>
        </fieldset>
        {error && (
          <p className={cx("kb-error")} role="alert">
            {error}（编辑内容已保留；关闭后重新打开卡片可获取最新版本。）
          </p>
        )}
        <footer className={cx("kb-modal-footer")}>
          <Button type="button" onClick={requestClose}>
            取消
          </Button>
          <Button
            className={cx("kb-primary")}
            disabled={saving || !draft.title.trim()}
            type="submit"
            variant="primary"
          >
            保存卡片
          </Button>
        </footer>
      </form>
      <section className={cx("kb-card-tools")}>
        <Button type="button" aria-expanded={toolsOpen} onClick={() => setToolsOpen(!toolsOpen)}>
          移动与归档
          <IconChevronDownOutlineRegular className={cx("kb-disclosure-icon")} />
        </Button>
        {toolsOpen && (
          <div>
            {dirty && <p className={cx("kb-muted")}>请先保存当前修改，再移动或归档。</p>}
            <div className={cx("kb-detail-row")}>
              <label className={cx("kb-field")}>
                移至列表
                <Select
                  value={target}
                  onValueChange={(value) => {
                    setTarget(value);
                    setBefore("");
                  }}
                  label={"移至列表"}
                  options={[
                    ...(lists.map((item) => ({ value: item.id, label: item.title })) ?? []),
                  ]}
                />
              </label>
              <label className={cx("kb-field")}>
                位置
                <Select
                  value={before}
                  onValueChange={(value) => setBefore(value)}
                  label={"位置"}
                  options={[
                    { value: "", label: "列表末尾" },
                    ...(data.cards
                      .filter(
                        (item) => item.listId === target && !item.archived && item.id !== card.id,
                      )
                      .map((item) => ({ value: item.id, label: <>{item.title} 之前</> })) ?? []),
                  ]}
                />
              </label>
              <Button
                disabled={dirty || saving}
                onClick={async () => {
                  if (await move(target, before || null)) close();
                }}
                type="button"
              >
                移动卡片
              </Button>
            </div>
            <Button
              disabled={dirty || saving}
              onClick={async () => {
                if (await archive()) close();
              }}
              type="button"
            >
              归档卡片
            </Button>
          </div>
        )}
      </section>
      {labelsOpen && (
        <LabelsDialog
          boardId={list.boardId}
          data={data}
          saving={saving}
          error={error}
          selected={draft.labels}
          onToggle={(id) =>
            set(
              "labels",
              draft.labels.includes(id)
                ? draft.labels.filter((item) => item !== id)
                : [...draft.labels, id],
            )
          }
          onCreated={(id) => setDraft((old) => ({ ...old, labels: [...old.labels, id] }))}
          mutate={changeLabels}
          close={() => setLabelsOpen(false)}
        />
      )}
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
    <div className={cx("kb-archive-row")}>
      <div>
        <strong>{title}</strong>
        <small>{kind}</small>
      </div>
      <Button disabled={disabled} onClick={restore} type="button">
        恢复
      </Button>
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
