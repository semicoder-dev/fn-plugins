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
for (const entry of ["src/client.tsx", "src/style.module.css"]) {
  const source = await Bun.file(new URL(`../plugins/kanban/${entry}`, import.meta.url)).text();
  if (/--(?:m|rt)-|@base-ui\/|lucide-react|tailwindcss|fn-sdk\/(?:ui|theme)/.test(source))
    throw new Error(`${entry}: use shared fn-ui and DSH semantic tokens`);
  if (/<\/?(?:button|select|dialog|details)\b|showModal\(/.test(source))
    throw new Error(`${entry}: use original DSH controls and overlays`);
}
console.log(
  "Validated plugin contract, fixed development artifacts and unpublished market boundary",
);
