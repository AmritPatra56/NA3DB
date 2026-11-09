// arc_viewer.js - the arc picture full screen. Fetches the entry's pairs as
// numbers (/api/entries/:id/arcs) when opened and draws them at screen size.
// Every pair is on screen without a click: counts above the drawing, the
// pointed or picked pair under it, the whole list beside it. Leontis–Westhof
// symbols mark the non-canonical arcs; a family chip shows only that family.

const NS = "http://www.w3.org/2000/svg";
const KIND = { wc: "Watson–Crick", gu: "G·U wobble", nc: "non-canonical" };
const EDGE = { W: "Watson–Crick", H: "Hoogsteen", S: "Sugar" };
const TOP = 14, PAD = 22, GAP = 24;
// The drawing is as many units as the screen has pixels, so text is the same
// size on a phone as on a computer. Set when the viewer opens or resizes.
let W = 1000, H = 470, BASE = 420;

const dialog = document.getElementById("arc_viewer");
const svg = dialog.querySelector(".av_svg");
const info = dialog.querySelector(".av_info");
const rows = dialog.querySelector(".av_rows");
const fams = dialog.querySelector(".av_fams");
let V = null;          // the open picture
let cache = new Map(); // pdb id -> its arcs, once fetched

const el = (tag, attrs, parent, text) => {
    let e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    parent.appendChild(e);
    return e;
};
const num = (n) => n.toLocaleString("en-GB");
const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

// The Leontis–Westhof symbol of a family: one shape per edge, a circle for
// Watson–Crick, a square for Hoogsteen, a triangle for Sugar; filled for cis,
// open for trans. Drawn centred on x, y.
function glyph(fam, x, y, r = 4.5) {
    if (!/^[ct][WHS][WHS]$/.test(fam)) return "";
    let fill = fam[0] === "c" ? "currentColor" : "#fff";
    let one = (e, cx) => e === "W" ? `<circle cx="${cx}" cy="${y}" r="${r}"/>`
        : e === "H" ? `<rect x="${cx - r}" y="${y - r}" width="${2 * r}" height="${2 * r}"/>`
        : `<path d="M${cx - r - 1} ${y + r}L${cx + r + 1} ${y + r}L${cx} ${y - r - 1}Z"/>`;
    return `<g fill="${fill}" stroke="currentColor" stroke-width="1.4">${one(fam[1], x - r - 1)}${one(fam[2], x + r + 1)}</g>`;
}
const glyph_html = (fam) => `<svg class="av_glyph" width="26" height="12" viewBox="0 0 26 12" aria-hidden="true">${glyph(fam, 13, 6, 4.5)}</svg>`;
const family_words = (f) => /^[ct][WHS][WHS]$/.test(f) ? `${f[0] === "c" ? "cis" : "trans"} ${EDGE[f[1]]} / ${EDGE[f[2]]}` : f;

// Where nucleotide i of the whole line sits before zooming.
function layout(d) {
    let total = d.strands.reduce((n, s) => n + s.length, 0);
    let k = d.strands.length, room = W - 2 * PAD;
    let gap = k > 1 ? Math.min(GAP, room * 0.25 / (k - 1)) : 0;
    let step = (room - gap * (k - 1)) / total;
    let strand_of = new Int32Array(total + 2);
    d.strands.forEach((s, j) => { for (let i = s.start + 1; i <= s.start + s.length; i++) strand_of[i] = j; });
    return {
        room, step, gap, strand_of,
        x: (i) => PAD + strand_of[i] * gap + (i - 0.5) * step,
        ends: (s, j) => [PAD + j * gap + s.start * step, PAD + j * gap + (s.start + s.length) * step]
    };
}

