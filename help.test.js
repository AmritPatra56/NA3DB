import test from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import help from "./help_texts.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const sources = (dir = "client/src") => readdirSync(new URL(dir, import.meta.url), { withFileTypes: true })
    .flatMap((f) => f.isDirectory() ? sources(`${dir}/${f.name}`) : /\.jsx?$/.test(f.name) ? [`${dir}/${f.name}`] : []);
const CSS = read("./public/style.css");

test("every help text is plain, filled in and free of em dashes", () => {
    for (const [key, text] of Object.entries(help)) {
        assert.equal(typeof text, "string", key);
        assert.ok(text.trim().length > 20, `${key} is empty`);
        assert.doesNotMatch(text, /—/, `${key} has an em dash`);
    }
});

test("every structure section has its help text, and no text is left unused", () => {
    let sections = [...read("./client/src/components/Structure.jsx").matchAll(/\{ id: "([\w-]+)", title:/g)].map((m) => m[1]);
    assert.equal(sections.length, 12);
    let used = [...sections, ...sources().flatMap((v) => [...read(`./${v}`).matchAll(/help(?:\.data)?\?\.\["([\w-]+)"\]/g)].map((m) => m[1]))];
    assert.deepEqual([...new Set(used)].sort(), Object.keys(help).sort());
});

test("every \"?\" is drawn by the one shared component", () => {
    const NOTE = "client/src/components/HelpNote.jsx";
    assert.match(read(`./${NOTE}`), /<details ref=\{box\} className="help"/);
    for (const v of sources().filter((v) => v !== NOTE)) {
        let src = read(`./${v}`);
        assert.doesNotMatch(src, /className="(band_)?help"/, `${v} draws its own "?"`);
        assert.doesNotMatch(src, /<summary[^>]*>\?<\/summary>/, `${v} draws its own "?"`);
    }
    assert.match(read("./client/src/components/Section.jsx"), /<HelpNote name=\{id\} text=\{help\}/);
    assert.match(read("./client/src/components/Structure.jsx"), /help=\{help\?\.\[s\.id\]\}/, "the texts come from /api/help");
    assert.doesNotMatch(CSS, /band_help/);
});

test("the \"?\" is round, ink blue, and closes on Escape", () => {
    let rule = CSS.match(/\n\.help > summary \{([\s\S]*?)\}/)[1];
    assert.match(rule, /border-radius: 50%/);
    assert.match(rule, /color: var\(--accent\)/);
    assert.match(rule, /border: [\d.]+px solid var\(--accent\)/);
    let note = read("./client/src/components/HelpNote.jsx");
    assert.match(note, /ev\.key !== "Escape"\) return;\s*onClose\(name\);\s*button\.current\.focus\(\);/);
});

test("every guide shares one look", () => {
    let guides = sources().flatMap((v) => [...read(`./${v}`).matchAll(/<details className="([^"]*)"[^>]*>\s*<summary>(How |Why )/g)])
        .map((m) => m[1]);
    assert.equal(guides.length, 4, "colours, map, same-sequence picture, three tables");
    for (const cls of guides) assert.match(cls, /^guide\b/, `${cls} is not a guide`);
    assert.doesNotMatch(CSS, /\.(report_why|ss_how) (summary|p|ul)/, "a guide restyles its own summary or body");
});

test("the colour guide cites DNATCO's live palette, not the old Mol* copy", () => {
    let page = read("./client/src/components/NtcGuide.jsx");
    assert.match(page, /href="https:\/\/dnatco\.datmos\.org"/);
    assert.doesNotMatch(page, /dnatco\/src\/color\.ts/);
});
