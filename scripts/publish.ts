import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { readCatalog, mergeCatalog, releaseIdentity } from "./release-utils.ts";
// CI only: create immutable release assets, verify downloaded bytes, then expose the catalog.
const input = resolve(process.argv[2] ?? "release-bundle");
const site = resolve(process.argv[3] ?? "published-site");
const index = readCatalog(
  await Bun.file(resolve(input, "applications.json")).json(),
);
const release = await Bun.file(resolve(input, "release.json")).json();
const { version, tag } = release;
const selected = readCatalog({
  schema: 1,
  applications: release.applications,
}).applications;
const scope =
  tag === `apps-v${version}`
    ? "all"
    : tag.slice(0, -(String(version).length + 2));
const identity = releaseIdentity(version, scope);
if (
  identity.tag !== tag ||
  selected.length !== identity.names.length ||
  !identity.names.every((name) =>
    selected.some(
      (app) =>
        app.id === `fn-${name}` &&
        app.version === version &&
        app.url ===
          `https://github.com/semicoder-dev/fn-plugins/releases/download/${tag}/${app.id}-${version}.fn.tgz`,
    ),
  ) ||
  JSON.stringify(mergeCatalog(readCatalog(release.baseline), selected)) !==
    JSON.stringify(index)
)
  throw new Error("Release manifest and catalog differ");
if (
  process.env.GITHUB_REPOSITORY !== "semicoder-dev/fn-plugins" ||
  process.env.GITHUB_REF !== `refs/tags/${tag}`
)
  throw new Error("Release identity mismatch");
const catalogURL =
  "https://semicoder-dev.github.io/fn-plugins/applications.json";
const current = await fetch(catalogURL, {
  cache: "no-store",
  signal: AbortSignal.timeout(30000),
});
if (!current.ok) throw new Error("Cannot verify current market");
const live = readCatalog(await current.json());
if (
  JSON.stringify(live) !== JSON.stringify(release.baseline) &&
  JSON.stringify(live) !== JSON.stringify(index)
)
  throw new Error(
    "Market changed since release baseline; refusing to overwrite it",
  );
async function gh(args: string[]) {
  const child = Bun.spawn(
    ["gh", ...args, "--repo", "semicoder-dev/fn-plugins"],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code) throw new Error(err);
  return out;
}
let existing: any;
try {
  existing = JSON.parse(
    await gh(["release", "view", tag, "--json", "isDraft,assets"]),
  );
} catch (error) {
  if (!String(error).includes("release not found")) throw error;
}
if (!existing) {
  const notesPath = resolve("release/notes", `${tag}.md`);
  if (!(await Bun.file(notesPath).exists()))
    throw new Error("Missing release notes");
  await gh([
    "release",
    "create",
    tag,
    "--verify-tag",
    "--draft",
    "--title",
    selected.length === 1
      ? `${selected[0]!.name} ${version}`
      : `Fn applications ${version}`,
    "--notes-file",
    notesPath,
    ...selected.map((app) => resolve(input, `${app.id}-${app.version}.fn.tgz`)),
    resolve(input, "applications.json"),
    resolve(input, "release.json"),
  ]);
}
const verify = resolve(input, "verified");
await mkdir(verify, { recursive: true });
await gh(["release", "download", tag, "--dir", verify]);
const downloaded = await Bun.file(resolve(verify, "applications.json")).text();
if (downloaded !== (await Bun.file(resolve(input, "applications.json")).text()))
  throw new Error("Published catalog differs");
for (const app of selected) {
  const bytes = await Bun.file(
    resolve(verify, `${app.id}-${app.version}.fn.tgz`),
  ).bytes();
  if (new Bun.CryptoHasher("sha256").update(bytes).digest("hex") !== app.sha256)
    throw new Error("Published archive digest mismatch");
}
if (!existing || existing.isDraft)
  await gh(["release", "edit", tag, "--draft=false", "--latest"]);
// Verify the complete public catalog, including retained applications, before Pages switches.
for (const app of index.applications) {
  const response = await fetch(app.url, { signal: AbortSignal.timeout(60000) });
  if (
    !response.ok ||
    new Bun.CryptoHasher("sha256")
      .update(await response.bytes())
      .digest("hex") !== app.sha256
  )
    throw new Error(
      "Public application archive failed verification: " + app.id,
    );
}
await mkdir(site, { recursive: true });
await Bun.write(resolve(site, "applications.json"), downloaded);
await Bun.write(
  resolve(site, "index.html"),
  '<!doctype html><meta charset="utf-8"><title>Fn 应用市场</title><a href="https://semicoder.dev/fn/docs/plugins">Fn 应用市场说明</a>',
);
console.log(`${tag}: published archives and verified catalog ready for Pages`);
