// landing.test.js - the landing page's layout in style.css. Its count-as-you-
// type logic is the React client's now (client/test/useApi.test.jsx,
// landingCount.test.jsx).
import test from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

// The window is one screen tall (.interface is 100vh) and the rail fills it.
// If the landing let the page scroll instead of itself, the rail would end one
// screen down and leave a gap under the name.
test("the landing scrolls inside itself, so the rail stays the full height", () => {
    const css = readFileSync(new URL("./public/style.css", import.meta.url), "utf8");
    const rule = css.match(/^\.landing_page \{([^}]*)\}/m)[1];
    assert.match(rule, /overflow-y: auto;/);
    assert.match(css, /^\.interface \{[^}]*height: calc\(100vh - var\(--footer-h\)\);/m);
});
