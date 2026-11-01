import { defineBackend } from "@semicoder/fn-sdk/backend";
import { join } from "node:path";
import api from "./contract.ts";
import { CatalogService } from "./service.ts";

export default defineBackend({
  api,
  setup({ host }) {
    const service = new CatalogService(
      join(host.paths.cache, "catalog-v1.json"),
    );
    return {
      handlers: {
        list: (input) => service.list(input),
        detail: ({ id }) => service.detail(id),
        refresh: () => service.refresh(),
      },
      stop: () => service.close(),
    };
  },
});
