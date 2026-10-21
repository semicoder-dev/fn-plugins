import type { Context } from "@deepseek-ai/cordis";
import type { ModelSelection, SessionInfo } from "@semicoder/fn-sdk";
import type { ClientApplication } from "@semicoder/fn-sdk/cordis-client";
import { useState } from "react";
import { buttonStyle, ErrorText, fieldStyle, ModelPicker, pageStyle, SessionOutput } from "../../../shared/client.tsx";

function SearchPage({ api }: { api: ClientApplication }) {
  const [selection, setSelection] = useState<ModelSelection>({ connectionId: "", modelId: "" });
  const [query, setQuery] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function search() {
    setPending(true); setError("");
    try {
      const session = await api.call<SessionInfo>("sessions.create", {
        appId: api.context.appId, ...selection, endpointId: "search", title: query.slice(0, 100),
      });
      await api.call("sessions.send", { id: session.id, text: query, requestId: crypto.randomUUID() });
      setSessionId(session.id);
    } catch (error) { setError(String(error)); }
    finally { setPending(false); }
  }
  return <main style={pageStyle}>
    <header><h1>网络搜索</h1><p>通过模型查找资料、阅读网页，并在结果中附上来源。</p></header>
    <ModelPicker api={api} value={selection} onChange={setSelection} />
    <label>搜索问题<textarea style={{ ...fieldStyle, resize: "vertical" }} rows={4} value={query} onChange={event => setQuery(event.target.value)} maxLength={8000} placeholder="你想了解什么？" /></label>
    <button style={buttonStyle} disabled={pending || !selection.modelId || !query.trim()} onClick={() => void search()}>{pending ? "正在创建会话…" : "搜索"}</button>
    <ErrorText error={error} />
    {sessionId && <SessionOutput api={api} sessionId={sessionId} />}
  </main>;
}
export const inject = ["clientApp"];
export function apply(ctx: Context) {
  const api = ctx.clientApp;
  api.page({ keepAlive: true, id: "search", title: "网络搜索", component: () => <SearchPage api={api} /> });
}
