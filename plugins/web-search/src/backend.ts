import { definePlugin, defineMethod, z } from "@semicoder/fn-sdk/runtime";
import type { ChatEventContext } from "@semicoder/fn-sdk/chat";
import {
  configuredModel,
  startResearch,
  waitForResearch,
  report,
  chatText,
  splitChatText,
} from "./research";

const input = z.strictObject({
  query: z.string().trim().min(1).max(16000),
  modelId: z.string().min(1),
  sessionId: z.string().min(1).optional(),
});
const selection = z.strictObject({
  requestId: z.string(),
  query: z.string().max(16000),
  conversationId: z.string(),
});
const chatKey = (ctx: ChatEventContext) => "chat-session:" + ctx.conversationId;
const pendingKey = (ctx: ChatEventContext) => "chat-model:" + ctx.conversationId;

async function cancelModelCard(ctx: ChatEventContext) {
  const previous = selection.safeParse(ctx.kv.get(pendingKey(ctx)));
  if (previous.success) {
    const item = await ctx.chat!.get(previous.data.requestId);
    if (item?.state?.phase === "pending") await ctx.chat!.cancel(previous.data.requestId);
  }
  await ctx.kv.delete(pendingKey(ctx));
}

async function send(ctx: ChatEventContext, text: string) {
  for (const chunk of splitChatText(text)) {
    ctx.signal.throwIfAborted();
    await ctx.chat!.sendText(chunk);
  }
}
async function chooseModel(ctx: ChatEventContext, query = "") {
  const models = ctx.models
    .list()
    .filter((m) => m.configured)
    .slice(0, 50);
  if (!models.length) {
    await send(ctx, "请先在 fn 宿主的设置中添加可用模型，再回来发送搜索问题。");
    return;
  }
  await cancelModelCard(ctx);
  const requestId = await ctx.chat!.request({
    card: {
      version: 1,
      template: "choice",
      title: "选择搜索模型",
      summary: query ? "选好后继续搜索刚才的问题。" : "用于后续搜索；切换模型会开始新话题。",
      blocks: query ? [{ type: "text", text: query.slice(0, 2000) }] : [],
      inputs: [
        {
          id: "modelId",
          label: "模型",
          type: "select",
          required: true,
          options: models.map((m) => ({ id: m.id, label: m.name.slice(0, 200) })),
        },
      ],
      actions: [{ id: "select", label: query ? "开始搜索" : "使用此模型", style: "primary" }],
    },
  });
  await ctx.kv.set(pendingKey(ctx), { requestId, query, conversationId: ctx.conversationId });
}
async function researchInChat(ctx: ChatEventContext, query: string, modelId: string) {
  ctx.signal.throwIfAborted();
  const saved = ctx.kv.get(chatKey(ctx));
  const sessions = await ctx.agents.list();
  const existing =
    typeof saved === "string"
      ? sessions.find((s) => s.id === saved && s.modelId === modelId)
      : undefined;
  let id: string | undefined;
  try {
    const session = await startResearch(
      ctx,
      query,
      modelId,
      existing?.id,
      async (s) => {
        // Save the link before starting the turn, so a restart cannot create a duplicate task.
        ctx.signal.throwIfAborted();
        await ctx.kv.set(chatKey(ctx), s.id);
        id = s.id;
      },
      ctx.signal,
    );
    const result = await waitForResearch(ctx, session.id, ctx.signal, (text) => ctx.progress(text));
    await send(ctx, chatText(result));
  } catch (error) {
    if (id) await ctx.agents.cancel(id).catch(() => {});
    if (ctx.signal.aborted) throw ctx.signal.reason;
    await send(
      ctx,
      "搜索未完成：" +
        (error instanceof Error ? error.message : "请稍后重试") +
        "\n可发送 /新话题 开始新的搜索。原记录保留在插件页面。",
    );
  }
}

export default definePlugin({
  activate(ctx) {
    if (!ctx.agents?.create || !ctx.chat?.sendText)
      throw new Error("网络搜索需要包含 Agent 和 fn Chat v2 的开发版 fn；公开 0.4.5 尚不支持。");
  },
  methods: {
    start: defineMethod("搜索或在已有话题中追问", input, (value, ctx) =>
      startResearch(ctx, value.query, value.modelId, value.sessionId),
    ),
    report: defineMethod(
      "读取答案、实际检索来源和运行进度",
      z.strictObject({ sessionId: z.string().min(1) }),
      ({ sessionId }, ctx) => report(ctx, sessionId),
    ),
    preferences: defineMethod(
      "保存网页与 fn Chat 共用的默认模型",
      z.strictObject({ modelId: z.string().min(1) }),
      async ({ modelId }, ctx) => {
        if (!configuredModel(ctx, modelId)) throw new Error("模型不可用，请重新选择");
        await ctx.kv.set("preferences", { modelId });
        return null;
      },
    ),
  },
  chat: {
    version: 1,
    timeoutMs: 600_000,
    async onMessage(message, ctx) {
      const text = message.text.trim();
      if (text === "/新话题") {
        await ctx.kv.delete(chatKey(ctx));
        await cancelModelCard(ctx);
        await send(ctx, "已开始新话题。请发送要搜索的问题。");
        return;
      }
      if (text === "/模型") {
        await chooseModel(ctx);
        return;
      }
      if (text === "/帮助") {
        await send(
          ctx,
          "直接发送问题即可搜索，继续发送可在同一话题中追问。\n/新话题：开始新的搜索\n/模型：选择模型\n搜索时会显示处理进度，后续文字按顺序处理。需要中止时，在 fn 宿主的网络搜索页面点击停止。",
        );
        return;
      }
      const model = configuredModel(ctx);
      if (!model) {
        await chooseModel(ctx, text);
        return;
      }
      await cancelModelCard(ctx);
      await researchInChat(ctx, text, model.id);
    },
    async onResponse(response, ctx) {
      const pending = selection.safeParse(ctx.kv.get(pendingKey(ctx)));
      if (
        !pending.success ||
        pending.data.requestId !== response.requestId ||
        pending.data.conversationId !== ctx.conversationId ||
        response.actionId !== "select"
      )
        throw new Error("模型选择已失效，请发送 /模型 重新选择");
      const modelId = typeof response.values.modelId === "string" ? response.values.modelId : "";
      if (!configuredModel(ctx, modelId)) {
        await chooseModel(ctx, pending.data.query);
        return;
      }
      await ctx.kv.set("preferences", { modelId });
      await ctx.kv.delete(chatKey(ctx));
      await ctx.kv.delete(pendingKey(ctx));
      if (pending.data.query) await researchInChat(ctx, pending.data.query, modelId);
      else await send(ctx, "模型已设置。请发送要搜索的问题。");
    },
  },
});
