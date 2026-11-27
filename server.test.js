import test, { before, after } from "node:test";
import assert from "node:assert";
import { FILTERS, COLUMNS, TEXT_FILTERS, PILL_FILTERS, BROWSE, MODIFICATIONS, RESOLUTION_BANDS } from "./filters.js";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import app, { cited_rows, viewer_installed, pairs_reply } from "./server.js";
import { close as close_db, query } from "./db.js";
import { find_entry, entry_contents, entry_residues, entry_citation, entry_base_pairs, entry_ntc_classes, browse_counts, build_where, kingdom_organisms, BROWSE_TOP } from "./search.js";
import { lineage_of, name_key } from "./taxonomy.js";
import { detail_rows, molecule_groups, arc_views, base_pair_section, ntc_section } from "./detail.js";
import help from "./help_texts.js";

let base;
let server;

before(async () => {
    server = app.listen(0);
    await once(server, "listening");
    base = `http://localhost:${server.address().port}`;
});

after(async () => {
    server.close();
    await close_db();
});

test("the search page is served at /", async () => {
    let res = await fetch(base + "/search");

    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /html/);
});

test("the report page is served at /report", async () => {
    assert.equal((await fetch(base + "/report")).status, 200);
});

test("a structure page is built from our own data", async () => {
    assert.equal((await fetch(base + "/structure/4TNA")).status, 200);
    let body = await (await fetch(base + "/api/entries/4TNA")).json();
    assert.match(body.title, /FURTHER REFINEMENT/);
});

test("a structure page ignores case in the id", async () => {
    assert.equal((await fetch(base + "/structure/4tna")).status, 200);
});

test("an unknown structure is a real 404, not a 200 that says not found", async () => {
    assert.equal((await fetch(base + "/structure/ZZZZ")).status, 404);
});

test("/api/health reports the database is reachable", async () => {
    let res = await fetch(base + "/api/health");
    let body = await res.json();

    assert.equal(res.status, 200);
    assert.deepEqual(body, { ok: true, database: "up" });
});

test("/api/stats counts the entries in the database", async () => {
    let res = await fetch(base + "/api/stats");
    let body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(typeof body.total, "number");
    assert.ok(body.total > 0);
    assert.ok(body.updated === null || !Number.isNaN(Date.parse(body.updated)), body.updated);
});

test("/api/browse sends the landing cards and only what drawing them needs", async () => {
    let res = await fetch(base + "/api/browse");
    let groups = await res.json();

    assert.equal(res.status, 200);
    assert.deepEqual(groups.map((g) => g.area), ["made", "from", "method", "modified", "bound"]);
    for (const g of groups) {
        assert.deepEqual(Object.keys(g).sort(), ["area", "foot", "hint", "question", "rows"]);
        assert.ok(g.foot === null || typeof g.foot.text === "string");
        for (const row of g.rows) {
            assert.deepEqual(Object.keys(row).sort(),
                ["count", "label", "no_url", "options", "options_name", "say_no", "say_yes", "share", "url"]);
            assert.equal(typeof row.count, "number");
            assert.ok(row.share >= 0 && row.share <= 1);
            assert.match(row.url, /^\/search\?/);
            assert.match(row.no_url, /^\/search\?/);
            for (const o of row.options) {
                assert.deepEqual(Object.keys(o).sort(), ["count", "label", "note", "say", "share", "url"]);
                assert.match(o.url, /^\/search\?/);
            }
        }
    }
    let counts = (await browse_counts()).flatMap((g) => g.rows.map((r) => r.count));
    assert.deepEqual(groups.flatMap((g) => g.rows.map((r) => r.count)), counts);
});

test("/api/pill_counts sends the counts the search panel's pills show", async () => {
    let res = await fetch(base + "/api/pill_counts");
    let counts = await res.json();

    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(counts), FILTERS.filter((f) => f.count_by).map((f) => f.key));

    let checked = 0;
    for (const [key, by_value] of Object.entries(counts)) {
        for (const [value, n] of Object.entries(by_value)) {
            assert.equal(await count_of(new URLSearchParams({ [key]: value })), n, `${key}=${value}`);
            checked++;
        }
    }
    assert.ok(checked > 0, "some pills carry a count");
});

