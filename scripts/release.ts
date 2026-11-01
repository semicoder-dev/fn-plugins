import { mkdir, copyFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { manifestSchema } from "@semicoder/fn-sdk/manifest";
import {
  releaseIdentity,
  mergeCatalog,
  readCatalog,
  type CatalogEntry,
} from "./release-utils.ts";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version))
  throw new Error("Usage: bun scripts/release.ts <version>");
const { tag, names } = releaseIdentity(version, process.argv[3]);
if (
  process.env.GITHUB_EVENT_NAME === "push" &&
  process.env.GITHUB_REF !== `refs/tags/${tag}`
)
  throw new Error("Release tag and application versions differ");
const output = resolve("artifacts/release");
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const applications: CatalogEntry[] = [];
const baseline = readCatalog(await Bun.file("release/catalog.json").json());
for (const name of names) {
  const directory = resolve("plugins", name);
  const manifest = manifestSchema.parse(
    await Bun.file(resolve(directory, "fn.app.json")).json(),
  );
  const pkg = await Bun.file(resolve(directory, "package.json")).json();
  if (manifest.version !== version || pkg.version !== version)
    throw new Error("Selected application versions must match the release");
  const filename = `${manifest.id}-${version}.fn.tgz`;
  const path = resolve(directory, filename);
  const bytes = await Bun.file(path).bytes();
  const files = await new Bun.Archive(bytes).files();
  const packaged = JSON.parse(await files.get("fn.app.json")!.text());
  if (
    JSON.stringify(manifestSchema.parse(packaged)) !== JSON.stringify(manifest)
  )
    throw new Error("Packaged manifest mismatch");
  const messages = await Bun.file(
    resolve(directory, manifest.locales.messages["zh-CN"]!),
  ).json();
  const text = (value: any) =>
    typeof value === "string" ? value : (messages[value?.key] ?? "");
  applications.push({
    id: manifest.id,
    version,
    name: text(manifest.name),
    description: text(manifest.description),
    url: `https://github.com/semicoder-dev/fn-plugins/releases/download/${tag}/${filename}`,
    sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
  });
  await copyFile(path, resolve(output, filename));
}
await Bun.write(
  resolve(output, "applications.json"),
  JSON.stringify(mergeCatalog(baseline, applications), null, 2) + "\n",
);
await Bun.write(
  resolve(output, "release.json"),
  JSON.stringify({ tag, version, applications, baseline }, null, 2) + "\n",
);
console.log(
  `${tag}: ${applications.length} verified application archives in ${output}`,
);
