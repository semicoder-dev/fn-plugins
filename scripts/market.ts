import { createHash } from "node:crypto";
import { resolve } from "node:path";
import pkg from "../plugins/kanban/package.json";
export const archivePath = resolve(
  import.meta.dir,
  `../artifacts/semicoder-fn-kanban-${pkg.version}.tgz`,
);
export async function candidateIndex(baseURL: string) {
  const base = new URL(baseURL);
  if (base.protocol !== "https:" || base.username || base.password || base.hash)
    throw new Error("候选市场需使用 HTTPS");
  return {
    schemaVersion: 3,
    name: "fn 看板候选市场",
    plugins: [
      {
        packageName: pkg.name,
        name: pkg.fn.name,
        description: pkg.description,
        version: pkg.version,
        url: new URL("kanban.tgz", base).href,
        sha256: createHash("sha256")
          .update(new Uint8Array(await Bun.file(archivePath).arrayBuffer()))
          .digest("hex"),
        peers: pkg.peerDependencies,
        iconSvg: await Bun.file(new URL("../plugins/kanban/src/icon.svg", import.meta.url)).text(),
      },
    ],
  };
}
