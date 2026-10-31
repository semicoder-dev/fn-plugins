import { packPlugin, buildPlugin } from "@semicoder/fn-sdk/build";
import { resolve } from "node:path";
const root = resolve(import.meta.dir, "..");
for (const name of ["kanban", "models-dev"]) {
  const directory = resolve(root, "plugins", name);
  await Bun.write(
    resolve(directory, "dist/icon.svg"),
    Bun.file(resolve(directory, "src/icon.svg")),
  );
  if (process.argv.includes("--pack"))
    console.log(await packPlugin(directory, resolve(root, "artifacts")));
  else await buildPlugin(directory);
}
