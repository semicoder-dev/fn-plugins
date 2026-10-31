import { defineBackend } from "@semicoder/fn-sdk/backend";
import { join } from "node:path";
import api from "./contract.ts";
import { KanbanStore } from "./store.ts";
export default defineBackend({
  api,
  async setup({ host }) {
    const store = new KanbanStore(join(host.paths.data, "kanban.sqlite"));
    const publish = async () => {
      const state = store.read();
      const cards = state.cards.filter(
        (c) =>
          !c.archived &&
          state.lists.some(
            (l) =>
              l.id === c.listId &&
              !l.archived &&
              state.boards.some((b) => b.id === l.boardId && !b.archived),
          ),
      );
      await host.widgets.publish("summary", {
        version: 1,
        body: {
          type: "column",
          children: [
            {
              type: "row",
              children: [
                {
                  type: "metric",
                  value: state.boards.filter((b) => !b.archived).length,
                  label: { key: "boards" },
                },
                {
                  type: "metric",
                  value: cards.filter((c) => !c.done).length,
                  label: { key: "remaining" },
                },
              ],
            },
            {
              type: "list",
              children: cards
                .filter((c) => !c.done)
                .slice(0, 3)
                .map((c) => ({ type: "text" as const, text: c.title })),
            },
          ],
        },
      });
    };
    await publish();
    return {
      handlers: {
        read: () => store.read(),
        mutate: async (input) => {
          const result = store.mutate(input, (await host.preferences()).locale);
          await publish();
          return result;
        },
      },
      stop: () => store.close(),
    };
  },
});
