import { resolve } from "node:path";
import { copyFile, rm, mkdir } from "node:fs/promises";
const source = resolve(process.argv[2] ?? "../fn/artifacts/sdk");
const manifest = await Bun.file(resolve(source, "manifest.json")).json();
const pkg = await Bun.file("package.json").json();
await mkdir("vendor", { recursive: true });
pkg.overrides ??= {};
for await (const file of new Bun.Glob("*.tgz").scan("vendor"))
  await rm(resolve("vendor", file));
for (const [name, value] of Object.entries(manifest) as [
  string,
  { file: string; sha256: string },
][]) {
  const bytes = await Bun.file(resolve(source, value.file)).bytes();
  if (
    new Bun.CryptoHasher("sha256").update(bytes).digest("hex") !== value.sha256
  )
    throw new Error("SDK digest mismatch");
  await copyFile(resolve(source, value.file), resolve("vendor", value.file));
  pkg.devDependencies[name] = pkg.overrides[name] =
    "file:./vendor/" + value.file;
  await rm(resolve("node_modules", name), { recursive: true, force: true });
}
await Bun.write("package.json", JSON.stringify(pkg, null, 2) + "\n");
await copyFile(resolve(source, "manifest.json"), "vendor/manifest.json");
