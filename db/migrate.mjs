// migrate.mjs - applies any migration that has not run yet.
// Run: node --env-file-if-exists=.env db/migrate.mjs
//
// Each .sql file in db/migrations/ runs once, in filename order, in a
// transaction, and is recorded in schema_migrations. Running it again does
// nothing, which is what makes it safe to call from a deploy script.

import { readdir, readFile } from "node:fs/promises";
import { query, transaction, close } from "../db.js";

const DIR = new URL("./migrations/", import.meta.url);

// The table that remembers. Created on the first run, before anything else.
await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
        filename   TEXT        NOT NULL PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
`);

let applied = new Set(
    (await query("SELECT filename FROM schema_migrations")).rows.map((r) => r.filename)
);

// Sorted by name, which is why every file starts 001_, 002_, 003_.
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
        // The change and its record land together, or a crash between them
        // leaves the change applied but unrecorded and it runs twice.
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
