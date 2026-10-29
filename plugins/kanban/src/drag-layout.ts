import type { Command, State } from "./contract.ts";

export type DragItem = { kind: "card" | "list"; id: string };
export type DragLayout = { lists: string[]; cards: Record<string, string[]> };

export function boardLayout(lists: State["lists"], cards: State["cards"]): DragLayout {
  return {
    lists: lists.map((list) => list.id),
    cards: Object.fromEntries(
      lists.map((list) => [
        list.id,
        cards.filter((card) => card.listId === list.id && !card.archived).map((card) => card.id),
      ]),
    ),
  };
}

export function placeItem(
  layout: DragLayout,
  item: DragItem,
  listId: string,
  beforeId: string | null,
): DragLayout {
  if (beforeId === item.id) return layout;
  const insert = (ids: string[]) => {
    const next = ids.filter((id) => id !== item.id);
    const index = beforeId === null ? next.length : next.indexOf(beforeId);
    if (index < 0) return ids;
    next.splice(index, 0, item.id);
    return next;
  };
  if (item.kind === "list") {
    if (!layout.lists.includes(item.id)) return layout;
    const lists = insert(layout.lists);
    return lists.every((id, index) => id === layout.lists[index]) ? layout : { ...layout, lists };
  }
  const source = layout.lists.find((id) => layout.cards[id].includes(item.id));
  if (
    !source ||
    !layout.cards[listId] ||
    (beforeId !== null && !layout.cards[listId].includes(beforeId))
  )
    return layout;
  const target = insert(layout.cards[listId]);
  if (source === listId && target.every((id, index) => id === layout.cards[listId][index]))
    return layout;
  return {
    ...layout,
    cards: {
      ...layout.cards,
      [source]: layout.cards[source].filter((id) => id !== item.id),
      [listId]: target,
    },
  };
}

export function moveCommand(
  original: DragLayout,
  next: DragLayout,
  item: DragItem,
): Command | null {
  if (item.kind === "list") {
    if (original.lists.every((id, index) => id === next.lists[index])) return null;
    return {
      type: "list.move",
      id: item.id,
      beforeId: next.lists[next.lists.indexOf(item.id) + 1] ?? null,
    };
  }
  const listId = next.lists.find((id) => next.cards[id].includes(item.id));
  if (!listId) return null;
  const index = next.cards[listId].indexOf(item.id);
  const beforeId = next.cards[listId][index + 1] ?? null;
  if (
    original.cards[listId].includes(item.id) &&
    (original.cards[listId][original.cards[listId].indexOf(item.id) + 1] ?? null) === beforeId
  )
    return null;
  return { type: "card.move", id: item.id, listId, beforeId };
}

// A time-based ramp keeps scrolling consistent on both 60 Hz and 120 Hz displays.
export function edgeVelocity(point: number, start: number, end: number): number {
  const edge = Math.min(64, (end - start) / 3);
  if (point < start || point > end || edge <= 0) return 0;
  if (point < start + edge) return -720 * ((start + edge - point) / edge) ** 2;
  if (point > end - edge) return 720 * ((point - end + edge) / edge) ** 2;
  return 0;
}
