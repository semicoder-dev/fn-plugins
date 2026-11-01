import { defineContract, method, z } from "@semicoder/fn-sdk/contract";

const number = z.number().finite().nonnegative();
export const spec = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  type: z.string().optional(),
  family: z.string().optional(),
  reasoning: z.boolean().optional(),
  tool_call: z.boolean().optional(),
  attachment: z.boolean().optional(),
  temperature: z.boolean().optional(),
  structured_output: z.boolean().optional(),
  open_weights: z.boolean().optional(),
  knowledge: z.string().optional(),
  release_date: z.string().optional(),
  last_updated: z.string().optional(),
  license: z.string().optional(),
  status: z.string().optional(),
  modalities: z
    .object({ input: z.array(z.string()), output: z.array(z.string()) })
    .optional(),
  limit: z
    .object({
      context: number.optional(),
      input: number.optional(),
      output: number.optional(),
    })
    .optional(),
});
const cost = z
  .object({
    input: number.optional(),
    output: number.optional(),
    cache_read: number.optional(),
    cache_write: number.optional(),
  })
  .passthrough();
export const offer = z.object({
  providerId: z.string(),
  providerName: z.string(),
  model: spec,
  cost: cost.optional(),
  doc: z.string().optional(),
});
export const model = spec.extend({
  lab: z.string(),
  providers: z.number().int().nonnegative(),
});
export type Model = z.infer<typeof model>;
export type Offer = z.infer<typeof offer>;
export const status = z.object({
  fetchedAt: number,
  stale: z.boolean(),
  warning: z.string().nullable(),
});
export const query = z.object({
  search: z.string().max(200).default(""),
  lab: z.string().default(""),
  type: z.string().default(""),
  input: z.string().default(""),
  capability: z
    .enum(["", "reasoning", "tool_call", "open_weights"])
    .default(""),
  sort: z
    .enum(["release", "name", "lab", "providers", "context", "output"])
    .default("release"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(50),
});
export type Query = z.input<typeof query>;
export const listing = status.extend({
  items: z.array(model),
  total: z.number(),
  nextOffset: z.number().nullable(),
  labs: z.array(z.string()),
  types: z.array(z.string()),
  inputs: z.array(z.string()),
});
export const detail = status.extend({ model, offers: z.array(offer) });
export type Listing = z.infer<typeof listing>;
export type Detail = z.infer<typeof detail>;
export default defineContract({
  list: method({ input: query, output: listing }),
  detail: method({
    input: z.object({ id: z.string().min(1).max(500) }),
    output: detail,
  }),
  refresh: method({ input: z.object({}), output: status }),
});
