// help.test.js - the one "?" help component and the "How to ..." guides:
// every help text lives in help_texts.js, every "?" is drawn by
// views/includes/help.ejs, and every guide shares one look. No database needed.

import test from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import help from "./help_texts.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const views = (dir = "views") => readdirSync(new URL(dir, import.meta.url), { withFileTypes: true })
    .flatMap((f) => f.isDirectory() ? views(`${dir}/${f.name}`) : f.name.endsWith(".ejs") ? [`${dir}/${f.name}`] : []);
const CSS = read("./public/style.css");

test("every help text is plain, filled in and free of em dashes", () => {
    for (const [key, text] of Object.entries(help)) {
        assert.equal(typeof text, "string", key);
        assert.ok(text.trim().length > 20, `${key} is empty`);
        assert.doesNotMatch(text, /—/, `${key} has an em dash`);
    }
});

test("every structure section has its help text, and no text is left unused", () => {
    let sections = [...read("./detail.js").matchAll(/\{ id: "([\w-]+)", title:/g)].map((m) => m[1]);
    assert.equal(sections.length, 12);
    let used = [...sections, ...views().flatMap((v) => [...read(`./${v}`).matchAll(/help\["([\w-]+)"\]/g)].map((m) => m[1]))];
    assert.deepEqual([...new Set(used)].sort(), Object.keys(help).sort());
});

test("every \"?\" is drawn by the one shared template", () => {
    let help_ejs = read("./views/includes/help.ejs");
    assert.match(help_ejs, /<details class="help">/);
    assert.match(help_ejs, /throw new Error/, "an unknown key fails loudly, not as an empty bubble");
    for (const v of views().filter((v) => !v.endsWith("includes/help.ejs"))) {
        let src = read(`./${v}`);
        assert.doesNotMatch(src, /class="(band_)?help"/, `${v} draws its own "?"`);
        assert.doesNotMatch(src, /<summary[^>]*>\?<\/summary>/, `${v} draws its own "?"`);
    }
    assert.match(read("./views/structure.ejs"), /include\("includes\/help", \{ key: s\.id \}\)/);
    assert.doesNotMatch(read("./views/structure.ejs"), /const help = \{/, "the texts live in help_texts.js");
    assert.doesNotMatch(CSS, /band_help/);
});

test("the \"?\" is round, ink blue, and closes on Escape", () => {
    let rule = CSS.match(/\n\.help > summary \{([\s\S]*?)\}/)[1];
    assert.match(rule, /border-radius: 50%/);
    assert.match(rule, /color: var\(--accent\)/);
    assert.match(rule, /border: [\d.]+px solid var\(--accent\)/);
    let page = read("./views/structure.ejs");
    assert.match(page, /event\.key !== "Escape"\) return;[\s\S]{0,120}\.help\[open\]/);
});

test("every guide shares one look", () => {
    let guides = [
        ...views().flatMap((v) => [...read(`./${v}`).matchAll(/<details class="([^"]*)"[^>]*>\s*<summary>(How |Why )/g)]),
        ...read("./public/sameseq.js").matchAll(/<details class="([^"]*)"[^>]*>\s*<summary>(How |Why )/g),
    ].map((m) => m[1]);
    assert.equal(guides.length, 4, "colours, map, same-sequence picture, three tables");
    for (const cls of guides) assert.match(cls, /^guide\b/, `${cls} is not a guide`);
    assert.doesNotMatch(CSS, /\.(report_why|ss_how) (summary|p|ul)/, "a guide restyles its own summary or body");
});

test("the colour guide cites DNATCO's live palette, not the old Mol* copy", () => {
    let page = read("./views/structure.ejs");
    assert.match(page, /href="https:\/\/dnatco\.datmos\.org"/);
    assert.doesNotMatch(page, /dnatco\/src\/color\.ts/);
});