function build(d) {
    let r = svg.getBoundingClientRect();
    W = Math.max(300, Math.round(r.width));
    H = Math.max(220, Math.min(Math.round(r.height), Math.round(W * 0.6)));
    BASE = H - 58;
    svg.textContent = "";
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    let L = layout(d);
    let ticks = el("g", {}, svg);
    let lines = d.strands.map((s) => el("line", { y1: BASE, y2: BASE, class: "arc_strand" + (s.symmetry ? " arc_copy" : "") }, svg));
    let width = Math.max(0.7, 1.8 * Math.min(1, Math.sqrt(40 / Math.max(1, d.pairs.length))));
    let arcs = el("g", { class: "arc_lines", "stroke-width": width }, svg);
    let paths = d.pairs.map(([, , kind], i) => el("path", { class: `arc_${kind}`, "data-i": i }, arcs));
    let glyphs = el("g", { class: "av_glyphs" }, svg);
    let marks = el("g", {}, svg);
    V = { ...(V?.d === d ? V : { hover: null, picked: null, fam: null }), d, L, s: 1, tx: 0, ticks, lines, paths, glyphs, marks };
    draw();
    paint();
}

// Everything that moves with the zoom. An arc's height follows its width on
// screen, capped at the top, so zooming in turns flat stems into rainbows.
function draw() {
    let { d, L } = V;
    let sx = (v) => V.tx + V.s * v;
    let reach = BASE - TOP - 3;
    let height = (xa, xb) => (3 + reach * Math.min(1, (xb - xa) / L.room)) / 0.75;
    d.strands.forEach((s, j) => {
        let [x1, x2] = L.ends(s, j);
        V.lines[j].setAttribute("x1", sx(x1));
        V.lines[j].setAttribute("x2", sx(x2));
    });
    let symbols = "";
    V.paths.forEach((p, i) => {
        let [a, b, kind, , fam] = d.pairs[i];
        let xa = sx(L.x(a)), xb = sx(L.x(b)), h = height(xa, xb), y = BASE - h;
        p.setAttribute("d", `M${xa.toFixed(1)} ${BASE}C${xa.toFixed(1)} ${y.toFixed(1)} ${xb.toFixed(1)} ${y.toFixed(1)} ${xb.toFixed(1)} ${BASE}`);
        // A symbol only where the arc is wide enough on screen to carry it.
        if (kind === "nc" && xb - xa >= 22 && xb > 0 && xa < W) {
            symbols += `<g data-i="${i}" class="av_sym">${glyph(fam, (xa + xb) / 2, BASE - h * 0.75)}</g>`;
        }
    });
    V.glyphs.innerHTML = symbols;

    // The letters under the line once there is room for them, modified ones
    // white on dark; before that, a dot marks each modified residue.
    V.marks.textContent = "";
    let room = L.step * V.s;
    d.strands.forEach((s, j) => {
        let first = Math.max(1, Math.floor((-V.tx / V.s - PAD - j * L.gap) / L.step) - s.start - 1);
        for (let pos = first; pos <= s.length; pos++) {
            let x = sx(L.x(s.start + pos));
            if (x < -10) continue;
            if (x > W + 10) break;
            let mod = s.modified.includes(pos);
            if (room >= 10) {
                if (mod) el("circle", { cx: x, cy: BASE + 12, r: 6.5, class: "av_mod" }, V.marks);
                el("text", { x, y: BASE + 15.5, class: "av_letter" + (mod ? " av_letter_mod" : "") }, V.marks, s.sequence?.[pos - 1] ?? "·");
            } else if (mod) {
                el("circle", { cx: x, cy: BASE, r: 3.5, class: "av_mod" }, V.marks);
            }
        }
    });
    let on = V.hover ?? V.picked;
    if (on != null) {
        for (const i of d.pairs[on].slice(0, 2)) el("circle", { cx: sx(L.x(i)), cy: BASE, r: 5.5, class: "av_end" }, V.marks);
    }

    // A ruler counted from each strand's 5' end, spaced so labels never touch.
    V.ticks.textContent = "";
    let every = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find((n) => n * L.step * V.s >= 44) ?? 2000;
    d.strands.forEach((s, j) => {
        let [x1, x2] = L.ends(s, j).map(sx);
        if (x2 < 0 || x1 > W) return;
        for (let p = every; p <= s.length; p += every) {
            let x = sx(L.x(s.start + p));
            if (x < 0 || x > W) continue;
            el("line", { x1: x, y1: BASE + 22, x2: x, y2: BASE + 27, class: "av_tick" }, V.ticks);
            el("text", { x, y: BASE + 52, class: "av_ticklabel" }, V.ticks, p);
        }
        let room = Math.min(x2, W) - Math.max(x1, 0);
        if (room >= 70) {
            el("text", { x: Math.max(x1, 4), y: BASE + 40, class: "av_label" }, V.ticks, "5′");
            el("text", { x: Math.min(x2, W - 4), y: BASE + 40, class: "av_label av_right" }, V.ticks, "3′");
        }
        if ((d.strands.length > 1 || s.symmetry) && room >= 24) {
            el("text", { x: (Math.max(x1, 0) + Math.min(x2, W)) / 2, y: BASE + 40, class: "av_label av_name" }, V.ticks, s.name);
        }
    });
}

