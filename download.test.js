// download.test.js - the one download button: every link that saves a file
// wears the .download class (or opens a menu that does), and the button's look
// lives in one CSS rule. No database needed.

import test from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const views = (dir = "views") => readdirSync(new URL(dir, import.meta.url), { withFileTypes: true })
    .flatMap((f) => f.isDirectory() ? views(`${dir}/${f.name}`) : f.name.endsWith(".ejs") ? [`${dir}/${f.name}`] : []);
const scripts = readdirSync(new URL("public", import.meta.url)).filter((f) => f.endsWith(".js")).map((f) => `public/${f}`);
const SOURCES = [...views(), ...scripts].map((path) => [path, read(`./${path}`)]);
const CSS = read("./public/style.css");
const ICON = "M12 4v11M7 10l5 5 5-5M5 20h14";

test("every link that saves a file is the download button, or sits in its menu", () => {
    let found = 0;
    for (const [path, src] of SOURCES) {
        // A menu of files counts as one button when its summary is one.
        let menus = src.replace(/<details(?:<%(?:(?!%>)[\s\S])*%>|[^<>])*>\s*<summary class="download[^"]*"[\s\S]*?<\/details>/g, "");
        // An EJS tag can sit inside an attribute, and its %> is not the end of the <a>.
        for (const a of menus.match(/<a\b(?:<%(?:(?!%>)[\s\S])*%>|\$\{[^}]*\}|[^<>$])*>/g) ?? []) {
            if (!/\sdownload[\s>]/.test(a)) continue;
            found++;
            assert.match(a, /class="(?:[^"]*\s)?download(?:\s[^"]*)?"/, `${path}: ${a}`);
        }
    }
    assert.ok(found >= 6, `only ${found} download links found`);
});

test("the report's two downloads are the button too", () => {
    let page = read("./views/report.ejs");
    for (const id of ["export_button", "zip_button"]) {
        assert.match(page, new RegExp(`<button type="button" class="download" id="${id}">`));
    }
});

test("the button is drawn once, in CSS, not copied into each place", () => {
    for (const [path, src] of SOURCES) assert.ok(!src.includes(ICON), `${path} draws its own arrow`);
    assert.doesNotMatch(read("./views/structure.ejs"), /const dl = /);
    for (const old of ["pair_csv", "sequence_fasta", "seqmap_file", "a.entry_fasta", "entry_fasta > summary"]) {
        assert.ok(!CSS.includes(old), `style.css still styles ${old} on its own`);
    }
    let rule = CSS.match(/\n\.download \{([\s\S]*?)\}/)[1];
    assert.match(rule, /background: var\(--accent\)/);
    assert.match(rule, /color: var\(--on-accent\)/);
    assert.match(CSS, /\.download::before \{[^}]*mask: url\("data:image\/svg\+xml/);
    assert.match(CSS, /\.download:disabled \{/);
    assert.match(CSS, /\.download_small \{/);
});

test("the Links section offers its files as buttons", () => {
    let links = read("./views/structure.ejs").match(/s\.id === "links"[\s\S]*?<\/ul>/)[0];
    assert.equal((links.match(/class="download"/g) ?? []).length, 2, "FASTA and base pairs CSV");
});
