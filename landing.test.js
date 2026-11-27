import test from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

test("the landing scrolls inside itself, so the rail stays the full height", () => {
    const css = readFileSync(new URL("./public/style.css", import.meta.url), "utf8");
    const rule = css.match(/^\.landing_page \{([^}]*)\}/m)[1];
    assert.match(rule, /overflow-y: auto;/);
    assert.match(css, /^\.interface \{[^}]*height: calc\(100vh - var\(--footer-h\)\);/m);
});
