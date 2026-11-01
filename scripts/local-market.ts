import { resolve } from "node:path";
const port = Number(process.argv[2] ?? 4321),
  origin = `http://127.0.0.1:${port}`;
const applications: {
    id: string;
    version: string;
    name: string;
    description: string;
    url: string;
    sha256: string;
  }[] = [],
  files = new Map<string, string>();
for (const name of ["translate", "notes", "kanban", "models-dev"]) {
  const manifest = await Bun.file(`plugins/${name}/fn.app.json`).json();
  const filename = `${manifest.id}-${manifest.version}.fn.tgz`,
    path = resolve(`plugins/${name}`, filename);
  const bytes = await Bun.file(path).bytes();
  const messages = await Bun.file(
    resolve(`plugins/${name}`, manifest.locales.messages["zh-CN"]),
  ).json();
  applications.push({
    id: manifest.id,
    version: manifest.version,
    name: messages[manifest.name.key] ?? manifest.name,
    description: messages[manifest.description?.key] ?? "",
    url: origin + "/" + filename,
    sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex"),
  });
  files.set("/" + filename, path);
}
const server = Bun.serve({
  hostname: "127.0.0.1",
  port,
  fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/applications.json")
      return Response.json({ schema: 1, applications });
    const file = files.get(path);
    return file
      ? new Response(Bun.file(file))
      : new Response("Not Found", { status: 404 });
  },
});
console.log(`Local development market: ${server.url}applications.json`);