// Which arcs and rows stand out: the pointed or picked pair, else the chosen
// family. Also fills the pair panel under the drawing.
function paint() {
    let { d } = V;
    let on = V.hover ?? V.picked;
    let lit = on != null ? (i) => i === on : V.fam ? (i) => d.pairs[i][4] === V.fam : null;
    svg.classList.toggle("av_dim", !!lit);
    V.paths.forEach((p, i) => p.classList.toggle("av_on", !!lit?.(i)));
    if (on != null) V.paths[on].parentNode.appendChild(V.paths[on]);   // on top of the others
    V.glyphs.querySelectorAll("[data-i]").forEach((g) => g.classList.toggle("av_on", !!lit?.(+g.dataset.i)));
    for (const tr of rows.children) {
        let i = +tr.dataset.i;
        tr.hidden = !!V.fam && d.pairs[i][4] !== V.fam;
        tr.classList.toggle("av_row_on", i === on);
    }
    show(on);
}

function show(i) {
    if (i == null) {
        info.innerHTML = `<span class="av_k">Pair</span><b>Hover an arc or a row</b>
            <span>Every pair is in the list of pairs; pick a family to see only those.</span>`;
        return;
    }
    let [a, b, kind, , fam, name_a, name_b] = V.d.pairs[i];
    let { strand_of } = V.L;
    let mods = [[a, name_a], [b, name_b]].filter(([x]) => modified(x)).map(([, n]) => n);
    let facts = [family_words(fam), KIND[kind]];
    if (strand_of[a] === strand_of[b]) facts.push(`spans ${num(b - a)} nt`);
    if (mods.length) facts.push(`modified: ${mods.join(", ")}`);
    info.innerHTML = `<span class="av_k">Pair ${num(i + 1)} of ${num(V.d.pairs.length)}</span>
        <b>${esc(name_a)} – ${esc(name_b)} ${glyph_html(fam)} ${esc(fam)}</b>
        <span>${esc(facts.join(" · "))}</span>`;
}

// Whether nucleotide i of the whole line is a modified residue.
function modified(i) {
    let s = V.d.strands[V.L.strand_of[i]];
    return s.modified.includes(i - s.start);
}

function hover(i, from_drawing) {
    if (i === V.hover) return;
    V.hover = i;
    draw();
    paint();
    if (i != null && from_drawing) rows.querySelector(`tr[data-i="${i}"]`)?.scrollIntoView({ block: "nearest" });
}
function pick(i) {
    V.picked = V.picked === i ? null : i;
    V.hover = null;
    draw();
    paint();
}

function zoom(f, cx = W / 2) {
    let s = Math.min(Math.max(80, 16 / V.L.step), Math.max(1, V.s * f));
    V.tx = clamp(cx - (cx - V.tx) * (s / V.s), s);
    V.s = s;
    draw();
    paint();
}
const clamp = (tx, s = V.s) => Math.min(0, Math.max(W - W * s, tx));

