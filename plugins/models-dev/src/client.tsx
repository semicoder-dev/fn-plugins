import React, { useEffect, useRef, useState } from "react";
import type { Context } from "@deepseek-ai/cordis";
import type { APIClient } from "@semicoder/fia/api";
import { client } from "@semicoder/fn-sdk/client";
import { Button, Input, Select, Modal, classes } from "@semicoder/fn-ui";
import { NavigationButton, useNavigation } from "@semicoder/fn-ui-navigation/view";
import type Navigation from "@semicoder/fn-ui-navigation/types";
import type {} from "@semicoder/fn-ui-layout/contract";
import contract, { type Listing, type Detail, type Query, type Offer } from "./contract.ts";
import styles from "./style.module.css";
const cx = (...values: (string | false | undefined)[]) => classes(styles, ...values);
type Remote = APIClient<typeof contract>;
export const inject = ["slots", "layoutSlots", "navigation", "platform", "api:modelsDev"];
export function apply(ctx: Context) {
  const remote = client(ctx, "modelsDev", contract);
  ctx.slots.register({ name: "fn.sidebar.top", id: "fn-models-dev", order: 21 }, () => (
    <NavigationButton navigation={ctx.navigation} path="fn-models-dev" label="模型目录" compact>
      <svg
        viewBox="0 0 24 24"
        width="23"
        height="23"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <path d="m12 3 9 5-9 5-9-5 9-5Z M3 12l9 5 9-5 M3 16l9 5 9-5" />
      </svg>
    </NavigationButton>
  ));
  ctx.slots.register({ name: "fn.main", key: "fn-models-dev" }, () => (
    <Models remote={remote} navigation={ctx.navigation} />
  ));
}
const defaults: Query = {
  search: "",
  lab: "",
  type: "",
  input: "",
  capability: "",
  sort: "release",
  direction: "desc",
  offset: 0,
  limit: 50,
};
const count = (n: number | undefined) => (n === undefined ? "—" : n.toLocaleString());
const yes = (v: boolean | undefined) => (v === undefined ? "未知" : v ? "支持" : "不支持");
const price = (v: number | undefined) =>
  v === undefined ? "—" : `$${v.toLocaleString("en-US", { maximumFractionDigits: 6 })}`;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
