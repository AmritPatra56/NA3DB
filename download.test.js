import test from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const sources = (dir = "client/src") => readdirSync(new URL(dir, import.meta.url), { withFileTypes: true })
    .flatMap((f) => f.isDirectory() ? sources(`${dir}/${f.name}`) : /\.jsx?$/.test(f.name) ? [`${dir}/${f.name}`] : []);
const SOURCES = sources().map((path) => [path, read(`./${path}`)]);
const CSS = read("./public/style.css");
const ICON = "M12 4v11M7 10l5 5 5-5M5 20h14";

test("every link that saves a file is the download button, or sits in its menu", () => {
    let found = 0;
    for (const [path, src] of SOURCES) {
        let menus = src.replace(/<DownloadMenu\b[\s\S]*?<\/DownloadMenu>/g, "");
        for (const a of menus.match(/<a\b(?:\{(?:[^{}]|\{[^{}]*\})*\}|[^<>{}])*>/g) ?? []) {
            if (!/\sdownload[\s>=]/.test(a)) continue;
            found++;
            assert.match(a, /className="(?:[^"]*\s)?download(?:\s[^"]*)?"/, `${path}: ${a}`);
        }
    }
    assert.ok(found >= 6, `only ${found} download links found`);
    assert.match(read("./client/src/components/DownloadMenu.jsx"), /<summary className="download download_small"/);
});

test("the report's two downloads are the button too", () => {
    let page = read("./client/src/components/ReportPage.jsx");
    for (const id of ["export_button", "zip_button"]) {
        assert.match(page, new RegExp(`<button type="button" className="download" id="${id}"`));
    }
});

test("the button is drawn once, in CSS, not copied into each place", () => {
    for (const [path, src] of SOURCES) assert.ok(!src.includes(ICON), `${path} draws its own arrow`);
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
    let links = read("./client/src/components/Links.jsx");
    assert.equal((links.match(/className="download"/g) ?? []).length, 2, "FASTA and base pairs CSV");
});
