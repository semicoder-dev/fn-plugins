import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
// CI only: create immutable release assets, verify downloaded bytes, then expose the catalog.
const input = resolve(process.argv[2] ?? "release-bundle");
const site = resolve(process.argv[3] ?? "published-site");
const index = await Bun.file(resolve(input, "applications.json")).json();
const version = index.applications[0]?.version;
const tag = `apps-v${version}`;
if (
  process.env.GITHUB_REPOSITORY !== "semicoder-dev/fn-plugins" ||
  process.env.GITHUB_REF !== `refs/tags/${tag}`
)
  throw new Error("Release identity mismatch");
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
  const notes =
    "翻译、笔记和看板应用 0.2.0。适用于 Fn 0.7，使用 SDK 0.6.0 与 Fn UI 0.1.0。应用中心通过摘要校验安装包；手机入口另行发布。";
  const notesPath = resolve(input, "notes.md");
  await Bun.write(notesPath, notes);
  await gh([
    "release",
    "create",
    tag,
    "--verify-tag",
    "--draft",
    "--title",
    `Fn applications ${version}`,
    "--notes-file",
    notesPath,
    ...index.applications.map((app: any) =>
      resolve(input, `${app.id}-${app.version}.fn.tgz`),
    ),
    resolve(input, "applications.json"),
  ]);
}
const verify = resolve(input, "verified");
await mkdir(verify, { recursive: true });
await gh(["release", "download", tag, "--dir", verify]);
const downloaded = await Bun.file(resolve(verify, "applications.json")).text();
if (downloaded !== (await Bun.file(resolve(input, "applications.json")).text()))
  throw new Error("Published catalog differs");
for (const app of index.applications) {
  const bytes = await Bun.file(
    resolve(verify, `${app.id}-${app.version}.fn.tgz`),
  ).bytes();
  if (new Bun.CryptoHasher("sha256").update(bytes).digest("hex") !== app.sha256)
    throw new Error("Published archive digest mismatch");
}
if (!existing || existing.isDraft)
  await gh(["release", "edit", tag, "--draft=false", "--latest"]);
await mkdir(site, { recursive: true });
await Bun.write(resolve(site, "applications.json"), downloaded);
await Bun.write(
  resolve(site, "index.html"),
  '<!doctype html><meta charset="utf-8"><title>Fn 应用市场</title><a href="https://semicoder.dev/fn/docs/plugins">Fn 应用市场说明</a>',
);
console.log(`${tag}: published archives and verified catalog ready for Pages`);
