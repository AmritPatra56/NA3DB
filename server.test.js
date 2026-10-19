// server.test.js - checks the routes: status codes, formats, and what is
// deliberately not downloadable. Imports the app and runs it on a free port.

import test, { before, after } from "node:test";
import assert from "node:assert";
import { FILTERS, COLUMNS, TEXT_FILTERS, PILL_FILTERS, EXAMPLES } from "./filters.js";
import { once } from "node:events";
import app from "./server.js";
import { close as close_db } from "./db.js";

let base;
let server;

// One server for the whole file. Port 0 means "any free port", so these tests
// can run while npm run dev is already using 4000.
before(async () => {
    server = app.listen(0);
    await once(server, "listening");
    base = `http://localhost:${server.address().port}`;
});

// Both of these or the test process never exits: the HTTP server holds the
// port, and the database pool holds its connections for idleTimeoutMillis.
after(async () => {
    server.close();
    await close_db();
});


// --- pages --------------------------------------------------------------

test("the search page is served at /", async () => {
    let res = await fetch(base + "/search");

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

test("/api/health reports the database is reachable", async () => {
    let res = await fetch(base + "/api/health");
    let body = await res.json();

    assert.equal(res.status, 200);
    assert.deepEqual(body, { ok: true, database: "up" });
});

// Asserts the TYPE, not the value. 120 becomes 1,489 when the real structures
// are loaded, and that is not a reason for a test to go red.
test("/api/stats counts the entries in the database", async () => {
    let res = await fetch(base + "/api/stats");
    let body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(typeof body.total, "number");
    assert.ok(body.total > 0);
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

// --- the report needs a search ------------------------------------------
// A report covers a search, so there is no way to reach it before making one.
test("/report with no search sends you to /search", async () => {
    let res = await fetch(base + "/report", { redirect: "manual" });

    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/search");
});

// A layout choice is not a search, so it must not get past the gate.
test("a display parameter alone does not open the report", async () => {
    for (const query of ["fields=closed", "view=lines", "sort=confal_desc",
                         "per_page=50", "page=3"]) {
        let res = await fetch(base + "/report?" + query, { redirect: "manual" });

        assert.equal(res.status, 302, `/report?${query} should be turned away`);
    }
});

test("the field list opens or closes from the URL", async () => {
    let open  = await (await fetch(base + "/report?q=tRNA")).text();
    let shut  = await (await fetch(base + "/report?q=tRNA&fields=closed")).text();

    assert.match(open, /class="query_panel "/);
    assert.match(open, /fields_toggle"[\s\S]*?aria-expanded="true"/);

    assert.match(shut, /class="query_panel hidden"/);
    assert.match(shut, /fields_toggle"[\s\S]*?aria-expanded="false"/);
});

test("/report with a search opens", async () => {
    for (const query of ["q=tRNA", "entry_id=tna", "polymer_type=Protein%2FNA"]) {
        let res = await fetch(base + "/report?" + query);

        assert.equal(res.status, 200, `/report?${query} should open`);
        assert.match(await res.text(), /report_fields/);
    }
});

test("the landing page does not offer the report", async () => {
    let landing = await (await fetch(base + "/")).text();
    let search  = await (await fetch(base + "/search")).text();

    assert.ok(!landing.includes('href="/report"'),
              "the landing page must not link to the report");
    assert.ok(search.includes('href="/report"'),
              "the search page must");
});

// --- the front door ------------------------------------------------------
test("/ is the landing page, not the search page", async () => {
    let res  = await fetch(base + "/");
    let html = await res.text();

    assert.equal(res.status, 200);
    assert.match(html, /NA3DB/);
    assert.match(html, /Nucleic Acid 3D Database/);

    // The thing that makes it the landing page: no filter panel.
    assert.ok(!html.includes("query_panel"), "the landing page carries no filters");
});

// The box submits natively: a real action and method, and a real submit
// button. landing.js adds the live count on top, but nothing here depends on
// it, so the page still works if that script never loads.
test("the landing box is a form that needs no JavaScript", async () => {
    let html = await (await fetch(base + "/")).text();

    assert.match(html, /<form[^>]+action="\/search"[^>]+method="get"/);
    assert.match(html, /name="q"/);
    assert.match(html, /<button type="submit"/);

    assert.ok(!/onsubmit=|onclick=/.test(html),
              "nothing on this page may need a handler to work");
});

test("the landing page links to the filter panel", async () => {
    let html = await (await fetch(base + "/")).text();

    assert.match(html, /landing_advanced" href="\/search"/);
});

test("every example is a link, labelled by what kind of thing it is", async () => {
    let html = await (await fetch(base + "/")).text();
    let reg  = await (await fetch(base + "/api/fields")).json();

    assert.equal(reg.examples.length, EXAMPLES.length);

    for (const example of reg.examples) {
        assert.ok(html.includes(`href="${example.url}"`),
                  `no chip linking to ${example.url}`);
        assert.ok(html.includes(example.kind),
                  `${example.term} is not labelled by kind`);
    }

    // Each one shows a different kind of thing, which is what makes the line
    // teach rather than just list.
    let kinds = reg.examples.map((e) => e.kind);
    assert.equal(new Set(kinds).size, kinds.length, "two examples share a kind");
});

// The examples are picked for the real database, and na3db_test holds 120
// different entries, so not every one can match here. What this does catch is
// a broken q filter or an example that is not a searchable string at all.
test("the examples are answerable, and some of them match", async () => {
    let reg = await (await fetch(base + "/api/fields")).json();
    let matched = 0;

    for (const example of reg.examples) {
        // The chip's own URL, asked of the API rather than the page.
        let res  = await fetch(base + "/api/entries" + example.url.slice("/search".length));
        let body = await res.json();

        assert.equal(res.status, 200, `the example "${example.term}" is not a valid search`);
        assert.equal(typeof body.total, "number");

        if (body.total > 0) matched++;
    }

    assert.ok(matched > 0, "not one example matches anything, so the box is broken");
});

// Every link made before the split carried the search on /. Those have to keep
// working, so / with a query is sent on rather than shown the landing page.
test("an old bookmark on / is redirected to /search", async () => {
    for (const query of ["entry_id=tna", "polymer_type=Protein%2FNA&page=3",
                         "q=tRNA&sort=confal_desc"]) {
        let res = await fetch(base + "/?" + query, { redirect: "manual" });

        assert.equal(res.status, 301, `/?${query} should be redirected`);
        assert.equal(res.headers.get("location"), "/search?" + query);
    }
});

test("/search is the page that was on / before", async () => {
    let res  = await fetch(base + "/search");
    let html = await res.text();

    assert.equal(res.status, 200);
    assert.ok(html.includes("query_panel"), "the filter panel lives here now");
    assert.ok(html.includes("results_list"));
});

// --- the registry endpoint ----------------------------------------------
// A promise rather than a behaviour: no SQL crosses this line. It fails the
// day a field reaches the whitelist by accident.
test("/api/fields never ships the SQL", async () => {
    let body = (await (await fetch(base + "/api/fields")).text()).toUpperCase();

    for (const word of ["SELECT", "WHERE", "EXISTS", "ILIKE", "COALESCE",
                        "STRING_AGG", "ENTITY_POLY_SEQ", "E.ID"]) {
        assert.ok(!body.includes(word), `the response must not contain ${word}`);
    }
});

test("/api/fields describes every filter and column", async () => {
    let body = await (await fetch(base + "/api/fields")).json();

    // Counted against the registry rather than a number typed here, so adding
    // a filter does not mean editing this test. What it still catches is the
    // whitelist silently dropping one.
    assert.deepEqual(body.filters.map((f) => f.key), FILTERS.map((f) => f.key));
    assert.deepEqual(body.columns.map((c) => c.key), COLUMNS.map((c) => c.key));
    assert.deepEqual(body.text_filters, TEXT_FILTERS);
    assert.deepEqual(body.pill_filters, PILL_FILTERS);

    // Checked across every filter rather than the first one, so adding a UI
    // field to one of them cannot quietly change what this proves: the keys
    // are drawn from the allowed set, and nothing carrying SQL is among them.
    const FILTER_FIELDS = ["key", "label", "group", "kind", "prominent",
                           "options", "any", "placeholder", "pair_with"];
    const COLUMN_FIELDS = ["key", "label", "group", "scope", "show"];

    for (const filter of body.filters) {
        for (const field of Object.keys(filter)) {
            assert.ok(FILTER_FIELDS.includes(field),
                      `${filter.key} ships an unexpected field: ${field}`);
        }
        assert.ok(!("where" in filter) && !("clause" in filter),
                  `${filter.key} ships its SQL`);
    }

    for (const column of body.columns) {
        for (const field of Object.keys(column)) {
            assert.ok(COLUMN_FIELDS.includes(field),
                      `${column.key} ships an unexpected field: ${field}`);
        }
        assert.ok(!("select" in column), `${column.key} ships its SQL`);
    }
});

// The injected copy in the page is the one the browser actually runs on.
test("the search page carries the registry and not the SQL", async () => {
    let html = (await (await fetch(base + "/search")).text());

    assert.match(html, /window\.REGISTRY = \{/);
    assert.ok(!/ILIKE|string_agg|entity_poly_seq/i.test(html),
              "the page must not contain SQL");
});

// --- the filter panel, open or closed ------------------------------------
// Decided on the server so the page arrives in the right state, with no flash
// of filters appearing and then collapsing.
const PANEL_CASES = [
    ["/search",                                   true,  "the Advanced search link"],
    ["/search?q=tRNA",                            false, "a search from the box"],
    ["/search?q=tRNA&page=3&sort=confal_desc",    false, "...paged and sorted"],
    ["/search?entry_id=tna",                      true,  "an old bookmark using a filter"],
    ["/search?q=tRNA&polymer_type=Protein%2FNA",  true,  "the box plus a filter"],
    ["/search?q=",                                true,  "an empty box"],
    ["/search?q=tRNA&panel=open",                 true,  "the toggle says open"],
    ["/search?panel=closed",                      false, "the toggle says closed"],
    ["/search?q=tRNA&view=lines",                 false, "a layout choice, not a filter"]
];

for (const [url, open, why] of PANEL_CASES) {
    test(`the panel is ${open ? "open" : "closed"} for ${why}`, async () => {
        let html = await (await fetch(base + url)).text();
        let tag  = html.match(/class="query_panel ([^"]*)"/);

        assert.ok(tag, "the panel should be on the page either way");
        assert.equal(!tag[1].includes("hidden"), open);
    });
}

test("the toggle reports the state it is in", async () => {
    let shut = await (await fetch(base + "/search?q=tRNA")).text();
    let open = await (await fetch(base + "/search")).text();

    assert.match(shut, /class="filters_toggle"\s+aria-expanded="false"/);
    assert.match(open, /class="filters_toggle"\s+aria-expanded="true"/);
});

// --- the prominent filter ------------------------------------------------
// q is drawn above the panel rather than inside it. The input keeps its id, so
// read_filters still finds it, and carries form="query_form" so Enter submits
// the panel it no longer sits in.
test("a prominent filter is drawn above the panel, not inside it", async () => {
    let html = await (await fetch(base + "/search")).text();
    let reg  = await (await fetch(base + "/api/fields")).json();

    let prominent = reg.filters.filter((f) => f.prominent);
    assert.ok(prominent.length > 0, "something should be prominent");

    for (const f of prominent) {
        assert.ok(!html.includes(`<label for="${f.key}">`),
                  `${f.key} is still drawn as a panel field`);

        let bar = html.slice(html.indexOf('class="top_search"'),
                             html.indexOf('class="workspace_body"'));

        assert.ok(bar.includes(`id="${f.key}"`), `${f.key} is not in the top bar`);
        assert.ok(bar.includes('form="query_form"'),
                  "the top input must submit the panel's form");
    }
});

test("every other filter is still drawn inside the panel", async () => {
    let html = await (await fetch(base + "/search")).text();
    let reg  = await (await fetch(base + "/api/fields")).json();

    for (const f of reg.filters.filter((x) => !x.prominent)) {
        if (f.kind === "pills") {
            assert.ok(html.includes(`data-name="${f.key}"`), `no pills for ${f.key}`);
        } else {
            assert.ok(html.includes(`name="${f.key}"`), `no input for ${f.key}`);
        }
    }
});

// --- the generated form -------------------------------------------------
// A filter in the registry is a control on the form. Fails if one is added
// and the form does not grow.
test("the form has a control for every filter in the registry", async () => {
    let html = await (await fetch(base + "/search")).text();
    let reg  = await (await fetch(base + "/api/fields")).json();

    for (const f of reg.filters) {
        if (f.kind === "pills") {
            assert.ok(html.includes(`data-name="${f.key}"`),
                      `no pill group for ${f.key}`);
            for (const o of f.options) {
                assert.ok(html.includes(`data-value="${o.value}"`),
                          `no pill for ${f.key} = ${o.value}`);
            }
        } else {
            assert.ok(html.includes(`name="${f.key}"`), `no input for ${f.key}`);
        }
    }
});

// confal_min and confal_max are two filters and ONE control. pair_with is
// what tells the template that; without it the form grows two stray boxes.
test("the form draws one range control, not two", async () => {
    let html = await (await fetch(base + "/search")).text();

    assert.equal((html.match(/range_row/g) || []).length, 1);
    assert.ok(html.includes('placeholder="min"'));
    assert.ok(html.includes('placeholder="max"'));
});

// One category box per group, each with the slug that colours its dot.
test("the form draws one box per group, in registry order", async () => {
    let html = await (await fetch(base + "/search")).text();
    let reg  = await (await fetch(base + "/api/fields")).json();

    let seen = [...html.matchAll(/class="category ([a-z]+)"/g)].map((m) => m[1]);
    assert.deepEqual(seen, reg.groups.map((g) => g.slug));

    // A box gets a note only if its group carries one.
    assert.equal((html.match(/field_note/g) || []).length,
                 reg.groups.filter((g) => g.note).length);
});

// --- sorting ------------------------------------------------------------
test("the page offers every sort the registry defines, and no SQL", async () => {
    let html = await (await fetch(base + "/search")).text();
    let reg  = await (await fetch(base + "/api/fields")).json();

    assert.equal(reg.sorts.length, 8);

    for (const sort of reg.sorts) {
        assert.ok(html.includes(`value="${sort.key}"`), `no option for ${sort.key}`);
        assert.ok(html.includes(sort.label), `no label for ${sort.key}`);
        assert.deepEqual(Object.keys(sort).sort(), ["key", "label"]);
    }

    assert.ok(!/NULLS LAST|ORDER BY|LEFT JOIN/i.test(JSON.stringify(reg)),
              "the ORDER BY must stay on the server");
});

// scope and show answer different questions, and conflating them is the
// mistake this field exists to prevent: pdb_id is fetched for every result
// because the links need it, and displayed nowhere because the heading is it.
test("a column can be fetched without being displayed", async () => {
    let reg = await (await fetch(base + "/api/fields")).json();
    let api = await (await fetch(base + "/api/entries/4TNA")).json();

    let id_column = reg.columns.find((c) => c.key === "pdb_id");

    assert.equal(id_column.scope, "entry", "it is fetched with every result");
    assert.deepEqual(id_column.show, [], "and shown in no view");

    assert.equal(api.pdb_id, "4TNA", "so the value is there");
    assert.ok(!api.rows.some((r) => r.label === "Entry ID"), "but never as a row");
});

// --- the layout switcher -------------------------------------------------
// Both views draw the same reply, so switching is a redraw rather than a new
// request. The server renders the pressed state so the right button is lit on
// arrival instead of correcting itself after the script runs.
test("the page offers both layouts, with the right one pressed", async () => {
    for (const [url, pressed] of [["/search", "cards"],
                                  ["/search?view=lines", "lines"],
                                  ["/search?view=nonsense", "cards"]]) {
        let html = await (await fetch(base + url)).text();

        for (const view of ["cards", "lines"]) {
            let button = html.match(
                new RegExp(`data-view="${view}"\\s+aria-pressed="(true|false)"`));

            assert.ok(button, `${url}: no ${view} button`);
            assert.equal(button[1], String(view === pressed),
                         `${url}: ${view} should be ${view === pressed}`);
        }
    }
});

// --- the result card -----------------------------------------------------
// Each result carries the rows its card draws, built by detail.js from the
// same registry the structure page uses, so the two cannot describe one entry
// differently.
test("every result carries its card rows", async () => {
    let body = await (await fetch(base + "/api/entries")).json();
    let reg  = await (await fetch(base + "/api/fields")).json();

    let expected = reg.columns.filter((c) => (c.show || ["page"]).includes("card"));
    assert.equal(expected.length, 10);

    for (const entry of body.results) {
        assert.ok(Array.isArray(entry.card), `${entry.pdb_id} has no card`);

        // In registry order, with the empty ones dropped.
        let labels = entry.card.map((r) => r.label);
        let allowed = expected.map((c) => c.label);

        assert.deepEqual(labels, allowed.filter((l) => labels.includes(l)),
                         `${entry.pdb_id} draws its card out of order`);
    }
});

test("the card and the structure page agree on every shared row", async () => {
    let body = await (await fetch(base + "/api/entries?entry_id=4TNA")).json();
    let one  = await (await fetch(base + "/api/entries/4TNA")).json();

    let page = new Map(one.rows.map((r) => [r.label, r.value]));

    for (const row of body.results[0].card) {
        assert.ok(page.has(row.label), `the page is missing ${row.label}`);
        assert.equal(page.get(row.label), row.value,
                     `${row.label} differs between the card and the page`);
    }
});

// --- a card answers the question that was asked -------------------------
// If you can filter by it, the result should show it. Three columns are not on
// the card by default, so a search using one of them adds its row.
//
// Only monomer_flag can be checked end to end here: the seed comes from
// entries.json, which carries no DNATCO data, so na3db_test has no NtC or
// confal rows for the other two to match. The mapping itself is tested in
// search.test.js, where it needs no data at all.
test("searching the monomer flag puts it on the card", async () => {
    let plain = await (await fetch(base + "/api/entries")).json();
    let asked = await (await fetch(base + "/api/entries?monomer_flag=Non-Standard")).json();

    assert.ok(asked.results.length > 0);
    assert.ok(!plain.results[0].card.some((r) => r.label === "Monomer standard flag"),
              "it should not be on a card by default");

    for (const entry of asked.results) {
        assert.ok(entry.card.some((r) => r.label === "Monomer standard flag"),
                  `${entry.pdb_id} does not show it`);
    }
});

test("an added row keeps its place in registry order", async () => {
    let body = await (await fetch(base + "/api/entries?monomer_flag=Non-Standard")).json();
    let reg  = await (await fetch(base + "/api/fields")).json();

    let order = reg.columns.map((c) => c.label);
    let labels = body.results[0].card.map((r) => r.label);

    assert.deepEqual(labels, order.filter((l) => labels.includes(l)),
                     "the extra row was appended instead of placed");
});

test("the card shows the organism and not the confal score by default", async () => {
    let reg = await (await fetch(base + "/api/fields")).json();

    let on_card = reg.columns
        .filter((c) => (c.show || ["page"]).includes("card"))
        .map((c) => c.label);

    assert.ok(on_card.includes("Source organism"));
    assert.ok(!on_card.includes("Overall confal score"));
    assert.equal(on_card.length, 10);
});

// --- the detail rows ----------------------------------------------------
// The card and the structure page were two hand-written lists once, and had
// drifted: 17 rows against 22, two ways to print a resolution. These keep them
// one list. 4TNA and 3BNA are seed.sql fixtures; the suite uses na3db_test.
test("the panel and the structure page draw the same rows", async () => {
    let api  = await (await fetch(base + "/api/entries/4TNA")).json();
    let html = await (await fetch(base + "/structure/4TNA")).text();

    assert.ok(api.rows.length > 0, "there should be rows to compare");

    for (const row of api.rows) {
        assert.ok(html.includes(`>${row.label}<`), `the page is missing ${row.label}`);
    }

    // Same count, so the page cannot carry extras either.
    assert.equal((html.match(/detail_field/g) || []).length, api.rows.length);
});

test("the raw fields survive beside the formatted rows", async () => {
    let api = await (await fetch(base + "/api/entries/4TNA")).json();

    assert.equal(typeof api.resolution, "number", "2.5, not the string 2.50 Å");
    assert.ok(api.rows.some((r) => r.value === "2.50 \u00C5"),
              "the formatted value belongs in rows, not in the field");
});

// 3BNA's resolution is exactly 3, where the page said "3 Å" and the panel
// said "3.00 Å".
test("a whole-number resolution still prints two decimals", async () => {
    let api  = await (await fetch(base + "/api/entries/3BNA")).json();
    let html = await (await fetch(base + "/structure/3BNA")).text();

    assert.ok(api.rows.some((r) => r.value === "3.00 \u00C5"));
    assert.ok(html.includes("3.00 \u00C5"), "and the page agrees");
});

test("a column marked in_detail: false is fetched but is not a row", async () => {
    let api = await (await fetch(base + "/api/entries/4TNA")).json();
    let labels = api.rows.map((r) => r.label);

    assert.ok(!labels.includes("Entry ID"), "the id is the heading, not a row");
    assert.equal(api.pdb_id, "4TNA", "but it is still fetched - the links need it");
});

// Everything in public/ is public. Everything else must not be reachable,
// or a visitor could read the server source or the raw templates.
const private_files = [
    "/server.js",
    "/search.js",
    "/search.reference.mjs",
    "/filters.js",
    "/detail.js",
    "/db.js",
    "/db/init.sql",
    "/db/seed.sql",
    "/entries.json",
    "/search.ejs",
    "/landing.ejs",
    "/structure.ejs",
    "/views/search.ejs",
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

// --- the report follows the search it came from ---------------------------
// The report rebuilds its query from the URL, and match is not a filter key,
// so it has to be carried across deliberately or an Excludes search would
// quietly report the Contains one.
test("/api/export honours the match mode", async () => {
    let all   = (await (await fetch(base + "/api/export")).json()).total;
    let yes   = (await (await fetch(base + "/api/export?q=tna")).json()).total;
    let no    = (await (await fetch(base + "/api/export?q=tna&match=excludes")).json()).total;

    assert.ok(yes > 0 && no > 0);
    assert.equal(yes + no, all, "the two reports should cover everything once");
});

// A structure page runs no script, so its rail links are built on the server.
test("the structure page's rail carries that structure", async () => {
    let html = await (await fetch(base + "/structure/4TNA")).text();

    assert.match(html, /href="\/report\?entry_id=4TNA"/);
    assert.match(html, /href="\/search\?entry_id=4TNA"/);
});

test("the report reached from a structure covers only that structure", async () => {
    let body = await (await fetch(base + "/api/export?entry_id=4TNA")).json();

    assert.equal(body.total, 1);
    assert.equal(body.results[0].pdb_id, "4TNA");
});
