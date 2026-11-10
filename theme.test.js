// theme.test.js - the light and dark themes: the colour tokens in
// public/style.css, the theme button in public/theme.js, and that every page
// carries both. No database needed.

import test from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const CSS = read("./public/style.css");

// --- the tokens -----------------------------------------------------------

const LIGHT_BLOCK = CSS.match(/^:root \{([\s\S]*?)\n\}/m)[1];
const DARK_BY_CHOICE = CSS.match(/:root\[data-theme="dark"\] \{([\s\S]*?)\n    \}/)[1];
const DARK_BY_DEVICE = CSS.match(/:root:not\(\[data-theme="light"\]\) \{([\s\S]*?)\n    \}/)[1];
const tokens = (block) => Object.fromEntries([...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
const LIGHT = tokens(LIGHT_BLOCK);
const DARK = tokens(DARK_BY_CHOICE);

test("the dark theme is the same whether the visitor or the device picks it", () => {
    assert.equal(DARK_BY_CHOICE, DARK_BY_DEVICE, "the two dark blocks have drifted apart");
});

test("light and dark define the same tokens", () => {
    assert.deepEqual(Object.keys(DARK).sort(), Object.keys(LIGHT).sort());
    assert.match(LIGHT_BLOCK, /color-scheme: light;/);
    assert.match(DARK_BY_CHOICE, /color-scheme: dark;/);
});

// Both dark blocks sit inside @media screen, so a printed page is light
// whatever the theme on screen.
test("printing stays light", () => {
    assert.match(CSS, /@media screen \{\s*:root\[data-theme="dark"\]/);
    assert.match(CSS, /@media screen and \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\)/);
});

test("every token in use is defined, and every token defined is used", () => {
    let rest = CSS.replace(LIGHT_BLOCK, "").replace(DARK_BY_CHOICE, "").replace(DARK_BY_DEVICE, "");
    let scripts = ["public/cana.js", "public/seqmap.js", "public/arc_viewer.js", "detail.js",
                   "views/includes/map_guide.ejs"].map(read).join("\n");
    let used = new Set([...(rest + scripts).matchAll(/var\(--([\w-]+)/g)].map((m) => m[1]));
    // Set and read inside a rule (the category dot, a section's colours), not themes.
    let local = new Set(["dot", "sec", "tint", "ink", "share"]);
    for (const name of used) {
        if (!local.has(name)) assert.ok(name in LIGHT, `--${name} is used but never defined`);
    }
    for (const name of Object.keys(LIGHT)) assert.ok(used.has(name), `--${name} is defined but never used`);
});

// A colour written outside the tokens shows the same in both themes. These
// are the ones meant to: filled badges and buttons that carry their own text
// colour, the group hues, the red marks. A new one fails here until it is
// either made a token or added on purpose.
const THEME_FREE = new Set([
    "#378add", "#1d9e75", "#ba7517",                        // group hues
    "#5dcaa5", "#04342c", "#e0a030", "#412402", "#7f77dd", "#eeedfe", "#cecbf6", "#26215c", // pair badges
    "#f43f5e", "#dc2626", "#f59e0b", "#17845f",             // marks, gaps, a green button's hover
    "#fff", "#475569", "#94a3b8"                            // text on filled badges, the A and B badges
]);
test("no colour outside the tokens unless it is meant to be the same in both themes", () => {
    let rest = CSS.replace(LIGHT_BLOCK, "").replace(DARK_BY_CHOICE, "").replace(DARK_BY_DEVICE, "")
                  .replace(/\/\*[\s\S]*?\*\//g, "");
    let stray = [...rest.matchAll(/#[0-9a-fA-F]{3,6}\b/g)].map((m) => m[0].toLowerCase())
                  .filter((c) => !THEME_FREE.has(c));
    assert.deepEqual([...new Set(stray)], []);
});

// WCAG 2 relative luminance and contrast ratio.
const luminance = (hex) => {
    let [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
    let [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};

// Text on its ground, at least 4.5:1 (WCAG AA) in the dark theme.
const TEXT_PAIRS = [
    ["text", "bg-primary"], ["text", "bg-secondary"], ["text", "row-hover"],
    ["text-muted", "bg-primary"], ["text-muted", "bg-secondary"],
    ["accent", "bg-primary"], ["accent", "bg-secondary"], ["accent", "accent-wash"], ["on-accent", "accent"],
    ["danger", "bg-secondary"], ["accent-ink", "accent-tint"], ["ok-ink", "ok-tint"],
    ["ok-badge-ink", "ok-badge-tint"], ["ink-blue", "tint-blue"], ["ink-amber", "tint-amber"],
    ["ink-teal", "tint-teal"], ["ink-gray", "tint-gray"],
    ["here", "bg-secondary"], ["good", "bg-secondary"], ["warn", "bg-secondary"], ["bad", "bg-secondary"],
    ["on-pair-mod", "pair-mod"]
];

test("dark-theme text is readable: at least 4.5:1 against its ground", () => {
    for (const [fg, bg] of TEXT_PAIRS) {
        let ratio = contrast(DARK[fg], DARK[bg]);
        assert.ok(ratio >= 4.5, `--${fg} on --${bg}: ${ratio.toFixed(2)}`);
    }
});

// Lines and marks that carry meaning need 3:1 (WCAG 1.4.11).
const GRAPHICS = ["pair-wc", "pair-gu", "pair-nc", "pair-mod", "strand", "ntc-opn", "ntc-nan-line", "ntc-edge", "text-dim"];
test("dark-theme base pairs, NtC marks and hints stand out: at least 3:1", () => {
    for (const name of GRAPHICS) {
        let ratio = contrast(DARK[name], DARK["bg-secondary"]);
        assert.ok(ratio >= 3, `--${name}: ${ratio.toFixed(2)}`);
    }
});

// The NtC colours are the same in both themes, so a figure means the same.
// The one that falls under 3:1 on the dark ground gets the outline.
test("NtC class colours are theme-free; a dim one is outlined in the dark", async () => {
    let { CANA } = await import("./public/cana.js");
    let fills = Object.values(CANA).flatMap((c) => c.fill);
    for (const f of fills) assert.match(f, /^(#[0-9A-Fa-f]{6}|var\(--ntc-(opn|nan)\))$/, f);
    let dim = fills.filter((f) => f.startsWith("#") && contrast(f.toLowerCase(), DARK["bg-secondary"]) < 3);
    assert.ok(dim.length > 0 && LIGHT["ntc-edge"] === "transparent" && contrast(DARK["ntc-edge"], DARK["bg-secondary"]) >= 3,
              "dim NtC colours need the dark outline");
    assert.match(CSS, /\.ntc_bar \{ stroke: var\(--ntc-edge\);/);
});

// --- every page --------------------------------------------------------

test("every page sets the theme before it paints and has the button", () => {
    for (const file of readdirSync(new URL("./views", import.meta.url)).filter((f) => f.endsWith(".ejs"))) {
        let page = read(`./views/${file}`);
        let head = page.slice(0, page.indexOf("</head>"));
        assert.ok(head.includes('include("includes/theme.ejs")'), `${file}: no theme in the head`);
        assert.ok(page.includes('include("includes/rail.ejs")'), `${file}: no rail, so no theme button`);
    }
    let snippet = read("./views/includes/theme.ejs");
    assert.match(snippet, /<meta name="color-scheme" content="light dark">/);
    assert.match(snippet, /<script>try \{ var t = localStorage\.getItem\("na3db-theme"\)/);
    assert.match(snippet, /<script src="\/theme\.js" defer><\/script>/);
    assert.match(read("./views/includes/rail.ejs"), /<button type="button" class="rail-item rail-theme" data-choice="auto" hidden/);
});

test("no em dash in anything the theme shows", () => {
    for (const path of ["./public/theme.js", "./views/includes/theme.ejs", "./views/includes/rail.ejs"]) {
        assert.ok(!read(path).includes("—"), path);
    }
});

// --- the button ----------------------------------------------------------

// Runs theme.js against a fake page with one button and a fake storage.
function mount(saved, { blocked = false } = {}) {
    let store = new Map(saved ? [["na3db-theme", saved]] : []);
    let listeners = {};
    let button = {
        hidden: true, dataset: { choice: "auto" }, title: "", attrs: {},
        setAttribute(k, v) { this.attrs[k] = v; },
        addEventListener(name, fn) { this.click = fn; }
    };
    let root = { dataset: {} };
    let localStorage = {
        getItem: (k) => { if (blocked) throw new Error("blocked"); return store.get(k) ?? null; },
        setItem: (k, v) => { if (blocked) throw new Error("blocked"); store.set(k, v); },
        removeItem: (k) => { if (blocked) throw new Error("blocked"); store.delete(k); }
    };
    let context = {
        document: { documentElement: root, querySelectorAll: () => [button] },
        localStorage,
        window: { addEventListener: (name, fn) => { listeners[name] = fn; } }
    };
    vm.runInNewContext(read("./public/theme.js"), context);
    return { button, root, store, listeners };
}

test("the button shows once its script runs, and starts on Auto", () => {
    let { button, root } = mount();
    assert.equal(button.hidden, false);
    assert.equal(button.dataset.choice, "auto");
    assert.equal(root.dataset.theme, undefined, "Auto leaves the theme to the device");
    assert.match(button.attrs["aria-label"], /^Theme: auto, follows your device\. Switch to light\.$/);
});

test("a click goes Auto, Light, Dark, Auto, and is remembered", () => {
    let { button, root, store } = mount();
    button.click();
    assert.equal(root.dataset.theme, "light");
    assert.equal(store.get("na3db-theme"), "light");
    button.click();
    assert.equal(root.dataset.theme, "dark");
    assert.equal(store.get("na3db-theme"), "dark");
    button.click();
    assert.equal(root.dataset.theme, undefined);
    assert.equal(store.has("na3db-theme"), false, "Auto is the absence of a choice");
});

test("a remembered choice comes back; a junk one is Auto", () => {
    assert.equal(mount("dark").root.dataset.theme, "dark");
    assert.equal(mount("dark").button.dataset.choice, "dark");
    assert.equal(mount("purple").root.dataset.theme, undefined);
});

test("blocked storage still lets the button switch the page", () => {
    let { button, root } = mount(null, { blocked: true });
    button.click();
    assert.equal(root.dataset.theme, "light");
});

test("a change in another tab is followed", () => {
    let { root, store, listeners } = mount();
    store.set("na3db-theme", "dark");
    listeners.storage({ key: "na3db-theme" });
    assert.equal(root.dataset.theme, "dark");
});
