// landing.test.js - the count-as-you-type logic in public/landing.js.
//
// It runs in a browser, so the few globals it touches are stubbed here and the
// file is evaluated against them. What this is really for is the race: a slow
// early request must not overwrite a fast later one.

import test from "node:test";
import assert from "node:assert";
import { readFileSync } from "node:fs";

const SOURCE = readFileSync(new URL("./public/landing.js", import.meta.url), "utf8");

// Builds a fake page, runs landing.js against it, and hands back the handles
// needed to drive it: type(), the readout, and control over the replies.
function mount() {
    // Each element records its listeners by name, so the file can attach
    // several to the box and the test can fire the one it means.
    const element = (extra = {}) => ({
        listeners: {},
        addEventListener(name, fn) { this.listeners[name] = fn; },
        ...extra
    });

    const box = element({ value: "", form: { submitted: false, submit() { this.submitted = true; } } });
    const readout = element({ textContent: "" });

    const pending = [];
    const timers = [];

    // Only what the landing page actually has: it loads no shared.js, so there
    // is deliberately no escape_html here.
    const context = {
        document: {
            querySelector: (sel) => sel.includes("input") ? box : readout
        },
        fetch: (url) => new Promise((resolve) => { pending.push({ url, resolve }); }),
        setTimeout: (fn) => { timers.push(fn); return timers.length; },
        clearTimeout: (id) => { if (id) timers[id - 1] = null; }
    };

    const run = new Function(...Object.keys(context), SOURCE);
    run(...Object.values(context));

    return {
        readout, box,
        type(text) { box.value = text; box.listeners.input(); },
        settle() {
            const fn = timers.filter(Boolean).at(-1);
            if (fn) fn();
        },
        requests: () => pending.map((p) => decodeURIComponent(p.url)),
        reply(index, body) {
            pending[index].resolve({ ok: true, json: async () => body });
            return new Promise((r) => setImmediate(r));
        }
    };
}

test("a short term asks nothing and shows nothing", async () => {
    const page = mount();

    page.type("t");
    page.settle();

    assert.deepEqual(page.requests(), []);
    assert.equal(page.readout.textContent, "");
});

test("typing a word makes one request, not one per letter", async () => {
    const page = mount();

    for (const term of ["tR", "tRN", "tRNA"]) page.type(term);
    page.settle();

    assert.equal(page.requests().length, 1, "the earlier timers must be cancelled");
    assert.match(page.requests()[0], /q=tRNA$/);
});

test("the count is written in words a person reads", async () => {
    for (const [total, expected] of [[0, "no structures match"],
                                     [1, "1 structure"],
                                     [163, "163 structures"],
                                     [1489, "1,489 structures"]]) {
        const page = mount();

        page.type("tRNA");
        page.settle();
        await page.reply(0, { total });

        assert.equal(page.readout.textContent, expected);
    }
});

// The bug this guards: type "tRNA", pause, then "tRNAx". If the first reply is
// slow and lands last, the box says tRNAx while the number is for tRNA.
test("a reply that arrives late is thrown away", async () => {
    const page = mount();

    page.type("tRNA");
    page.settle();

    page.type("tRNAx");
    page.settle();

    assert.equal(page.requests().length, 2);

    await page.reply(1, { total: 0 });     // the newer search answers first
    assert.equal(page.readout.textContent, "no structures match");

    await page.reply(0, { total: 163 });   // the older one finally arrives
    assert.equal(page.readout.textContent, "no structures match",
                 "the stale reply must not overwrite the current one");
});

test("clearing the box clears the count", async () => {
    const page = mount();

    page.type("tRNA");
    page.settle();
    await page.reply(0, { total: 163 });
    assert.equal(page.readout.textContent, "163 structures");

    page.type("");
    assert.equal(page.readout.textContent, "");
});
