import type { Context } from "@deepseek-ai/cordis";
import type { ClientApplication } from "@semicoder/fn-sdk/cordis-client";
import { useEffect, useState } from "react";
import { buttonStyle, ErrorText, fieldStyle, pageStyle } from "../../../shared/client.tsx";

interface Note { key: string; text: string; updatedAt: number }
function NotesPage({ api }: { api: ClientApplication }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function refresh() {
    const values = await api.kv.list();
    setNotes(values.flatMap(({ key, value }): Note[] => {
      if (!key.startsWith("note:") || !value || typeof value !== "object" || Array.isArray(value)) return [];
      return typeof value.text === "string" && typeof value.updatedAt === "number"
        ? [{ key, text: value.text, updatedAt: value.updatedAt }] : [];
    }).sort((a, b) => b.updatedAt - a.updatedAt));
  }
  useEffect(() => { void refresh().catch(error => setError(String(error))); }, [api]);
  async function save() {
    setPending(true); setError("");
    try {
      await api.kv.set(`note:${crypto.randomUUID()}`, { text: text.trim(), updatedAt: Date.now() });
      setText(""); await refresh();
    } catch (error) { setError(String(error)); }
    finally { setPending(false); }
  }
  async function remove(key: string) {
    setPending(true); setError("");
    try { await api.kv.delete(key); await refresh(); }
    catch (error) { setError(String(error)); }
    finally { setPending(false); }
  }
  return <main style={pageStyle}>
    <header><h1>随手记</h1><p>笔记保存到当前应用的独立 KV，无需模型连接。</p></header>
    <textarea aria-label="笔记内容" style={{ ...fieldStyle, resize: "vertical" }} rows={6} value={text} onChange={event => setText(event.target.value)} maxLength={50_000} placeholder="记下一点想法…" />
    <button style={buttonStyle} disabled={pending || !text.trim()} onClick={() => void save()}>保存笔记</button>
    <ErrorText error={error} />
    {notes.length === 0 && <p>还没有笔记。</p>}
    {notes.map(note => <article key={note.key} style={{ border: "1px solid #8884", borderRadius: 10, padding: 16 }}>
      <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{note.text}</p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <small>{new Date(note.updatedAt).toLocaleString()}</small>
        <button style={buttonStyle} disabled={pending} onClick={() => void remove(note.key)}>删除</button>
      </div>
    </article>)}
  </main>;
}
export const inject = ["clientApp"];
export function apply(ctx: Context) {
  const api = ctx.clientApp;
  api.page({ keepAlive: true, id: "notes", title: "随手记", component: () => <NotesPage api={api} /> });
}
