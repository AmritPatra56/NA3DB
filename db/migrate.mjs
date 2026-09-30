// migrate.mjs - applies any migration that has not run yet.
//
// Run:  node --env-file-if-exists=.env db/migrate.mjs
//
// Every .sql file in db/migrations/ runs once, in filename order, inside a
// transaction. What has run is recorded in schema_migrations, so running this
// a second time does nothing — which is what makes it safe in a deploy script.
//
// Why this exists: once real data is loaded, the schema can only be changed by
// adding to it. "Wipe and reload init.sql" stops being an option the moment a
// reload takes an hour.

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
    console.log(`nothing to do — ${files.length} migration(s) already applied`);
    await close();
    process.exit(0);
}

for (const file of pending) {
    let sql = await readFile(new URL(file, DIR), "utf8");

    try {
        // The change and the record of it land together, or neither does.
        // Otherwise a crash between them leaves a change applied but
        // unrecorded, and the next run applies it a second time.
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

console.log(`done — ${pending.length} applied, ${files.length} total`);
await close();
