import { inspectPlugin } from "@semicoder/fn-sdk/build";
for (const app of ["translate", "notes", "kanban", "models-dev"])
  await inspectPlugin("plugins/" + app);
await inspectPlugin("examples/stocks");
for (const path of [
  "package.json",
  "bun.lock",
  ...(await Array.fromAsync(new Bun.Glob("plugins/*/package.json").scan("."))),
]) {
  const text = await Bun.file(path).text();
  if (/@deepseek-ai|cordis|pi-ai|"vite"|"oxfmt"/.test(text))
    throw new Error("Forbidden dependency: " + path);
}