test("/api/entries/:id rows are the rows the structure page shows", async () => {
    let ids = [...new Set(["1DN8", ...(await (await fetch(base + "/api/entries?per_page=50")).json()).results.map((e) => e.pdb_id)])];
    for (const id of ids) {
        let body = await (await fetch(base + "/api/entries/" + id)).json();
        let expected = cited_rows(detail_rows(await find_entry(id)), await entry_citation(id));
        assert.deepEqual(body.rows, JSON.parse(JSON.stringify(expected)), id);
    }
});

test("/api/entries/:id/molecules is the page's molecule groups", async () => {
    for (const id of ["1DN8", "4TNA"]) {
        let body = await (await fetch(base + `/api/entries/${id}/molecules`)).json();
        let expected = molecule_groups(await entry_contents(id), await entry_residues(id));
        assert.deepEqual(body, JSON.parse(JSON.stringify(expected)), id);
    }
    assert.equal((await fetch(base + "/api/entries/ZZZZ/molecules")).status, 404);
});

test("/api/entries/:id/pairs is the page's base pairs, arcs and NtC families", async () => {
    for (const id of ["1DN8", "4TNA"]) {
        for (const asked of ["", "au"]) {
            let body = await (await fetch(base + `/api/entries/${id}/pairs?assembly=${asked}`)).json();
            let html = await (await fetch(base + `/structure/${id}?assembly=${asked}`)).text();
            let pairs = await entry_base_pairs(id);
            assert.deepEqual(body.base_pairs, JSON.parse(JSON.stringify(base_pair_section(pairs))), id);
            assert.deepEqual(body.ntc, JSON.parse(JSON.stringify(ntc_section(await entry_ntc_classes(id)))), id);
            assert.equal(body.arc_view.au, undefined);
            assert.equal(body.arc_view.arcs?.layout, undefined);
            if (body.base_pairs) assert.ok(html.includes(`${body.base_pairs.total.toLocaleString("en-GB")} ${body.base_pairs.total === 1 ? "pair" : "pairs"}, Leontis`), id);
            if (body.arc_view.arcs) assert.ok(html.includes(`viewBox="0 0 ${body.arc_view.arcs.width} ${body.arc_view.arcs.height}"`), `${id} ${asked}`);
            assert.ok(html.includes(`data-arc-view="${body.arc_view.key}"`) || !body.arc_view.arcs, `${id} ${asked}`);
        }
    }
    assert.equal((await fetch(base + "/api/entries/ZZZZ/pairs")).status, 404);
});

const arc_pair = (label_1, pos_1, label_2, pos_2, kind = "wc", copy_2 = "1") =>
    ({ label_1, pos_1, label_2, pos_2, family: kind === "nc" ? "tWH" : "cWW", kind, copy_1: "1", copy_2 });
const dna = (labels, length) => [{ id: "1", kind: "DNA", length,
                                   chains: labels.map((label) => ({ label, auth: label })) }];
const plain = (length, modified = []) =>
    new Map([["1", Array.from({ length }, (_, i) => ({ pos: i + 1, modified: modified.includes(i + 1) }))]]);

