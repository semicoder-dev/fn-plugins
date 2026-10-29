import React, { useState } from "react";
import {
  Button,
  Input,
  Menu,
  IconArchiveOutlineRegular,
  IconChevronDownOutlineRegular,
  IconEllipsisOutlineRegular,
  IconPlusOutlineRegular,
  IconSearchOutlineRegular,
  classes,
} from "@semicoder/fn-ui";
import type { State } from "./contract.ts";
import styles from "./style.module.css";
const cx = (...values: (string | false | undefined)[]) => classes(styles, ...values);
type Board = State["boards"][number];

export function BoardHome({
  data,
  saving,
  online,
  open,
  create,
  rename,
  archive,
  showArchived,
}: {
  data: State;
  saving: boolean;
  online: boolean;
  open: (id: string) => void;
  create: () => void;
  rename: (board: Board) => void;
  archive: (board: Board) => void;
  showArchived: () => void;
}) {
  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState("");
  const boards = data.boards.filter((board) => !board.archived);
  const matches = boards.filter((board) =>
    board.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <>
      <header className={cx("kb-topbar")}>
        <h1>看板</h1>
        <div className={cx("kb-actions")}>
          <span role="status" className={cx("kb-home-status kb-muted")}>
            {saving ? "正在保存…" : online ? "已保存到本机" : "正在连接…"}
          </span>
          <Button type="button" size="sm" onClick={showArchived}>
            <IconArchiveOutlineRegular /> 归档看板
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!online || saving}
            onClick={create}
          >
            <IconPlusOutlineRegular /> 新建看板
          </Button>
        </div>
      </header>
      {!boards.length ? (
        <div className={cx("kb-empty")}>
          <h2>还没有看板</h2>
          <p>为一个项目或一段工作创建看板，再用列表和卡片整理进度。</p>
          <Button type="button" variant="primary" disabled={!online || saving} onClick={create}>
            <IconPlusOutlineRegular /> 创建第一个看板
          </Button>
          <small>所有内容保存在本机。</small>
        </div>
      ) : (
        <section className={cx("kb-home")} aria-label="看板首页">
          <div className={cx("kb-home-tools")}>
            <h2>
              我的看板 <span className={cx("kb-count")}>{boards.length}</span>
            </h2>
            <Input
              type="search"
              icon={<IconSearchOutlineRegular />}
              aria-label="搜索看板"
              placeholder="搜索看板…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className={cx("kb-board-grid")}>
            {matches.map((board) => {
              const lists = data.lists.filter(
                (list) => list.boardId === board.id && !list.archived,
              );
              const listIds = new Set(lists.map((list) => list.id));
              const cards = data.cards.filter((card) => listIds.has(card.listId) && !card.archived);
              return (
                <article key={board.id} className={cx("kb-board-tile")}>
                  <Button
                    type="button"
                    className={cx("kb-board-entry")}
                    aria-label={`打开看板 ${board.title}`}
                    onClick={() => open(board.id)}
                  >
                    <strong title={board.title}>{board.title}</strong>
                    <span className={cx("kb-board-summary")}>
                      {lists.length} 个列表<span aria-hidden="true">·</span>
                      {cards.length} 张卡片
                    </span>
                    <span className={cx("kb-board-entry-footer")}>
                      <span>
                        {cards.length
                          ? `${cards.filter((card) => card.done).length} 张已完成`
                          : "开始整理工作"}
                      </span>
                      <IconChevronDownOutlineRegular
                        className={cx("kb-chevron-right")}
                        aria-hidden="true"
                      />
                    </span>
                  </Button>
                  <div className={cx("kb-board-tile-menu")}>
                    <Menu
                      open={menu === board.id}
                      onClose={() => setMenu("")}
                      portal
                      autoFocus
                      align="end"
                      anchor={
                        <Button
                          type="button"
                          size="sm"
                          aria-label={`${board.title}看板操作`}
                          aria-haspopup="menu"
                          aria-expanded={menu === board.id}
                          onClick={(event) => {
                            event.currentTarget.focus();
                            setMenu(menu === board.id ? "" : board.id);
                          }}
                        >
                          <IconEllipsisOutlineRegular />
                        </Button>
                      }
                      items={[
                        { id: "rename", label: "重命名", disabled: saving },
                        { id: "archive", label: "归档看板", disabled: saving },
                      ]}
                      onSelect={(id) => {
                        setMenu("");
                        if (id === "rename") rename(board);
                        else archive(board);
                      }}
                    />
                  </div>
                </article>
              );
            })}
          </div>
          {!matches.length && <p className={cx("kb-empty-inline")}>没有匹配的看板。</p>}
        </section>
      )}
    </>
  );
}

export function BoardHeader({
  title,
  query,
  onQuery,
  filtered,
  onFilters,
  saving,
  online,
  back,
  manageLabels,
  labelNamesVisible,
  toggleLabels,
  showArchived,
}: {
  title: string;
  query: string;
  onQuery: (query: string) => void;
  filtered: boolean;
  onFilters: () => void;
  saving: boolean;
  online: boolean;
  back: () => void;
  manageLabels: () => void;
  labelNamesVisible: boolean;
  toggleLabels: () => void;
  showArchived: () => void;
}) {
  const [menu, setMenu] = useState(false);
  return (
    <header className={cx("kb-topbar kb-board-header")}>
      <Button type="button" size="sm" aria-label="返回看板首页" title="返回看板首页" onClick={back}>
        <IconChevronDownOutlineRegular className={cx("kb-chevron-left")} />
      </Button>
      <h1 title={title}>{title}</h1>
      <span
        role="status"
        className={cx(`kb-muted ${saving || !online ? "kb-board-status" : "kb-sr-only"}`)}
      >
        {saving ? "保存中…" : online ? "已保存到本机" : "连接中…"}
      </span>
      <div className={cx("kb-board-search")}>
        <Input
          type="search"
          icon={<IconSearchOutlineRegular />}
          aria-label="搜索卡片"
          placeholder="搜索卡片…"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
        />
      </div>
      <Button
        type="button"
        size="sm"
        className={cx(`kb-filter-button ${filtered ? "kb-filter-active" : ""}`)}
        aria-label={filtered ? "筛选卡片，已启用筛选" : "筛选卡片"}
        aria-haspopup="dialog"
        title="搜索与筛选"
        onClick={(event) => {
          event.currentTarget.focus();
          onFilters();
        }}
      >
        <IconSearchOutlineRegular />
        <span className={cx("kb-filter-caption")}>筛选</span>
        {filtered && <span className={cx("kb-filter-dot")} aria-hidden="true" />}
      </Button>
      <Menu
        open={menu}
        onClose={() => setMenu(false)}
        portal
        autoFocus
        align="end"
        anchor={
          <Button
            type="button"
            size="sm"
            aria-label="更多看板操作"
            title="更多操作"
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={(event) => {
              event.currentTarget.focus();
              setMenu(!menu);
            }}
          >
            <IconEllipsisOutlineRegular />
          </Button>
        }
        items={[
          { id: "labels", label: "管理标签", disabled: saving },
          {
            id: "display",
            label: labelNamesVisible ? "隐藏标签文字" : "显示标签文字",
            disabled: saving,
          },
          { id: "archive", label: "查看归档" },
        ]}
        onSelect={(id) => {
          setMenu(false);
          if (id === "labels") manageLabels();
          else if (id === "display") toggleLabels();
          else showArchived();
        }}
      />
    </header>
  );
}
