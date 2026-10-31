import index from "../marketplace.json";
import manifest from "../vendor/manifest.json";
import pkg from "../plugins/kanban/package.json";
import models from "../plugins/models-dev/package.json";
import { createHash } from "node:crypto";
import { inspectPlugin } from "@semicoder/fn-sdk/build";
if (index.schemaVersion !== 3 || !index.name || !Array.isArray(index.plugins))
  throw new Error("Expected schema 3 plugin market");
const published = index.plugins as Array<{
  packageName: string;
  name: string;
  description: string;
  version: string;
  url: string;
  sha256: string;
  peers: Record<string, string>;
  iconSvg: string;
}>;
const seen = new Set<string>();
for (const entry of published) {
  const source = [pkg, models].find((item) => item.name === entry.packageName);
  if (!source || seen.has(entry.packageName))
    throw new Error("Unknown or duplicate market package");
  seen.add(entry.packageName);
  const slug = entry.packageName.replace("@semicoder/fn-", "");
  // Source may be ahead while the market still points at its verified public release.
  const expectedURL = `https://github.com/semicoder-dev/fn-plugins/releases/download/${slug}-v${entry.version}/semicoder-fn-${slug}-${entry.version}.tgz`;
  if (
    !/^\d+\.\d+\.\d+$/.test(entry.version) ||
    !Bun.semver.satisfies(entry.version, `<=${source.version}`) ||
    entry.name !== source.fn.name ||
    entry.description !== source.description ||
    entry.url !== expectedURL ||
    !/^[a-f0-9]{64}$/.test(entry.sha256) ||
    JSON.stringify(entry.peers) !== JSON.stringify(source.peerDependencies) ||
    entry.iconSvg !==
      (await Bun.file(new URL(`../plugins/${slug}/src/icon.svg`, import.meta.url)).text())
  )
    throw new Error(`Market metadata differs from verified release: ${entry.packageName}`);
}
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
for (const name of ["kanban", "models-dev"]) {
  await inspectPlugin(new URL(`../plugins/${name}`, import.meta.url).pathname);
  for (const entry of ["src/client.tsx", "src/style.module.css"]) {
    const source = await Bun.file(new URL(`../plugins/${name}/${entry}`, import.meta.url)).text();
    if (/--(?:m|rt)-|@base-ui\/|lucide-react|tailwindcss|fn-sdk\/(?:ui|theme)/.test(source))
      throw new Error(`${entry}: use shared fn-ui and DSH semantic tokens`);
    if (/<\/?(?:button|select|dialog|details)\b|showModal\(/.test(source))
      throw new Error(`${entry}: use original DSH controls and overlays`);
  }
}
console.log("Validated plugin contracts, fixed artifacts and release market metadata");
