import { defineContract, method, stream, z } from "@semicoder/fn-sdk/contract";
export const translation = z.object({
  id: z.string().uuid(),
  source: z.string(),
  target: z.enum(["en", "zh-CN"]),
  text: z.string(),
  createdAt: z.number(),
});
export const input = z.object({
  source: z.string().trim().min(1).max(30000),
  target: z.enum(["en", "zh-CN"]),
});
export default defineContract({
  history: method({ input: z.object({}), output: z.array(translation) }),
  translate: stream({
    input,
    chunk: z.discriminatedUnion("type", [
      z.object({ type: z.literal("text"), text: z.string() }),
      z.object({ type: z.literal("completed"), record: translation }),
    ]),
  }),
});