function Models({ remote, navigation }: { remote: Remote; navigation: Navigation }) {
  const path = useNavigation(navigation);
  let id = "";
  try {
    id = decodeURIComponent(path.slice("fn-models-dev/".length));
  } catch {}
  if (!path.startsWith("fn-models-dev/")) id = "";
  const [q, setQ] = useState<Query>(defaults),
    [search, setSearch] = useState("");
  const [data, setData] = useState<Listing | null>(null),
    [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [refreshing, setRefreshing] = useState(false);
  const [revision, setRevision] = useState(0),
    [selected, setSelected] = useState<Offer | null>(null);
  const generation = useRef(0),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setQ((old) => ({ ...old, search, offset: 0 })), 200);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const request = ++generation.current;
    setLoading(true);
    setError("");
    setSelected(null);
    if (id) setDetail(null);
    const result = id ? remote.call("detail", { id }) : remote.call("list", q);
    void result
      .then((value) => {
        if (request !== generation.current || !alive.current) return;
        if (id) setDetail(value as Detail);
        else setData(value as Listing);
      })
      .catch((e) => {
        if (request === generation.current && alive.current) setError(message(e));
      })
      .finally(() => {
        if (request === generation.current && alive.current) setLoading(false);
      });
    return () => {
      generation.current++;
    };
  }, [id, q, revision, remote]);
  const set = (key: keyof Query, value: string) =>
    setQ((old) => ({ ...old, [key]: value, offset: 0 }));
  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    setError("");
    try {
      await remote.call("refresh", {});
      if (alive.current) setRevision((x) => x + 1);
    } catch (e) {
      if (alive.current) setError(message(e));
    } finally {
      if (alive.current) setRefreshing(false);
    }
  }
  const state = id ? detail : data;
  return (
    <div className={cx("page")}>
      <header className={cx("header")}>
        {id && (
          <Button onClick={() => navigation.go("fn-models-dev")} aria-label="返回模型目录">
            ←
          </Button>
        )}
        <h1>{id ? (detail?.model.name ?? "模型详情") : "模型目录"}</h1>
        <span className={cx("source")}>models.dev</span>
        <Button onClick={() => void refresh()} disabled={refreshing || loading}>
          {refreshing ? "更新中…" : "刷新"}
        </Button>
      </header>
      {error && (
        <div className={cx("notice")} role="alert">
          {error}{" "}
          <Button onClick={() => void refresh()} disabled={refreshing}>
            重试
          </Button>
        </div>
      )}
      {state?.warning && (
        <div className={cx("notice")} role="status">
          {state.warning}
        </div>
      )}
      {loading && (
        <div className={cx("status")} role="status">
          正在读取模型信息…
        </div>
      )}
      {!id ? (
        <>
          <div className={cx("filters")}>
            <Input
              aria-label="搜索模型"
              placeholder="搜索模型名称、ID 或描述"
              value={search}
              maxLength={200}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
            <Select
              label="开发机构"
              value={q.lab ?? ""}
              onValueChange={(v) => set("lab", v)}
              options={[
                { value: "", label: "全部机构" },
                ...(data?.labs ?? []).map((value) => ({ value, label: value })),
              ]}
            />
            <Select
              label="模型类型"
              value={q.type ?? ""}
              onValueChange={(v) => set("type", v)}
              options={[
                { value: "", label: "全部类型" },
                ...(data?.types ?? []).map((value) => ({
                  value,
                  label: value === "chat" ? "对话" : value,
                })),
              ]}
            />
            <Select
              label="输入模态"
              value={q.input ?? ""}
              onValueChange={(v) => set("input", v)}
              options={[
                { value: "", label: "全部输入" },
                ...(data?.inputs ?? []).map((value) => ({ value, label: value })),
              ]}
            />
            <Select
              label="模型能力"
              value={q.capability ?? ""}
              onValueChange={(v) => set("capability", v)}
              options={[
                { value: "", label: "全部能力" },
                { value: "reasoning", label: "推理" },
                { value: "tool_call", label: "工具调用" },
                { value: "open_weights", label: "开放权重" },
              ]}
            />
            <Select
              label="排序"
              value={q.sort ?? "release"}
              onValueChange={(v) => set("sort", v)}
              options={[
                { value: "release", label: "发布日期" },
                { value: "name", label: "名称" },
                { value: "lab", label: "开发机构" },
                { value: "providers", label: "供应方案" },
                { value: "context", label: "上下文" },
                { value: "output", label: "最大输出" },
              ]}
            />
            <Button
              aria-label="切换排序方向"
              onClick={() => set("direction", q.direction === "asc" ? "desc" : "asc")}
            >
              {q.direction === "asc" ? "升序 ↑" : "降序 ↓"}
            </Button>
            <Button
              onClick={() => {
                setSearch("");
                setQ(defaults);
              }}
            >
              重置
            </Button>
          </div>
          <div className={cx("scroll")} aria-busy={loading}>
            <table className={cx("table")}>
              <caption className={cx("sr")}>模型规格列表</caption>
              <thead>
                <tr>
                  <th>模型</th>
                  <th>开发机构</th>
                  <th>供应方案</th>
                  <th>上下文</th>
                  <th>最大输出</th>
                  <th>输入</th>
                  <th>推理</th>
                </tr>
              </thead>
              <tbody>
                {data?.items.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <Button
                        className={cx("modelLink")}
                        onClick={() => navigation.go(`fn-models-dev/${encodeURIComponent(m.id)}`)}
                      >
                        {m.name}
                      </Button>
                      <small>{m.id}</small>
                    </td>
                    <td>{m.lab}</td>
                    <td>{m.providers}</td>
                    <td>{count(m.limit?.context)}</td>
                    <td>{count(m.limit?.output)}</td>
                    <td>{m.modalities?.input.join(" · ") || "—"}</td>
                    <td>{yes(m.reasoning)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data?.total === 0 && !loading && (
              <div className={cx("empty")}>没有匹配的模型，试试其他关键词或清除筛选。</div>
            )}
            {!data && !loading && !error && (
              <div className={cx("empty")}>点击刷新获取模型目录。</div>
            )}
          </div>
          <footer className={cx("footer")}>
            <span>{data ? `${data.total} 个模型` : "尚未加载"}</span>
            <Button
              disabled={loading || !(q.offset ?? 0)}
              onClick={() =>
                setQ((old) => ({ ...old, offset: Math.max(0, (old.offset ?? 0) - 50) }))
              }
            >
              上一页
            </Button>
            <span>第 {Math.floor((q.offset ?? 0) / 50) + 1} 页</span>
            <Button
              disabled={loading || !data || data.nextOffset === null}
              onClick={() => setQ((old) => ({ ...old, offset: data?.nextOffset ?? 0 }))}
            >
              下一页
            </Button>
          </footer>
        </>
      ) : (
        detail && (
          <div className={cx("scroll", "detail")}>
            <p className={cx("id")}>{detail.model.id}</p>
            <p>{detail.model.description}</p>
            <dl className={cx("specs")}>
              {Object.entries({
                开发机构: detail.model.lab,
                模型系列: detail.model.family,
                类型: detail.model.type ?? "chat",
                供应方案: detail.model.providers,
                上下文: count(detail.model.limit?.context),
                最大输入: count(detail.model.limit?.input),
                最大输出: count(detail.model.limit?.output),
                知识截止: detail.model.knowledge,
                发布日期: detail.model.release_date,
                更新日期: detail.model.last_updated,
                权重:
                  detail.model.open_weights === undefined
                    ? "未知"
                    : detail.model.open_weights
                      ? "开放"
                      : "闭源",
                许可证: detail.model.license,
                输入模态: detail.model.modalities?.input.join(" · "),
                输出模态: detail.model.modalities?.output.join(" · "),
                推理: yes(detail.model.reasoning),
                工具调用: yes(detail.model.tool_call),
              }).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{value ?? "—"}</dd>
                </div>
              ))}
            </dl>
            <div className={cx("sectionHeading")}>
              <h2>供应商与价格</h2>
              <a
                href={`https://models.dev/models/${detail.model.id.split("/").map(encodeURIComponent).join("/")}`}
                target="_blank"
                rel="noreferrer"
              >
                在 models.dev 查看 ↗
              </a>
            </div>
            <p className={cx("muted")}>
              基础价格：美元 / 百万 token。—
              表示未提供；具体阶梯和特殊计费请查看价格详情及供应商文档。
            </p>
            <div className={cx("tableWrap")}>
              <table className={cx("table")}>
                <thead>
                  <tr>
                    <th>供应商 / 模型 ID</th>
                    <th>输入价格</th>
                    <th>输出价格</th>
                    <th>缓存读取</th>
                    <th>上下文</th>
                    <th>工具调用</th>
                    <th>详情</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.offers.map((o) => (
                    <tr key={`${o.providerId}/${o.model.id}`}>
                      <td>
                        {o.providerName}
                        <small>{o.model.id}</small>
                      </td>
                      <td>{price(o.cost?.input)}</td>
                      <td>{price(o.cost?.output)}</td>
                      <td>{price(o.cost?.cache_read)}</td>
                      <td>{count(o.model.limit?.context)}</td>
                      <td>{yes(o.model.tool_call)}</td>
                      <td>
                        <Button
                          aria-label={`查看 ${o.providerName} ${o.model.id} 价格详情`}
                          onClick={() => setSelected(o)}
                        >
                          查看
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!detail.offers.length && (
              <p className={cx("empty")}>API 尚未提供此模型的供应商关联。</p>
            )}
          </div>
        )
      )}
      {state && (
        <div className={cx("status")}>
          来源：models.dev · {state.stale ? "缓存数据" : "最近同步"}{" "}
          {new Date(state.fetchedAt).toLocaleString()}
        </div>
      )}
      {selected && (
        <Modal
          open
          closeLabel="关闭价格详情"
          className={cx("priceDialog")}
          contentClassName={cx("priceContent")}
          title={`${selected.providerName} · 价格详情`}
          onClose={() => setSelected(null)}
        >
          <div className={cx("offer")}>
            <p className={cx("id")}>{selected.model.id}</p>
            <p>
              推理：{yes(selected.model.reasoning)} · 工具：{yes(selected.model.tool_call)} ·
              结构化输出：{yes(selected.model.structured_output)}
            </p>
            <p>
              温度调节：{yes(selected.model.temperature)} · 状态：
              {selected.model.status ?? "未标注"}
            </p>
            <p>价格单位：美元 / 百万 token。阶梯条件以供应商文档为准。</p>
            <PriceBreakdown cost={selected.cost} />
            {safeURL(selected.doc) && (
              <a href={selected.doc} target="_blank" rel="noreferrer">
                供应商文档 ↗
              </a>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
function safeURL(value: string | undefined) {
  try {
    return value && ["https:", "http:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

function PriceBreakdown({ cost }: { cost: Offer["cost"] }) {
  if (!cost) return <p>未提供价格</p>;
  const labels: Record<string, string> = {
    input: "输入",
    output: "输出",
    cache_read: "缓存读取",
    cache_write: "缓存写入",
    input_audio: "音频输入",
    output_audio: "音频输出",
    reasoning: "推理",
  };
  const rows = (values: Record<string, unknown>) => (
    <dl className={cx("prices")}>
      {Object.entries(values)
        .filter(([key, value]) => key in labels && typeof value === "number")
        .map(([key, value]) => (
          <div key={key}>
            <dt>{labels[key]}</dt>
            <dd>{price(value as number)}</dd>
          </div>
        ))}
    </dl>
  );
  const tiers = Array.isArray(cost.tiers) ? cost.tiers : [];
  return (
    <>
      <h3>基础价格</h3>
      {rows(cost)}
      {tiers.map((value, index) => {
        if (!value || typeof value !== "object") return null;
        const item = value as Record<string, unknown>,
          tier = item.tier as { type?: string; size?: number } | undefined;
        return (
          <section key={index}>
            <h3>
              阶梯 {index + 1}
              {tier
                ? ` · ${tier.type === "context" ? "上下文" : (tier.type ?? "条件")} ${count(tier.size)}`
                : ""}
            </h3>
            {rows(item)}
          </section>
        );
      })}
      {!tiers.length && cost.context_over_200k && typeof cost.context_over_200k === "object" ? (
        <section>
          <h3>上下文超过 200,000 token</h3>
          {rows(cost.context_over_200k as Record<string, unknown>)}
        </section>
      ) : null}
    </>
  );
}
