import index from "../marketplace.json";
import manifest from "../vendor/manifest.json";
import pkg from "../plugins/kanban/package.json";
import { createHash } from "node:crypto";
import { inspectPlugin } from "@semicoder/fn-sdk/build";
if (index.schemaVersion !== 3 || !index.name || index.plugins.length)
  throw new Error(
    "The plugins-v1 candidate market must remain empty until verified plugins are explicitly published",
  );
for (const item of manifest.packages) {
  const actual = createHash("sha256")
    .update(
      new Uint8Array(
        await Bun.file(new URL(`../vendor/${item.archive}`, import.meta.url)).arrayBuffer(),
      ),
    )
    .digest("hex");
  if (actual !== item.sha256) throw new Error(`Development artifact changed: ${item.name}`);
}
if (pkg.name !== "@semicoder/fn-kanban" || pkg.fn.name !== "看板")
  throw new Error("Kanban identity changed");
await inspectPlugin(new URL("../plugins/kanban", import.meta.url).pathname);
console.log(
  "Validated plugin contract, fixed development artifacts and unpublished market boundary",
);
