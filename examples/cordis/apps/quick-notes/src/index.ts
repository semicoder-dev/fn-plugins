import type { Context } from "@deepseek-ai/cordis";
import type {} from "@semicoder/fn-sdk";

export const inject = ["app"];
export function apply(ctx: Context) {
  // A normal Cordis backend may contribute methods without an Agent or Chat endpoint.
  ctx.app.method("count", () => ctx.app.kv.list().filter(item => item.key.startsWith("note:")).length);
}
