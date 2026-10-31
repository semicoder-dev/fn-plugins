import { defineContract, method, z } from "@semicoder/fn-sdk/contract";
export const note = z.object({
  id: z.string().uuid(),
  title: z.string().max(300),
  body: z.string().max(200000),
  revision: z.number().int().nonnegative(),
  updatedAt: z.number(),
});
export default defineContract({
  list: method({ input: z.object({}), output: z.array(note) }),
  save: method({ input: note.omit({ updatedAt: true }), output: note }),
  remove: method({
    input: z.object({ id: z.string().uuid(), revision: z.number().int() }),
    output: z.null(),
  }),
});
