import type { Context } from "@deepseek-ai/cordis";
import type { ModelSelection } from "@semicoder/fn-sdk";
import type { ClientApplication } from "@semicoder/fn-sdk/cordis-client";
import { useState } from "react";
import { buttonStyle, ErrorText, fieldStyle, ModelPicker, pageStyle, SessionOutput } from "../../../shared/client.tsx";

function TranslationPage({ api }: { api: ClientApplication }) {
  const [selection, setSelection] = useState<ModelSelection>({ connectionId: "", modelId: "" });
  const [text, setText] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("简体中文");
  const [sessionId, setSessionId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function translate() {
    setPending(true); setError("");
    try {
      const result = await api.invoke<{ sessionId: string }>("translate", { ...selection, text, targetLanguage });
      setSessionId(result.sessionId);
    } catch (error) { setError(String(error)); }
    finally { setPending(false); }
  }
  return <main style={pageStyle}>
    <header><h1>译文</h1><p>选择账号与模型，翻译文本并保留会话。</p></header>
    <ModelPicker api={api} value={selection} onChange={setSelection} />
    <label>目标语言<input style={fieldStyle} value={targetLanguage} onChange={event => setTargetLanguage(event.target.value)} maxLength={100} /></label>
    <label>原文<textarea style={{ ...fieldStyle, resize: "vertical" }} rows={8} value={text} onChange={event => setText(event.target.value)} maxLength={50_000} placeholder="输入或粘贴文本…" /></label>
    <button style={buttonStyle} disabled={pending || !selection.modelId || !text.trim() || !targetLanguage.trim()} onClick={() => void translate()}>{pending ? "正在创建会话…" : "翻译"}</button>
    <ErrorText error={error} />
    {sessionId && <SessionOutput api={api} sessionId={sessionId} />}
  </main>;
}
export const inject = ["clientApp"];
export function apply(ctx: Context) {
  const api = ctx.clientApp;
  api.page({ keepAlive: true, id: "translate", title: "译文", component: () => <TranslationPage api={api} /> });
}
