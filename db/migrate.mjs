// Applies each db/migrations/*.sql once, in order. Run: node --env-file-if-exists=.env db/migrate.mjs

import { readdir, readFile } from "node:fs/promises";
import { query, transaction, close } from "../db.js";

const DIR = new URL("./migrations/", import.meta.url);

await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT        NOT NULL PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
`);

let applied = new Set(
    (await query("SELECT filename FROM schema_migrations")).rows.map((r) => r.filename)
);

let files = (await readdir(DIR)).filter((f) => f.endsWith(".sql")).sort();
let pending = files.filter((f) => !applied.has(f));

if (pending.length === 0) {
    console.log(`nothing to do: ${files.length} migration(s) already applied`);
    await close();
    process.exit(0);
}

for (const file of pending) {
    let sql = await readFile(new URL(file, DIR), "utf8");

    try {
        // The change and its record commit together, or a crash would run it twice.
        await transaction(async (q) => {
            await q(sql);
            await q("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
        });
        console.log("applied", file);
    } catch (err) {
        console.error(`\nFAILED on ${file}`);
        console.error(err.message);
        console.error("\nNothing was applied from that file. Fix it and run again.");
        await close();
        process.exit(1);
    }
}

console.log(`done: ${pending.length} applied, ${files.length} total`);
await close();
