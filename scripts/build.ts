import { buildPlugin, packPlugin } from "@semicoder/fn-sdk/build";
for (const app of ["translate", "notes", "kanban"])
  console.log(
    JSON.stringify(
      await (process.argv.includes("--pack") ? packPlugin : buildPlugin)(
        "plugins/" + app,
      ),
    ),
  );
