import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { connectView } from "@semicoder/fn-sdk/client";
import { useI18n } from "@semicoder/fn-sdk/react";
import {
  ApplicationProvider,
  Button,
  Input,
  Select,
  Notice,
  Modal,
  Icon,
} from "@semicoder/fn-ui";
import api, {
  type Query,
  type Listing,
  type Detail,
  type Offer,
} from "./contract.ts";
import s from "./style.module.css";

const view = connectView(api);
const modelURL = (id: string) =>
  "https://models.dev/models/" +
  id.split("/").map(encodeURIComponent).join("/");
function Page() {
  const { t, locale } = useI18n(view);
  const [query, setQuery] = useState<Query>({}),
    [search, setSearch] = useState("");
  const [listing, setListing] = useState<Listing>(),
    [detail, setDetail] = useState<Detail>();
  const [offer, setOffer] = useState<Offer>(),
    [error, setError] = useState("");
  const [loading, setLoading] = useState(false),
    [refreshing, setRefreshing] = useState(false);
  const [reload, setReload] = useState(0);
  const sequence = useRef(0),
    detailSequence = useRef(0);
  const number = (v?: number) =>
    v === undefined ? "—" : new Intl.NumberFormat(locale).format(v);
  const price = (v?: number) =>
    v === undefined
      ? "—"
      : new Intl.NumberFormat(locale, {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 6,
        }).format(v);
  const change = (values: Partial<Query>) =>
    setQuery((q) => ({ ...q, ...values, offset: 0 }));
  useEffect(() => {
    const timer = setTimeout(() => change({ search }), 250);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void view
      .call("list", query, { signal: controller.signal })
      .then(setListing)
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [query, reload]);
  useEffect(
    () => () => {
      detailSequence.current++;
      sequence.current++;
    },
    [],
  );
  async function open(id: string) {
    const current = ++detailSequence.current;
    setError("");
    try {
      const value = await view.call("detail", { id });
      if (current === detailSequence.current) {
        setDetail(value);
        setOffer(undefined);
      }
    } catch (e) {
      if (current === detailSequence.current) setError(String(e));
    }
  }
  async function refresh() {
    const current = ++sequence.current;
    setRefreshing(true);
    setError("");
    try {
      await view.call("refresh", {});
      if (current === sequence.current) setReload((v) => v + 1);
    } catch (e) {
      if (current === sequence.current) setError(String(e));
    } finally {
      if (current === sequence.current) setRefreshing(false);
    }
  }
  const filters = [
    { key: "lab", values: listing?.labs ?? [] },
    { key: "type", values: listing?.types ?? [] },
    { key: "input", values: listing?.inputs ?? [] },
    { key: "capability", values: ["reasoning", "tool_call", "open_weights"] },
  ] as const;
  const specRows = (model: Detail["model"] | Offer["model"]) => (
    <dl className={s.specs}>
      {[
        "family",
        "type",
        "release_date",
        "last_updated",
        "knowledge",
        "license",
        "status",
      ].map((key) => {
        const value = model[key as keyof typeof model];
        return value === undefined ? null : (
          <div key={key}>
            <dt>{t(key)}</dt>
            <dd>{String(value)}</dd>
          </div>
        );
      })}
      {["context", "input", "output"].map((key) => (
        <div key={key}>
          <dt>{t(key === "input" ? "inputLimit" : key)}</dt>
          <dd>{number(model.limit?.[key as "context"])}</dd>
        </div>
      ))}
      {[
        "reasoning",
        "tool_call",
        "open_weights",
        "attachment",
        "temperature",
        "structured_output",
      ].map((key) => (
        <div key={key}>
          <dt>{t(key)}</dt>
          <dd>
            {model[key as "reasoning"] === undefined
              ? "—"
              : t(model[key as "reasoning"] ? "yes" : "no")}
          </dd>
        </div>
      ))}
      <div>
        <dt>{t("input")}</dt>
        <dd>{model.modalities?.input.join(", ") || "—"}</dd>
      </div>
      <div>
        <dt>{t("outputModalities")}</dt>
        <dd>{model.modalities?.output.join(", ") || "—"}</dd>
      </div>
    </dl>
  );
  return (
    <main className={s.page}>
      {detail ? (
        <>
          <header className={s.header}>
            <Button
              onClick={() => {
                detailSequence.current++;
                setDetail(undefined);
                setOffer(undefined);
              }}
            >
              {t("back")}
            </Button>
            <div className={s.heading}>
              <h1>{detail.model.name}</h1>
              <span>{detail.model.id}</span>
            </div>
            <a
              href={modelURL(detail.model.id)}
              target="_blank"
              rel="noreferrer"
            >
              models.dev ↗
            </a>
          </header>
          <section className={s.details}>
            {detail.stale && <Notice>{t("stale")}</Notice>}
            {detail.model.description && <p>{detail.model.description}</p>}
            {specRows(detail.model)}
            <h2>
              {t("providers")} · {number(detail.offers.length)}
            </h2>
            <p className={s.muted}>{t("priceUnit")}</p>
            {detail.offers.length === 0 ? (
              <Notice>{t("noProviders")}</Notice>
            ) : (
              <div className={s.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      <th>{t("provider")}</th>
                      <th>{t("inputPrice")}</th>
                      <th>{t("outputPrice")}</th>
                      <th>{t("cacheRead")}</th>
                      <th>{t("cacheWrite")}</th>
                      <th>{t("details")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.offers.map((o) => (
                      <tr key={o.providerId + ":" + o.model.id}>
                        <td>
                          <b>{o.providerName}</b>
                          <small>{o.model.id}</small>
                        </td>
                        <td>{price(o.cost?.input)}</td>
                        <td>{price(o.cost?.output)}</td>
                        <td>{price(o.cost?.cache_read)}</td>
                        <td>{price(o.cost?.cache_write)}</td>
                        <td>
                          <Button
                            aria-label={
                              t("details") +
                              " " +
                              o.providerName +
                              " " +
                              o.model.id
                            }
                            onClick={() => setOffer(o)}
                          >
                            {t("details")}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      ) : (
        <>
          <header className={s.header}>
            <h1>{t("app.name")}</h1>
            <div className={s.search}>
              <Input
                aria-label={t("search")}
                placeholder={t("search")}
                value={search}
                maxLength={200}
                onChange={(e) => setSearch(e.target.value)}
                icon={<Icon name="search" />}
              />
            </div>
            <Button disabled={refreshing} onClick={() => void refresh()}>
              {t(refreshing ? "refreshing" : "refresh")}
            </Button>
          </header>
          <div className={s.filters}>
            {filters.map(({ key, values }) => (
              <Select
                key={key}
                label={t(key)}
                value={query[key] ?? ""}
                onValueChange={(value) => change({ [key]: value })}
                options={[
                  { value: "", label: t("all_" + key) },
                  ...values.map((value) => ({
                    value,
                    label: key === "capability" ? t(value) : value,
                  })),
                ]}
              />
            ))}
            <Select
              label={t("sort")}
              value={query.sort ?? "release"}
              onValueChange={(value) =>
                change({ sort: value as Query["sort"] })
              }
              options={[
                "release",
                "name",
                "lab",
                "providers",
                "context",
                "output",
              ].map((value) => ({ value, label: t(value) }))}
            />
            <Button
              aria-label={t("direction")}
              onClick={() =>
                change({
                  direction: query.direction === "asc" ? "desc" : "asc",
                })
              }
            >
              {t(query.direction === "asc" ? "ascending" : "descending")}
            </Button>
            <Button
              onClick={() => {
                setSearch("");
                setQuery({});
              }}
            >
              {t("reset")}
            </Button>
          </div>
          <div className={s.status} role="status">
            <span>
              {loading
                ? t("loading")
                : number(listing?.total) + " " + t("models")}
            </span>
            {listing && (
              <span>
                {t(listing.stale ? "stale" : "updated")} ·{" "}
                {new Date(listing.fetchedAt).toLocaleString(locale)}
              </span>
            )}
          </div>
          {listing?.warning && <Notice>{t("cacheWarning")}</Notice>}
          <div className={s.tableWrap} aria-busy={loading}>
            <table>
              <thead>
                <tr>
                  {[
                    "name",
                    "lab",
                    "providers",
                    "context",
                    "output",
                    "input",
                    "reasoning",
                  ].map((key) => (
                    <th key={key}>{t(key)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {listing?.items.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <button
                        className={s.model}
                        onClick={() => void open(m.id)}
                      >
                        <b>{m.name}</b>
                        <small>{m.id}</small>
                      </button>
                    </td>
                    <td>{m.lab}</td>
                    <td>{number(m.providers)}</td>
                    <td>{number(m.limit?.context)}</td>
                    <td>{number(m.limit?.output)}</td>
                    <td>{m.modalities?.input.join(", ") || "—"}</td>
                    <td>
                      {m.reasoning === undefined
                        ? "—"
                        : t(m.reasoning ? "yes" : "no")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!loading && listing?.total === 0 && (
            <p className={s.empty}>{t("empty")}</p>
          )}
          <footer className={s.footer}>
            <a
              href="https://models.dev/models/"
              target="_blank"
              rel="noreferrer"
            >
              models.dev ↗
            </a>
            <div>
              <Button
                disabled={loading || !query.offset}
                onClick={() =>
                  setQuery((q) => ({
                    ...q,
                    offset: Math.max(0, (q.offset ?? 0) - 50),
                  }))
                }
              >
                {t("previous")}
              </Button>
              <span>{number((query.offset ?? 0) / 50 + 1)}</span>
              <Button
                disabled={loading || listing?.nextOffset == null}
                onClick={() =>
                  setQuery((q) => ({ ...q, offset: listing?.nextOffset ?? 0 }))
                }
              >
                {t("next")}
              </Button>
            </div>
          </footer>
        </>
      )}
      {error && (
        <Notice>
          {t("requestFailed")} · {error}
          <Button
            onClick={() =>
              detail ? void open(detail.model.id) : void refresh()
            }
          >
            {t("retry")}
          </Button>
        </Notice>
      )}
      {offer && (
        <Modal
          title={offer.providerName}
          wide
          onClose={() => setOffer(undefined)}
        >
          <div className={s.offer}>
            <code>{offer.model.id}</code>
            {specRows(offer.model)}
            <p className={s.muted}>{t("priceUnit")}</p>
            <dl className={s.specs}>
              {["input", "output", "cache_read", "cache_write"].map((key) => (
                <div key={key}>
                  <dt>{t("cost_" + key)}</dt>
                  <dd>{price(offer.cost?.[key] as number | undefined)}</dd>
                </div>
              ))}
            </dl>
            {offer.cost &&
              Object.keys(offer.cost).some(
                (k) =>
                  !["input", "output", "cache_read", "cache_write"].includes(k),
              ) && (
                <details>
                  <summary>{t("tiers")}</summary>
                  <pre>
                    {JSON.stringify(
                      Object.fromEntries(
                        Object.entries(offer.cost).filter(
                          ([k]) =>
                            ![
                              "input",
                              "output",
                              "cache_read",
                              "cache_write",
                            ].includes(k),
                        ),
                      ),
                      null,
                      2,
                    )}
                  </pre>
                </details>
              )}
          </div>
        </Modal>
      )}
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <ApplicationProvider view={view}>
    <Page />
  </ApplicationProvider>,
);
