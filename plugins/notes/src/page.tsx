import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { connectView } from "@semicoder/fn-sdk/client";
import { useI18n, useUnsavedChanges } from "@semicoder/fn-sdk/react";
import {
  ApplicationProvider,
  Button,
  Input,
  Textarea,
  Notice,
  Icon,
} from "@semicoder/fn-ui";
import api, { type note } from "./contract.ts";
import s from "./style.module.css";
const view = connectView(api);
type Note = typeof note._output;
function Page() {
  const { t, locale } = useI18n(view);
  const [notes, setNotes] = useState<Note[]>([]),
    [selected, setSelected] = useState<Note | null>(null),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [dirty, setDirty] = useState(false);
  const current = useRef(selected);
  current.current = selected;
  useUnsavedChanges(view, dirty);
  const refresh = () => view.call("list", {}).then(setNotes);
  useEffect(() => {
    void refresh().catch((e) => setError(String(e)));
  }, []);
  async function save() {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const value = await view.call("save", selected);
      if (current.current?.id === value.id) {
        setSelected(value);
        setDirty(false);
      }
      await refresh();
    } catch (e) {
      setError(String(e).includes("conflict") ? t("conflict") : String(e));
    } finally {
      setSaving(false);
    }
  }
  async function select(value: Note | null) {
    if (saving) return;
    if (dirty && !(await view.ui.confirm(t("discard")))) return;
    setSelected(value);
    setDirty(false);
    setError("");
  }
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  const create = () =>
    select({
      id: crypto.randomUUID(),
      title: "",
      body: "",
      revision: 0,
      updatedAt: Date.now(),
    });
  return (
    <main className={s.page}>
      <aside>
        <header>
          <h1>{t("app.name")}</h1>
          <Button aria-label={t("new")} onClick={() => void create()}>
            <Icon name="plus" />
          </Button>
        </header>
        <Input
          aria-label={t("search")}
          placeholder={t("search")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <nav>
          {notes
            .filter((n) =>
              (n.title + " " + n.body)
                .toLowerCase()
                .includes(query.toLowerCase()),
            )
            .map((n) => (
              <button
                key={n.id}
                aria-current={n.id === selected?.id}
                onClick={() => void select(n)}
              >
                <b>{n.title || t("untitled")}</b>
                <span>{n.body.slice(0, 80) || t("emptyNote")}</span>
                <time>
                  {new Intl.DateTimeFormat(locale, {
                    dateStyle: "short",
                  }).format(n.updatedAt)}
                </time>
              </button>
            ))}
        </nav>
      </aside>
      <section className={s.editor}>
        {selected ? (
          <>
            <header>
              <span>{dirty ? t("unsaved") : t("saved")}</span>
              <Button
                disabled={saving || !dirty}
                variant="primary"
                onClick={() => void save()}
              >
                {saving ? t("saving") : t("save")}
              </Button>
              {selected.revision > 0 && (
                <Button
                  onClick={async () => {
                    if (!(await view.ui.confirm(t("deleteConfirm")))) return;
                    try {
                      await view.call("remove", {
                        id: selected.id,
                        revision: selected.revision,
                      });
                      setSelected(null);
                      setDirty(false);
                      await refresh();
                    } catch (e) {
                      setError(String(e));
                    }
                  }}
                >
                  {t("delete")}
                </Button>
              )}
            </header>
            <Input
              aria-label={t("title")}
              placeholder={t("title")}
              value={selected.title}
              disabled={saving}
              onChange={(e) => {
                setSelected({ ...selected, title: e.target.value });
                setDirty(true);
              }}
            />
            <Textarea
              aria-label={t("body")}
              placeholder={t("body")}
              value={selected.body}
              disabled={saving}
              onChange={(e) => {
                setSelected({ ...selected, body: e.target.value });
                setDirty(true);
              }}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                  e.preventDefault();
                  void save();
                }
              }}
            />
            {error && <Notice>{error}</Notice>}
          </>
        ) : (
          <div className={s.empty}>
            <Icon name="note" />
            <h2>{t("welcome")}</h2>
            <Button variant="primary" onClick={() => void create()}>
              {t("new")}
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <ApplicationProvider view={view}>
    <Page />
  </ApplicationProvider>,
);
