import { cp, mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

// Opt-in candidate verification. The repository and its public lockfile stay unchanged.
const manifestPath = process.argv[2];
if (!manifestPath)
  throw new Error("Usage: bun run verify:sdk-candidate <SDK manifest.json>");
const manifest = await Bun.file(manifestPath).json();
const temporary = await mkdtemp(join(tmpdir(), "fn-sdk-candidate-apps-"));
try {
  for (const entry of [
    ".gitignore",
    "package.json",
    "tsconfig.json",
    "plugins",
    "examples",
    "scripts",
    "release",
  ])
    if (existsSync(entry))
      await cp(entry, join(temporary, entry), {
        recursive: true,
        filter: (path) =>
          !["node_modules", ".fn-build", "dist"].includes(basename(path)) &&
          !path.endsWith(".fn.tgz"),
      });
  const pkg = await Bun.file(join(temporary, "package.json")).json();
  for (const name of ["@semicoder/fn-sdk", "@semicoder/fn-ui"]) {
    const artifact = manifest[name];
    if (
      !artifact ||
      typeof artifact.file !== "string" ||
      basename(artifact.file) !== artifact.file
    )
      throw new Error("Invalid candidate artifact");
    const bytes = await Bun.file(
      resolve(dirname(manifestPath), artifact.file),
    ).bytes();
    if (
      new Bun.CryptoHasher("sha256").update(bytes).digest("hex") !==
      artifact.sha256
    )
      throw new Error("Candidate hash mismatch");
    const files = await new Bun.Archive(bytes).files();
    const candidate = JSON.parse(
      await files.get("package/package.json")!.text(),
    );
    if (
      candidate.name !== name ||
      candidate.version !== pkg.devDependencies[name]
    )
      throw new Error(
        "Candidate must match the application's declared SDK/UI version",
      );
    await Bun.write(join(temporary, artifact.file), bytes);
    pkg.devDependencies[name] = "file:./" + artifact.file;
  }
  await Bun.write(
    join(temporary, "package.json"),
    JSON.stringify(pkg, null, 2) + "\n",
  );
  for (const args of [
    ["install", "--ignore-scripts"],
    ["run", "check"],
    ["run", "test"],
    ["run", "pack"],
  ]) {
    const child = Bun.spawn([process.execPath, ...args], {
      cwd: temporary,
      stdout: "inherit",
      stderr: "inherit",
    });
    if (await child.exited)
      throw new Error(
        "Candidate application validation failed: " + args.join(" "),
      );
  }
  console.log(
    "Candidate SDK/UI verified against all official applications in an isolated checkout; public dependencies unchanged",
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
