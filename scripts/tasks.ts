import { mkdir, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { checkPlugin, buildCheckedPlugin, packPlugin } from "@semicoder/fn-sdk/plugin";
import { iconSvgSchema } from "@semicoder/fn-sdk/manifest";
const action = process.argv[2];
const selected = process.argv[3];
const available = ["translate", "quick-notes", "web-search"];
const ids = selected ? [selected] : available;
if (!ids.every(id => available.includes(id))) throw new Error("未知插件 ID");
for (const id of ids) {
  const root = `plugins/${id}`;
  if (action === "check") await checkPlugin(root);
  else if (action === "build") await buildCheckedPlugin(root);
  else if (action === "pack") {
    const archive = await packPlugin(root);
    const pkg = await Bun.file(`${root}/package.json`).json();
    const name = `${id}-${pkg.version}.tgz`;
    await mkdir("artifacts", { recursive: true });
    await rename(archive, `artifacts/${name}`);
    const sha256 = createHash("sha256").update(await Bun.file(`artifacts/${name}`).bytes()).digest("hex");
    const { id: pluginId, name: title, description, icon, color, sdkVersion } = pkg.fn;
    const entry = { id: pluginId, packageName: pkg.name, name: title, description, icon, color, sdkVersion, version: pkg.version,
      ...(pkg.fn.iconSvg ? { iconSvg: iconSvgSchema.parse(await Bun.file(`${root}/${pkg.fn.iconSvg}`).text()) } : {}),
      url: `https://github.com/semicoder-dev/fn-plugins/releases/download/${id}-v${pkg.version}/${name}`, sha256 };
    await Bun.write(`artifacts/${id}.json`, JSON.stringify(entry, null, 2) + "\n");
    await Bun.write(`artifacts/${name}.sha256`, `${sha256}  ${name}\n`);
    console.log(`Prepared ${name}; candidate index entry artifacts/${id}.json (not published)`);
  } else throw new Error("用法：bun scripts/tasks.ts check|build|pack [plugin-id]");
}
