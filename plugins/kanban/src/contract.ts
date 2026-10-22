import { defineAPI, z } from "@semicoder/fia/api";

const id = z.string().uuid();
const title = z.string().trim().min(1, "请输入名称").max(200);
export const colors = ["green", "blue", "purple", "yellow", "orange", "red"] as const;
export const colorNames = {
  green: "绿色",
  blue: "蓝色",
  purple: "紫色",
  yellow: "黄色",
  orange: "橙色",
  red: "红色",
};
const checklist = z
  .array(z.object({ id, text: title, done: z.boolean() }))
  .max(100)
  .refine((items) => new Set(items.map((item) => item.id)).size === items.length, "检查项 ID 重复");
export const cardDetails = z.object({
  title,
  description: z.string().max(20000),
  labels: z.array(z.enum(colors)).max(6),
  due: z.iso.date().nullable(),
  done: z.boolean(),
  checklist,
});
const board = z.object({ id, title, archived: z.boolean() });
const list = z.object({ id, boardId: id, title, archived: z.boolean() });
export const card = cardDetails.extend({
  id,
  listId: id,
  archived: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export const state = z.object({
  revision: z.number().int().nonnegative(),
  boards: z.array(board).max(100),
  lists: z.array(list).max(1000),
  cards: z.array(card).max(10000),
});
export type State = z.infer<typeof state>;
export type Card = z.infer<typeof card>;
export type Details = z.infer<typeof cardDetails>;
export const command = z.discriminatedUnion("type", [
  z.object({ type: z.literal("board.create"), title }),
  z.object({ type: z.literal("board.rename"), id, title }),
  z.object({ type: z.literal("board.archive"), id, archived: z.boolean() }),
  z.object({ type: z.literal("list.create"), boardId: id, title }),
  z.object({ type: z.literal("list.rename"), id, title }),
  z.object({ type: z.literal("list.archive"), id, archived: z.boolean() }),
  z.object({ type: z.literal("list.move"), id, beforeId: id.nullable() }),
  z.object({ type: z.literal("card.create"), listId: id, title }),
  z.object({ type: z.literal("card.edit"), id, details: cardDetails }),
  z.object({ type: z.literal("card.archive"), id, archived: z.boolean() }),
  z.object({ type: z.literal("card.move"), id, listId: id, beforeId: id.nullable() }),
]);
export type Command = z.infer<typeof command>;
export const mutation = z.object({
  requestId: id,
  revision: z.number().int().nonnegative(),
  command,
});
export type Mutation = z.infer<typeof mutation>;
export default defineAPI({
  methods: {
    read: { description: "读取本机看板", input: z.object({}), output: state },
    mutate: {
      description: "事务保存看板变更",
      input: mutation,
      output: z.object({ state, createdId: id.optional() }),
    },
  },
  events: {
    changed: { description: "本地看板已保存", payload: z.object({ revision: z.number() }) },
  },
});
