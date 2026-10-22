import index from "../marketplace.json";
if (index.schemaVersion !== 3 || !index.name || index.plugins.length) throw new Error("The plugins-v1 candidate market must remain empty until verified plugins are explicitly published");
console.log("Validated empty plugins-v1 market (schema 3)");
