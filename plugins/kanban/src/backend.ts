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
      await host.application
        .setSummary({
          version: 1,
          metrics: [
            {
              value: state.boards.filter((b) => !b.archived).length,
              label: { key: "boards" },
            },
            {
              value: cards.filter((c) => !c.done).length,
              label: { key: "remaining" },
            },
          ],
          text: cards
            .filter((c) => !c.done)
            .slice(0, 3)
            .map((c) => c.title)
            .join(" · ") || { key: "app.description" },
        })
        .catch((error) => console.error("Summary update failed", error));
    };
    await publish();
    return {
      handlers: {
        read: () => store.read(),
        mutate: async (input) => {
          const result = store.mutate(input, (await host.preferences()).locale);
          await host.application
            .notifyDataChanged()
            .catch((error) => console.error("View notification failed", error));
          await publish();
          return result;
        },
      },
      stop: () => store.close(),
    };
  },
});