test("/pairs sends the arc picture as the page draws it, without the viewer's layout", () => {
    let pairs = [arc_pair("A", 1, "B", 6), arc_pair("A", 2, "B", 5, "gu"), arc_pair("A", 3, "B", 4, "nc")];
    let view = arc_views(dna(["A", "B"], 6), plain(6, [3]), pairs, {}, "");
    let listed = pairs.map((p) => ({ ...p, bases: "AU", chain_1: p.label_1, chain_2: p.label_2 }));
    let reply = JSON.parse(JSON.stringify(pairs_reply(listed, view, [])));
    let { layout, ...picture } = JSON.parse(JSON.stringify(view.arcs));
    assert.ok(layout, "the page's arcs have a layout to leave out");
    assert.deepEqual(reply.arc_view.arcs, picture);
    assert.equal(reply.arc_view.au, undefined);
    assert.deepEqual({ ...reply.arc_view, arcs: null }, JSON.parse(JSON.stringify({ ...view, au: undefined, arcs: null })));
    assert.deepEqual(reply.base_pairs, JSON.parse(JSON.stringify(base_pair_section(listed))));
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

test("/report with no search sends you to /search", async () => {
    let res = await fetch(base + "/report", { redirect: "manual" });

    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "/search");
});

test("a display parameter alone does not open the report", async () => {
    for (const query of ["fields=closed", "view=lines", "sort=confal_desc",
                         "per_page=50", "page=3", "panel=open"]) {
        let res = await fetch(base + "/report?" + query, { redirect: "manual" });

        assert.equal(res.status, 302, `/report?${query} should be turned away`);
    }
});

test("the report's field list folds with the full search's handle, and the phone keeps its button", () => {
    let css = readFileSync(new URL("./public/style.css", import.meta.url), "utf8");
    let jsx = readFileSync(new URL("./client/src/components/ReportPage.jsx", import.meta.url), "utf8");
    let block = (start) => { let b = css.slice(css.indexOf(start)); return b.slice(0, b.indexOf("\n}\n")); };

    assert.match(css, /\n\.interface > \.query_panel\.folded:has\(#report_fields\) \{\n    margin-left: -450px;\n    visibility: hidden;/);
    assert.match(css, /\n\.interface > \.query_panel\.folded \+ \.panel_edge \{ flex-basis: 26px; \}/, "the tab never covers the table");
    let wide = block("@media (min-width: 641px) {\n    .fields_toggle");
    assert.match(wide, /\.fields_toggle \{ display: none; \}/);
    assert.match(wide, /> \.rail \{ position: relative; z-index: 6; \}/, "the list slides behind the rail, not over it");

    let phone = block("@media (max-width: 640px) {\n    .interface > .results_area:has(.report_body)");
    assert.match(phone, /\.query_panel\.folded:has\(#report_fields\) \{ margin-left: 0; visibility: visible; \}/);
    assert.match(phone, /\.query_panel\.folded > #report_fields \{ display: none; \}/);
    assert.match(phone, /\.interface > \.panel_edge \{ display: none; \}/);

    let stacked = block("/* Stacked above the results, the panel folds upwards");
    assert.doesNotMatch(stacked, /\n    \.panel_handle/, "an unscoped rule would turn the report's handle too");

    assert.match(jsx, /id="report_panel" inert=\{fold\.inert\}/, "the Download buttons stay reachable on a phone");
});

test("/report with a search opens", async () => {
    for (const query of ["q=tRNA", "entry_id=tna", "polymer_type=Protein%2FNA"]) {
        let res = await fetch(base + "/report?" + query);

        assert.equal(res.status, 200, `/report?${query} should open`);
    }
});

test("/ is the landing page, not the search page", async () => {
    let res = await fetch(base + "/", { redirect: "manual" });
    assert.equal(res.status, 200);
});

test("an old bookmark on / is redirected to /search", async () => {
    for (const query of ["entry_id=tna", "polymer_type=Protein%2FNA&page=3",
                         "q=tRNA&sort=confal_desc"]) {
        let res = await fetch(base + "/?" + query, { redirect: "manual" });

        assert.equal(res.status, 301, `/?${query} should be redirected`);
        assert.equal(res.headers.get("location"), "/search?" + query);
    }
});

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

test("/api/fields never ships the SQL", async () => {
    let body = (await (await fetch(base + "/api/fields")).text()).toUpperCase();

    for (const word of ["SELECT", "WHERE", "EXISTS", "ILIKE", "COALESCE",
                        "STRING_AGG", "ENTITY_POLY_SEQ", "E.ID"]) {
        assert.ok(!body.includes(word), `the response must not contain ${word}`);
    }
});

test("/api/help is help_texts.js, key for key", async () => {
    let r = await fetch(base + "/api/help");
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), help);
});

test("/api/fields describes every filter and column", async () => {
    let body = await (await fetch(base + "/api/fields")).json();

    assert.deepEqual(body.filters.map((f) => f.key), FILTERS.map((f) => f.key));
    assert.deepEqual(body.columns.map((c) => c.key), COLUMNS.map((c) => c.key));
    assert.deepEqual(body.text_filters, TEXT_FILTERS);
    assert.deepEqual(body.pill_filters, PILL_FILTERS);

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

test("the registry offers every sort, and no SQL", async () => {
    let reg = await (await fetch(base + "/api/fields")).json();

    assert.equal(reg.sorts.length, 9);
    for (const sort of reg.sorts) assert.deepEqual(Object.keys(sort).sort(), ["key", "label"]);

    assert.ok(!/NULLS LAST|ORDER BY|LEFT JOIN/i.test(JSON.stringify(reg)),
              "the ORDER BY must stay on the server");
});

test("a column can be fetched without being displayed", async () => {
    let reg = await (await fetch(base + "/api/fields")).json();
    let api = await (await fetch(base + "/api/entries/4TNA")).json();

    let id_column = reg.columns.find((c) => c.key === "pdb_id");

    assert.equal(id_column.scope, "entry", "it is fetched with every result");
    assert.deepEqual(id_column.show, [], "and shown in no view");

    assert.equal(api.pdb_id, "4TNA", "so the value is there");
    assert.ok(!api.rows.some((r) => r.label === "Entry ID"), "but never as a row");
});

test("every result carries its card rows", async () => {
    let body = await (await fetch(base + "/api/entries")).json();
    let reg  = await (await fetch(base + "/api/fields")).json();

    let expected = reg.columns.filter((c) => (c.show || ["page"]).includes("card"));
    assert.equal(expected.length, 11);

    for (const entry of body.results) {
        assert.ok(Array.isArray(entry.card), `${entry.pdb_id} has no card`);

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

test("the sidebar folds on a wide screen and never empties the strip", async () => {
    let jsx = readFileSync(new URL("./client/src/components/Structure.jsx", import.meta.url), "utf8");
    assert.match(jsx, /<button type="button" className="panel_handle nav_handle" aria-controls="section_nav"/,
                 "the full search's handle, not one drawn again");
    assert.match(jsx, /useRemembered\("section_nav", "folded", "open"\)/, "it stays folded for the next structure");
    assert.match(readFileSync(new URL("./client/src/components/SectionNav.jsx", import.meta.url), "utf8"),
                 /<nav className="section_nav" id="section_nav"[^>]*inert=\{inert\}>/, "folded links leave the tab order");

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

test("a whole-number resolution still prints two decimals", async () => {
    let api = await (await fetch(base + "/api/entries/3BNA")).json();

    assert.ok(api.rows.some((r) => r.value === "3.00 \u00C5"));
});

test("a column marked in_detail: false is fetched but is not a row", async () => {
    let api = await (await fetch(base + "/api/entries/4TNA")).json();
    let labels = api.rows.map((r) => r.label);

    assert.ok(!labels.includes("Entry ID"), "the id is the heading, not a row");
    assert.equal(api.pdb_id, "4TNA", "but it is still fetched - the links need it");
});

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
    "/package.json",
    "/client/src/main.jsx",
    "/src/main.jsx",
    "/client/package.json",
    "/.env"
];

for (const path of private_files) {
    test(`${path} is not downloadable`, async () => {
        assert.equal((await fetch(base + path)).status, 404);
    });
}

test("but public files are", async () => {
    for (const path of ["/style.css", "/assets/search.svg", "/assets/fonts/IBMPlexSans-Regular.woff2"]) {
        assert.equal((await fetch(base + path)).status, 200, path);
    }
});

test("/api/export honours the match mode", async () => {
    let all   = (await (await fetch(base + "/api/export")).json()).total;
    let yes   = (await (await fetch(base + "/api/export?q=tna")).json()).total;
    let no    = (await (await fetch(base + "/api/export?q=tna&match=excludes")).json()).total;

    assert.ok(yes > 0 && no > 0);
    assert.equal(yes + no, all, "the two reports should cover everything once");
});

test("the landing page states the database's size and last load", async () => {
    let stats = await (await fetch(base + "/api/stats")).json();

    assert.equal(stats.total, Number((await query("SELECT count(*) FROM entry")).rows[0].count));

    let loads = Number((await query("SELECT count(*) FROM loaded_entries")).rows[0].count);
    if (loads) assert.ok(!Number.isNaN(Date.parse(stats.updated)));
    else       assert.equal(stats.updated, null, "no load record, no date");
});

async function shown_rows() {
    let groups = await (await fetch(base + "/api/browse")).json();
    return groups.flatMap((g) => g.rows.flatMap((r) => [{ ...r, option: false }, ...r.options.map((o) => ({ ...o, option: true }))]));
}
const count_of = async (q) => (await (await fetch(base + "/api/count?" + q)).json()).total;
const query_of = (url) => url.slice("/search?".length);

test("every browse row's number is what its Yes finds, and every option's what it finds", async () => {
    let rows = await shown_rows();
    let built = (await browse_counts()).flatMap((g) => g.rows.flatMap((r) => [r, ...r.options]));
    assert.equal(rows.length, built.length, "a row is missing from the page");
    assert.ok(rows.some((r) => r.option) && rows.some((r) => !r.option));

    for (const row of rows) {
        let found = await count_of(query_of(row.url));
        assert.equal(row.count, found, `${row.label}: shows ${row.count}, its link finds ${found}`);
    }
});

test("made-of and method rows each add up to every entry", async () => {
    let total = (await (await fetch(base + "/api/stats")).json()).total;
    let rows  = (await shown_rows()).filter((r) => !r.option);

    for (const key of ["polymer_type=", "experimental_method="]) {
        let sum = rows.filter((r) => r.url.startsWith("/search?" + key)).reduce((a, r) => a + r.count, 0);
        assert.equal(sum, total, key);
    }
});

test("every row's Yes and No add up to every entry, and the cards send both", async () => {
    let total = await count_of("");
    let rows = BROWSE.flatMap((g) => g.rows);
    let sent = (await shown_rows()).filter((r) => !r.option);
    assert.equal(rows.length, 17);
    assert.deepEqual(sent.map((r) => [r.url, r.no_url]), rows.map((r) => [r.url, r.no_url]));
    for (const row of rows) {
        assert.equal(await count_of(query_of(row.url)) + await count_of(query_of(row.no_url)), total, row.label);
        assert.ok(row.say_yes && row.say_no, "a pressed Yes or No says what it means in the bar");
    }
});

test("the 10 most frequent are the database's own, most entries first, water never a ligand", async () => {
    let rows = (await browse_counts()).flatMap((g) => g.rows.filter((r) => r.top));
    assert.deepEqual(rows.map((r) => r.params), [{ monomer_flag: ["Non-Standard"] }, { has_ligand: ["With ligands"] }]);
    for (const row of rows) {
        assert.ok(row.options.length > 0 && row.options.length <= BROWSE_TOP);
        let counts = row.options.map((r) => r.count);
        assert.deepEqual(counts, [...counts].sort((a, b) => b - a), "not most first");
        assert.ok(row.options.every((r) => /^[A-Z0-9]{1,5}$/.test(r.label)), "every row is a code");
    }
    let ligands = rows[1].options.map((r) => r.label);
    assert.ok(!ligands.includes("HOH"));
    let direct = (await query(
        `SELECT comp_id FROM pdbx_entity_nonpoly WHERE comp_id <> 'HOH'
          GROUP BY 1 ORDER BY count(DISTINCT entry_id) DESC, 1 LIMIT 1`)).rows[0].comp_id;
    assert.equal(ligands[0], direct, "the first ligand is the most common one");
});

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

    assert.equal(await count("ligand=1,2-ETHANEDIOL"), await count("ligand=" + encodeURIComponent("1,2-ethanediol")));
    assert.equal(await count("ligand=MG,not a code"), 0, "a list with a name in it is one text, as before");
});

test("each kingdom's most frequent organisms are its own, most entries first, none twice", async () => {
    let from = (await browse_counts()).find((g) => g.area === "from");
    let kingdoms = from.rows.filter((r) => r.within);
    assert.deepEqual(kingdoms.map((r) => r.within), ["Eukaryota", "Bacteria", "Archaea", "Viruses"]);
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

test("a kingdom lists a species once, without its strains, and nothing unplaced", () => {
    let list = ["Escherichia coli", "Escherichia coli K-12", "bacterium", "Homo sapiens",
                "Thermus thermophilus", "Escherichia coli BL21(DE3)", "Bacillus subtilis"]
        .map((code) => ({ code, name: "" }));
    assert.deepEqual(kingdom_organisms(list, "Bacteria").map((o) => o.code),
                     ["Escherichia coli", "Thermus thermophilus", "Bacillus subtilis"]);
    assert.deepEqual(kingdom_organisms(list, "Bacteria", 2).map((o) => o.code),
                     ["Escherichia coli", "Thermus thermophilus"]);
});

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
});

test("a filter and its not add up to every entry, an entry it cannot judge counted as not", async () => {
    let count = async (q) => (await (await fetch(base + "/api/count?" + q)).json()).total;
    let total = await count("");
    for (const q of ["source_organism=Bacteria", "ligand=MG", "polymer_type=DNA", "polymer_type=DNA,RNA",
                     "experimental_method=X-RAY%20DIFFRACTION%3A2-2.5", "nonstandard_residue=PSU,5MC", "synthetic=Synthetic",
                     "resolution_min=2"]) {
        assert.equal(await count(q) + await count("not_" + q), total, q);
    }
    assert.equal(await count("not_source_organism=Eukaryota,Bacteria"), total - await count("source_organism=Eukaryota,Bacteria"));
    assert.equal(await count("experimental_method=X-RAY%20DIFFRACTION&not_has_ligand=With%20ligands"),
                 await count("experimental_method=X-RAY%20DIFFRACTION&has_ligand=Without%20ligands"));
    assert.equal(await count("not_q=tRNA"), total);
    assert.equal(await count("not_no_such_filter=1"), total);
});

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

test("the landing page shows its five questions, laid out 2-1-2, without NAKB labels", async () => {
    let sent = JSON.stringify(await (await fetch(base + "/api/browse")).json());
    assert.equal(BROWSE.length, 5);
    assert.ok(!BROWSE.some((g) => g.question === "Which molecule?"));
    assert.ok(!/nakb/i.test(sent), "the landing cards still show NAKB");

    assert.deepEqual(JSON.parse(sent).map((g) => g.question), BROWSE.map((g) => g.question));

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

    assert.ok(!sent.includes("\u2014"), "no em dash on the landing cards");
});

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

test("no NAKB molecule filter is left anywhere", async () => {
    assert.ok(!FILTERS.some((f) => f.key === "topic"));
    for (const path of ["/", "/search?panel=open"]) {
        let html = await (await fetch(base + path)).text();
        assert.ok(!/nakb/i.test(html), `${path} still shows NAKB`);
    }
});

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
    let body = await (await fetch(base + "/api/entries/4TNA")).json();
    assert.match(body.cite_text, /^Hingerty, B\.E\./, "Copy carries the citation as text");
    for (const format of ["ris", "bib"]) {
        assert.equal((await fetch(base + `/structure/4TNA/citation?format=${format}`)).status, 200, format);
    }
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
    let body = await (await fetch(base + "/api/entries/1DN8")).json();
    let first = c.authors[0];
    assert.ok(body.cite_authors.startsWith(`${first.given} ${first.family}`), "full names for the section");
    assert.equal(body.citation.abstract, c.abstract);
    let ris = await (await fetch(base + "/structure/1DN8/citation?format=ris")).text();
    assert.match(ris, new RegExp(`\r\nT2  - ${c.journal}\r\n`));
    assert.match(ris, new RegExp(`\r\nDO  - ${c.doi.replace(/[.()]/g, "\\$&")}\r\n`));
});

test("every footer link answers", async () => {
    for (const path of ["/cite", "/help", "/contact"]) {
        assert.equal((await fetch(base + path)).status, 200, path);
    }
});

test("the report reached from a structure covers only that structure", async () => {
    let body = await (await fetch(base + "/api/export?entry_id=4TNA")).json();

    assert.equal(body.total, 1);
    assert.equal(body.results[0].pdb_id, "4TNA");
});

test("a FASTA link for a molecule without a sequence is a 404, not an empty file", async () => {
    assert.equal((await fetch(base + "/structure/4TNA/fasta/99")).status, 404);
    assert.equal((await fetch(base + "/structure/NOPE/fasta/1")).status, 404);
    assert.equal((await fetch(base + "/structure/4TNA/fasta")).status, 404);
    assert.equal((await fetch(base + "/structure/4TNA/fasta?only=na")).status, 404);
});

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

test("the arcs API gives the viewer every pair as numbers, and a 404 for an unknown entry", async () => {
    let res = await fetch(base + "/api/entries/4tna/arcs");
    assert.equal(res.status, 200);
    let body = await res.json();
    assert.deepEqual({ ...body, title: undefined }, { pdb_id: "4TNA", title: undefined, view: "au", strands: [], pairs: [] }, "the seed has no pairs, nor assemblies");
    assert.equal(typeof body.title, "string", "the viewer heads itself with the title");
    assert.equal((await fetch(base + "/api/entries/ZZZZ/arcs")).status, 404);
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

test("the sequence map API: a 404 for an entry with no nucleic-acid chain, and for an unknown one", async () => {
    let res = await fetch(base + "/api/entries/4tna/sequence_map");
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: "4TNA has no nucleic-acid chain" });
    assert.equal((await fetch(base + "/api/entries/4tna/sequence_map?format=text")).status, 404);
    assert.equal((await fetch(base + "/api/entries/ZZZZ/sequence_map")).status, 404);
});

test("the same sequence API: no groups for an entry that shares none, a 404 for an unknown one", async () => {
    let res = await fetch(base + "/api/entries/4tna/same_sequence");
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { pdb_id: "4TNA", groups: [] });
    assert.equal((await fetch(base + "/api/entries/ZZZZ/same_sequence")).status, 404);
    assert.equal((await (await fetch(base + "/api/entries/4TNA")).json()).same_entries, 0);
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

test("wide, the Views take a column beside the sections", () => {
    let css = readFileSync(new URL("./public/style.css", import.meta.url), "utf8");
    let side = readFileSync(new URL("./client/src/reading.js", import.meta.url), "utf8").match(/const SIDE = "([^"]+)"/)[1];
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
});

test("the 3D view frames our own viewer, lazily, and the page is isolated so coot can run", async () => {
    let jsx = readFileSync(new URL("./client/src/components/View3D.jsx", import.meta.url), "utf8");
    assert.match(jsx, /const src = `\/viewer\/\?embed=1&id=\$\{encodeURIComponent\(pdbId\)\}`;/,
                 "the frame's address is our own viewer, with the entry to show");
    assert.match(jsx, /\{mounted && <iframe className="view_3d_frame"/,
                 "the frame downloads and annotates the entry, so it waits until it is asked for");
    assert.match(jsx, /<button type="button" className="view_3d_start"/, "selected by a scroll, 3D offers itself");
    assert.ok(!/rcsb|pdbe|molstar/i.test(jsx), "it sends no one to another viewer");

    let css = readFileSync(new URL("./public/style.css", import.meta.url), "utf8");
    assert.match(css, /\.view_3d_frame \{[^}]*height: 100%/, "the frame fills the box it is given");
    assert.match(css, /#views > \.section_body:has\(#view-3d:not\(\[hidden\]\)\) \{[^}]*height: calc\(100vh - 146px - var\(--footer-h\)\);/);
    assert.match(css, /#views > \.section_body:has\(#view-3d:not\(\[hidden\]\)\) \.view_3d \{ height: auto; \}/,
                 "inside that chain the fixed fallback height gives way");
    assert.match(css, /height: calc\(100vh - 191px - var\(--footer-h\)\);/,
                 "and 45px less again where the sections list is a strip across the top");

    let res = await fetch(base + "/structure/4TNA");
    assert.equal(res.headers.get("cross-origin-opener-policy"), "same-origin");
    assert.equal(res.headers.get("cross-origin-embedder-policy"), "require-corp");
    assert.equal((await fetch(base + "/search")).headers.get("cross-origin-embedder-policy"), "require-corp");

    if (viewer_installed) {
        let frame = await fetch(base + "/viewer/?embed=1&id=4TNA");
        assert.equal(frame.status, 200);
        assert.equal(frame.headers.get("cross-origin-embedder-policy"), "require-corp",
                     "the framed document has to agree to being isolated too");
        assert.equal(frame.headers.get("cross-origin-resource-policy"), "same-origin");
        assert.match(await frame.text(), /<div id="root">/, "the viewer's own page");
        assert.equal((await fetch(base + "/viewer/napair.wasm")).headers.get("content-type"), "application/wasm");
    } else {
        assert.equal((await fetch(base + "/viewer/")).status, 404);
    }
});

test("one handle in the gutter swaps which column is the wide one", () => {
    let sheet = readFileSync(new URL("./public/style.css", import.meta.url), "utf8");
    assert.match(sheet, /\.band_swap::before \{[^}]*mask-image/,
                 "its own glyph in place of the download arrow");
    let css = readFileSync(new URL("./public/style.css", import.meta.url), "utf8");
    let side = readFileSync(new URL("./client/src/reading.js", import.meta.url), "utf8").match(/const SIDE = "([^"]+)"/)[1];
    let wide = css.slice(css.indexOf(`@media ${side} {`));
    wide = wide.slice(0, wide.indexOf("\n}\n"));

    assert.match(wide, /grid-template-columns: minmax\(0, 1fr\) var\(--viewer\);/, "the row as it starts");
    assert.match(wide, /\.structure_page\.views_wide \.detail_body \{\s*grid-template-columns: var\(--viewer\) minmax\(0, 1fr\);/,
                 "swapped, the two widths trade places and nothing moves sideways");
    assert.match(wide, /\.band_swap \{ display: inline-flex; \}/,
                 "shown only where there are two columns to swap");
    assert.match(css, /\.band_swap \{[^}]*display: none;/, "and hidden everywhere else");
});

test("no em dash anywhere a structure page or an error page shows", async () => {
    for (const path of ["/structure/4TNA", "/structure/ZZZZ"]) {
        let html = await (await fetch(base + path)).text();
        let shown = html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<!--[\s\S]*?-->/g, "");
        assert.ok(!shown.includes("—"), `${path} shows an em dash`);
    }
});

test("Conformation names its colours from cana.js", async () => {
    let cana = await (await fetch(base + "/cana.js")).text();
    assert.ok(cana.includes("CANA_NAMES"));
});

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

test("the organism boxes have suggestions, each with its common names and count", async () => {
    for (const path of ["/api/source_organisms", "/api/expression_hosts"]) {
        let rows = await (await fetch(base + path)).json();
        assert.ok(rows.length > 0, path);
        assert.ok(rows.every((r) => typeof r.code === "string" && typeof r.entries === "number"), path);
    }
});
