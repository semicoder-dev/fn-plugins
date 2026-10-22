import { packPlugin, buildPlugin } from "@semicoder/fn-sdk/build";
import { resolve } from "node:path";
const root = resolve(import.meta.dir, "..");
await Bun.write(
  resolve(root, "plugins/kanban/dist/icon.svg"),
  Bun.file(resolve(root, "plugins/kanban/src/icon.svg")),
);
if (process.argv.includes("--pack"))
  console.log(await packPlugin(resolve(root, "plugins/kanban"), resolve(root, "artifacts")));
else await buildPlugin(resolve(root, "plugins/kanban"));
