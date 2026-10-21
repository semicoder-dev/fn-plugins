import { useEffect, useState, type CSSProperties } from "react";
import type { ClientApplication } from "@semicoder/fn-sdk/cordis-client";
import type { ModelSelection, SessionInfo } from "@semicoder/fn-sdk";

export const pageStyle: CSSProperties = { maxWidth: 860, margin: "0 auto", padding: 32, display: "grid", gap: 20 };
export const fieldStyle: CSSProperties = {
  width: "100%", padding: "10px 12px", border: "1px solid #8885", borderRadius: 8,
  background: "transparent", color: "inherit", font: "inherit", boxSizing: "border-box",
};
export const buttonStyle: CSSProperties = {
  padding: "10px 16px", border: "1px solid #8885", borderRadius: 8,
  background: "#7772", color: "inherit", cursor: "pointer", font: "inherit",
};
export function ErrorText({ error }: { error: string }) {
  return error ? <p role="alert" style={{ color: "#d9534f", margin: 0 }}>{error}</p> : null;
}

interface Connection { id: string; name: string; provider: string; configured: boolean }
export function ModelPicker({ api, value, onChange }: {
  api: ClientApplication; value: ModelSelection; onChange: (value: ModelSelection) => void;
}) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    api.list<Connection>("connections.list").then((items) => {
      if (active) setConnections(items.filter(item => item.configured));
    }).catch(error => { if (active) setError(String(error)); });
    return () => { active = false; };
  }, [api]);
  useEffect(() => {
    let active = true;
    setModels([]);
    setError("");
    if (value.connectionId) {
      api.list<{ id: string; name: string; connectionId: string }>("models.saved")
        .then(items => { if (active) setModels(items.filter(item => item.connectionId === value.connectionId)); })
        .catch(error => { if (active) setError(String(error)); });
    }
    return () => { active = false; };
  }, [api, value.connectionId]);
  return <div style={{ display: "grid", gap: 10 }}>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
      <label>模型连接
        <select style={fieldStyle} value={value.connectionId} onChange={event => onChange({ connectionId: event.target.value, modelId: "" })}>
          <option value="">选择已连接的账号</option>
          {connections.map(item => <option key={item.id} value={item.id}>{item.name} · {item.provider}</option>)}
        </select>
      </label>
      <label>模型
        <select style={fieldStyle} value={value.modelId} disabled={!value.connectionId} onChange={event => onChange({ ...value, modelId: event.target.value })}>
          <option value="">选择模型</option>
          {models.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
    </div>
    {!connections.length && <small>请先在设置中添加模型连接并完成认证。</small>}
    {value.connectionId && !models.length && <small>请在设置的模型服务中，将此账号的模型添加到列表。</small>}
    <ErrorText error={error} />
  </div>;
}

interface DisplayItem { id: string; kind: string; text: string; truncated?: boolean }
interface ProjectionPage { items: DisplayItem[]; nextOffset: number; hasMore: boolean }
export function SessionOutput({ api, sessionId }: { api: ClientApplication; sessionId: string }) {
  const [items, setItems] = useState<DisplayItem[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    setItems([]);
    setError("");
    async function refresh() {
      try {
        const result: DisplayItem[] = [];
        let offset = 0;
        let more = true;
        while (more && active) {
          const page = await api.call<ProjectionPage>("sessions.projection", { id: sessionId, offset, limit: 100 });
          result.push(...page.items);
          more = page.hasMore && page.nextOffset > offset;
          offset = page.nextOffset;
        }
        const sessions = await api.list<SessionInfo>("sessions.list", { appId: api.context.appId });
        if (active) {
          setItems(result);
          setRunning(sessions.find(item => item.id === sessionId)?.status === "running");
          setError("");
        }
      } catch (error) { if (active) setError(String(error)); }
      if (active) timer = setTimeout(refresh, 1500);
    }
    void refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [api, sessionId]);
  async function cancel() {
    try { await api.call("sessions.cancel", { id: sessionId }); }
    catch (error) { setError(String(error)); }
  }
  return <section style={{ display: "grid", gap: 12 }} aria-label="会话结果">
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <small>{running ? "正在处理…" : "会话已保存"}</small>
      {running && <button style={buttonStyle} onClick={() => void cancel()}>停止</button>}
    </div>
    {items.filter(item => item.kind !== "user").map(item =>
      <article key={item.id} style={{ padding: 16, border: "1px solid #8884", borderRadius: 10, overflowWrap: "anywhere" }}>
        <small>{item.kind === "assistant" ? "回复" : item.kind === "tool" ? "工具" : "状态"}</small>
        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.65 }}>{item.text}</div>
        {item.truncated && <small>内容已截断。</small>}
      </article>,
    )}
    <ErrorText error={error} />
  </section>;
}
