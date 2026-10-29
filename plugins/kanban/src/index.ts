import type { Context } from "@deepseek-ai/cordis";
import { implementAPI } from "@semicoder/fia/api";
import type {} from "@semicoder/fn-host";
import type {} from "@semicoder/fn-rpc";
import type {} from "@semicoder/fn-activity";
import { join } from "node:path";
import contract from "./contract.ts";
import { KanbanStore } from "./store.ts";

export const inject = ["host", "rpc", "activity"];
export function apply(ctx: Context) {
  const store = new KanbanStore(join(ctx.host.dataDirectory, "fn-kanban", "kanban-v2.sqlite"));
  ctx.effect(() => () => store.close());
  ctx.rpc.register(
    "kanban",
    implementAPI(contract, {
      read: () => store.read(),
      mutate: (input) =>
        ctx.activity.run(() => {
          const result = store.mutate(input);
          ctx.rpc.emit("kanban", "changed", { revision: result.state.revision });
          return result;
        }),
    }),
  );
}
