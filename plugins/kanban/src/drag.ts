import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { classes } from "@semicoder/fn-ui";
import type { Command, State } from "./contract.ts";
import {
  boardLayout,
  edgeVelocity,
  moveCommand,
  placeItem,
  type DragItem,
  type DragLayout,
} from "./drag-layout.ts";
import styles from "./style.module.css";

const cx = (...names: string[]) => classes(styles, ...names);
const easing = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const itemSelector = (item: DragItem) => `[data-${item.kind}-id="${item.id}"]`;
const contains = (rect: DOMRect, x: number, y: number) =>
  x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
type Options = {
  boardId: string;
  revision: number;
  lists: State["lists"];
  cards: State["cards"];
  disabled: boolean;
  move: (command: Command, revision: number) => Promise<boolean>;
};
type Session = {
  item: DragItem;
  boardId: string;
  revision: number;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  original: DragLayout;
  layout: DragLayout;
  phase: "pending" | "dragging" | "settling";
  overlay: HTMLElement | null;
  valid: boolean;
  frame: number;
  lastTime: number;
  removeListeners: () => void;
};

/** Local preview only: one revision-checked mutation is sent when a drag is dropped. */
export function useBoardDrag(options: Options) {
  const root = useRef<HTMLDivElement>(null);
  const current = useRef(options);
  current.current = options;
  const session = useRef<Session | null>(null);
  const animations = useRef(new Map<HTMLElement, Animation>());
  const previousRects = useRef(new Map<string, DOMRect>());
  const ignoreClickUntil = useRef(0);
  const [preview, setPreview] = useState<{
    item: DragItem;
    layout: DragLayout;
  } | null>(null);
  const [announcement, setAnnouncement] = useState("");

  function elements() {
    return Array.from(
      root.current?.querySelectorAll<HTMLElement>(
        "[data-list-id], [data-card-id]",
      ) ?? [],
    );
  }
  function snapshotRects() {
    previousRects.current = new Map(
      elements().map((el) => [
        el.dataset.cardId ?? el.dataset.listId!,
        el.getBoundingClientRect(),
      ]),
    );
  }
  function showLayout(s: Session, layout: DragLayout) {
    snapshotRects();
    s.layout = layout;
    setPreview({ item: s.item, layout });
  }
  // Hit testing uses the final layout, so cards in mid-animation cannot bounce the placeholder back.
  function layoutRect(el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    if (!animations.current.has(el)) return rect;
    const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    return new DOMRect(
      rect.x - matrix.m41,
      rect.y - matrix.m42,
      rect.width,
      rect.height,
    );
  }
  useLayoutEffect(() => {
    const before = previousRects.current;
    if (!before.size) return;
    const nodes = elements();
    for (const animation of animations.current.values()) animation.cancel();
    animations.current.clear();
    if (!reducedMotion()) {
      for (const el of nodes) {
        const id = el.dataset.cardId ?? el.dataset.listId!;
        const old = before.get(id);
        // Children of a moving list travel with their parent, never twice.
        if (
          !old ||
          id === preview?.item.id ||
          (preview?.item.kind === "list" && el.dataset.cardId)
        )
          continue;
        const rect = el.getBoundingClientRect();
        let dx = old.left - rect.left,
          dy = old.top - rect.top;
        const parent = el.dataset.cardId
          ? el.closest<HTMLElement>("[data-list-id]")
          : null;
        const oldParent = parent && before.get(parent.dataset.listId!);
        if (parent && oldParent) {
          const parentRect = layoutRect(parent);
          dx -= oldParent.left - parentRect.left;
          dy -= oldParent.top - parentRect.top;
        }
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
        const animation = el.animate(
          [
            { transform: `translate(${dx}px, ${dy}px)` },
            { transform: "translate(0, 0)" },
          ],
          { duration: 200, easing },
        );
        animations.current.set(el, animation);
        void animation.finished.then(
          () => {
            if (animations.current.get(el) === animation)
              animations.current.delete(el);
          },
          () => {},
        );
      }
    }
    before.clear();
  }, [preview]);

  function dispose(s: Session) {
    cancelAnimationFrame(s.frame);
    s.removeListeners();
    s.overlay?.getAnimations().forEach((animation) => animation.cancel());
    s.overlay?.remove();
    if (root.current?.hasPointerCapture(s.pointerId))
      root.current.releasePointerCapture(s.pointerId);
    if (session.current === s) session.current = null;
  }
  function reset(s: Session) {
    snapshotRects();
    dispose(s);
    setPreview(null);
  }
  async function finish(s: Session, commit: boolean) {
    if (session.current !== s || s.phase === "settling") return;
    if (s.phase === "pending") {
      dispose(s);
      return;
    }
    s.phase = "settling";
    cancelAnimationFrame(s.frame);
    ignoreClickUntil.current = performance.now() + 400;
    if (!commit) showLayout(s, s.original);
    const command = commit ? moveCommand(s.original, s.layout, s.item) : null;
    // Wait for the final placeholder position (including a cancellation rollback) to render.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    if (session.current !== s) return;
    const target = root.current?.querySelector<HTMLElement>(
      itemSelector(s.item),
    );
    if (target && s.overlay) {
      const rect = layoutRect(target);
      const animation = s.overlay.animate(
        [
          {
            transform: s.overlay.style.transform,
            width: s.overlay.style.width,
            height: s.overlay.style.height,
          },
          {
            transform: `translate3d(${rect.left}px, ${rect.top}px, 0) rotate(0deg) scale(1)`,
            width: `${rect.width}px`,
            height: `${rect.height}px`,
          },
        ],
        { duration: reducedMotion() ? 0 : 180, easing, fill: "forwards" },
      );
      await animation.finished.catch(() => {});
    }
    if (session.current !== s) return;
    const saved = command
      ? await current.current.move(command, s.revision)
      : true;
    if (session.current !== s) return;
    reset(s);
    setAnnouncement(
      !commit
        ? "已取消拖动"
        : !saved
          ? "移动未保存，已恢复看板"
          : command
            ? "已移动并保存"
            : "位置未改变",
    );
  }

  function targetList(s: Session) {
    const nodes = Array.from(
      root.current?.querySelectorAll<HTMLElement>(":scope > [data-list-id]") ??
        [],
    );
    return nodes.reduce<HTMLElement | null>((best, node) => {
      const rect = layoutRect(node);
      const bestRect = best && layoutRect(best);
      return !bestRect ||
        Math.abs(s.x - rect.left - rect.width / 2) <
          Math.abs(s.x - bestRect.left - bestRect.width / 2)
        ? node
        : best;
    }, null);
  }
  function updateTarget(s: Session) {
    const board = root.current;
    if (!board) return;
    s.valid = contains(board.getBoundingClientRect(), s.x, s.y);
    if (s.overlay) s.overlay.dataset.valid = String(s.valid);
    if (!s.valid) return;
    const placeholder = board.querySelector<HTMLElement>(itemSelector(s.item));
    if (placeholder && contains(layoutRect(placeholder), s.x, s.y)) return;
    let next: DragLayout;
    if (s.item.kind === "list") {
      const before = Array.from(
        board.querySelectorAll<HTMLElement>(":scope > [data-list-id]"),
      ).find((node) => {
        const rect = layoutRect(node);
        return (
          node.dataset.listId !== s.item.id && s.x < rect.left + rect.width / 2
        );
      });
      next = placeItem(s.layout, s.item, "", before?.dataset.listId ?? null);
    } else {
      const list = targetList(s);
      if (!list) return;
      const before = Array.from(
        list.querySelectorAll<HTMLElement>("[data-card-id]"),
      ).find((node) => {
        const rect = layoutRect(node);
        return (
          node.dataset.cardId !== s.item.id && s.y < rect.top + rect.height / 2
        );
      });
      next = placeItem(
        s.layout,
        s.item,
        list.dataset.listId!,
        before?.dataset.cardId ?? null,
      );
    }
    if (next !== s.layout) showLayout(s, next);
  }
  function frame(s: Session, time: number) {
    if (session.current !== s || s.phase !== "dragging" || !root.current)
      return;
    const board = root.current;
    const rect = board.getBoundingClientRect();
    const elapsed = Math.min(32, time - s.lastTime) / 1000;
    s.lastTime = time;
    if (contains(rect, s.x, s.y)) {
      board.scrollLeft += edgeVelocity(s.x, rect.left, rect.right) * elapsed;
      if (s.item.kind === "card") {
        const cards =
          targetList(s)?.querySelector<HTMLElement>("[data-card-area]");
        if (cards) {
          const bounds = cards.getBoundingClientRect();
          cards.scrollTop +=
            edgeVelocity(
              s.y,
              Math.max(rect.top, bounds.top),
              Math.min(rect.bottom, bounds.bottom),
            ) * elapsed;
        }
      }
    }
    if (s.overlay)
      s.overlay.style.transform = `translate3d(${s.x - s.offsetX}px, ${s.y - s.offsetY}px, 0) rotate(${reducedMotion() ? 0 : 2}deg) scale(${reducedMotion() ? 1 : 1.025})`;
    updateTarget(s);
    s.frame = requestAnimationFrame((time) => frame(s, time));
  }
  function activate(s: Session) {
    const board = root.current;
    const source = board?.querySelector<HTMLElement>(itemSelector(s.item));
    if (!board || !source) {
      dispose(s);
      return;
    }
    const rect = source.getBoundingClientRect();
    s.offsetX = s.startX - rect.left;
    s.offsetY = s.startY - rect.top;
    const overlay = source.cloneNode(true) as HTMLElement;
    // The inert visual clone must never become a second accessible card or a hit-test target.
    for (const el of [
      overlay,
      ...Array.from(overlay.querySelectorAll<HTMLElement>("*")),
    ]) {
      for (const attr of [
        "id",
        "data-card-id",
        "data-list-id",
        "data-card-area",
        "aria-label",
      ])
        el.removeAttribute(attr);
    }
    overlay.inert = true;
    overlay.setAttribute("aria-hidden", "true");
    overlay.dataset.dragOverlay = s.item.kind;
    overlay.classList.add(cx("kb-drag-overlay"));
    Object.assign(overlay.style, {
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      transformOrigin: `${s.offsetX}px ${s.offsetY}px`,
      transform: `translate3d(${rect.left}px, ${rect.top}px, 0)`,
    });
    board.parentElement!.append(overlay);
    // cloneNode does not preserve the internal scroll position of long lists.
    source
      .querySelectorAll<HTMLElement>("[data-card-area]")
      .forEach((el, index) => {
        const clone = overlay.querySelectorAll<HTMLElement>(
          `.${cx("kb-cards")}`,
        )[index];
        if (clone) clone.scrollTop = el.scrollTop;
      });
    s.overlay = overlay;
    s.phase = "dragging";
    s.lastTime = performance.now();
    board.setPointerCapture(s.pointerId);
    window.getSelection()?.removeAllRanges();
    showLayout(s, s.layout);
    setAnnouncement(
      `正在拖动${s.item.kind === "card" ? "卡片" : "列表"}，按 Esc 取消`,
    );
    s.frame = requestAnimationFrame((time) => frame(s, time));
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    const opts = current.current;
    // Touch scrolling keeps its native behavior; mouse and pen use the drag handles.
    if (
      opts.disabled ||
      session.current ||
      event.button !== 0 ||
      !event.isPrimary ||
      event.pointerType === "touch"
    )
      return;
    const target = event.target as HTMLElement;
    if (
      target.closest(
        "input,textarea,select,[contenteditable=true],[data-label-toggle],[aria-haspopup=menu]",
      )
    )
      return;
    const card = target.closest<HTMLElement>("[data-card-id]");
    const header = target.closest<HTMLElement>("[data-list-handle]");
    const list = header?.closest<HTMLElement>("[data-list-id]");
    const item: DragItem | null = card
      ? { kind: "card", id: card.dataset.cardId! }
      : list
        ? { kind: "list", id: list.dataset.listId! }
        : null;
    if (!item) return;
    const layout = boardLayout(opts.lists, opts.cards);
    const s: Session = {
      item,
      boardId: opts.boardId,
      revision: opts.revision,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      offsetX: 0,
      offsetY: 0,
      original: layout,
      layout,
      phase: "pending",
      overlay: null,
      valid: true,
      frame: 0,
      lastTime: 0,
      removeListeners: () => {},
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== s.pointerId || s.phase === "settling") return;
      s.x = e.clientX;
      s.y = e.clientY;
      if (
        s.phase === "pending" &&
        Math.hypot(s.x - s.startX, s.y - s.startY) >= 6
      )
        activate(s);
      if (s.phase === "dragging") e.preventDefault();
    };
    const release = (e: MouseEvent) => {
      if (s.phase === "dragging") {
        s.x = e.clientX;
        s.y = e.clientY;
        updateTarget(s);
      }
      void finish(s, s.valid);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId === s.pointerId) release(e);
    };
    // WebKit can lose pointerup when its pressed DOM node moves during a reorder.
    // The matching mouse release still ends that gesture; finish is idempotent.
    const mouseUp = (e: MouseEvent) => {
      if (event.pointerType === "mouse" && e.button === 0) release(e);
    };
    const cancel = () => void finish(s, false);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      }
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("mouseup", mouseUp);
    window.addEventListener("pointercancel", cancel);
    root.current?.addEventListener("lostpointercapture", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", key, true);
    s.removeListeners = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("mouseup", mouseUp);
      window.removeEventListener("pointercancel", cancel);
      root.current?.removeEventListener("lostpointercapture", cancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", key, true);
    };
    session.current = s;
  }

  useEffect(() => {
    const s = session.current;
    if (!s) return;
    if (s.boardId !== options.boardId) {
      reset(s);
      return;
    }
    if (
      s.phase !== "settling" &&
      (options.disabled || s.revision !== options.revision)
    )
      void finish(s, false);
  }, [options.boardId, options.revision, options.disabled]);
  useEffect(
    () => () => {
      if (session.current) dispose(session.current);
      for (const animation of animations.current.values()) animation.cancel();
    },
    [],
  );

  return {
    root,
    preview,
    announcement,
    onPointerDown,
    onClickCapture(event: React.MouseEvent) {
      if (
        session.current?.phase === "dragging" ||
        session.current?.phase === "settling" ||
        performance.now() < ignoreClickUntil.current
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
  };
}
