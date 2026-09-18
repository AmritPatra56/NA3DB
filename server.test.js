// server.test.js - checks the routes: status codes, formats, and what is
// deliberately not downloadable. Imports the app and runs it on a free port.

import test, { before, after } from "node:test";
import assert from "node:assert";
import { once } from "node:events";
import app from "./server.js";

let base;
let server;

// One server for the whole file. Port 0 means "any free port", so these tests
// can run while npm run dev is already using 4000.
before(async () => {
    server = app.listen(0);
    await once(server, "listening");
    base = `http://localhost:${server.address().port}`;
});

// Without this the test process never exits.
after(() => server.close());


// --- pages --------------------------------------------------------------

test("the search page is served at /", async () => {
    let res = await fetch(base + "/");

    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /html/);
});

test("the report page is served at /report", async () => {
    assert.equal((await fetch(base + "/report")).status, 200);
});

test("a structure page is built from our own data", async () => {
    let res = await fetch(base + "/structure/4TNA");
    let html = await res.text();

    assert.equal(res.status, 200);
    // curl runs no JavaScript, so finding this proves the server rendered it.
    assert.match(html, /FURTHER REFINEMENT/);
});

test("a structure page ignores case in the id", async () => {
    assert.equal((await fetch(base + "/structure/4tna")).status, 200);
});

test("an unknown structure is a real 404, not a 200 that says not found", async () => {
    assert.equal((await fetch(base + "/structure/ZZZZ")).status, 404);
});


// --- the API ------------------------------------------------------------

test("/api/health answers without touching the data", async () => {
    assert.deepEqual(await (await fetch(base + "/api/health")).json(), { ok: true });
});

test("/api/entries returns a page and the counts to draw pagination", async () => {
    let body = await (await fetch(base + "/api/entries")).json();

    assert.ok(Array.isArray(body.results));
    for (const key of ["total", "page", "pages", "page_size"]) {
        assert.equal(typeof body[key], "number", `${key} should be a number`);
    }
});

test("/api/entries applies its filters", async () => {
    let body = await (await fetch(base + "/api/entries?entry_id=tna")).json();

    assert.ok(body.results.length > 0);
    for (const entry of body.results) {
        assert.ok(entry.pdb_id.toLowerCase().includes("tna"));
    }
});

test("/api/entries/:id returns that one entry", async () => {
    let body = await (await fetch(base + "/api/entries/4tna")).json();

    assert.equal(body.pdb_id, "4TNA");
});

test("an unknown id is 404 with a readable message", async () => {
    let res = await fetch(base + "/api/entries/ZZZZ");

    assert.equal(res.status, 404);
    assert.match((await res.json()).error, /ZZZZ/);
});

test("an impossible query is 400, not 500", async () => {
    let res = await fetch(base + "/api/entries?confal_min=9&confal_max=2");

    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /cannot be higher/);
});


// --- the right format for the right caller ------------------------------

test("an unknown /api path answers in JSON", async () => {
    let res = await fetch(base + "/api/nonsense");

    assert.equal(res.status, 404);
    assert.match(res.headers.get("content-type"), /json/);
});

test("an unknown page answers in HTML", async () => {
    let res = await fetch(base + "/nonsense");

    assert.equal(res.status, 404);
    assert.match(res.headers.get("content-type"), /html/);
});


// --- what must never be downloadable ------------------------------------

// Everything in public/ is public. Everything else must not be reachable,
// or a visitor could read the server source or the raw templates.
const private_files = [
    "/server.js",
    "/search.js",
    "/entries.json",
    "/index.ejs",
    "/structure.ejs",
    "/views/index.ejs",
    "/package.json",
    "/.env"
];

for (const path of private_files) {
    test(`${path} is not downloadable`, async () => {
        assert.equal((await fetch(base + path)).status, 404);
    });
}

test("but public files are", async () => {
    for (const path of ["/style.css", "/app.js", "/assets/search.svg"]) {
        assert.equal((await fetch(base + path)).status, 200, path);
    }
});
