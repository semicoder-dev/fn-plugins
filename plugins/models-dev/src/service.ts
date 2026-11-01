import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { CatalogIndex, catalogSchema } from "./catalog.ts";
import type { Query } from "./contract.ts";

export const endpoint = "https://models.dev/catalog.json?type=all";
const ttl = 60 * 60 * 1000;
const maxBytes = 24 * 1024 * 1024;
type Fetcher = (url: string, options: RequestInit) => Promise<Response>;
export class CatalogService {
  private index?: CatalogIndex;
  private fetchedAt = 0;
  private warning: string | null = null;
  private pending?: Promise<void>;
  private retryAt = 0;
  private loaded = false;
  private lifetime = new AbortController();
  constructor(
    private file: string,
    private fetcher: Fetcher = fetch,
    private now = Date.now,
  ) {}
  close() {
    this.lifetime.abort();
  }
  private assertOpen() {
    this.lifetime.signal.throwIfAborted();
  }
  private state() {
    return {
      fetchedAt: this.fetchedAt,
      stale: Boolean(this.warning) || this.now() - this.fetchedAt >= ttl,
      warning: this.warning,
    };
  }
  private async load() {
    if (this.loaded) return;
    this.loaded = true;
    try {
      if ((await stat(this.file)).size > maxBytes) return;
      const value = JSON.parse(await readFile(this.file, "utf8"));
      if (
        value.version !== 1 ||
        !Number.isFinite(value.fetchedAt) ||
        value.fetchedAt < 0 ||
        value.fetchedAt > this.now()
      )
        return;
      const data = catalogSchema.parse(value.data);
      this.index = new CatalogIndex(data);
      this.fetchedAt = value.fetchedAt;
    } catch {
      /* Missing/corrupt cache is replaced only after a valid API response. */
    }
  }
  private async update(force = false) {
    this.assertOpen();
    if (this.pending) return this.pending;
    this.pending = (async () => {
      await this.load();
      if (!force && this.index && this.now() - this.fetchedAt < ttl) return;
      if (!force && this.now() < this.retryAt) {
        if (!this.index)
          throw new Error(this.warning ?? "目录暂不可用，请刷新重试");
        return;
      }
      try {
        const response = await this.fetcher(endpoint, {
          signal: AbortSignal.any([
            this.lifetime.signal,
            AbortSignal.timeout(20_000),
          ]),
          redirect: "error",
          headers: { accept: "application/json" },
        });
        if (!response.ok) throw new Error(`models.dev HTTP ${response.status}`);
        if (!response.body) throw new Error("models.dev 返回空响应");
        const reader = response.body.getReader();
        let bytes = 0;
        const chunks: Uint8Array[] = [];
        try {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            bytes += part.value.length;
            if (bytes > maxBytes) throw new Error("模型目录超过大小限制");
            chunks.push(part.value);
          }
        } finally {
          await reader.cancel().catch(() => {});
          reader.releaseLock();
        }
        const data = catalogSchema.parse(
          JSON.parse(Buffer.concat(chunks).toString("utf8")),
        );
        this.assertOpen();
        const index = new CatalogIndex(data),
          fetchedAt = this.now();
        const temporary = `${this.file}.${crypto.randomUUID()}.tmp`;
        let diskWarning: string | null = null;
        try {
          await mkdir(dirname(this.file), { recursive: true });
          await writeFile(
            temporary,
            JSON.stringify({ version: 1, fetchedAt, data }),
            {
              mode: 0o600,
            },
          );
          this.assertOpen();
          await rename(temporary, this.file);
        } catch (error) {
          this.assertOpen();
          diskWarning = "目录已更新，但本机缓存保存失败；重启后需要联网。";
        } finally {
          await rm(temporary, { force: true });
        }
        this.assertOpen();
        this.index = index;
        this.fetchedAt = fetchedAt;
        this.warning = diskWarning;
        this.retryAt = 0;
      } catch (error) {
        this.assertOpen();
        this.warning = `更新失败${this.index ? "，正在显示上次缓存" : ""}：${error instanceof Error ? error.message.slice(0, 240) : "网络或数据错误"}`;
        this.retryAt = this.now() + 60_000;
        if (!this.index) throw new Error(this.warning);
      }
    })();
    try {
      await this.pending;
    } finally {
      this.pending = undefined;
    }
  }
  async list(input: Query) {
    await this.update();
    this.assertOpen();
    return { ...this.index!.list(input), ...this.state() };
  }
  async detail(id: string) {
    await this.update();
    this.assertOpen();
    return { ...this.index!.detail(id), ...this.state() };
  }
  async refresh() {
    await this.update(true);
    this.assertOpen();
    return this.state();
  }
}
