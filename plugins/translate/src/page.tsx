import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { connectView } from "@semicoder/fn-sdk/client";
import { useI18n } from "@semicoder/fn-sdk/react";
import {
  ApplicationProvider,
  Button,
  Textarea,
  Select,
  PageHeader,
  Notice,
} from "@semicoder/fn-ui";
import api from "./contract.ts";
import s from "./style.module.css";
const view = connectView(api);
function Page() {
  const { t, locale } = useI18n(view);
  const [source, setSource] = useState(""),
    [target, setTarget] = useState<"en" | "zh-CN">("en"),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [history, setHistory] = useState<typeof api.history.output._output>([]);
  const active = useRef<AbortController | null>(null);
  const refresh = () => view.call("history", {}).then(setHistory);
  useEffect(() => {
    void refresh().catch((e) => setError(String(e)));
    return () => active.current?.abort();
  }, []);
  const translate = async () => {
    if (busy || !source.trim()) return;
    const controller = new AbortController();
    active.current = controller;
    setText("");
    setError("");
    setBusy(true);
    try {
      for await (const item of view.stream(
        "translate",
        { source, target },
        { signal: controller.signal },
      )) {
        if (item.type === "text") setText((value) => value + item.text);
        else await refresh();
      }
    } catch (error) {
      setError(controller.signal.aborted ? t("cancelled") : String(error));
    } finally {
      setBusy(false);
      active.current = null;
    }
  };
  return (
    <main className={s.page}>
      <PageHeader title={t("app.name")} description={t("app.description")} />
      <div className={s.toolbar}>
        <span>{t("auto")}</span>
        <span>→</span>
        <Select
          value={target}
          label={t("target")}
          options={[
            { value: "en", label: t("english") },
            { value: "zh-CN", label: t("chinese") },
          ]}
          onValueChange={(v) => setTarget(v as typeof target)}
        />
        <Button
          variant="primary"
          disabled={!source.trim() || busy}
          onClick={() => void translate()}
        >
          {busy ? t("translating") : t("translate")}
        </Button>
        {busy && (
          <Button onClick={() => active.current?.abort()}>{t("cancel")}</Button>
        )}
      </div>
      <div className={s.columns}>
        <Textarea
          aria-label={t("source")}
          placeholder={t("placeholder")}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void translate();
          }}
        />
        <div className={s.result} aria-live="polite">
          {text || <span>{t("result")}</span>}
          {text && (
            <Button
              size="sm"
              onClick={() =>
                void navigator.clipboard
                  .writeText(text)
                  .then(() => view.ui.toast(t("copied")))
                  .catch((e) => setError(String(e)))
              }
            >
              {t("copy")}
            </Button>
          )}
        </div>
      </div>
      {error && <Notice>{error}</Notice>}
      <h2>{t("history")}</h2>
      <div className={s.history}>
        {history.map((item) => (
          <button
            key={item.id}
            onClick={() => {
              if (busy) return;
              setSource(item.source);
              setTarget(item.target);
              setText(item.text);
            }}
          >
            <time>
              {new Intl.DateTimeFormat(locale, {
                dateStyle: "short",
                timeStyle: "short",
              }).format(item.createdAt)}
            </time>
            <span>{item.source}</span>
            <p>{item.text}</p>
          </button>
        ))}
      </div>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <ApplicationProvider view={view}>
    <Page />
  </ApplicationProvider>,
);
