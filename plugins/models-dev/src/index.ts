import type { Context } from "@deepseek-ai/cordis";
import { implementAPI } from "@semicoder/fia/api";
import type {} from "@semicoder/fn-host";
import type {} from "@semicoder/fn-rpc";
import type {} from "@semicoder/fn-activity";
import { join } from "node:path";
import contract from "./contract.ts";
import { CatalogService } from "./service.ts";
export const inject = ["host", "rpc", "activity"];
export function apply(ctx: Context) {
  const service = new CatalogService(
    join(ctx.host.dataDirectory, "fn-models-dev", "catalog-v1.json"),
  );
  ctx.effect(() => () => service.close());
  ctx.rpc.register(
    "modelsDev",
    implementAPI(contract, {
      list: (input) => ctx.activity.run(() => service.list(input)),
      detail: ({ id }) => ctx.activity.run(() => service.detail(id)),
      refresh: () => ctx.activity.run(() => service.refresh()),
    }),
  );
}
