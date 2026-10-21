import { buildCordisApplication } from "@semicoder/fn-sdk/build-cordis";
import { mkdir, rename } from "node:fs/promises";
import { join } from "node:path";

const apps = ["translate", "quick-notes", "web-search"];
const command = process.argv[2] ?? "build";
if (!["build", "pack"].includes(command)) throw new Error(`Unknown command ${command}`);
await mkdir(join(import.meta.dir, "artifacts"), { recursive: true });
for (const name of apps) {
  const directory = join(import.meta.dir, "apps", name);
  await buildCordisApplication(directory);
  if (command === "pack") {
    const temporary = join(import.meta.dir, "artifacts", `${name}-packing.tgz`);
    const process = Bun.spawn([Bun.which("bun")!, "pm", "pack", "--filename", temporary], {
      cwd: directory, stdout: "pipe", stderr: "pipe",
    });
    const [stdout, stderr, code] = await Promise.all([
      new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited,
    ]);
    if (code) throw new Error(`${stdout}\n${stderr}`);
    const target = join(import.meta.dir, "artifacts", `${name}.tgz`);
    await rename(temporary, target);
    console.log(target);
  }
}
