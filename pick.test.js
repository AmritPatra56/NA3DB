import test from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";
import { BROWSE } from "./filters.js";

test("every landing link asks one filter, which the script reads", () => {
    let one = (url, values, label) => {
        let params = [...new URL(url, "http://x").searchParams];
        assert.equal(params.length, 1, label);
        assert.deepEqual(params[0][1].split(","), values, label);
    };
    for (const group of BROWSE) for (const r of group.rows) {
        one(r.url, Object.values(r.params)[0], r.label);
        one(r.no_url, Object.values(r.no_params)[0], r.label);
        for (const o of r.choices ?? []) one(o.url, Object.values(o.params)[0], o.label);
    }
});

test("style.css keeps the picking parts hidden until they are wanted", () => {
    let css = readFileSync(new URL("./public/style.css", import.meta.url), "utf8");
    assert.match(css, /\n\.browse_yes \.arrow \{ display: none; \}/, "only a picking page promises options");
    assert.match(css, /\.picking \.browse_yes \.arrow \{/);
    assert.match(css, /\n\.picked_line\[hidden\] \{ display: none; \}/, "its display: flex would show it while hidden");
    assert.ok(!/\n\.landing_search button \{/.test(css),
              "the Search button's style must name the submit, or Clear takes it too");
    assert.match(css, /\n\.browse_tick \{ display: none; \}/, "no box shows until the page is picking");
    assert.match(css, /\n\.browse_options\[hidden\] \{ display: none; \}/, "the shelf's display would show it while hidden");
});
