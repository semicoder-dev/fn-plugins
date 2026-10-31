import { connectView } from "@semicoder/fn-sdk/client";
import contract from "./contract.ts";
export const view = connectView(contract);
