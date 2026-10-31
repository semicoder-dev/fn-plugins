import { Database } from "bun:sqlite";
import api, { note } from "./contract.ts";
export class NotesStore {
  db: Database;
  constructor(path: string) {
    this.db = new Database(path, { create: true });
    this.db.exec(
      "PRAGMA journal_mode=WAL;PRAGMA synchronous=FULL;CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY,title TEXT NOT NULL,body TEXT NOT NULL,revision INTEGER NOT NULL,updatedAt INTEGER NOT NULL)",
    );
  }
  list() {
    return api.list.output.parse(
      this.db.query("SELECT * FROM notes ORDER BY updatedAt DESC").all(),
    );
  }
  save(value: typeof api.save.input._output) {
    const input = api.save.input.parse(value);
    return this.db
      .transaction(() => {
        const current = this.db
          .query("SELECT revision FROM notes WHERE id=?")
          .get(input.id) as { revision: number } | null;
        if ((current?.revision ?? 0) !== input.revision)
          throw new Error("conflict");
        const result = {
          ...input,
          revision: input.revision + 1,
          updatedAt: Date.now(),
        };
        this.db
          .query(
            "INSERT INTO notes VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,body=excluded.body,revision=excluded.revision,updatedAt=excluded.updatedAt",
          )
          .run(
            result.id,
            result.title,
            result.body,
            result.revision,
            result.updatedAt,
          );
        return note.parse(result);
      })
      .immediate();
  }
  remove(input: typeof api.remove.input._output) {
    const result = this.db
      .query("DELETE FROM notes WHERE id=? AND revision=?")
      .run(input.id, input.revision);
    if (!result.changes) throw new Error("conflict");
    return null;
  }
  close() {
    this.db.close();
  }
}
