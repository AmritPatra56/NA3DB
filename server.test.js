// server.test.js - checks the routes: status codes, formats, and what is
// deliberately not downloadable. Imports the app and runs it on a free port.

import test, { before, after } from "node:test";
import assert from "node:assert";
import { FILTERS, COLUMNS, TEXT_FILTERS, PILL_FILTERS, BROWSE, TOPICS } from "./filters.js";
import { once } from "node:events";
import app from "./server.js";
import { close as close_db, query } from "./db.js";
import { find_entry, entry_contents, entry_residues } from "./search.js";
import { detail_rows, molecule_groups, structure_sections, pair_arcs, PAGE_GROUPS, SHOWN_ELSEWHERE } from "./detail.js";

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

// A NUL or other control character in an id was a 500 from PostgreSQL.
test("an id holding a control character is a 404, and the message does not echo it", async () => {
    for (const path of ["/structure/%00", "/api/entries/%00", "/api/entries/ZZ%00ZZ/arcs"]) {
        let res = await fetch(base + path);
        assert.equal(res.status, 404, path);
        assert.ok(!/[\x00-\x08\x0b\x0c\x0e-\x1f]|\\u0000/.test(await res.text()), path);
    }
    assert.equal((await fetch(base + "/api/entries/4TNA%00")).status, 200);
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
                         "per_page=50", "page=3", "panel=open"]) {
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
    // ?panel=open: a phone hides the panel unless the link asks for it.
    assert.match(html, /landing_advanced" href="\/search\?panel=open"/);
    assert.match(html, /panel=open">Full search</);
});

test("the landing page has no 'Try' line of examples", async () => {
    let html = await (await fetch(base + "/")).text();
    assert.ok(!html.includes("landing_examples"));
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

// Polymer types before DNA and RNA were split. The page's script only selects
// pills it knows, so an old value reaching it would be dropped and the search
// would silently widen to every entry. The server rewrites it first.
test("an old polymer type on /search is redirected to the new values", async () => {
    const cases = [
        ["polymer_type=Nucleic%20acid",
         "polymer_type=DNA%2CRNA%2CDNA%2FRNA"],
        ["polymer_type=Protein%2FNA&page=3",
         "polymer_type=Protein%2FDNA%2CProtein%2FRNA%2CProtein%2FDNA%2FRNA&page=3"],
        ["q=tRNA&polymer_type=Nucleic%20acid%2CProtein&sort=confal_desc",
         "q=tRNA&polymer_type=DNA%2CRNA%2CDNA%2FRNA%2CProtein&sort=confal_desc"],
        ["polymer_type=RNA%2CNucleic%20acid",
         "polymer_type=RNA%2CDNA%2CDNA%2FRNA"]
    ];
    for (const [old_query, new_query] of cases) {
        let res = await fetch(base + "/search?" + old_query, { redirect: "manual" });

        assert.equal(res.status, 301, `/search?${old_query} should be redirected`);
        assert.equal(res.headers.get("location"), "/search?" + new_query);
    }
});

test("a current polymer type on /search is not redirected", async () => {
    for (const query of ["polymer_type=DNA", "polymer_type=Protein%2FRNA", "q=tRNA", ""]) {
        let res = await fetch(base + "/search?" + query, { redirect: "manual" });
        assert.equal(res.status, 200, `/search?${query} should be served as it is`);
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
    const FILTER_FIELDS = ["key", "label", "group", "kind", "prominent", "options", "any", "first",
                           "placeholder", "pair_with", "revealed_by", "suggest"];
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
    ["/search",                                   true,  "the Full search link"],
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
            // A pill that would find nothing is left out; every other is drawn.
            for (const o of f.options) {
                let found = (await (await fetch(base + `/api/count?${f.key}=${encodeURIComponent(o.value)}`)).json()).total;
                assert.equal(html.includes(`data-value="${o.value}"`), found > 0 || f.key !== "polymer_type",
                             `pill for ${f.key} = ${o.value} (finds ${found})`);
            }
        } else {
            assert.ok(html.includes(`name="${f.key}"`), `no input for ${f.key}`);
        }
    }
});

// confal_min and confal_max are two filters and ONE control. pair_with is
// what tells the template that; without it the form grows two stray boxes.
test("the form draws one range control per pair, not one per end", async () => {
    let html = await (await fetch(base + "/search")).text();

    assert.equal((html.match(/class="range_row"/g) || []).length,
                 FILTERS.filter((f) => f.kind === "range" && f.pair_with).length);
    assert.ok(html.includes('placeholder="min"'));
    assert.ok(html.includes('placeholder="max"'));
});

// The resolution range waits under the method pills until X-ray, EM or another
// method that measures one is picked, and starts hidden so it never flashes.
test("the resolution range is drawn hidden, revealed by a method that has one", async () => {
    let html = await (await fetch(base + "/search")).text();
    let field = html.match(/<div class="field revealed_field"[^>]*>/)[0];

    assert.match(field, /data-revealed-by="experimental_method"/);
    assert.match(field, /X-RAY DIFFRACTION\|ELECTRON MICROSCOPY/);
    assert.ok(!field.includes("SOLUTION NMR"), "NMR measures no resolution");
    assert.match(field, / hidden>$/);
    assert.ok(html.indexOf('data-name="experimental_method"') < html.indexOf("revealed_field"),
              "the range sits under the method pills");
});

test("the method pills show four, the rest behind a More button", async () => {
    let html = await (await fetch(base + "/search")).text();
    let group = html.slice(html.indexOf('data-name="experimental_method"'));
    group = group.slice(0, group.indexOf("</div>"));
    let method = FILTERS.find((f) => f.key === "experimental_method");

    assert.equal((group.match(/class="pill pill_extra"[^>]* hidden>/g) || []).length, method.options.length - 4);
    assert.match(group, /class="pill_more" aria-expanded="false"/);

    // A link that picks a hidden method arrives with them unfolded.
    let picked = await (await fetch(base + "/search?experimental_method=FIBER%20DIFFRACTION")).text();
    assert.match(picked, /class="pill_more" aria-expanded="true"/);
    assert.ok(!/class="pill pill_extra"[^>]* hidden>/.test(picked));
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

    assert.equal(reg.sorts.length, 9);

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
test("the page offers all three layouts, Grid first, Cards pressed by default", async () => {
    for (const [url, pressed] of [["/search", "cards"],
                                  ["/search?view=cards", "cards"],
                                  ["/search?view=lines", "lines"],
                                  ["/search?view=grid", "grid"],
                                  ["/search?view=arcs", "grid"],
                                  ["/search?view=nonsense", "cards"]]) {
        let html = await (await fetch(base + url)).text();

        assert.match(html, /data-view="grid"[\s\S]*data-view="cards"[\s\S]*data-view="lines"/, `${url}: order`);

        for (const view of ["grid", "cards", "lines"]) {
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
    assert.equal(expected.length, 11);

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

    // The page shows these as tables (Molecules, Sources) instead of rows;
    // the card keeps the rows because it has no room for the tables.
    let shown_as_table = ["Entity name", "Source organism"];

    for (const row of body.results[0].card) {
        if (shown_as_table.includes(row.label)) {
            assert.ok(one.entities.length > 0, `${row.label}: the page has no molecules`);
            continue;
        }
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
    assert.equal(on_card.length, 11);
});

// --- the detail rows ----------------------------------------------------
// The card and the structure page were two hand-written lists once, and had
// drifted: 17 rows against 22, two ways to print a resolution. These keep them
// one list. 4TNA and 3BNA are seed.sql fixtures; the suite uses na3db_test.
test("the panel and the structure page draw the same rows", async () => {
    let api  = await (await fetch(base + "/api/entries/4TNA")).json();
    let html = await (await fetch(base + "/structure/4TNA")).text();

    assert.ok(api.rows.length > 0, "there should be rows to compare");

    // The modified, ligand and NtC rows are left out: the page shows them as
    // tables and counts, which hold every code the rows list.
    let on_page = api.rows.filter((row) => !SHOWN_ELSEWHERE.has(row.key));
    for (const row of on_page) {
        assert.ok(html.includes(`>${row.label}<`), `the page is missing ${row.label}`);
    }

    // Same count, so the page cannot carry extras either.
    assert.equal((html.match(/detail_field/g) || []).length, on_page.length);
});

// The sidebar is the page's table of contents: every entry jumps to a section
// that exists, in the order the page reads, so a link like #base-pairs is
// safe to cite.
test("every sidebar link on a structure page lands on a section", async () => {
    let html = await (await fetch(base + "/structure/4TNA")).text();
    let links = [...html.matchAll(/class="nav_item[^"]*" href="#([^"]+)"|href="#([^"]+)" class="nav_item/g)]
        .map((m) => m[1] ?? m[2]);
    let sections = [...html.matchAll(/<section id="([^"]+)"/g)].map((m) => m[1]);

    assert.deepEqual(links, ["overview", "molecules", "sources", "modified-nucleotides", "ligands",
                             "base-pairs", "conformation", "sequence-map", "same-sequence", "citations", "links"]);
    assert.deepEqual(sections, links, "one section per link, in the same order");
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

// The landing page says how big the database is and when it last changed,
// both asked of the database, so the line cannot go stale.
test("the landing page states the database's size and last load", async () => {
    let html  = await (await fetch(base + "/")).text();
    let total = (await (await fetch(base + "/api/stats")).json()).total;

    assert.ok(html.includes(`<b>${total.toLocaleString("en-GB")}</b> structures`));

    // The test seed may have no load record; then the date is left out, not invented.
    let loads = Number((await query("SELECT count(*) FROM loaded_entries")).rows[0].count);
    if (loads) assert.match(html, /updated \d{1,2} [A-Z][a-z]{2} \d{4}/);
    else       assert.ok(!html.includes("updated"), "no load record, no date");
});

// --- browse cards on the landing page -------------------------------------
// Each row shows a number and links to a search; the two must agree, or the
// front page promises results the search does not give.
function shown_rows(html) {
    let rows = [];
    let re = /<li><a href="([^"]+)">\s*<span class="browse_name">([^<]+)[\s\S]*?<span class="browse_count">([\d,]+)<\/span>/g;
    for (let m of html.matchAll(re)) {
        rows.push({ url: m[1].replaceAll("&amp;", "&"), label: m[2].trim(), count: Number(m[3].replaceAll(",", "")) });
    }
    return rows;
}

test("every browse row's number is what its link finds", async () => {
    let rows = shown_rows(await (await fetch(base + "/")).text());
    assert.equal(rows.length, BROWSE.flatMap((g) => g.rows).length, "a row is missing from the page");

    for (const row of rows) {
        let found = (await (await fetch(base + "/api/count" + row.url.slice("/search".length))).json()).total;
        assert.equal(row.count, found, `${row.label}: shows ${row.count}, its link finds ${found}`);
    }
});

// An entry has one polymer type and one method, so those two cards each
// cover the whole database once. A missing or doubled value shows up here.
test("made-of and method rows each add up to every entry", async () => {
    let total = (await (await fetch(base + "/api/stats")).json()).total;
    let rows  = shown_rows(await (await fetch(base + "/")).text());

    for (const key of ["polymer_type=", "experimental_method="]) {
        let sum = rows.filter((r) => r.url.startsWith("/search?" + key)).reduce((a, r) => a + r.count, 0);
        assert.equal(sum, total, key);
    }
});

test("the landing page shows the three questions, without em dashes", async () => {
    let html = await (await fetch(base + "/")).text();
    for (const group of BROWSE) assert.ok(html.includes(group.question), group.question);
    assert.ok(html.includes("Not sure what to type? Start from what you know."));
    assert.ok(!html.includes("\u2014"), "no em dash on the landing page");
});

// Topic words are matched as written, in the title or a molecule name only.
test("a topic matches its words in a title or molecule name", async () => {
    for (const topic of TOPICS) {
        let patterns = topic.words.map((w) => "%" + w.replace(/[\\%_]/g, "\\$&") + "%");
        let direct = Number((await query(
            `SELECT count(*) FROM entry e
              WHERE EXISTS (SELECT 1 FROM struct st WHERE st.entry_id = e.id AND st.title ILIKE ANY($1))
                 OR EXISTS (SELECT 1 FROM entity en WHERE en.entry_id = e.id AND en.pdbx_description ILIKE ANY($1))`,
            [patterns])).rows[0].count);
        let api = (await (await fetch(base + "/api/count?topic=" + encodeURIComponent(topic.value))).json()).total;
        assert.equal(api, direct, topic.value);
    }
});

test("an unknown topic matches nothing", async () => {
    let n = (await (await fetch(base + "/api/count?topic=nonsense")).json()).total;
    assert.equal(n, 0);
});

// The footer links before its pages are written; each must still answer.
test("every footer link answers", async () => {
    for (const path of ["/cite", "/help", "/contact"]) {
        assert.equal((await fetch(base + path)).status, 200, path);
    }
});

// The rail is NA3DB's own now, not the institute's logo.
test("the rail carries the NA3DB mark, not the IBT logo", async () => {
    let html = await (await fetch(base + "/search")).text();
    assert.ok(html.includes('aria-label="NA3DB home"'));
    assert.ok(!html.includes('alt="IBT logo"'));
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

test("a FASTA link for a molecule without a sequence is a 404, not an empty file", async () => {
    assert.equal((await fetch(base + "/structure/4TNA/fasta/99")).status, 404);
    assert.equal((await fetch(base + "/structure/NOPE/fasta/1")).status, 404);
    // The test seed carries no sequences, so a whole-entry file is empty too.
    assert.equal((await fetch(base + "/structure/4TNA/fasta")).status, 404);
    assert.equal((await fetch(base + "/structure/4TNA/fasta?only=na")).status, 404);
});

// --- the base-pair API ---------------------------------------------------
// The seed has no base pairs, so these check the shape and the edges; the
// pairs themselves are tested in contents.test.js.
test("base pairs of an unknown entry are a JSON 404", async () => {
    let response = await fetch(base + "/api/entries/NOPE/base_pairs");
    assert.equal(response.status, 404);
    assert.match((await response.json()).error, /NOPE/);
});

test("an entry with no base pairs gives an empty list, in JSON and CSV", async () => {
    let json = await (await fetch(base + "/api/entries/4tna/base_pairs")).json();
    assert.deepEqual(json, { entry: "4TNA", model: null, total: 0,
                             counts: { wc: 0, gu: 0, nc: 0 }, pairs: [] });

    let csv = await fetch(base + "/api/entries/4TNA/base_pairs?format=csv");
    assert.equal(csv.headers.get("content-type"), "text/csv; charset=utf-8");
    assert.match(csv.headers.get("content-disposition"), /4TNA_base_pairs\.csv/);
    assert.equal(await csv.text(), "chain_1,res_1,chain_2,res_2,family,kind\n");
});

test("one entry's API carries each molecule's sequence and the ligand codes", async () => {
    let entry = await (await fetch(base + "/api/entries/4TNA")).json();
    assert.ok(entry.entities.every((e) => "sequence" in e && "comp_id" in e));
    assert.ok("ligands" in entry);
});

test("a polymer pill shows its count, and a selected empty one is still drawn", async () => {
    let html = await (await fetch(base + "/search")).text();
    let rna = (await (await fetch(base + "/api/count?polymer_type=RNA")).json()).total;
    assert.match(html, new RegExp(`data-value="RNA">RNA <span class="pill_count">${rna}</span>`));
    assert.ok(!html.includes('data-value="Oligosaccharide"'));

    let asked = await (await fetch(base + "/search?polymer_type=Oligosaccharide")).text();
    assert.ok(asked.includes('data-value="Oligosaccharide"'),
              "a pill the URL selects must exist, or the search silently widens");
});


// --- the arc picture in Base pairs ----------------------------------------

// The seed has no base pairs, so the picture is drawn from fixture pairs
// through the same template the route renders.
const render = (view, locals) =>
    new Promise((ok, fail) => app.render(view, locals, (err, html) => err ? fail(err) : ok(html)));

async function page_with_arcs(arcs, nucleic_chains = 0, same_entries = 0) {
    let entry = await find_entry("4TNA");
    let [contents, residues] = await Promise.all([entry_contents("4TNA"), entry_residues("4TNA")]);
    let page = { entry, rows: detail_rows(entry), citations: [],
                 molecules: molecule_groups(contents, residues), base_pairs: null, arcs, nucleic_chains,
                 same_entries };
    return render("structure", { ...page, page: "search", sections: structure_sections(page),
                                 PAGE_GROUPS, rail_query: "" });
}

const section = (html, id) => {
    let from = html.indexOf(`<section id="${id}"`);
    return html.slice(from, html.indexOf("</section>", from));
};
const pairs_section = (html) => section(html, "base-pairs");
const arc_pair = (label_1, pos_1, label_2, pos_2, kind = "wc", copy_2 = "1") =>
    ({ label_1, pos_1, label_2, pos_2, family: kind === "nc" ? "tWH" : "cWW", kind, copy_1: "1", copy_2 });
const dna = (labels, length) => [{ id: "1", kind: "DNA", length,
                                   chains: labels.map((label) => ({ label, auth: label })) }];
const plain = (length, modified = []) =>
    new Map([["1", Array.from({ length }, (_, i) => ({ pos: i + 1, modified: modified.includes(i + 1) }))]]);

test("Overview is rows only; an entry without pairs draws no picture anywhere", async () => {
    let html = await (await fetch(base + "/structure/4TNA")).text();
    let top = section(html, "overview");

    assert.ok(!html.includes("arc_picture"));
    assert.ok(!top.includes("arc_") && !top.includes("No base pairs annotated"));
    assert.match(top, /class="detail_field structure_lead">\s*<div class="detail_label">Title</, "the title is the first row again");
});

test("Base pairs opens with the pairs drawn as arcs, with a key; Overview has none", async () => {
    let arcs = pair_arcs(dna(["A", "B"], 6), plain(6, [3]),
                         [arc_pair("A", 1, "B", 6), arc_pair("A", 2, "B", 5, "gu"), arc_pair("A", 3, "B", 4, "nc")]);
    let page = await page_with_arcs(arcs);
    let html = pairs_section(page);

    assert.ok(!section(page, "overview").includes("arc_picture"), "not in Overview");
    assert.ok(html.includes('<figure class="arc_picture">'));
    for (const kind of ["wc", "gu", "nc"]) {
        let d = html.match(new RegExp(`<path class="arc_${kind}" d="([^"]*)"`))[1];
        assert.equal((d.match(/M/g) || []).length, 1, `one ${kind} arc`);
    }
    assert.match(html, /<path class="arc_dot" d="M/);
    assert.match(html, /aria-label="Arc diagram: 3 base pairs drawn as arcs over 2 strands \(A, B\), 12 nucleotides"/);
    assert.match(html, />A<\/text>.*>B<\/text>/s);
    assert.ok(html.includes("2 strands · 12 nt"));
    assert.match(html, /<path class="arc_gu" d="M[^"]+"><title>A:2 – B:5 · cWW<\/title>/, "each arc names its pair on hover");
    assert.match(html, />5′<\/text>.*>3′<\/text>/s);
    assert.ok(html.includes("arc_mod"), "a key entry for the modified dot");
    assert.ok(!html.includes("symmetry copy"), "no copies, no note");
    assert.ok(!html.includes("No base pairs annotated"));
});

test("a symmetry copy is named A′, drawn dashed and explained under the picture", async () => {
    let arcs = pair_arcs(dna(["A"], 4), plain(4),
                         [arc_pair("A", 1, "A", 4, "wc", "2"), arc_pair("A", 2, "A", 3, "wc", "2")]);
    let html = pairs_section(await page_with_arcs(arcs));

    assert.match(html, /class="arc_strand arc_copy"/);
    assert.match(html, />A′<\/text>/);
    assert.ok(html.includes("′ marks a symmetry copy from the crystal"));
    assert.ok(!html.includes("arc_mod"), "nothing modified, no key entry for it");
    assert.ok(!html.includes('<i class="arc_gu">') && !html.includes('<i class="arc_nc">'),
              "the key lists only the kinds drawn");
});

test("the arcs API gives the viewer every pair as numbers, and a 404 for an unknown entry", async () => {
    let res = await fetch(base + "/api/entries/4tna/arcs");
    assert.equal(res.status, 200);
    let body = await res.json();
    assert.deepEqual({ ...body, title: undefined }, { pdb_id: "4TNA", title: undefined, strands: [], pairs: [] }, "the seed has no pairs");
    assert.equal(typeof body.title, "string", "the viewer heads itself with the title");
    assert.equal((await fetch(base + "/api/entries/ZZZZ/arcs")).status, 404);
});

test("the picture opens full screen: a button for it, the dialog, and its script", async () => {
    let arcs = pair_arcs(dna(["A", "B"], 6), plain(6), [arc_pair("A", 1, "B", 6)]);
    let html = await page_with_arcs(arcs);

    assert.equal((html.match(/data-arc-open="4TNA"/g) || []).length, 2, "the picture and the Full screen button");
    assert.match(html, /<dialog id="arc_viewer"/);
    assert.match(html, /<script type="module" src="\/arc_viewer.js"><\/script>/);
    for (const part of ["av_summary", "av_info", "Leontis–Westhof families", "av_fams", "av_rows"]) {
        assert.ok(html.includes(part), `the viewer has its ${part}: every pair on screen without a click`);
    }

    let none = await (await fetch(base + "/structure/4TNA")).text();
    assert.ok(!none.includes("arc_viewer"), "no pairs, no viewer");
    assert.equal((await fetch(base + "/arc_viewer.js")).status, 200);
});

test("each entry has a small arc picture for the Arcs view, kept by the browser for an hour", async () => {
    let res = await fetch(base + "/structure/4tna/arcs.svg");
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /^image\/svg\+xml/);
    assert.equal(res.headers.get("cache-control"), "public, max-age=3600");
    assert.match(await res.text(), /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg".*No base pairs annotated/s);
    assert.equal((await fetch(base + "/structure/ZZZZ/arcs.svg")).status, 404);
});

test("each search result carries its card's arc numbers, null when nothing is drawn", async () => {
    let body = await (await fetch(base + "/api/entries?q=4TNA")).json();
    let entry = body.results.find((e) => e.pdb_id === "4TNA");

    assert.ok(entry && "arcs" in entry);
    assert.equal(entry.arcs, null, "the seed has no pairs");
});

test("the search page offers a Grid view, and an old Arcs link lands on it", async () => {
    for (const view of ["grid", "arcs"]) {
        let html = await (await fetch(base + "/search?view=" + view)).text();
        assert.match(html, /data-view="grid"\s+aria-pressed="true">Grid</);
        assert.ok(!html.includes("arc_viewer"), "the arc picture lives on the structure page only");
    }
    assert.match(await (await fetch(base + "/search?view=bogus")).text(), /data-view="cards"\s+aria-pressed="true"/);
});

test("every page has the footer, with Help and Contact", async () => {
    for (const path of ["/", "/search", "/report", "/structure/4TNA", "/structure/ZZZZ"]) {
        let html = await (await fetch(base + path)).text();
        assert.match(html, /<footer class="site_footer">/, path);
        assert.ok(html.includes('href="/help"') && html.includes('href="/contact"'), path);
    }
});

test("the sequence map API: a 404 for an entry with no nucleic-acid chain, and for an unknown one", async () => {
    // The seed's 4TNA lists no chains; sequence_map itself is in seqmap.test.js.
    let res = await fetch(base + "/api/entries/4tna/sequence_map");
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: "4TNA has no nucleic-acid chain" });
    assert.equal((await fetch(base + "/api/entries/4tna/sequence_map?format=text")).status, 404);
    assert.equal((await fetch(base + "/api/entries/ZZZZ/sequence_map")).status, 404);
});

test("the same sequence API: no groups for an entry that shares none, a 404 for an unknown one", async () => {
    // The seed has no two entries with one sequence; compare_chains itself is
    // in sameseq.test.js.
    let res = await fetch(base + "/api/entries/4tna/same_sequence");
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { pdb_id: "4TNA", groups: [] });
    assert.equal((await fetch(base + "/api/entries/ZZZZ/same_sequence")).status, 404);
});

test("the compare API takes two different chains as ENTRY:CHAIN", async () => {
    let get = (qs) => fetch(base + "/api/same_sequence/compare" + qs);
    for (const qs of ["", "?a=4TNA:A", "?a=4TNA&b=4TNA:A", "?a=4TNA:A:B&b=4TNA:A"]) {
        assert.equal((await get(qs)).status, 400, qs);
    }
    let same = await get("?a=4TNA:A&b=4tna:a");
    assert.equal(same.status, 400);
    assert.deepEqual(await same.json(), { error: "Pick two different chains" });
    assert.equal((await get("?a=ZZZZ:A&b=4TNA:A")).status, 404);
});

test("the structure page has a Same sequence section after the Sequence map, drawn by its own script", async () => {
    let html = await page_with_arcs(null, 1, 3);
    let same = section(html, "same-sequence");
    assert.match(same, /class="sameseq" data-entry="4TNA"/);
    assert.match(html, /<script type="module" src="\/sameseq.js"><\/script>/);
    assert.ok(html.indexOf('id="sequence-map"') < html.indexOf('id="same-sequence"') &&
              html.indexOf('id="same-sequence"') < html.indexOf('id="citations"'));
    assert.ok(!/\u2014/.test(same), "no em dash in what the section says");
    let script = await (await fetch(base + "/sameseq.js")).text();
    for (const part of ["ss_bar", "ss_swap", "ss_full", "ss_dialog", "ss_list", "ss_best",
                        "Everything without a number is the same in both. Click a number to find it."]) {
        assert.ok(script.includes(part), `the script draws ${part}`);
    }
    assert.ok(!/\u2014/.test(script), "no em dash anywhere the script writes");

    let none = await (await fetch(base + "/structure/4TNA")).text();
    assert.ok(section(none, "same-sequence").includes("No other entry has a chain with exactly this sequence."));
    assert.ok(!none.includes("/sameseq.js"), "and no script for it");
});

test("the structure page has a Sequence map section after Conformation, drawn by its own script", async () => {
    let html = await page_with_arcs(null, 2);
    let map = section(html, "sequence-map");
    assert.match(map, /class="seqmap" data-entry="4TNA"/);
    assert.match(html, /href="#sequence-map"/);
    assert.match(html, /<script type="module" src="\/seqmap.js"><\/script>/);
    assert.ok(html.indexOf('id="base-pairs"') < html.indexOf('id="conformation"') &&
              html.indexOf('id="conformation"') < html.indexOf('id="sequence-map"'));
    let script = await (await fetch(base + "/seqmap.js")).text();
    for (const part of ["seqmap_full", "seqmap_dialog", "smd_overview", "smd_strands", 'data-zoom="fit"', "seqmap_jump"]) {
        assert.ok(script.includes(part), `the script draws the full-screen view's ${part}`);
    }

    let none = await (await fetch(base + "/structure/4TNA")).text();
    assert.ok(section(none, "sequence-map").includes("None recorded"), "no chains, nothing to draw");
    assert.ok(!none.includes("/seqmap.js"), "and no script for it");
});

// Em dashes read as machine-written; a blank cell says "none" instead.
test("no em dash anywhere a structure page or an error page shows", async () => {
    for (const path of ["/structure/4TNA", "/structure/ZZZZ"]) {
        let html = await (await fetch(base + path)).text();
        let shown = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<!--[\s\S]*?-->/g, "");
        assert.ok(!shown.includes("—"), `${path} shows an em dash`);
    }
});

test("the sequence map explains its bracket rows, and Conformation names its colours", async () => {
    let html = await page_with_arcs(null, 2);
    let map = section(html, "sequence-map");
    assert.match(map, /<details class="guide" id="sequence-map-guide">/);
    for (const part of ["((()))", "([)]", "GCUGAcGUAACAGC", "A nucleotide pairs once per row."]) {
        assert.ok(map.includes(part), `the guide shows ${part}`);
    }
    assert.ok(!/\u2014/.test(map), "no em dash in the guide");
    let cana = await (await fetch(base + "/cana.js")).text();
    assert.ok(cana.includes("CANA_NAMES"));
    let none = await (await fetch(base + "/structure/4TNA")).text();
    assert.ok(!section(none, "sequence-map").includes("sequence-map-guide"), "no guide over an empty section");
});

// A search that finds nothing carries its "Did you mean" offers; one that
// finds something carries none, so the count stays one cheap query.
test("count and entries offer close searches only when nothing matched", async () => {
    let none = await (await fetch(base + "/api/count?q=ribozome")).json();
    assert.equal(none.total, 0);
    assert.deepEqual(none.suggestions[0], { field: "q", value: "ribosome", total: none.suggestions[0].total });

    let page = await (await fetch(base + "/api/entries?q=ribozome")).json();
    assert.deepEqual(page.suggestions, none.suggestions);

    let some = await (await fetch(base + "/api/count?q=ribosome")).json();
    assert.ok(some.total > 0);
    assert.equal(some.suggestions, undefined);
    assert.equal((await (await fetch(base + "/api/entries?q=ribosome")).json()).suggestions, undefined);
});

test("the results page has a place for the offers, hidden until needed", async () => {
    let html = await (await fetch(base + "/search?q=ribozome")).text();
    assert.match(html, /class="did_you_mean hidden"/);
});

test("the organism boxes have suggestions, each with its common names and count", async () => {
    for (const path of ["/api/source_organisms", "/api/expression_hosts"]) {
        let rows = await (await fetch(base + path)).json();
        assert.ok(rows.length > 0, path);
        assert.ok(rows.every((r) => typeof r.code === "string" && typeof r.entries === "number"), path);
    }
    let html = await (await fetch(base + "/search")).text();
    assert.match(html, /data-suggest="source_organisms"/);
    assert.match(html, /data-suggest="expression_hosts"/);
});
