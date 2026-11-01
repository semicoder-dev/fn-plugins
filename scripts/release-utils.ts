export const applicationNames = [
  "translate",
  "notes",
  "kanban",
  "models-dev",
] as const;
export interface CatalogEntry {
  id: string;
  version: string;
  name: string;
  description: string;
  url: string;
  sha256: string;
}
export interface Catalog {
  schema: 1;
  applications: CatalogEntry[];
}
export function releaseIdentity(version: string, scope = "all") {
  if (
    !/^\d+\.\d+\.\d+$/.test(version) ||
    (scope !== "all" && !applicationNames.includes(scope as any))
  )
    throw new Error("Expected release version and application name (or all)");
  return {
    tag: scope === "all" ? `apps-v${version}` : `${scope}-v${version}`,
    names: scope === "all" ? [...applicationNames] : [scope],
  };
}
export function readCatalog(value: unknown): Catalog {
  const catalog = value as Catalog;
  if (catalog?.schema !== 1 || !Array.isArray(catalog.applications))
    throw new Error("Invalid application catalog");
  const ids = new Set<string>();
  for (const entry of catalog.applications) {
    if (
      !entry ||
      !applicationNames.some((name) => entry.id === `fn-${name}`) ||
      ids.has(entry.id) ||
      !/^\d+\.\d+\.\d+$/.test(entry.version) ||
      typeof entry.name !== "string" ||
      !entry.name ||
      typeof entry.description !== "string" ||
      !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      !/^https:\/\/github\.com\/semicoder-dev\/fn-plugins\/releases\/download\/[a-zA-Z0-9._-]+\/fn-[a-z0-9.-]+\.fn\.tgz$/.test(
        entry.url,
      ) ||
      !entry.url.endsWith(`/${entry.id}-${entry.version}.fn.tgz`)
    )
      throw new Error("Invalid or duplicate application catalog entry");
    ids.add(entry.id);
  }
  return catalog;
}
export function mergeCatalog(
  baseline: Catalog,
  released: CatalogEntry[],
): Catalog {
  readCatalog(baseline);
  readCatalog({ schema: 1, applications: released });
  const items = new Map(baseline.applications.map((app) => [app.id, app]));
  for (const app of released) items.set(app.id, app);
  return readCatalog({ schema: 1, applications: [...items.values()] });
}
