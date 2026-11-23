// server.test.js - checks the routes: status codes, formats, and what is
// deliberately not downloadable. Imports the app and runs it on a free port.

import test, { before, after } from "node:test";
import assert from "node:assert";
import { FILTERS, COLUMNS, TEXT_FILTERS, PILL_FILTERS, BROWSE, MODIFICATIONS, RESOLUTION_BANDS } from "./filters.js";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import app, { cited_rows, asked_view, viewer_installed } from "./server.js";
import { close as close_db, query } from "./db.js";
import { find_entry, entry_contents, entry_residues, entry_citation, browse_counts, build_where, kingdom_organisms, BROWSE_TOP } from "./search.js";
import { lineage_of, name_key } from "./taxonomy.js";
import { detail_rows, molecule_groups, structure_sections, pair_arcs, PAGE_GROUPS, SHOWN_ELSEWHERE, base_pair_section } from "./detail.js";
import { full_name } from "./cite.js";

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

test("an entry says whether the 3D viewer is installed, as its page does", async () => {
    let body = await (await fetch(base + "/api/entries/4TNA")).json();

    assert.strictEqual(body.viewer, viewer_installed);
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
    assert.match(open, /class="panel_handle fields_handle" aria-controls="report_panel"\s+aria-expanded="true"\s+aria-label="Hide the fields"/);

    assert.match(shut, /class="query_panel folded"/);
    assert.match(shut, /fields_toggle"[\s\S]*?aria-expanded="false"/);
    assert.match(shut, /class="panel_handle fields_handle"[^>]*aria-expanded="false"\s+aria-label="Show the fields"/);
});

// Beside the table the list folds with the full search's drawer handle; on a
// phone it sits above the table and the Fields button opens it downwards.
test("the report's field list folds with the full search's handle, and the phone keeps its button", () => {
    let css = readFileSync(new URL("./public/style.css", import.meta.url), "utf8");
    let js = readFileSync(new URL("./public/report.js", import.meta.url), "utf8");
    let block = (start) => { let b = css.slice(css.indexOf(start)); return b.slice(0, b.indexOf("\n}\n")); };

    assert.match(css, /\n\.interface > \.query_panel\.folded:has\(#report_fields\) \{\n    margin-left: -450px;\n    visibility: hidden;/);
    assert.match(css, /\n\.interface > \.query_panel\.folded \+ \.panel_edge \{ flex-basis: 26px; \}/, "the tab never covers the table");
    let wide = block("@media (min-width: 641px) {\n    .fields_toggle");
    assert.match(wide, /\.fields_toggle \{ display: none; \}/);
    assert.match(wide, /> \.rail \{ position: relative; z-index: 6; \}/, "the list slides behind the rail, not over it");

    // Folded on a phone hides the list, never the Download buttons with it.
    let phone = block("@media (max-width: 640px) {\n    .interface > .results_area:has(.report_body)");
    assert.match(phone, /\.query_panel\.folded:has\(#report_fields\) \{ margin-left: 0; visibility: visible; \}/);
    assert.match(phone, /\.query_panel\.folded > #report_fields \{ display: none; \}/);
    assert.match(phone, /\.interface > \.panel_edge \{ display: none; \}/);

    // The search page's stacked handle lies on its side; the report's stays upright.
    let stacked = block("/* Stacked above the results, the panel folds upwards");
    assert.doesNotMatch(stacked, /\n    \.panel_handle/, "an unscoped rule would turn the report's handle too");

    assert.match(js, /fields_panel\.inert = !open && !phone\.matches/, "the Download buttons stay reachable on a phone");
    assert.doesNotThrow(() => new Function(js.replace(/^(import|export) .*$/gm, "")));
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
    ["/search?q=tRNA",                            true,  "a search from the box"],
    ["/search?q=tRNA&page=3&sort=confal_desc",    true,  "...paged and sorted"],
    ["/search?entry_id=tna",                      true,  "an old bookmark using a filter"],
    ["/search?q=tRNA&polymer_type=Protein%2FNA",  true,  "the box plus a filter"],
    ["/search?q=",                                true,  "an empty box"],
    ["/search?q=tRNA&panel=open",                 true,  "an old link saying open"],
    ["/search?q=tRNA&panel=closed",               false, "the handle folded it"],
    ["/search?panel=closed",                      false, "...with no search"]
];

for (const [url, open, why] of PANEL_CASES) {
    test(`the panel is ${open ? "open" : "closed"} for ${why}`, async () => {
        let html = await (await fetch(base + url)).text();
        let tag  = html.match(/class="query_panel ([^"]*)"/);

        assert.ok(tag, "the panel should be on the page either way");
        assert.equal(!tag[1].includes("folded"), open);
    });
}

test("the drawer handle reports the state it is in", async () => {
    let shut = await (await fetch(base + "/search?q=tRNA&panel=closed")).text();
    let open = await (await fetch(base + "/search?q=tRNA")).text();

    assert.match(shut, /class="panel_handle"[^>]*aria-expanded="false"[^>]*aria-label="Show the filters"/);
    assert.match(open, /class="panel_handle"[^>]*aria-expanded="true"[^>]*aria-label="Hide the filters"/);
    assert.ok(!open.includes("filters_toggle"), "the old Filters button is gone");
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

    assert.equal((group.match(/class="pill pill_extra"[^>]* hidden>/g) || []).length, method.options.filter((o) => !o.band).length - 4);
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

    assert.deepEqual(links, ["views", "overview", "molecules", "sources", "modified-nucleotides", "ligands",
                             "base-pairs", "conformation", "sequence-map", "same-sequence", "citations", "links"]);
    assert.deepEqual(sections, links, "one section per link, in the same order");
});

// The sidebar folds away with the full search's drawer handle on a wide
// screen and stays folded for the next structure. On a narrow one it is a
// chip strip, which a fold would empty.
test("the sidebar folds on a wide screen and never empties the strip", async () => {
    let html = await (await fetch(base + "/structure/4TNA")).text();
    assert.match(html, /<button type="button" class="panel_handle nav_handle" aria-controls="section_nav"\s+aria-expanded="true"/,
                 "the full search's handle, not one drawn again");
    assert.match(html, /<nav class="section_nav" id="section_nav"/);
    assert.match(html, /<div class="nav_edge">[\s\S]*?<i class="arrow arrow_side" aria-hidden="true"><\/i>/);
    // Read before the page is drawn, so a folded sidebar never flashes open.
    assert.ok(html.indexOf('localStorage.getItem("section_nav")') < html.indexOf('class="detail_body"'));
    assert.match(html, /try \{ localStorage\.setItem\("section_nav"/, "storage can throw in a private window");
    assert.match(html, /nav_list\.inert = on && !nav_strip\.matches/, "folded links leave the tab order, only beside the page");
    // One name declared twice stops the whole script, the fold and the
    // reading position with it.
    for (const [, code] of html.matchAll(/<script>([\s\S]*?)<\/script>/g)) assert.doesNotThrow(() => new Function(code));

    let css = readFileSync(new URL("./public/style.css", import.meta.url), "utf8");
    assert.match(css, /\n\.structure_page \{\n    display: grid;\n    grid-template-columns: 180px 0 minmax/);
    assert.match(css, /\n\.structure_page\.nav_folded \{ grid-template-columns: 0 26px minmax/, "folded, the page gets all but the handle");
    assert.match(css, /\n\.nav_folded \.nav_handle \{ left: 0; \}/, "the handle stays on the page's edge");
    let strip = css.slice(css.indexOf("\n    .structure_page { display: block; }"));
    strip = strip.slice(0, strip.indexOf("\n}\n"));
    assert.match(strip, /\.nav_edge \{ display: none; \}/);
    assert.match(strip, /\.nav_folded \.section_nav \{ visibility: visible; \}/, "folded on a wide screen, chips on a narrow one");
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
// Each row shows a number and its Yes links to a search; the two must agree,
// or the front page promises results the search does not give. So must each
// option's number and link.
function shown_rows(html) {
    let rows = [];
    let re = /<a (class="browse_link" )?href="([^"]+)"[^>]*>\s*<span class="browse_name">([^<]+)[\s\S]*?<span class="browse_count">([\d,]+)<\/span>/g;
    for (let m of html.matchAll(re)) {
        rows.push({ option: !m[1], url: m[2].replaceAll("&amp;", "&"), label: m[3].trim(),
                    count: Number(m[4].replaceAll(",", "")) });
    }
    return rows;
}
const count_of = async (q) => (await (await fetch(base + "/api/count?" + q)).json()).total;
const query_of = (url) => url.slice("/search?".length);

test("every browse row's number is what its Yes finds, and every option's what it finds", async () => {
    let rows = shown_rows(await (await fetch(base + "/")).text());
    let built = (await browse_counts()).flatMap((g) => g.rows.flatMap((r) => [r, ...r.options]));
    assert.equal(rows.length, built.length, "a row is missing from the page");
    assert.ok(rows.some((r) => r.option) && rows.some((r) => !r.option));

    for (const row of rows) {
        let found = await count_of(query_of(row.url));
        assert.equal(row.count, found, `${row.label}: shows ${row.count}, its link finds ${found}`);
    }
});

// An entry has one polymer type and one method, so those two cards each
// cover the whole database once. A missing or doubled value shows up here.
test("made-of and method rows each add up to every entry", async () => {
    let total = (await (await fetch(base + "/api/stats")).json()).total;
    let rows  = shown_rows(await (await fetch(base + "/")).text()).filter((r) => !r.option);

    for (const key of ["polymer_type=", "experimental_method="]) {
        let sum = rows.filter((r) => r.url.startsWith("/search?" + key)).reduce((a, r) => a + r.count, 0);
        assert.equal(sum, total, key);
    }
});

// Yes and No answer one question, so between them they hold every entry
// once: an entry with nothing modelled bound is a No, not missing.
test("every row's Yes and No add up to every entry, and the page links both", async () => {
    let total = await count_of("");
    let html = await (await fetch(base + "/")).text();
    let rows = BROWSE.flatMap((g) => g.rows);
    assert.equal(rows.length, 17);
    for (const row of rows) {
        assert.equal(await count_of(query_of(row.url)) + await count_of(query_of(row.no_url)), total, row.label);
        assert.ok(html.includes(`class="browse_no" href="${row.no_url.replaceAll("&", "&amp;")}"`), row.label);
        assert.ok(row.say_yes && row.say_no, "a pressed Yes or No says what it means in the bar");
    }
});

// The professor's ask: a shop shelf, most common first, read from the data,
// opened under Yes.
test("the 10 most frequent are the database's own, most entries first, water never a ligand", async () => {
    let rows = (await browse_counts()).flatMap((g) => g.rows.filter((r) => r.top));
    assert.deepEqual(rows.map((r) => r.params), [{ monomer_flag: ["Non-Standard"] }, { has_ligand: ["With ligands"] }]);
    for (const row of rows) {
        assert.ok(row.options.length > 0 && row.options.length <= BROWSE_TOP);
        let counts = row.options.map((r) => r.count);
        assert.deepEqual(counts, [...counts].sort((a, b) => b - a), "not most first");
        // A code is its own label; its name, when the PDB gives one, the note.
        assert.ok(row.options.every((r) => /^[A-Z0-9]{1,5}$/.test(r.label)), "every row is a code");
    }
    let ligands = rows[1].options.map((r) => r.label);
    assert.ok(!ligands.includes("HOH"));
    let direct = (await query(
        `SELECT comp_id FROM pdbx_entity_nonpoly WHERE comp_id <> 'HOH'
          GROUP BY 1 ORDER BY count(DISTINCT entry_id) DESC, 1 LIMIT 1`)).rows[0].comp_id;
    assert.equal(ligands[0], direct, "the first ligand is the most common one");

    // Options wait for Yes: none shows before the script opens them.
    let html = await (await fetch(base + "/")).text();
    let shelves = html.match(/<div class="browse_options"[^>]*>/g);
    assert.ok(shelves.length >= 5 && shelves.every((d) => d.endsWith(" hidden>")));
    assert.match(html, new RegExp(`${rows[1].options.length} most frequent <small>`));
});

// Ticking two codes asks for either, read as each would be alone; a name with
// a comma in it is still one name.
test("a list of codes finds entries with any of them; a name with a comma stays one name", async () => {
    let count = async (q) => (await (await fetch(base + "/api/count?" + q)).json()).total;
    let two = (await query(
        `SELECT comp_id FROM pdbx_entity_nonpoly WHERE comp_id <> 'HOH'
          GROUP BY 1 ORDER BY count(DISTINCT entry_id) DESC, 1 LIMIT 2`)).rows.map((r) => r.comp_id);
    let either = Number((await query(
        `SELECT count(DISTINCT entry_id) FROM pdbx_entity_nonpoly WHERE comp_id = ANY($1)`, [two])).rows[0].count);
    assert.ok(either > await count("ligand=" + two[0]), "the seed's two commonest ligands overlap entirely");
    assert.equal(await count("ligand=" + two.join(",")), either);
    assert.equal(await count("ligand=" + two.join(", ")), either, "spaces after commas are fine");

    let res = (await query(
        `SELECT cc.id FROM doc d CROSS JOIN LATERAL unnest(string_to_array(d.residue_codes, ', ')) r(code)
           JOIN chem_comp cc ON cc.id = r.code AND cc.mon_nstd_flag = 'n'
          GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 2`)).rows.map((r) => r.id);
    let any_res = Number((await query(
        `SELECT count(DISTINCT entry_id) FROM entity_poly_seq WHERE mon_id = ANY($1)`, [res])).rows[0].count);
    assert.equal(await count("nonstandard_residue=" + res.join(",")), any_res);

    // Not code-shaped, so still the one name it always was.
    assert.equal(await count("ligand=1,2-ETHANEDIOL"), await count("ligand=" + encodeURIComponent("1,2-ethanediol")));
    assert.equal(await count("ligand=MG,not a code"), 0, "a list with a name in it is one text, as before");
});

// Each kingdom opens on its own organisms, the commonest first, each one
// organism once: E. coli, not E. coli and its strain beside it.
test("each kingdom's most frequent organisms are its own, most entries first, none twice", async () => {
    let from = (await browse_counts()).find((g) => g.area === "from");
    let kingdoms = from.rows.filter((r) => r.within);
    assert.deepEqual(kingdoms.map((r) => r.within), ["Eukaryota", "Bacteria", "Archaea", "Viruses"]);
    // The seed has no viruses; the page draws no options for an empty list.
    assert.ok(kingdoms.filter((k) => k.options.length > 1).length >= 2);
    for (const k of kingdoms) {
        assert.ok(k.options.length <= BROWSE_TOP, k.label);
        let counts = k.options.map((r) => r.count);
        assert.deepEqual(counts, [...counts].sort((a, b) => b - a), `${k.label}: not most first`);
        for (const o of k.options) {
            let lineage = lineage_of(o.label);
            assert.ok(lineage.includes(name_key(k.within)), `${o.label} is not in ${k.label}`);
            assert.ok(!lineage.some((l) => l.startsWith("unclassified ")), `${o.label} names no one organism`);
            assert.ok(!k.options.some((p) => lineage.includes(name_key(p.label))), `${o.label} sits under another row`);
        }
    }
});

// The seed holds no species beside its own strain, so the choosing is
// checked on a made-up list, most entries first as the box gives it.
test("a kingdom lists a species once, without its strains, and nothing unplaced", () => {
    let list = ["Escherichia coli", "Escherichia coli K-12", "bacterium", "Homo sapiens",
                "Thermus thermophilus", "Escherichia coli BL21(DE3)", "Bacillus subtilis"]
        .map((code) => ({ code, name: "" }));
    assert.deepEqual(kingdom_organisms(list, "Bacteria").map((o) => o.code),
                     ["Escherichia coli", "Thermus thermophilus", "Bacillus subtilis"]);
    assert.deepEqual(kingdom_organisms(list, "Bacteria", 2).map((o) => o.code),
                     ["Escherichia coli", "Thermus thermophilus"]);
});

// The bands under X-ray and EM each answer one question, so each entry of
// the method falls in exactly one of its bands, and nothing else in any. A
// band is a method value, so a band of X-ray and EM itself are either.
test("the resolution bands hold every X-ray and EM entry once; bands and methods find either", async () => {
    let enc = (values) => "experimental_method=" + encodeURIComponent(values.join(","));
    let rows = (await browse_counts()).find((g) => g.area === "method").rows;
    for (const [method, bands] of Object.entries(RESOLUTION_BANDS)) {
        let row = rows.find((r) => r.params.experimental_method[0] === method);
        assert.deepEqual(row.options.map((r) => r.label), bands.map((b) => b.short), method);
        assert.equal(row.options.reduce((a, r) => a + r.count, 0), row.count, `${method}: a band misses or doubles an entry`);
        assert.ok(row.options.every((r) => r.say === bands.find((b) => b.short === r.label).label));

        let [a, b] = bands.slice(1, 3).map((band) => band.value);
        assert.equal(await count_of(enc([a, b])), await count_of(enc([a])) + await count_of(enc([b])), method);
        assert.equal(await count_of(enc([a, "SOLUTION NMR"])),
                     await count_of(enc([a])) + await count_of(enc(["SOLUTION NMR"])), "a band or NMR is either");
        assert.equal(await count_of(enc([a, method])), await count_of(enc([method])), "the whole method holds its band");
        assert.equal(await count_of(enc([method + ":nonsense"])), 0, "an unknown band finds nothing, as an unknown method");
    }
    // Full search shows a band picked on the landing page, so it can be turned off.
    let html = await (await fetch(base + "/search?" + enc([RESOLUTION_BANDS["ELECTRON MICROSCOPY"][2].value]))).text();
    assert.match(html, /class="pill pill_band selected" data-value="ELECTRON MICROSCOPY:3-3.5">EM 3 to 3.5 Å</);
    assert.match(html, /class="pill pill_band" data-value="X-RAY DIFFRACTION:2-2.5">/);
});

// not_<key> turns one filter round, so a filter and its not hold every
// entry between them, whatever the filter: text, pills, a list, a band.
test("a filter and its not add up to every entry, an entry it cannot judge counted as not", async () => {
    let count = async (q) => (await (await fetch(base + "/api/count?" + q)).json()).total;
    let total = await count("");
    for (const q of ["source_organism=Bacteria", "ligand=MG", "polymer_type=DNA", "polymer_type=DNA,RNA",
                     "experimental_method=X-RAY%20DIFFRACTION%3A2-2.5", "nonstandard_residue=PSU,5MC", "synthetic=Synthetic",
                     // NMR has no resolution: neither in nor out would lose it.
                     "resolution_min=2"]) {
        assert.equal(await count(q) + await count("not_" + q), total, q);
    }
    // Many values in one not_ are none of them.
    assert.equal(await count("not_source_organism=Eukaryota,Bacteria"), total - await count("source_organism=Eukaryota,Bacteria"));
    // A not and a tick both hold; "not with ligands" is "without".
    assert.equal(await count("experimental_method=X-RAY%20DIFFRACTION&not_has_ligand=With%20ligands"),
                 await count("experimental_method=X-RAY%20DIFFRACTION&has_ligand=Without%20ligands"));
    // The box has none (Excludes turns the whole search), and an unknown key asks nothing.
    assert.equal(await count("not_q=tRNA"), total);
    assert.equal(await count("not_no_such_filter=1"), total);
});

// Ticking two kingdoms means either, as two ligand codes do. Read as one
// name, "Eukaryota,Bacteria" found nothing.
test("a list of taxa finds entries from any of them; a name that is no taxon stays text", async () => {
    let ids = async (params) => {
        let { where, values } = build_where(params);
        return new Set((await query(`SELECT e.id FROM entry e WHERE ${where}`, values)).rows.map((r) => r.id));
    };
    let union = async (...names) => new Set((await Promise.all(names.map((n) => ids({ source_organism: n })))).flatMap((s) => [...s]));
    let either = await union("Eukaryota", "Bacteria");
    assert.ok(either.size > 0);
    assert.deepEqual(await ids({ source_organism: "Eukaryota,Bacteria" }), either);
    assert.deepEqual(await ids({ source_organism: "human, Bacteria" }), await union("human", "Bacteria"),
                     "a common name in the list is read as if typed alone");
    assert.equal((await ids({ source_organism: "Bacteria,no such organism" })).size, 0, "one text, as before");
});

// NAKB's labels are hand-made and can be wrong (an oligo labelled ribosome),
// so the front page does not offer them. Full search still can.
test("the landing page shows its five questions, laid out 2-1-2, without NAKB labels", async () => {
    let html = await (await fetch(base + "/")).text();
    assert.equal(BROWSE.length, 5);
    assert.ok(!BROWSE.some((g) => g.question === "Which molecule?"));
    assert.ok(!/nakb/i.test(html), "the landing page still shows NAKB");

    // The page is in BROWSE order, which is how a phone stacks the cards.
    let at = BROWSE.map((g) => html.indexOf(g.question));
    assert.deepEqual(at, [...at].sort((a, b) => a - b), "the page does not follow BROWSE order");
    for (const g of BROWSE) assert.ok(html.includes(`style="grid-area: ${g.area}"`), g.area);

    // Desktop: two left, the middle spanning both rows, two right. Tablet: two
    // columns. Phone: one column in BROWSE order. Every area a card names is
    // in each grid.
    let css = readFileSync(new URL("./public/style.css", import.meta.url), "utf8");
    let grids = [...css.matchAll(/\.browse \{[^}]*grid-template-areas:([^;]+);/g)].map((m) => m[1].match(/"[^"]+"/g).map((r) => r.slice(1, -1).trim().split(/\s+/)));
    let [desk, tablet, phone] = grids;
    assert.equal(grids.length, 3, "desktop, tablet and phone");
    assert.deepEqual(new Set(tablet.flat()), new Set(BROWSE.map((g) => g.area)));
    assert.deepEqual(desk.map((r) => r.length), [3, 3]);
    assert.equal(desk[0][1], desk[1][1], "the middle card spans both rows");
    assert.notEqual(desk[0][0], desk[1][0]);
    assert.notEqual(desk[0][2], desk[1][2]);
    assert.deepEqual(new Set(desk.flat()), new Set(BROWSE.map((g) => g.area)));
    assert.deepEqual(phone.flat(), BROWSE.map((g) => g.area), "a phone stacks the cards out of order");

    for (const group of BROWSE) assert.ok(html.includes(group.question), group.question);
    assert.ok(html.includes("Not sure what to type? Start from what you know."));
    assert.ok(!html.includes("\u2014"), "no em dash on the landing page");
});

// Counted from the residues themselves, not the doc view the filter reads.
test("a modification finds the entries holding any of its codes", async () => {
    for (const m of MODIFICATIONS) {
        let direct = Number((await query(
            `SELECT count(DISTINCT entry_id) FROM entity_poly_seq WHERE mon_id = ANY($1)`, [m.codes])).rows[0].count);
        let api = (await (await fetch(base + "/api/count?modification=" + encodeURIComponent(m.value))).json()).total;
        assert.equal(api, direct, m.value);
    }
    let none = (await (await fetch(base + "/api/count?modification=nonsense")).json()).total;
    assert.equal(none, 0, "an unknown modification matches nothing");
});

test("with and without ligands add up to every entry, water not counted", async () => {
    let total = (await (await fetch(base + "/api/stats")).json()).total;
    let count = async (v) => (await (await fetch(base + "/api/count?has_ligand=" + encodeURIComponent(v))).json()).total;
    let with_ = await count("With ligands");
    assert.equal(with_ + await count("Without ligands"), total);
    let direct = Number((await query(
        `SELECT count(DISTINCT entry_id) FROM pdbx_entity_nonpoly WHERE comp_id <> 'HOH'`)).rows[0].count);
    assert.ok(direct > 0 && direct < total, "the seed has entries with and without ligands");
    assert.equal(with_, direct);
});

// The seed (db/make_seed.mjs) has entries with water only, ions only, both
// and neither, so these two cannot pass by matching each other's rows.
test("with and without water add up to every entry, and with is every entry that models HOH", async () => {
    let total = (await (await fetch(base + "/api/stats")).json()).total;
    let count = async (v) => (await (await fetch(base + "/api/count?has_water=" + encodeURIComponent(v))).json()).total;
    let with_ = await count("With water");
    assert.equal(with_ + await count("Without water"), total);
    let direct = Number((await query(
        `SELECT count(DISTINCT entry_id) FROM pdbx_entity_nonpoly WHERE comp_id = 'HOH'`)).rows[0].count);
    assert.ok(direct > 0 && direct < total, "the seed has entries with and without water");
    assert.equal(with_, direct);
});

// NAKB's labels are hand-made and can be wrong, so neither page offers them.
test("no NAKB molecule filter is left anywhere", async () => {
    assert.ok(!FILTERS.some((f) => f.key === "topic"));
    for (const path of ["/", "/search?panel=open"]) {
        let html = await (await fetch(base + path)).text();
        assert.ok(!/nakb/i.test(html), `${path} still shows NAKB`);
    }
});

// The footer links before its pages are written; each must still answer.
// --- the citation, to save or copy ---------------------------------------
// The seed's 4TNA has a primary citation of one author and nothing else: it
// is not in citations.json, so it is the PDB's. 1DN8 is.

test("the citation downloads as RIS for EndNote and Zotero, named after the entry", async () => {
    let res = await fetch(base + "/structure/4tna/citation?format=ris");
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/x-research-info-systems; charset=utf-8");
    assert.match(res.headers.get("content-disposition"), /^attachment; filename="4TNA\.ris"$/);
    let body = await res.text();
    assert.match(body, /^TY  - JOUR\r\n/);
    assert.match(body, /\r\nAU  - Hingerty, B\.E\.\r\n/);
    assert.match(body, /\r\nER  - \r\n$/);
});

test("the citation downloads as BibTeX", async () => {
    let res = await fetch(base + "/structure/4TNA/citation?format=bib");
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/x-bibtex; charset=utf-8");
    assert.match(res.headers.get("content-disposition"), /filename="4TNA\.bib"/);
    assert.match(await res.text(), /^@article\{PDB4TNA,\n  author    = \{Hingerty, B\. E\.\},/);
});

test("a citation in an unknown format is a 400, and an unknown entry a 404", async () => {
    assert.equal((await fetch(base + "/structure/4TNA/citation?format=xml")).status, 400);
    assert.equal((await fetch(base + "/structure/4TNA/citation")).status, 400);
    assert.equal((await fetch(base + "/structure/ZZZZ/citation?format=ris")).status, 404);
});

test("the Citation section holds one citation, to save or copy", async () => {
    let html = await (await fetch(base + "/structure/4TNA")).text();
    let from = html.indexOf('<section id="citations"'), to = html.indexOf("</section>", from);
    let part = html.slice(from, to);
    assert.match(part, />Citation</);
    assert.equal(part.match(/class="citation"/g)?.length, 1);
    assert.ok(part.includes('href="/structure/4TNA/citation?format=ris" download'));
    assert.ok(part.includes('href="/structure/4TNA/citation?format=bib" download'));
    assert.ok(part.includes('data-text="Hingerty, B.E."'), "Copy carries the citation as text");
});

test("Published and Authors at the top follow a checked reference, and only that", () => {
    let rows = [{ key: "published", value: "Nucleic Acids Res. 2020" }, { key: "all_authors", value: "Yu, H." },
                { key: "method", value: "X-RAY DIFFRACTION" }];
    let ref = { source: "reference", type: "article", journal: "Nucleic Acids Research", journal_abbrev: "Nucleic Acids Res",
                year: 2021, authors: [{ family: "Yu", given: "Hao" }, { name: "MCSG" }] };
    assert.deepEqual(cited_rows(rows, ref).map((r) => r.value), ["Nucleic Acids Res 2021", "Yu, H., MCSG", "X-RAY DIFFRACTION"]);
    assert.equal(cited_rows(rows, { ...ref, type: "preprint", journal: "bioRxiv" })[0].value, "bioRxiv preprint 2021");
    assert.deepEqual(cited_rows(rows, { ...ref, source: "pdb" }), rows);
    assert.deepEqual(cited_rows(rows, null), rows);
});

test("a checked reference gives full names, the issue and the abstract, and fills the top rows", async () => {
    let c = await entry_citation("1DN8");
    let html = await (await fetch(base + "/structure/1DN8")).text();
    let from = html.indexOf('<section id="citations"'), to = html.indexOf("</section>", from);
    let part = html.slice(from, to);
    let first = c.authors[0];
    assert.ok(part.includes(`${first.given} ${first.family}`), "full name in the section");
    if (c.abstract) assert.match(part, /<summary>Abstract<\/summary>/);
    let ris = await (await fetch(base + "/structure/1DN8/citation?format=ris")).text();
    assert.match(ris, new RegExp(`\r\nT2  - ${c.journal}\r\n`));
    assert.match(ris, new RegExp(`\r\nDO  - ${c.doi.replace(/[.()]/g, "\\$&")}\r\n`));
});

test("Save reference sits beside Published at the top of the page", async () => {
    // The seed has no journals, so Published is given here.
    let entry = { ...(await find_entry("4TNA")), published: "Nature 2020" };
    let page = { entry, rows: detail_rows(entry), citation: { source: "pdb", title: "T", authors: [{ family: "A", given: "B." }], journal: "Nature", year: 2020 },
                 molecules: { groups: [], fasta: {} }, base_pairs: null, arcs: null, nucleic_chains: 0, same_entries: 0 };
    let html = await render("structure", { ...page, page: "search", sections: structure_sections(page),
                                           PAGE_GROUPS, rail_query: "", cite_text: "A, B. T.", cite_unpublished: false, full_name });
    let row = html.slice(html.indexOf("published_value"), html.indexOf("</details>", html.indexOf("published_value")));
    assert.ok(row.includes("Nature 2020"));
    assert.ok(row.includes('href="/structure/4TNA/citation?format=ris"'));
});

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

async function page_with_arcs(arcs, nucleic_chains = 0, same_entries = 0, view, arc_view) {
    let entry = await find_entry("4TNA");
    let [contents, residues] = await Promise.all([entry_contents("4TNA"), entry_residues("4TNA")]);
    let page = { entry, rows: detail_rows(entry), citation: null,
                 molecules: molecule_groups(contents, residues), base_pairs: null, arcs, nucleic_chains,
                 same_entries };
    return render("structure", { ...page, page: "search", sections: structure_sections(page),
                                 PAGE_GROUPS, rail_query: "", view, arc_view });
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
    assert.ok(html.includes("′ marks a copy from the crystal's symmetry"));
    assert.ok(!html.includes("arc_mod"), "nothing modified, no key entry for it");
    assert.ok(!html.includes('<i class="arc_gu">') && !html.includes('<i class="arc_nc">'),
              "the key lists only the kinds drawn");
});

test("the picture offers Assembly 1 | Asymmetric unit, and the expanded view follows it", async () => {
    let one = pair_arcs(dna(["A"], 4), plain(4), [arc_pair("A", 1, "A", 4, "wc", "2")]);
    let arc_view = { key: "1", assembly: true, note: { text: "Assembly 1 has 30 strands.", link: "au", link_text: "The asymmetric unit is easier to read." },
                     options: [{ key: "1", label: "Assembly 1", current: true, title: "In the cell" },
                               { key: "au", label: "Asymmetric unit", current: false, title: "As stored" }],
                     about: ["Assembly 1 builds 1 strand by symmetry, drawn dashed.", "Under the line: <pairs>"] };
    let html = pairs_section(await page_with_arcs(one, 0, 0, undefined, arc_view));

    assert.match(html, /<nav class="arc_views" aria-label="Which chains to draw">\s*<a href="\?assembly=1#base-pairs" title="In the cell" aria-current="true">Assembly 1<\/a><a href="\?assembly=au#base-pairs" title="As stored">Asymmetric unit<\/a>/);
    assert.equal((html.match(/data-arc-view="1"/g) || []).length, 2, "both open buttons ask for the same view");
    assert.ok(html.includes('<span class="arc_note">Assembly 1 builds 1 strand by symmetry, drawn dashed.</span>'));
    assert.ok(html.includes('<span class="arc_note">Under the line: &lt;pairs&gt;</span>'), "each line said once, escaped");
    assert.ok(!html.includes("′ marks a copy"), "the assembly's own line says it, not the crystal note");
    assert.match(html, /Assembly 1 has 30 strands\. <a href="\?assembly=au#base-pairs">The asymmetric unit is easier to read\.<\/a>/);

    let plain_page = pairs_section(await page_with_arcs(one));
    assert.ok(!plain_page.includes("arc_views"), "no assemblies known: no choice to offer");
    assert.ok(plain_page.includes("′ marks a copy from the crystal's symmetry"));
});

test("the arcs API gives the viewer every pair as numbers, and a 404 for an unknown entry", async () => {
    let res = await fetch(base + "/api/entries/4tna/arcs");
    assert.equal(res.status, 200);
    let body = await res.json();
    assert.deepEqual({ ...body, title: undefined }, { pdb_id: "4TNA", title: undefined, view: "au", strands: [], pairs: [] }, "the seed has no pairs, nor assemblies");
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

test("Views opens the page: 1D, 2D and 3D tiles, the 1D dot-bracket open and drawn by its own script", async () => {
    let html = await page_with_arcs(null, 2);
    let views = section(html, "views");
    assert.ok(html.indexOf('id="views"') < html.indexOf('id="overview"'), "Views comes first");
    assert.match(html, /class="nav_item nav_solo[^"]*" href="#views"|href="#views" class="nav_item nav_solo/,
                 "its own sidebar link, with no group label over it");
    assert.ok(!views.includes('class="band_group"'), "and no group name over its title");

    assert.match(views, /role="tablist"/);
    let tabs = [...views.matchAll(/<button[^>]*role="tab"[^>]*>/g)].map((m) => m[0]);
    assert.deepEqual(tabs.map((t) => t.match(/data-view="(\w+)"/)[1]), ["1d", "2d", "3d"]);
    assert.deepEqual(tabs.map((t) => t.match(/aria-selected="(\w+)"/)[1]), ["true", "false", "false"]);
    for (const v of ["1d", "2d", "3d"]) {
        assert.match(views, new RegExp(`role="tabpanel"[^>]*aria-labelledby="view-${v}-tab"`), `${v} has its panel`);
        assert.match(views, new RegExp(`id="view-${v}-tab"[^>]*aria-controls="view-${v}"`));
    }
    let panel = (v) => views.match(new RegExp(`<div[^>]*id="view-${v}"[^>]*>`))[0];
    assert.ok(!/ hidden/.test(panel("1d")) && / hidden/.test(panel("2d")) && / hidden/.test(panel("3d")),
              "1D open, the others closed");

    assert.match(views, /class="lbn" data-entry="4TNA"/, "1D is the plain dot-bracket");
    assert.ok(!views.includes('class="seqmap"') && !views.includes("sequence-map-guide"),
              "the Sequence map, NtC bars and all, stays in its own section");
    assert.match(views, /href="#sequence-map"/, "1D points to the full map");
    assert.match(html, /<script type="module" src="\/views.js"><\/script>/);
    assert.ok(!/\u2014/.test(views), "no em dash in what the section says");
    let script = await (await fetch(base + "/views.js")).text();
    assert.ok(!/\u2014/.test(script), "no em dash anywhere the script writes");

    let none = await (await fetch(base + "/structure/4TNA")).text();
    assert.ok(section(none, "views").includes("None recorded"), "no chains, nothing to draw");
    assert.ok(!section(none, "views").includes('role="tablist"'), "and no tiles for nothing");
    assert.ok(!none.includes("/views.js"), "and no script for it");
});

// MG3: the Views move beside the page on a wide screen and the page itself
// stays as it was; the table of other pairs is linked to the 1D view.
test("each other pair links to the 1D view by its two ends; wide, the Views take a column beside the sections", async () => {
    let entry = await find_entry("4TNA");
    let [contents, residues] = await Promise.all([entry_contents("4TNA"), entry_residues("4TNA")]);
    let bp = (label_2, pos_2, copy_2, kind, family) => ({ label_1: "A", pos_1: 3, copy_1: "1", label_2, pos_2, copy_2,
        chain_1: "A", chain_2: label_2, kind, family, bases: "CG", res_1: "G3", res_2: `C${pos_2}` });
    let page = { entry, rows: detail_rows(entry), citation: null, molecules: molecule_groups(contents, residues),
                 base_pairs: base_pair_section([bp("A", 9, "1", "wc", "cWW"), bp("B", 4, "2_755", "nc", "tWH")]),
                 arcs: null, nucleic_chains: 2, same_entries: 0 };
    let sections = structure_sections(page);
    let html = await render("structure", { ...page, page: "search", sections, PAGE_GROUPS, rail_query: "" });
    let pairs = pairs_section(html);

    assert.match(pairs, /<tr data-a="A 3" data-b="B:2_755 4"><td>A \/ B<\/td><td><a class="pair_show" href="#views">G3 – C4<\/a><\/td>/,
                 "the ends as the 1D view keys its columns, the copy's included; the pair's words unchanged");
    assert.equal((pairs.match(/<tr data-a=/g) || []).length, 1, "only the other pairs: Watson–Crick ones have no row");
    assert.match(pairs, /<p class="pair_hint">Select a pair to show it in the 1D view\.<\/p>/);

    // The page keeps its order: Views first, then every section as before.
    assert.ok(html.indexOf('<section id="views"') < html.indexOf('<section id="overview"'));
    assert.match(html, new RegExp(`<div class="detail_body" style="--rows: ${sections.length - 1}">`),
                 "one row per section beside the Views");

    let css = readFileSync(new URL("./public/style.css", import.meta.url), "utf8");
    let js = readFileSync(new URL("./public/views.js", import.meta.url), "utf8");
    let side = js.match(/const SIDE = "([^"]+)"/)[1];
    let wide = css.slice(css.indexOf(`@media ${side} {`));
    assert.ok(css.includes(`@media ${side} {`), "the script and the page agree on when the Views sit beside");
    wide = wide.slice(0, wide.indexOf("\n}\n"));
    assert.match(wide, /grid-template-rows: repeat\(var\(--rows\), auto\) 1fr;/,
                 "a last 1fr row takes the Views' extra height, so no gap opens between sections");
    assert.match(wide, /> #views \{[^}]*grid-column: 2;[^}]*grid-row: 1 \/ -1;[^}]*position: sticky;/);
    assert.match(wide, /overflow: visible;/, "a scrolling detail_body would hold the sticky Views still");
    assert.match(wide, /#views > \.section_body \{\s*max-height: calc\(100vh - 146px - var\(--footer-h\)\);\s*overflow-y: auto;/,
                 "never taller than the window, the band and its help note outside the scroll");
    assert.match(wide, /\.section_nav \.group_views \{ display: none; \}/);
    assert.ok(!/\u2014/.test(pairs), "no em dash in the new words");
});

test("?view= opens that view; anything else opens 1D; the 3D slot is a place kept, linking nowhere", async () => {
    let tab = (html, v) => section(html, "views").match(new RegExp(`<button[^>]*data-view="${v}"[^>]*>`))[0];
    let panel = (html, v) => section(html, "views").match(new RegExp(`<div[^>]*id="view-${v}"[^>]*>`))[0];

    let three = await page_with_arcs(null, 2, 0, "3d");
    assert.match(tab(three, "3d"), /aria-selected="true"/);
    assert.match(tab(three, "1d"), /aria-selected="false"/);
    assert.ok(!/tabindex/.test(tab(three, "3d")) && /tabindex="-1"/.test(tab(three, "1d")), "Tab reaches the open one");
    assert.ok(!/ hidden/.test(panel(three, "3d")) && / hidden/.test(panel(three, "1d")) && / hidden/.test(panel(three, "2d")));
    let slot = section(three, "views").slice(section(three, "views").indexOf('id="view-3d"'));
    // The professor's ask (C2): no viewers elsewhere; the place waits for our own.
    assert.match(slot, /class="view_slot"/);
    assert.match(slot, /will be shown here/);
    assert.ok(!/<a |rcsb|pdbe|molstar/i.test(slot), "the 3D slot sends no one to another viewer");
    assert.ok(!/\u2014/.test(slot));

    let two = await page_with_arcs(null, 2, 0, "2d");
    let kept = section(two, "views").slice(section(two, "views").indexOf('id="view-2d"'), section(two, "views").indexOf('id="view-3d"'));
    assert.ok(!/ hidden/.test(panel(two, "2d")), "?view=2d opens 2D");
    assert.match(kept, /class="view_slot"/, "2D is a place kept, like 3D");
    assert.match(kept, /will be shown here/);
    assert.ok(!/R2DT|not drawn yet|<a /.test(kept), "and promises no method and links nowhere yet");

    assert.deepEqual(["1d", "2d", "3d"].map(asked_view), ["1d", "2d", "3d"]);
    for (const asked of [undefined, "", "4d", "3D", "<b>", ["2d", "3d"]]) {
        assert.equal(asked_view(asked), "1d", `${JSON.stringify(asked)} opens 1D`);
    }
    assert.equal((await fetch(base + "/structure/4TNA?view=%3Cb%3E")).status, 200, "a bad view is no error");
});

test("the 3D view frames our own viewer, lazily, and the page is isolated so coot can run", async () => {
    // Rendered both ways round: a server with a viewer build in viewer/ and
    // one without. page_with_arcs leaves `viewer` unset, which is the second
    // of those, so the kept-place assertions above cover a bare checkout.
    let entry = await find_entry("4TNA");
    let [contents, residues] = await Promise.all([entry_contents("4TNA"), entry_residues("4TNA")]);
    let page = { entry, rows: detail_rows(entry), citation: null, base_pairs: null, arcs: null,
                 molecules: molecule_groups(contents, residues), nucleic_chains: 2, same_entries: 0 };
    let with_viewer = await render("structure", { ...page, page: "search", sections: structure_sections(page),
                                                 PAGE_GROUPS, rail_query: "", view: "3d", viewer: true });
    let slot = section(with_viewer, "views");
    slot = slot.slice(slot.indexOf('id="view-3d"'));

    assert.match(slot, /<div class="view_3d" data-src="\/viewer\/\?embed=1&amp;id=4TNA" data-entry="4TNA">/,
                 "the frame's address is our own viewer, with the entry to show");
    assert.ok(!/<iframe/.test(slot),
              "and it is not in the HTML: the frame downloads and annotates the entry, so it waits for the tile");
    assert.ok(!/<a |rcsb|pdbe|molstar/i.test(slot), "still sends no one to another viewer");
    assert.ok(!/\u2014/.test(slot), "no em dash in the new words");

    let js = readFileSync(new URL("./public/views.js", import.meta.url), "utf8");
    assert.match(js, /mount_3d/, "the script makes the frame");
    assert.match(js, /box\.dataset\.mounted/, "once only, so a second click never restarts the run");

    let css = readFileSync(new URL("./public/style.css", import.meta.url), "utf8");
    assert.match(css, /\.view_3d_frame \{[^}]*height: 100%/, "the frame fills the box it is given");
    // The box itself takes the height the reading area has left, and only
    // while 3D is open: 1D is a few lines and must not be stretched.
    assert.match(css, /#views > \.section_body:has\(#view-3d:not\(\[hidden\]\)\) \{[^}]*height: calc\(100vh - 146px - var\(--footer-h\)\);/);
    assert.match(css, /#views > \.section_body:has\(#view-3d:not\(\[hidden\]\)\) \.view_3d \{ height: auto; \}/,
                 "inside that chain the fixed fallback height gives way");
    assert.match(css, /height: calc\(100vh - 191px - var\(--footer-h\)\);/,
                 "and 45px less again where the sections list is a strip across the top");

    // Selected by a scroll, 3D offers itself rather than starting: the page
    // must not download and annotate an entry because someone read past
    // Conformation on their way to the citations.
    assert.match(slot, /<button type="button" class="view_3d_start">/);
    assert.match(js, /view === "3d" && !auto/, "an automatic switch makes no frame");
    assert.match(js, /document\.addEventListener\("na3db:section", \(e\) => \{\s*if \(chosen\) return;/,
                 "a view the reader picked is never taken away; every width follows otherwise");
    // The page's own scroll spy is the one that knows the section; both
    // files have to name the same event or the Views never hear it.
    let spy = readFileSync(new URL("./views/structure.ejs", import.meta.url), "utf8");
    let event = js.match(/addEventListener\("(na3db:[a-z]+)"/)[1];
    assert.ok(spy.includes(`new CustomEvent("${event}"`), "the spy announces what the Views listen for");

    // Moorhen's coot needs SharedArrayBuffer, which the browser grants only a
    // cross-origin-isolated page -- and a frame is isolated only when the
    // document around it is, so these are the structure page's own headers.
    let res = await fetch(base + "/structure/4TNA");
    assert.equal(res.headers.get("cross-origin-opener-policy"), "same-origin");
    assert.equal(res.headers.get("cross-origin-embedder-policy"), "require-corp");
    // Not the whole site: require-corp would block any cross-origin image or
    // script a page added later without CORS or CORP.
    assert.equal((await fetch(base + "/search")).headers.get("cross-origin-embedder-policy"), null);

    if (viewer_installed) {
        let frame = await fetch(base + "/viewer/?embed=1&id=4TNA");
        assert.equal(frame.status, 200);
        assert.equal(frame.headers.get("cross-origin-embedder-policy"), "require-corp",
                     "the framed document has to agree to being isolated too");
        assert.equal(frame.headers.get("cross-origin-resource-policy"), "same-origin");
        assert.match(await frame.text(), /<div id="root">/, "the viewer's own page");
        assert.equal((await fetch(base + "/viewer/napair.wasm")).headers.get("content-type"), "application/wasm");
    } else {
        // No build installed: the 3D view says so rather than framing a 404.
        let bare = await render("structure", { ...page, page: "search", sections: structure_sections(page),
                                              PAGE_GROUPS, rail_query: "", view: "3d", viewer: false });
        let kept = section(bare, "views");
        assert.match(kept.slice(kept.indexOf('id="view-3d"')), /will be shown here/);
        assert.equal((await fetch(base + "/viewer/")).status, 404);
    }
});

test("one handle in the gutter swaps which column is the wide one", async () => {
    let html = await page_with_arcs(null, 2);
    let views = section(html, "views");

    assert.match(views, /<button type="button" class="download download_small band_swap" aria-pressed="false">/,
                 "the same button as the FASTA and CSV ones beside it, and off to begin with");
    assert.equal((html.match(/class="download download_small band_swap"/g) || []).length, 1,
                 "one of them on the page: the other sections share the row, they do not own it");
    let sheet = readFileSync(new URL("./public/style.css", import.meta.url), "utf8");
    assert.match(sheet, /\.band_swap::before \{[^}]*mask-image/,
                 "its own glyph in place of the download arrow");
    assert.match(views, /<span class="band_swap_say">Enlarge views<\/span>/,
                 "it says what the click does, so it is not a shape to work out");
    assert.match(views, /band_tools[\s\S]{0,900}band_swap/, "in the Views band, with the other tools");

    // Applied before the page is drawn, or the columns are laid out one way
    // and swapped a frame later, in front of the reader.
    assert.match(html, /localStorage\.getItem\("views_wide"\) === "on"/);
    assert.ok(html.indexOf('localStorage.getItem("views_wide")') < html.indexOf('<div class="detail_body"'),
              "the class is set above the body it changes");
    assert.match(html, /localStorage\.setItem\("views_wide", on \? "on" : "off"\)/, "and remembered");

    let css = readFileSync(new URL("./public/style.css", import.meta.url), "utf8");
    let js = readFileSync(new URL("./public/views.js", import.meta.url), "utf8");
    let side = js.match(/const SIDE = "([^"]+)"/)[1];
    let wide = css.slice(css.indexOf(`@media ${side} {`));
    wide = wide.slice(0, wide.indexOf("\n}\n"));

    assert.match(wide, /grid-template-columns: minmax\(0, 1fr\) var\(--viewer\);/, "the row as it starts");
    assert.match(wide, /\.structure_page\.views_wide \.detail_body \{\s*grid-template-columns: var\(--viewer\) minmax\(0, 1fr\);/,
                 "swapped, the two widths trade places and nothing moves sideways");
    assert.match(wide, /\.band_swap \{ display: inline-flex; \}/,
                 "shown only where there are two columns to swap");
    let page = readFileSync(new URL("./views/structure.ejs", import.meta.url), "utf8");
    assert.match(page, /textContent = on \? "Shrink views" : "Enlarge views"/, "and the words follow the state");
    assert.match(css, /\.band_swap \{[^}]*display: none;/, "and hidden everywhere else");
    assert.ok(!/\u2014/.test(views), "no em dash in the new words");
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
