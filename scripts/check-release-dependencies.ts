import { applicationNames } from "./release-utils.ts";

export function checkReleaseDependencies(pkg: {
  overrides?: unknown;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}) {
  if (pkg.overrides && Object.keys(pkg.overrides).length)
    throw new Error("Release must not use dependency overrides");
  const dependencies = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const [name, version] of Object.entries(dependencies)) {
    if (/^(file:|link:|workspace:|\.\.?\/|\/)/.test(version))
      throw new Error("Release must not use local dependencies: " + name);
    if (
      name.startsWith("@semicoder/fn-") &&
      !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)
    )
      throw new Error("Fn SDK/UI dependencies must be exact public versions");
  }
}
if (import.meta.main) {
  for (const path of [
    "package.json",
    ...applicationNames.map((name) => `plugins/${name}/package.json`),
    "examples/stocks/package.json",
  ])
    checkReleaseDependencies(await Bun.file(path).json());
  const lock = await Bun.file("bun.lock").text();
  if (/file:|workspace:|link:/.test(lock))
    throw new Error("Release lockfile contains local dependencies");
  console.log("Release dependencies use exact public SDK/UI packages");
}
