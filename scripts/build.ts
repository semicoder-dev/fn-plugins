import { buildPlugin, packPlugin } from "@semicoder/fn-sdk/build";
for (const app of ["translate", "notes", "kanban", "models-dev"])
  console.log(
    JSON.stringify(
      await (process.argv.includes("--pack") ? packPlugin : buildPlugin)(
        "plugins/" + app,
      ),
    ),
  );
