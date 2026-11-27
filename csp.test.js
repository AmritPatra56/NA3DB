import test, { before, after } from "node:test";
import assert from "node:assert";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { inline_scripts, page_policy } from "./csp.js";
import app, { PAGE_POLICY, viewer_installed } from "./server.js";
import { close } from "./db.js";

let base;
let server;

before(async () => {
    server = app.listen(0);
    await once(server, "listening");
    base = `http://localhost:${server.address().port}`;
});

after(async () => {
    server.close();
    await close();
});

const built = readFileSync(new URL("./client/dist/index.html", import.meta.url), "utf8");

test("finds the theme line and nothing loaded with src=", () => {
    let found = inline_scripts(built);
    assert.strictEqual(found.length, 1);
    assert.match(found[0], /na3db-theme/);
    assert.deepStrictEqual(inline_scripts('<script src="/a.js"></script><script type="module" src="/b.js"></script>'), []);
});

test("allows exactly that line by its fingerprint", () => {
    let hash = createHash("sha256").update(inline_scripts(built)[0]).digest("base64");
    assert.match(PAGE_POLICY, new RegExp(`script-src 'self' 'sha256-${hash.replace(/[+/]/g, "\\$&")}';`));
});

test("a changed inline script is no longer allowed", () => {
    let changed = built.replace("na3db-theme", "na3db-theme2");
    assert.notStrictEqual(page_policy(changed), PAGE_POLICY);
});

test("never allows inline or eval'd code, plugins, or outside sources", () => {
    assert.doesNotMatch(PAGE_POLICY, /unsafe-inline|unsafe-eval|\*|https?:/);
    for (let part of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "frame-ancestors 'self'", "connect-src 'self'"]) {
        assert.ok(PAGE_POLICY.includes(part), part);
    }
});

for (let page of ["/", "/search?q=tRNA", "/structure/1EHZ", "/report", "/help", "/no-such-page"]) {
    test(`${page} sends the policy with COOP and COEP`, async () => {
        let res = await fetch(base + page);
        assert.strictEqual(res.headers.get("content-security-policy"), PAGE_POLICY);
        assert.strictEqual(res.headers.get("cross-origin-opener-policy"), "same-origin");
        assert.strictEqual(res.headers.get("cross-origin-embedder-policy"), "require-corp");
    });
}

test("the 3D viewer is left as it is: no policy", { skip: !viewer_installed }, async () => {
    let res = await fetch(base + "/viewer/");
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.headers.get("content-security-policy"), null);
});
