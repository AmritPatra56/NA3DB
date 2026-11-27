import test from "node:test";
import assert from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { MARK_LIGHT, MARK_DEEP } from "./client/src/logo.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const CSS = read("./public/style.css");
const SHELL = read("./client/index.html");
const CLIENT = readdirSync(new URL("./client/src", import.meta.url), { recursive: true })
    .filter((f) => /\.jsx?$/.test(f)).map((f) => read(`./client/src/${f}`));

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

test("printing stays light", () => {
    assert.match(CSS, /@media screen \{\s*:root\[data-theme="dark"\]/);
    assert.match(CSS, /@media screen and \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\)/);
});

test("every token in use is defined, and every token defined is used", () => {
    let rest = CSS.replace(LIGHT_BLOCK, "").replace(DARK_BY_CHOICE, "").replace(DARK_BY_DEVICE, "");
    let scripts = ["public/cana.js", "detail.js"].map(read).concat(CLIENT).join("\n");
    let used = new Set([...(rest + scripts).matchAll(/var\(--([\w-]+)/g)].map((m) => m[1]).filter((n) => !n.endsWith("-")));
    let local = new Set(["dot", "sec", "tint", "ink", "share", "footer-h", "topbar-h", "railcell-h", "viewer", "rows"]);
    for (const name of used) {
        if (!local.has(name)) assert.ok(name in LIGHT, `--${name} is used but never defined`);
    }
    for (const name of Object.keys(LIGHT)) assert.ok(used.has(name), `--${name} is defined but never used`);
});

const THEME_FREE = new Set([
    "#378add", "#1d9e75", "#ba7517",                        // group hues
    "#5dcaa5", "#04342c", "#e0a030", "#412402", "#7f77dd", "#eeedfe", "#cecbf6", "#26215c", "#0f7a58", // pair badges
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

const luminance = (hex) => {
    let [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
    let [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};

const TEXT_PAIRS = [
    ["text", "bg-primary"], ["text", "bg-secondary"], ["text", "row-hover"],
    ["text-muted", "bg-primary"], ["text-muted", "bg-secondary"],
    ["accent", "bg-primary"], ["accent", "bg-secondary"], ["accent", "accent-wash"], ["on-accent", "accent"], ["on-accent", "accent-ink"],
    ["danger", "bg-secondary"], ["accent-ink", "accent-tint"], ["ok-ink", "ok-tint"],
    ["ok-badge-ink", "ok-badge-tint"], ["ink-blue", "tint-blue"], ["ink-amber", "tint-amber"],
    ["ink-teal", "tint-teal"], ["ink-gray", "tint-gray"],
    ["here", "bg-secondary"], ["good", "bg-secondary"], ["warn", "bg-secondary"], ["bad", "bg-secondary"],
    ["on-pair-mod", "pair-mod"]
];

const THEMES = [["light", LIGHT], ["dark", DARK]];

test("text is readable in both themes: at least 4.5:1 against its ground", () => {
    for (const [name, theme] of THEMES) {
        for (const [fg, bg] of TEXT_PAIRS) {
            let ratio = contrast(theme[fg], theme[bg]);
            assert.ok(ratio >= 4.5, `${name}: --${fg} on --${bg}: ${ratio.toFixed(2)}`);
        }
    }
});

const GRAPHICS = ["pair-wc", "pair-gu", "pair-nc", "pair-mod", "strand", "ntc-nan-line", "ntc-edge", "text-dim"];
test("base pairs, NtC marks and hints stand out in both themes: at least 3:1", () => {
    for (const [theme_name, theme] of THEMES) {
        for (const name of GRAPHICS) {
            let ratio = contrast(theme[name], theme["bg-secondary"]);
            assert.ok(ratio >= 3, `${theme_name}: --${name}: ${ratio.toFixed(2)}`);
        }
    }
});

test("field and tick-box edges are visible in both themes: at least 3:1", () => {
    for (const [name, theme] of THEMES) {
        for (const ground of ["bg-primary", "bg-secondary"]) {
            let ratio = contrast(theme["input-border"], theme[ground]);
            assert.ok(ratio >= 3, `${name}: --input-border on --${ground}: ${ratio.toFixed(2)}`);
        }
    }
});

test("the interface has one accent colour, the Calm lab ink blue", () => {
    assert.equal(LIGHT["accent"].toLowerCase(), "#24508f");
    assert.equal(DARK["accent"].toLowerCase(), "#86a9e2");
    assert.equal(LIGHT["bg-primary"].toLowerCase(), "#f5f6f8");
    assert.equal(DARK["bg-primary"].toLowerCase(), "#11161d");
    for (const theme of [LIGHT, DARK]) assert.equal(theme["focus"], theme["accent"], "focus is the accent");
    assert.match(CSS, /accent-color: var\(--accent\);/);
});

test("NtC colours are DNATCO's exact palette; a dim one is outlined", async () => {
    let { NTC_CLASS_COLOURS, ntc_classes } = await import("./public/cana.js");
    assert.deepEqual(NTC_CLASS_COLOURS, { A: "#FFEBA1", B: "#C8CFFF", BII: "#0059DA", miB: "#3BE8FB", Z: "#01F60E",
                                          IC: "#FA5CFB", OPN: "#E90000", SYN: "#FF8222", N: "#F2F2F2" });
    assert.deepEqual([ntc_classes("AB01"), ntc_classes("BA08"), ntc_classes("BB07"), ntc_classes("OP1S"),
                      ntc_classes("NANT"), ntc_classes(null)],
                     [["A", "B"], ["BII", "A"], ["BII", "BII"], ["OPN", "SYN"], ["N", "N"], ["N", "N"]]);
    let fills = Object.values(NTC_CLASS_COLOURS).map((f) => f.toLowerCase());
    for (const [theme, ground] of [[LIGHT, LIGHT["bg-secondary"]], [DARK, DARK["bg-secondary"]]]) {
        let dim = fills.filter((f) => contrast(f, ground) < 3);
        assert.ok(dim.length > 0 && contrast(theme["ntc-edge"], ground) >= 3, "dim NtC colours need the outline");
    }
    assert.match(CSS, /\.ntc_bar \{ stroke: var\(--ntc-edge\);/);
});

test("the page sets the theme before it paints and has the button", () => {
    let head = SHELL.slice(0, SHELL.indexOf("</head>"));
    assert.match(head, /<meta name="color-scheme" content="light dark">/);
    assert.match(head, /<script>try \{ var t = localStorage\.getItem\("na3db-theme"\)/);
    assert.ok(!head.includes('type="module"'), "inline, ahead of the app");
    assert.match(read("./client/src/components/Rail.jsx"), /<ThemeButton \/>/);
    assert.match(read("./client/src/components/ThemeButton.jsx"), /<button type="button" className="rail-item rail-theme" data-choice=\{choice\}/);
});

test("no em dash in anything the theme shows", () => {
    for (const path of ["./client/index.html", "./client/src/components/ThemeButton.jsx", "./client/src/hooks/useTheme.js", "./client/src/components/Rail.jsx"]) {
        assert.ok(!read(path).includes("—"), path);
    }
});

test("IBM Plex is self-hosted: every face the CSS names is on disk", () => {
    let faces = [...CSS.matchAll(/@font-face \{([\s\S]*?)\}/g)].map((m) => m[1]);
    let have = faces.map((f) => `${f.match(/font-family: "([^"]+)"/)[1]} ${f.match(/font-weight: (\d+)/)[1]}`);
    assert.deepEqual(have.sort(), ["IBM Plex Mono 400", "IBM Plex Mono 500", "IBM Plex Mono 600",
                                   "IBM Plex Sans 400", "IBM Plex Sans 500", "IBM Plex Sans 600", "IBM Plex Sans 700"]);
    for (const face of faces) {
        let url = face.match(/url\("([^"]+)"\) format\("woff2"\)/)[1];
        assert.ok(url.startsWith("/assets/fonts/"), url);
        assert.ok(readFileSync(new URL(`./public${url}`, import.meta.url)).length > 10000, `${url} is missing`);
        assert.match(face, /font-display: swap;/);
    }
    assert.match(read("./public/assets/fonts/license.txt"), /SIL Open Font License, Version 1\.1/);
});

test("all text uses Plex: the body and every monospace stack", () => {
    assert.match(CSS, /body \{\s*font-family: "IBM Plex Sans", system-ui, sans-serif;/);
    for (const m of CSS.matchAll(/font-family:([^;]+);/g)) {
        if (/monospace/.test(m[1])) assert.match(m[1], /^\s*"IBM Plex Mono",/, m[1]);
    }
    assert.ok(!/\bInter\b/.test(CSS), "Inter is never loaded; do not name it");
});

test("no page loads fonts from another site", () => {
    let pages = [SHELL, CSS, ...CLIENT];
    for (const page of pages) assert.ok(!/fonts\.(googleapis|gstatic)\.com|use\.typekit|fonts\.bunny/.test(page));
});

const RAIL = read("./client/src/components/Rail.jsx");
const RAIL_SVG = [...MARK_LIGHT.map((d) => `<path class="mark_light" d="${d}"`),
                  ...MARK_DEEP.map((d) => `<path class="mark_deep" d="${d}"`)].join("\n");

test("the rail carries the helix mark and the name reads left to right", () => {
    assert.match(RAIL, /<svg className="mark" viewBox="0 0 2705 2774"/);
    assert.ok(!RAIL.includes("rail-name"), "the name is drawn in the lockup, not set as text");
    assert.match(RAIL, /aria-label="NA3DB home"/, "the link still carries the name");
    assert.ok(!RAIL.includes("rail-brand"), "the sideways name is gone");
    assert.ok(!/writing-mode:\s*vertical/.test(CSS), "no vertical text anywhere");
    assert.match(CSS, /\.mark_deep \{ fill: var\(--mark-deep\); \}/);
    assert.match(CSS, /\.mark_light \{ fill: var\(--mark-light\); \}/);
});

test("the deep ribbon is in front, and both strands lighten for the dark theme", () => {
    assert.ok(RAIL.lastIndexOf("mark_light") < RAIL.indexOf("mark_deep"),
              "every light path is drawn before the deep ones");
    let dark = CSS.slice(CSS.indexOf('[data-theme="dark"]'));
    assert.match(dark, /--mark-deep: #4f7fc2;/);
    assert.match(dark, /--mark-light: #a3cbef;/);
});

test("the mark is a right-handed helix, in the rail and the favicon", () => {
    const ends = (svg, cls) =>
        [...svg.matchAll(new RegExp(`<path class="${cls}" d="M (-?[\\d.]+),(-?[\\d.]+) L -?[\\d.]+,-?[\\d.]+ L (-?[\\d.]+),(-?[\\d.]+)`, "g"))]
            .map((m) => [+m[1], +m[2], +m[3], +m[4]]);
    for (const svg of [RAIL_SVG, read("./public/assets/favicon.svg")]) {
        let front = ends(svg, "mark_deep");
        let back = ends(svg, "mark_light");
        assert.equal(front.length, 3);
        assert.equal(back.length, 3);
        for (const [x1, y1, x2, y2] of front) {
            assert.ok((y2 - y1) / (x2 - x1) < 0, "a front ribbon rises to the right");
        }
        for (const [x1, y1, x2, y2] of back) {
            assert.ok((y2 - y1) / (x2 - x1) > 0, "a back ribbon falls to the right");
        }
    }
});

test("every page shows the mark as its favicon", () => {
    let head = SHELL.split("</head>")[0];
    assert.match(head, /<link rel="icon" href="\/assets\/favicon\.svg" type="image\/svg\+xml">/);
    assert.match(head, /<link rel="icon" href="\/assets\/favicon\.ico" sizes="32x32">/);
    assert.match(head, /<link rel="apple-touch-icon" href="\/assets\/apple-touch-icon\.png">/);
    for (const f of ["favicon.ico", "apple-touch-icon.png"]) {
        assert.ok(readFileSync(new URL(`./public/assets/${f}`, import.meta.url)).length > 200, f);
    }
});
