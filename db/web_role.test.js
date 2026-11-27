// The web account (db/web_role.sql) reads everything and writes nothing.
// Skipped unless WEB_DB_USER and WEB_DB_PASSWORD are set, so a checkout
// without the role still passes.
import test, { before, after } from "node:test";
import assert from "node:assert";
import pg from "pg";

const ready = Boolean(process.env.WEB_DB_USER && process.env.WEB_DB_PASSWORD);
let web;

before(async () => {
    if (!ready) return;
    web = new pg.Client({
        host:     process.env.DB_HOST,
        port:     Number(process.env.DB_PORT),
        database: process.env.DB_NAME,
        user:     process.env.WEB_DB_USER,
        password: process.env.WEB_DB_PASSWORD,
    });
    await web.connect();
});

after(async () => {
    if (web) await web.end();
});

// 42501 is "insufficient privilege", 25006 "read-only transaction".
async function refused(sql) {
    await assert.rejects(web.query(sql), (err) => ["42501", "25006"].includes(err.code));
}

test("reads tables and the search view", { skip: !ready }, async () => {
    const { rows } = await web.query(
        "SELECT (SELECT count(*) FROM entry) AS entries, (SELECT count(*) FROM doc) AS docs");
    assert.ok(Number(rows[0].entries) > 0);
    assert.ok(Number(rows[0].docs) > 0);
});

test("every table and view in public is readable", { skip: !ready }, async () => {
    const { rows } = await web.query(`
        SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'm')
          AND NOT has_table_privilege(c.oid, 'SELECT')`);
    assert.deepStrictEqual(rows, []);
});

test("cannot change a row", { skip: !ready }, async () => {
    await refused("INSERT INTO entry (id) VALUES ('ZZWR')");
    await refused("UPDATE entry SET id = id WHERE false");
    await refused("DELETE FROM entry WHERE false");
    await refused("TRUNCATE entry");
});

test("cannot change the schema or the search view", { skip: !ready }, async () => {
    await refused("CREATE TABLE web_probe (x int)");
    await refused("DROP TABLE entry");
    await refused("REFRESH MATERIALIZED VIEW doc");
});

test("cannot switch its session out of read-only", { skip: !ready }, async () => {
    // Even with read-only turned off, the missing grants still refuse the write.
    await web.query("BEGIN READ WRITE");
    try {
        await refused("INSERT INTO entry (id) VALUES ('ZZWR')");
    } finally {
        await web.query("ROLLBACK");
    }
});
