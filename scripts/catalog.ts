import { createHash } from "node:crypto";
import { z } from "@semicoder/fn-sdk/runtime";
import { iconSvgSchema } from "@semicoder/fn-sdk/manifest";
export const entrySchema = z.strictObject({
  id: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/).refine(id => !["models", "plugins", "settings"].includes(id)),
  packageName: z.string().max(214).regex(/^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/),
  name: z.string().trim().min(1).max(100), description: z.string().max(1000), icon: z.string().min(1).max(16), color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  iconSvg: iconSvgSchema.optional(),
  version: z.string().regex(/^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/), sdkVersion: z.string().max(20),
  url: z.string().max(2000).url().refine(value => { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && !url.hash; }), sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const indexSchema = z.strictObject({ schemaVersion: z.literal(1), name: z.string().trim().min(1).max(100), plugins: z.array(entrySchema).max(1000) }).refine(index => new Set(index.plugins.map(p => p.id)).size === index.plugins.length);
if (import.meta.main) {
  const action = process.argv[2];
  const index = indexSchema.parse(await Bun.file("marketplace.json").json());
  if (action === "promote") {
    const entry = entrySchema.parse(await Bun.file(process.argv[3]!).json());
    const expectedURL = `https://github.com/semicoder-dev/fn-plugins/releases/download/${entry.id}-v${entry.version}/${entry.id}-${entry.version}.tgz`;
    if (entry.url !== expectedURL) throw new Error("候选条目不是官方固定版本归档");
    const response = await fetch(entry.url, { signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error(`公开归档未就绪：${response.status}`);
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > 50 * 1024 * 1024 || createHash("sha256").update(new Uint8Array(bytes)).digest("hex") !== entry.sha256) throw new Error("公开归档哈希或大小不符");
    const previous = index.plugins.find(p => p.id === entry.id);
    if (previous) {
      const a = entry.version.split(".").map(Number), b = previous.version.split(".").map(Number);
      const difference = a.map((value, i) => value - b[i]!).find(value => value !== 0) ?? 0;
      if (previous.packageName !== entry.packageName || difference < 0 || (difference === 0 && JSON.stringify(previous) !== JSON.stringify(entry))) throw new Error("拒绝身份变更、降级或覆盖同版本条目");
    }
    index.plugins = [...index.plugins.filter(p => p.id !== entry.id), entry].sort((a, b) => a.id.localeCompare(b.id));
    await Bun.write("marketplace.json", JSON.stringify(indexSchema.parse(index), null, 2) + "\n");
  } else if (action !== "check") throw new Error("用法：catalog.ts check|promote [candidate.json]");
  console.log(`Verified ${index.plugins.length} published entries`);
}
