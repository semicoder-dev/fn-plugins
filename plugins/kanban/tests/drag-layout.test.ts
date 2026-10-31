import { expect, test } from "bun:test";
import {
  edgeVelocity,
  moveCommand,
  placeItem,
  type DragLayout,
} from "../src/drag-layout.ts";

const original: DragLayout = {
  lists: ["todo", "doing", "done"],
  cards: { todo: ["a", "b", "c"], doing: ["d"], done: [] },
};
const card = { kind: "card", id: "a" } as const;

test("card previews can cross several columns and return without changing the saved layout", () => {
  const inEmpty = placeItem(original, card, "done", null);
  const inDoing = placeItem(inEmpty, card, "doing", "d");
  expect(inEmpty.cards.done).toEqual(["a"]);
  expect(inDoing.cards).toEqual({
    todo: ["b", "c"],
    doing: ["a", "d"],
    done: [],
  });
  expect(moveCommand(original, inDoing, card)).toEqual({
    type: "card.move",
    id: "a",
    listId: "doing",
    beforeId: "d",
  });
  const returned = placeItem(inDoing, card, "todo", "b");
  expect(moveCommand(original, returned, card)).toBeNull();
  expect(original.cards.todo).toEqual(["a", "b", "c"]);
});

test("forward and backward insertion uses the final next neighbor, including end positions", () => {
  const last = placeItem(original, card, "todo", null);
  expect(last.cards.todo).toEqual(["b", "c", "a"]);
  expect(moveCommand(original, last, card)).toEqual({
    type: "card.move",
    id: "a",
    listId: "todo",
    beforeId: null,
  });
  const middle = placeItem(last, card, "todo", "c");
  expect(middle.cards.todo).toEqual(["b", "a", "c"]);
  expect(moveCommand(original, middle, card)).toEqual({
    type: "card.move",
    id: "a",
    listId: "todo",
    beforeId: "c",
  });
  expect(placeItem(middle, card, "todo", "c")).toBe(middle);
});

test("list previews retain card membership and detect a no-op on returning to the original slot", () => {
  const list = { kind: "list", id: "todo" } as const;
  const last = placeItem(original, list, "", null);
  expect(last.lists).toEqual(["doing", "done", "todo"]);
  expect(last.cards).toBe(original.cards);
  expect(moveCommand(original, last, list)).toEqual({
    type: "list.move",
    id: "todo",
    beforeId: null,
  });
  expect(
    moveCommand(original, placeItem(last, list, "", "doing"), list),
  ).toBeNull();
});

test("stale targets and the dragged item itself never remove or duplicate a card", () => {
  for (const [list, before] of [
    ["missing", null],
    ["todo", "missing"],
    ["doing", "a"],
    ["todo", "a"],
  ] as const) {
    expect(placeItem(original, card, list, before)).toBe(original);
  }
});

test("edge scrolling ramps up near the edge, stays still in the middle and stops outside", () => {
  expect(edgeVelocity(50, 0, 500)).toBeLessThan(0);
  expect(edgeVelocity(5, 0, 500)).toBeLessThan(edgeVelocity(50, 0, 500));
  expect(edgeVelocity(495, 0, 500)).toBe(-edgeVelocity(5, 0, 500));
  expect(edgeVelocity(250, 0, 500)).toBe(0);
  expect(edgeVelocity(-1, 0, 500)).toBe(0);
  expect(edgeVelocity(501, 0, 500)).toBe(0);
});
