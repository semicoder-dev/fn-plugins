import { existsSync } from "node:fs";
import { mkdtemp, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";

const root = process.cwd();
const target = await mkdtemp(join(tmpdir(), "fn-app-consumer-"));
try {
  for (const entry of [
    ".gitignore",
    "package.json",
    "bun.lock",
    "tsconfig.json",
    "plugins",
    "examples",
    "scripts",
    "release",
    "vendor",
  ])
    if (existsSync(join(root, entry))) {
      await cp(join(root, entry), join(target, entry), {
        recursive: true,
        filter: (path) =>
          !["node_modules", ".fn-build", "dist"].includes(basename(path)) &&
          !path.endsWith(".fn.tgz"),
      });
    }
  for (const args of [
    ["install", "--frozen-lockfile", "--ignore-scripts"],
    ["run", "check"],
    ["run", "test"],
    ["run", "pack"],
  ]) {
    const child = Bun.spawn([process.execPath, ...args], {
      cwd: target,
      stdout: "inherit",
      stderr: "inherit",
    });
    if (await child.exited)
      throw new Error(
        "Independent application validation failed: " + args.join(" "),
      );
  }
  console.log(
    "Official applications verified outside the repository with frozen dependencies",
  );
} finally {
  await rm(target, { recursive: true, force: true });
}
