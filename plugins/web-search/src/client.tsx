import "./styles.css";
import styles from "./page.module.css";
import React, { useEffect, useRef, useState } from "react";
import { createPluginClient } from "@semicoder/fn-sdk/client";
import type { ModelInfo } from "@semicoder/fn-sdk/types";
import type { AgentSession } from "@semicoder/fn-sdk/agent";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  ModelSelect,
  Page,
  PageHeader,
  Panel,
  PanelHeader,
  Textarea,
  Search,
  Plus,
  Copy,
  Square,
  ExternalLink,
} from "@semicoder/fn-sdk/ui";
import { isRunning, pluginId, statusLabels, type ResearchReport } from "./research";

const client = createPluginClient(pluginId);
type Summary = Omit<AgentSession, "system">;
export default function WebSearch() {
  const [query, setQuery] = useState("");
  const [modelId, setModelId] = useState("");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [sessions, setSessions] = useState<Summary[]>([]);
  const [current, setCurrent] = useState<ResearchReport | null>(null);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const selected = useRef<string | null>(null);
  const generation = useRef(0);
  const refresh = useRef<() => void>(() => {});
  const busy = pending || (!!current && isRunning(current.session.status));
  const hasModel = models.some((m) => m.id === modelId && m.configured);

  useEffect(() => {
    let alive = true,
      inFlight = false,
      again = false,
      initialized = false;
    const fail = (e: unknown) => {
      if (alive) setError(e instanceof Error ? e.message : String(e));
    };
    const load = async () => {
      if (inFlight) {
        again = true;
        return;
      }
      inFlight = true;
      const version = generation.current;
      try {
        const [items, available] = await Promise.all([client.agents.list(), client.models.list()]);
        if (!alive || version !== generation.current) return;
        setSessions(items);
        setModels(available);
        if (selected.current && !items.some((item) => item.id === selected.current)) {
          selected.current = null;
          setCurrent(null);
        }
        if (!initialized) {
          const prefs = await client.kv.get("preferences");
          if (!alive || version !== generation.current) return;
          if (
            prefs &&
            typeof prefs === "object" &&
            !Array.isArray(prefs) &&
            typeof prefs.modelId === "string"
          )
            setModelId(prefs.modelId);
          selected.current = items[0]?.id ?? null;
          initialized = true;
        }
        const id = selected.current;
        if (id) {
          const value = await client.invoke<ResearchReport>("report", { sessionId: id });
          if (alive && version === generation.current && selected.current === id) {
            setCurrent((previous) =>
              previous?.session.id === id && previous.session.revision > value.session.revision
                ? previous
                : value,
            );
            setModelId(value.session.modelId);
          }
        }
        if (alive && version === generation.current) setReady(true);
      } catch (e) {
        if (version === generation.current) fail(e);
      } finally {
        inFlight = false;
        if (again && alive) {
          again = false;
          void load();
        }
      }
    };
    // Debounce token notices; polling also recovers a missed notification or a newly created Chat session.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer !== undefined) return;
      timer = setTimeout(() => {
        timer = undefined;
        void load();
      }, 200);
    };
    refresh.current = schedule;
    const off = client.agents.onChange(schedule);
    const offModels = client.models.onChange(schedule);
    const offReconnect = client.onReconnect(() => {
      generation.current++;
      setCurrent(null);
      setReady(false);
      setError("");
      schedule();
    });
    const poll = setInterval(schedule, 2000);
    void load();
    return () => {
      alive = false;
      generation.current++;
      refresh.current = () => {};
      clearInterval(poll);
      clearTimeout(timer);
      off();
      offModels();
      offReconnect();
    };
  }, []);

  const newTopic = () => {
    generation.current++;
    selected.current = null;
    setCurrent(null);
    setQuery("");
    setError("");
    setCopied(false);
    refresh.current();
  };
  const open = (id: string) => {
    generation.current++;
    selected.current = id;
    setCurrent(null);
    setQuery("");
    setError("");
    setCopied(false);
    setReady(false);
    refresh.current();
  };
  const start = async () => {
    if (!query.trim() || !hasModel || busy || !ready) return;
    setPending(true);
    setError("");
    setCopied(false);
    try {
      const session = await client.invoke<AgentSession>("start", {
        query,
        modelId,
        ...(selected.current ? { sessionId: selected.current } : {}),
      });
      generation.current++;
      selected.current = session.id;
      setQuery("");
      setCurrent({ session, question: query, answer: "", sources: [], activity: [], warnings: [] });
      refresh.current();
    } catch (e) {
      setError(
        `${e instanceof Error ? e.message : String(e)}。若连接中断，请先从历史记录核对任务，再决定是否重试。`,
      );
      refresh.current();
    } finally {
      setPending(false);
    }
  };
  const stop = async () => {
    if (!current) return;
    setPending(true);
    try {
      await client.agents.cancel(current.session.id);
      refresh.current();
    } catch (e) {
      setError(String(e));
    } finally {
      setPending(false);
    }
  };
  const remove = async () => {
    if (!current || busy) return;
    setPending(true);
    try {
      await client.agents.remove(current.session.id);
      newTopic();
    } catch (e) {
      setError(String(e));
    } finally {
      setPending(false);
    }
  };
  const choose = async (id: string) => {
    setModelId(id);
    setError("");
    if (!id) return;
    try {
      await client.invoke("preferences", { modelId: id });
    } catch (e) {
      setError(String(e));
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(
        `${current?.answer ?? ""}\n\n${current?.sources.map((s) => `${s.title}\n${s.url}`).join("\n\n") ?? ""}`,
      );
      setCopied(true);
    } catch {
      setError("无法访问剪贴板，请选中结果手动复制。");
    }
  };
  return (
    <Page className={styles.page}>
      <PageHeader
        title="网络搜索"
        description="从问题出发，阅读来源，把答案带回来。"
        actions={
          <Button variant="secondary" disabled={!ready || pending} onClick={newTopic}>
            <Plus size={15} />
            新话题
          </Button>
        }
      />
      <div className={styles.layout}>
        <aside className={styles.sidebar} aria-label="搜索历史">
          <div className={styles.sectionTitle}>
            最近话题 <span>{sessions.length}</span>
          </div>
          {!sessions.length && (
            <p className={styles.hint}>你的搜索会保存在这里，也可查看从 fn Chat 发起的话题。</p>
          )}
          {sessions.map((s) => (
            <button
              key={s.id}
              className={`${styles.history} ${selected.current === s.id ? styles.selected : ""}`}
              disabled={pending}
              onClick={() => open(s.id)}
            >
              <strong>{s.title || "未命名话题"}</strong>
              <span>
                {statusLabels[s.status]} · {new Date(s.updatedAt).toLocaleDateString("zh-CN")}
              </span>
            </button>
          ))}
          <div className={styles.chatHint}>
            <strong>在 fn Chat 中继续</strong>
            <p>选择「网络搜索」机器人发送问题。首次可用卡片选模型；发送 /新话题 或 /模型 切换。</p>
          </div>
        </aside>
        <main className={styles.main}>
          {error && <Alert>{error}</Alert>}
          {ready && !models.some((m) => m.configured) && (
            <Alert tone="warning">请先在宿主设置中添加可用模型，再开始搜索。</Alert>
          )}
          <Panel className={styles.composer}>
            <Textarea
              aria-label={current ? "追问内容" : "搜索问题"}
              placeholder={
                current
                  ? "继续追问这个话题…"
                  : "想了解什么？例如：比较两个开源项目的特点，并附官方来源。"
              }
              value={query}
              maxLength={16000}
              disabled={!ready || busy}
              className={styles.input}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void start();
                }
              }}
            />
            <div className={styles.toolbar}>
              <ModelSelect
                aria-label="搜索模型"
                models={models}
                value={modelId}
                disabled={!ready || busy || !!current}
                onValueChange={(id) => void choose(id ?? "")}
              />
              {busy && current ? (
                <Button
                  variant="secondary"
                  disabled={pending || current.session.status === "cancelling"}
                  onClick={() => void stop()}
                >
                  <Square size={14} />
                  {current.session.status === "cancelling" ? "正在停止" : "停止"}
                </Button>
              ) : (
                <Button
                  disabled={!ready || pending || !hasModel || !query.trim()}
                  onClick={() => void start()}
                >
                  <Search size={15} />
                  {current ? "继续追问" : "开始搜索"}
                </Button>
              )}
            </div>
            <p className={styles.hint}>
              {current
                ? "追问保留上下文并重新检索；更换模型请新建话题。"
                : "模型会搜索并阅读网页，答案附实际检索来源。⌘ / Ctrl + Enter 开始。"}
            </p>
          </Panel>
          {current ? (
            <>
              <Panel>
                <PanelHeader>
                  <span className={styles.question}>
                    {current.question || current.session.title}
                  </span>
                  <Badge
                    tone={
                      current.session.status === "completed"
                        ? current.sources.length
                          ? "success"
                          : "warning"
                        : current.session.status === "failed"
                          ? "error"
                          : "neutral"
                    }
                  >
                    {current.session.status === "completed" && !current.sources.length
                      ? "未找到资料"
                      : statusLabels[current.session.status]}
                  </Badge>
                </PanelHeader>
                {isRunning(current.session.status) && (
                  <div className={styles.progress} role="status">
                    正在搜索与核对资料 · 第 {Math.max(1, current.session.step)} /{" "}
                    {current.session.maxSteps} 步
                  </div>
                )}
                {current.session.error && (
                  <div className={styles.notice}>
                    <Alert tone="warning">{current.session.error}</Alert>
                  </div>
                )}
                <div className={styles.answer}>
                  {current.answer || (busy ? "正在寻找相关资料…" : "暂无可展示的答案。")}
                </div>
                <div className={styles.resultActions}>
                  <Button variant="ghost" disabled={!current.answer} onClick={() => void copy()}>
                    <Copy size={14} />
                    {copied ? "已复制" : "复制答案和来源"}
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => void remove()}>
                    删除话题
                  </Button>
                </div>
              </Panel>
              {current.warnings.length > 0 && (
                <Alert tone="warning">{current.warnings.join("；")}</Alert>
              )}
              {(current.warnings.length > 0 || current.activity.length > 0) && (
                <details className={styles.details}>
                  <summary>检索过程 · {current.activity.length} 次工具返回</summary>
                  {current.activity.map((item, i) => (
                    <p key={i}>{item}</p>
                  ))}
                </details>
              )}
              <section aria-label="检索来源">
                <div className={styles.sectionTitle}>
                  检索来源 <span>{current.sources.length}</span>
                </div>
                <p className={styles.hint}>
                  仅显示本轮实际检索和读取的来源；「仅搜索摘要」表示尚未读取正文。
                </p>
                {current.sources.length ? (
                  <div className={styles.sources}>
                    {current.sources.map((s) => (
                      <a
                        key={s.url}
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.source}
                      >
                        <div>
                          <strong>{s.title}</strong>
                          <ExternalLink size={13} />
                        </div>
                        <span>{new URL(s.url).hostname}</span>
                        <small>
                          {s.read ? (s.truncated ? "已读部分正文" : "已读正文") : "仅搜索摘要"}
                        </small>
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className={styles.hint}>暂无可核实的网页来源。</p>
                )}
              </section>
            </>
          ) : (
            <Panel>
              <EmptyState
                title="让答案有出处"
                description="搜索、阅读、交叉核对，在一个话题里继续追问。"
              />
            </Panel>
          )}
        </main>
      </div>
    </Page>
  );
}
