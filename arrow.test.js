// arrow.test.js - the one open/close arrow: every control that folds
// something open or shut shows the same chevron, drawn by one CSS rule, in one
// colour and size. No database needed.

import test from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync, existsSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const views = (dir = "views") => readdirSync(new URL(dir, import.meta.url), { withFileTypes: true })
    .flatMap((f) => f.isDirectory() ? views(`${dir}/${f.name}`) : f.name.endsWith(".ejs") ? [`${dir}/${f.name}`] : []);
const scripts = readdirSync(new URL("public", import.meta.url)).filter((f) => f.endsWith(".js")).map((f) => `public/${f}`);
const SOURCES = [...views(), ...scripts].map((path) => [path, read(`./${path}`)]);
const CSS = read("./public/style.css");
const ARROW = '<i class="arrow';

test("no hand-made markers are left: text triangles, the old arrow image, the striped grip", () => {
    for (const [path, src] of SOURCES) {
        assert.doesNotMatch(src, /[▾▴▸◂]/, `${path} writes its own triangle`);
        assert.ok(!src.includes("arrow.svg"), `${path} uses the old arrow image`);
        assert.ok(!src.includes("handle_grip"), `${path} still has the striped grip`);
    }
    assert.ok(!existsSync(new URL("public/assets/arrow.svg", import.meta.url)), "arrow.svg is unused, so gone");
    for (const old of ["handle_grip", "handle_arrow", "category_arrow", ".band_fold svg", ".fields_toggle img", ".pill_more::after"]) {
        assert.ok(!CSS.includes(old), `style.css still styles ${old}`);
    }
});

test("every button that folds something open or shut carries the arrow", () => {
    let has = (path, cls) => {
        let src = read(`./${path}`);
        let at = src.indexOf(`class="${cls}"`);
        assert.ok(at >= 0, `${cls} is in ${path}`);
        assert.ok(src.slice(at, at + 600).includes(ARROW), `${cls} in ${path} has no arrow`);
    };
    has("views/structure.ejs", "band_fold");
    has("views/search.ejs", "category_header");
    has("views/search.ejs", "panel_handle");
    has("views/report.ejs", "fields_toggle");
    has("public/app.js", "card_more");
    has("views/search.ejs", "pill_more");
    has("views/includes/molecule_group.ejs", "more_rows_toggle");
});

test("the filter group headers say whether they are open, like every other fold", () => {
    assert.match(read("./views/search.ejs"), /class="category_header" role="button" tabindex="0" aria-expanded="true"/);
    assert.match(read("./public/app.js"), /header\.setAttribute\("aria-expanded"/);
});

test("the arrow is one rule: one shape, one colour, one size, and fold-outs get it on their own", () => {
    let rule = CSS.match(/\n\.arrow,\ndetails:not\(\.help, \.entry_fasta\) > summary::before \{([\s\S]*?)\}/);
    assert.ok(rule, "one rule draws both the .arrow element and every summary's arrow");
    assert.match(rule[1], /background: var\(--accent\)/);
    assert.match(rule[1], /width: 14px/);
    assert.match(rule[1], /mask: url\("data:image\/svg\+xml/);
    assert.match(CSS, /\nsummary \{ list-style: none; \}/, "the browser's own triangle is off");
    assert.match(CSS, /\nsummary::-webkit-details-marker \{ display: none; \}/);
    assert.equal((CSS.match(/^\.arrow[ ,{]/gm) ?? []).length, 1, "the arrow's look is set in one place");
    assert.doesNotMatch(CSS, /summary::(before|after) \{ content: "[^"]/, "no summary writes a triangle in text");
});

test("an arrow-only control is just the arrow: no outline, no shadow, no tab edge", () => {
    for (const name of ["panel_handle", "band_fold", "fields_toggle"]) {
        let rules = [...CSS.matchAll(/([^{}]*)\{([^{}]*)\}/g)].filter((m) => m[1].includes(`.${name}`));
        assert.ok(rules.length > 0, name);
        for (const [, selector, body] of rules) {
            assert.doesNotMatch(body, /border(?!-radius)[\w-]*:(?!\s*(0|none)\s*;)/, `${selector.trim()} draws a line`);
            assert.doesNotMatch(body, /box-shadow/, `${selector.trim()} draws a shadow`);
        }
    }
});
