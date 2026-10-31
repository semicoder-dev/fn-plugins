import { mkdir, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import { manifestSchema } from "@semicoder/fn-sdk/manifest";

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version))
  throw new Error("Usage: bun scripts/release.ts <version>");
const tag = `apps-v${version}`;
if (
  process.env.GITHUB_EVENT_NAME === "push" &&
  process.env.GITHUB_REF !== `refs/tags/${tag}`
)
  throw new Error("Release tag and application versions differ");
const output = resolve("artifacts/release");
await mkdir(output, { recursive: true });
const applications = [];
for (const name of ["translate", "notes", "kanban"]) {
  const directory = resolve("plugins", name);
  const manifest = manifestSchema.parse(
    await Bun.file(resolve(directory, "fn.app.json")).json(),
  );
  const pkg = await Bun.file(resolve(directory, "package.json")).json();
  if (manifest.version !== version || pkg.version !== version)
    throw new Error("All application versions must match the release");
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
  JSON.stringify({ schema: 1, applications }, null, 2) + "\n",
);
console.log(
  `${tag}: ${applications.length} verified application archives in ${output}`,
);