// The pointer in picture units; the picture keeps its shape and is centred.
function picture_point(ev) {
    let r = svg.getBoundingClientRect(), k = Math.min(r.width / W, r.height / H);
    return { x: (ev.clientX - r.left - (r.width - W * k) / 2) / k,
             y: (ev.clientY - r.top - (r.height - H * k) / 2) / k, k };
}
const picture_x = (ev) => picture_point(ev).x;

// The arc nearest the pointer, within a finger's width, so a thin line need
// not be hit exactly. Each arc is a cubic with its control points straight
// above its ends: x = a + (b - a)(3t² - 2t³), y = BASE - h·3t(1 - t).
function nearest(ev) {
    let { x, y, k } = picture_point(ev);
    let reach = BASE - TOP - 3, best = null, within = 14 / k;
    let sx = (v) => V.tx + V.s * v;
    V.d.pairs.forEach(([a, b, , , fam], i) => {
        if (V.fam && fam !== V.fam) return;
        let xa = sx(V.L.x(a)), xb = sx(V.L.x(b));
        if (x < xa - within || x > xb + within) return;
        let f = Math.min(1, Math.max(0, (x - xa) / (xb - xa || 1)));
        let lo = 0, hi = 1;
        for (let n = 0; n < 12; n++) {
            let t = (lo + hi) / 2;
            if (3 * t * t - 2 * t * t * t < f) lo = t; else hi = t;
        }
        let t = (lo + hi) / 2;
        let h = (3 + reach * Math.min(1, (xb - xa) / V.L.room)) / 0.75;
        let gap = Math.abs(y - (BASE - h * 3 * t * (1 - t)));
        if (gap < within) { within = gap; best = i; }
    });
    return best;
}

// The counts above the drawing.
function summary(d) {
    let count = { wc: 0, gu: 0, nc: 0 };
    let families = new Set();
    for (const p of d.pairs) { count[p[2]]++; if (p[2] === "nc") families.add(p[4]); }
    let nt = d.strands.reduce((n, s) => n + s.length, 0);
    let mod = d.strands.reduce((n, s) => n + s.modified.length, 0);
    let strands = d.strands.length;
    let items = [["Base pairs", num(d.pairs.length)], ["Watson–Crick", num(count.wc)], ["G·U wobble", num(count.gu)],
                 ["Non-canonical", `${num(count.nc)}${count.nc ? ` <small>${families.size} ${families.size === 1 ? "family" : "families"}</small>` : ""}`],
                 ["Nucleotides", `${num(nt)}${mod ? ` <small>${num(mod)} modified</small>` : ""}`],
                 ["Strands", `${num(strands)} <small>${esc(d.strands.slice(0, 6).map((s) => s.name).join(", "))}${strands > 6 ? "…" : ""}</small>`]];
    dialog.querySelector(".av_summary").innerHTML = items.map(([k, v]) => `<div>${k}<b>${v}</b></div>`).join("");
}

// The family chips and the pair list.
function lists(d) {
    let by = new Map();
    for (const p of d.pairs) by.set(p[4], (by.get(p[4]) ?? 0) + 1);
    fams.innerHTML = [...by].sort((x, y) => y[1] - x[1]).map(([f, n]) =>
        `<button type="button" class="av_fam" data-fam="${esc(f)}" aria-pressed="false" title="${esc(family_words(f))}">${glyph_html(f)}${esc(f)} <em>${num(n)}</em></button>`).join("");
    rows.innerHTML = d.pairs.map(([a, b, kind, , fam, name_a, name_b], i) =>
        `<tr data-i="${i}"><td>${num(i + 1)}</td>`
        + `<td${modified(a) ? ' class="av_modres"' : ""}>${esc(name_a)}</td>`
        + `<td${modified(b) ? ' class="av_modres"' : ""}>${esc(name_b)}</td>`
        + `<td>${glyph_html(fam)} ${esc(fam)}</td>`
        + `<td><i class="av_sw arc_${kind}"></i>${KIND[kind]}</td></tr>`).join("");
}

