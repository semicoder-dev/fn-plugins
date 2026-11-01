import { expect, test } from "bun:test";
import {
  releaseIdentity,
  mergeCatalog,
  readCatalog,
  type CatalogEntry,
} from "../../../scripts/release-utils.ts";
const entry = (id: string, version = "0.2.0"): CatalogEntry => ({
  id,
  version,
  name: id,
  description: "test",
  sha256: "a".repeat(64),
  url: `https://github.com/semicoder-dev/fn-plugins/releases/download/apps-v${version}/${id}-${version}.fn.tgz`,
});
test("single application release preserves previous URLs and digests", () => {
  const previous = [
    entry("fn-translate"),
    entry("fn-notes"),
    entry("fn-kanban"),
  ];
  const baseline = readCatalog({ schema: 1, applications: previous });
  const result = mergeCatalog(baseline, [entry("fn-models-dev")]);
  expect(result.applications.slice(0, 3)).toEqual(previous);
  expect(baseline.applications).toHaveLength(3);
  expect(result.applications).toHaveLength(4);
  expect(
    mergeCatalog(result, [entry("fn-models-dev", "0.2.1")]).applications[3]
      ?.version,
  ).toBe("0.2.1");
});
test("release identity and catalog reject ambiguous or untrusted entries", () => {
  expect(releaseIdentity("0.2.0", "models-dev").tag).toBe("models-dev-v0.2.0");
  expect(releaseIdentity("0.2.0").tag).toBe("apps-v0.2.0");
  expect(() => releaseIdentity("0.2.0", "../notes")).toThrow();
  expect(() => releaseIdentity("latest")).toThrow();
  const app = entry("fn-notes");
  expect(() => readCatalog({ schema: 1, applications: [app, app] })).toThrow();
  expect(() =>
    readCatalog({
      schema: 1,
      applications: [{ ...app, url: "https://example.com/notes.fn.tgz" }],
    }),
  ).toThrow();
  expect(() =>
    readCatalog({ schema: 1, applications: [{ ...app, sha256: "wrong" }] }),
  ).toThrow();
});
