import { defineBackend } from "@semicoder/fn-sdk/backend";
import { join } from "node:path";
import api from "./contract.ts";
import { NotesStore } from "./store.ts";
export default defineBackend({
  api,
  async setup({ host }) {
    const store = new NotesStore(join(host.paths.data, "notes.sqlite"));
    const publish = () =>
      host.widgets.publish("summary", {
        version: 1,
        body: {
          type: "column",
          children: [
            {
              type: "metric",
              value: store.list().length,
              label: { key: "count" },
            },
            {
              type: "list",
              children: store
                .list()
                .slice(0, 3)
                .map((n) => ({
                  type: "text" as const,
                  text: n.title || n.body.slice(0, 100) || { key: "untitled" },
                })),
            },
          ],
        },
      });
    await publish();
    return {
      handlers: {
        list: () => store.list(),
        save: async (input) => {
          const saved = store.save(input);
          await publish();
          return saved;
        },
        remove: async (input) => {
          store.remove(input);
          await publish();
          return null;
        },
      },
      stop: () => store.close(),
    };
  },
});