async function open(id) {
    dialog.showModal();
    document.documentElement.style.overflow = "hidden";
    info.innerHTML = "<span>Loading…</span>";
    let d = cache.get(id);
    dialog.querySelector(".av_id").textContent = id;
    dialog.querySelector(".av_title").textContent = d?.title ?? "";
    dialog.querySelector(".av_table").href = `/structure/${encodeURIComponent(id)}#base-pairs`;
    if (!d) {
        svg.textContent = "";
        rows.textContent = "";
        fams.textContent = "";
        dialog.querySelector(".av_summary").textContent = "";
        let res = await fetch(`/api/entries/${encodeURIComponent(id)}/arcs`);
        if (!res.ok) { info.innerHTML = "<span>Could not load the pairs.</span>"; return; }
        d = await res.json();
        cache.set(id, d);
        dialog.querySelector(".av_title").textContent = d.title ?? "";
    }
    V = null;
    if (!d.pairs.length) {
        svg.textContent = "";
        rows.textContent = "";
        fams.textContent = "";
        dialog.querySelector(".av_summary").textContent = "";
        info.innerHTML = "<span>No base pairs annotated for this entry.</span>";
        return;
    }
    dialog.querySelector(".av_copynote").hidden = !d.strands.some((s) => s.symmetry);
    summary(d);
    build(d);
    lists(d);
    paint();
}

function close() {
    if (dialog.open) dialog.close();
}
dialog.addEventListener("close", () => { document.documentElement.style.overflow = ""; });

let drag = null;
svg.addEventListener("pointerdown", (ev) => {
    if (!V) return;
    let i = nearest(ev);
    if (i != null) { pick(i); return; }
    drag = { x: picture_x(ev), tx: V.tx };
    svg.classList.add("av_drag");
    svg.setPointerCapture(ev.pointerId);
});
svg.addEventListener("pointermove", (ev) => {
    if (!V) return;
    if (drag) { V.tx = clamp(drag.tx + picture_x(ev) - drag.x); draw(); paint(); return; }
    if (ev.pointerType !== "mouse") return;
    hover(nearest(ev), true);
});
svg.addEventListener("pointerleave", () => V && !drag && hover(null));
svg.addEventListener("pointerup", () => { drag = null; svg.classList.remove("av_drag"); });
svg.addEventListener("wheel", (ev) => {
    if (!V) return;
    ev.preventDefault();
    zoom(ev.deltaY < 0 ? 1.25 : 0.8, picture_x(ev));
}, { passive: false });

rows.addEventListener("mouseover", (ev) => { let tr = ev.target.closest("tr"); if (V && tr) hover(+tr.dataset.i); });
rows.addEventListener("mouseleave", () => V && hover(null));
rows.addEventListener("click", (ev) => { let tr = ev.target.closest("tr"); if (V && tr) pick(+tr.dataset.i); });
fams.addEventListener("click", (ev) => {
    let b = ev.target.closest(".av_fam");
    if (!V || !b) return;
    V.fam = V.fam === b.dataset.fam ? null : b.dataset.fam;
    for (const c of fams.children) c.setAttribute("aria-pressed", String(c.dataset.fam === V.fam));
    V.picked = null;
    paint();
});

dialog.querySelector(".av_in").onclick = () => V && zoom(1.6);
dialog.querySelector(".av_out").onclick = () => V && zoom(1 / 1.6);
dialog.querySelector(".av_fit").onclick = () => { if (V) { V.s = 1; V.tx = 0; draw(); paint(); } };
dialog.querySelector(".av_close").onclick = close;
dialog.querySelector(".av_table").onclick = close;
// A click on the dimmed backdrop lands on the dialog itself.
dialog.addEventListener("click", (ev) => { if (ev.target === dialog) close(); });

// A turned phone or a resized window: draw again for the new size.
window.addEventListener("resize", () => {
    if (dialog.open && V) build(V.d);
});

// One listener for every open button, including the Arcs view's tiles, which
// are drawn after this script runs.
document.addEventListener("click", (ev) => {
    let b = ev.target.closest("[data-arc-open]");
    if (b) open(b.dataset.arcOpen);
});
