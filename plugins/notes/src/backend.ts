import { defineBackend } from "@semicoder/fn-sdk/backend";
import { join } from "node:path";
import api from "./contract.ts";
import { NotesStore } from "./store.ts";
export default defineBackend({
  api,
  async setup({ host }) {
    const store = new NotesStore(join(host.paths.data, "notes.sqlite"));
    const publish = async () => {
      const notes = store.list();
      await host.application
        .setSummary({
          version: 1,
          metrics: [{ value: notes.length, label: { key: "count" } }],
          text: notes
            .slice(0, 3)
            .map((n) => n.title || n.body.slice(0, 100))
            .filter(Boolean)
            .join(" · ") || { key: "emptyNote" },
        })
        .catch((error) => console.error("Summary update failed", error));
    };
    await publish();
    return {
      handlers: {
        list: () => store.list(),
        save: async (input) => {
          const saved = store.save(input);
          await host.application
            .notifyDataChanged()
            .catch((error) => console.error("View notification failed", error));
          await publish();
          return saved;
        },
        remove: async (input) => {
          store.remove(input);
          await host.application
            .notifyDataChanged()
            .catch((error) => console.error("View notification failed", error));
          await publish();
          return null;
        },
      },
      stop: () => store.close(),
    };
  },
});
