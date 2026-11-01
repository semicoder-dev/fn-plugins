import { z } from "@semicoder/fn-sdk/contract";
import {
  spec,
  offer,
  query,
  type Query,
  type Model,
  type Offer,
} from "./contract.ts";

const providerModel = spec.extend({
  canonical_model_id: z.string().optional(),
  cost: offer.shape.cost,
});
export const catalogSchema = z
  .object({
    models: z.record(z.string(), spec),
    providers: z.record(
      z.string(),
      z.object({
        id: z.string(),
        name: z.string(),
        doc: z.string().optional(),
        models: z.record(z.string(), providerModel),
      }),
    ),
  })
  .refine((data) => Object.keys(data.models).length > 0, "模型目录为空");
export type Catalog = z.infer<typeof catalogSchema>;
export class CatalogIndex {
  models: Model[];
  offers = new Map<string, Offer[]>();
  labs: string[];
  types: string[];
  inputs: string[];
  constructor(data: Catalog) {
    for (const [providerId, provider] of Object.entries(data.providers)) {
      for (const [modelId, item] of Object.entries(provider.models)) {
        // Match the site's resolveCanonicalModelId: explicit, full ID, provider-scoped ID.
        // No fuzzy name matching: aliases from different labs must remain separate.
        const id = [
          item.canonical_model_id,
          modelId,
          `${providerId}/${modelId}`,
        ].find((candidate): candidate is string =>
          Boolean(candidate && Object.hasOwn(data.models, candidate)),
        );
        if (!id) continue;
        const rows = this.offers.get(id) ?? [];
        rows.push({
          providerId,
          providerName: provider.name,
          model: item,
          cost: item.cost,
          doc: provider.doc,
        });
        this.offers.set(id, rows);
      }
    }
    for (const rows of this.offers.values())
      rows.sort(
        (a, b) =>
          a.providerName.localeCompare(b.providerName) ||
          a.model.id.localeCompare(b.model.id),
      );
    this.models = Object.entries(data.models).map(([id, value]) => ({
      ...value,
      id,
      lab: id.split("/")[0]!,
      providers: this.offers.get(id)?.length ?? 0,
    }));
    this.labs = [...new Set(this.models.map((m) => m.lab))].sort();
    this.types = [...new Set(this.models.map((m) => m.type ?? "chat"))].sort();
    this.inputs = [
      ...new Set(this.models.flatMap((m) => m.modalities?.input ?? [])),
    ].sort();
  }
  list(input: Query) {
    const q = query.parse(input);
    const words = q.search
      .trim()
      .toLocaleLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    const items = this.models.filter((m) => {
      const text =
        `${m.name} ${m.id} ${m.family ?? ""} ${m.description ?? ""}`.toLocaleLowerCase();
      return (
        words.every((word) => text.includes(word)) &&
        (!q.lab || m.lab === q.lab) &&
        (!q.type || (m.type ?? "chat") === q.type) &&
        (!q.input || m.modalities?.input.includes(q.input)) &&
        (!q.capability || m[q.capability] === true)
      );
    });
    const value = (m: Model): string | number | undefined =>
      q.sort === "release"
        ? m.release_date
        : q.sort === "context" || q.sort === "output"
          ? m.limit?.[q.sort]
          : m[q.sort];
    items.sort((a, b) => {
      const x = value(a),
        y = value(b);
      if (x === undefined || y === undefined)
        return x === y ? a.id.localeCompare(b.id) : x === undefined ? 1 : -1;
      const cmp =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x).localeCompare(String(y));
      return cmp * (q.direction === "asc" ? 1 : -1) || a.id.localeCompare(b.id);
    });
    return {
      items: items.slice(q.offset, q.offset + q.limit),
      total: items.length,
      nextOffset: q.offset + q.limit < items.length ? q.offset + q.limit : null,
      labs: this.labs,
      types: this.types,
      inputs: this.inputs,
    };
  }
  detail(id: string) {
    const model = this.models.find((m) => m.id === id);
    if (!model) throw new Error("模型不存在或已从 models.dev 目录移除");
    return { model, offers: this.offers.get(id) ?? [] };
  }
}
