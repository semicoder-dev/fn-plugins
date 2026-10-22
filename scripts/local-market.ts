import { parseArgs } from "node:util";
import { archivePath, candidateIndex } from "./market.ts";
const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    cert: { type: "string" },
    key: { type: "string" },
    port: { type: "string", default: "9443" },
  },
});
if (!values.cert || !values.key)
  throw new Error(
    "Usage: bun run market:local --cert <localhost certificate> --key <key> [--port 9443]",
  );
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(values.port),
  tls: { cert: Bun.file(values.cert), key: Bun.file(values.key) },
  async fetch(request): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/marketplace.json")
      return Response.json(await candidateIndex(`https://127.0.0.1:${server.port}/`), {
        headers: { "cache-control": "no-store" },
      });
    if (path === "/kanban.tgz")
      return new Response(Bun.file(archivePath), {
        headers: { "content-type": "application/gzip", "cache-control": "no-store" },
      });
    return new Response("Not found", { status: 404 });
  },
});
const url = `https://127.0.0.1:${server.port}/marketplace.json`;
await Bun.write(new URL("../artifacts/local-market-url.txt", import.meta.url), url + "\n");
console.log(`Local candidate market: ${url}`);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    server.stop(true);
    process.exit(0);
  });
