// The sequence map on a structure page: one ruler for the chosen strands, with
// the sequence, the NtC step between each two nucleotides (in DNATCO's
// colours, as tall as its confal score) and the base pairs in layered
// dot-bracket rows. Hover or tap a column for its pairs and steps.

import { NTC_CLASS_COLOURS, NTC_CLASS_NAMES, CANA_NAMES, ntc_classes, ntc_fill } from "./cana.js";
import { expand } from "./expand.js";
export { NTC_CLASS_COLOURS, NTC_CLASS_NAMES, CANA_NAMES, ntc_classes, ntc_fill };

const W = 14;                       // one column, as the section draws it
const W_MIN = 0.5, W_MAX = 28;      // the zoom buttons' range; Fit may go narrower
const LETTERS = 9;                  // narrower than this, letters give way to ticks
const RULER = 16, SEQ = 20, NTC = 28, ROW = 16, GAP = 6;
const Y_SEQ = RULER, Y_NTC = RULER + SEQ + 2, Y_ROWS = Y_NTC + NTC + GAP;
const LABEL_W = 44;
const SVG_NS = "http://www.w3.org/2000/svg";

// Tokens from style.css, so the rows follow the theme.
export const ROW_COLOUR = { WC: "var(--pair-wc)", cWW: "var(--pair-gu)" };
export const OTHER_ROW = "var(--pair-nc)";
const EDGE = { W: "Watson–Crick", H: "Hoogsteen", S: "sugar" };

export const el = (name, attrs = {}, parent) => {
    let node = document.createElementNS(SVG_NS, name);
    // A token (var(--...)) is not a valid presentation attribute; as a style
    // property it is.
    for (const [k, v] of Object.entries(attrs)) {
        if ((k === "fill" || k === "stroke") && String(v).startsWith("var(")) node.style.setProperty(k, v);
        else node.setAttribute(k, v);
    }
    parent?.append(node);
    return node;
};
export const html = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const flip = (f) => f[0] + f[2] + f[1];

// A hairline round a bar wide enough to keep its colour inside it: DNATCO's
// pale A, B and N would melt into the light ground, BII into the dark.
const edge = (w) => (w >= 4 ? { class: "ntc_bar" } : {});

// One NtC bar centred between its two nucleotides, in DNATCO's colours: the
// 5′ half and the 3′ half each in its class's colour. A step with no NtC is
// a low box in DNATCO's pale grey N.
export function bar(g, x, w, h, bottom, ntc) {
    if (!ntc || ntc === "NANT") {
        el("rect", { x: x - w / 2 + 0.5, y: bottom - 10.5, width: w - 1, height: 10, rx: 1.5,
                     fill: NTC_CLASS_COLOURS.N, stroke: "var(--ntc-nan-line)", "stroke-width": 1 }, g);
        return;
    }
    let [a, b] = ntc_fill(ntc);
    if (a !== b) {
        el("rect", { x: x - w / 2, y: bottom - h, width: w / 2, height: h, fill: a, ...edge(w / 2) }, g);
        el("rect", { x, y: bottom - h, width: w / 2, height: h, fill: b, ...edge(w / 2) }, g);
    } else {
        el("rect", { x: x - w / 2, y: bottom - h, width: w, height: h, fill: a, ...edge(w) }, g);
    }
}

export function swatch(ntc) {
    let svg = el("svg", { width: 12, height: 14, viewBox: "0 0 12 14", "aria-hidden": "true" });
    bar(svg, 6, 10, 13, 14, ntc);
    return svg.outerHTML;
}

// The legend: DNATCO's classes that the shown steps use, either half.
export function class_key(ntcs) {
    let used = new Set(ntcs.flatMap((n) => ntc_classes(n)));
    return Object.keys(NTC_CLASS_COLOURS).filter((c) => used.has(c)).map((c) =>
        `<span><i class="ntc_class_swatch" style="background:${NTC_CLASS_COLOURS[c]}"></i>${c} ${NTC_CLASS_NAMES[c]}</span>`).join("");
}
export const KEY_NOTE = `<span class="seqmap_key_note">A two-colour bar is the step's 5′ half and 3′ half. Colours: <a href="https://github.com/molstar/molstar/blob/master/packages/extensions/dnatco/src/color.ts" target="_blank" rel="noopener">DNATCO</a>.</span>`;

const row_y = (k) => Y_ROWS + k * ROW + ROW / 2;
const key_html = (map) => {
    return `
        <span class="seqmap_key_title">NtC step, in DNATCO's colours <em>(bar height: confal)</em></span>
        <span class="seqmap_group">${class_key(map.steps.map((s) => s.ntc))}</span>
        ${KEY_NOTE}
        <span class="seqmap_key_title">Pairs</span>
        <span class="seqmap_group"><span><i style="background:${ROW_COLOUR.WC}"></i>WC: Watson–Crick</span><span><i style="background:${ROW_COLOUR.cWW}"></i>cWW: other cis W–W</span><span><i style="background:${OTHER_ROW}"></i>other families</span><span><b class="seqmap_mod">a</b>lower case: modified</span></span>`;
};
const HINT = `<span class="seqmap_hint">Hover or tap a column: its pairs and the steps on either side show here.</span>`;
const file_url = (map) => `/api/entries/${encodeURIComponent(map.pdb_id)}/sequence_map?strands=${encodeURIComponent(map.shown.join(","))}&format=text`;

// What every drawing of one map shares: which strand each column is on, how
// a column is named, and its pairs as seen from it.
function prepare(map) {
    let n = map.cols.length;
    let links = Array.from({ length: n }, () => []);
    let strand_of = [];
    let s_no = 0;
    map.cols.forEach((c, i) => { if (!c) s_no++; strand_of[i] = s_no; });
    map.rows.forEach((r, k) => {
        for (const [i, j] of r.pairs) {
            let cross = strand_of[i] !== strand_of[j];
            links[i].push({ k, other: j, family: r.family, cross });
            links[j].push({ k, other: i, family: flip(r.family), cross });
        }
    });
    let many = map.names.length > 1;
    let starts = map.cols.map((c, i) => (c && (i === 0 || !map.cols[i - 1]) ? i : -1)).filter((i) => i >= 0);
    return {
        n, links, strand_of, starts,
        step_at: new Map(map.steps.map((s) => [s.i, s])),
        res: (i) => `${many ? map.names[strand_of[i]] + ":" : ""}${map.cols[i][3]}${map.cols[i][1] ?? ""}`
    };
}

// The ruler, sequence, NtC bars and rows at a column width w, into the
// scroll area of box. Narrow columns trade letters for ticks.
function draw_map(box, w) {
    let { map, p } = box.state;
    let { n, links, strand_of, starts, step_at, res } = p;
    let x_of = (i) => i * w + w / 2;
    let width = Math.ceil(n * w);
    let height = Y_ROWS + map.rows.length * ROW + 4;
    let wide = w >= LETTERS;

    let scroll = box.querySelector(".seqmap_scroll");
    scroll.innerHTML = `
        <svg class="seqmap_labels" width="${LABEL_W}" height="${height}" aria-hidden="true"></svg>
        <svg class="seqmap_svg" width="${width}" height="${height}" role="img"
             aria-label="Sequence map of ${html(map.names.join(", "))}: ${n - map.names.length + 1} nucleotides, ${map.steps.length} NtC steps, ${map.rows.length} rows of pairs"></svg>`;

    let lab = scroll.querySelector(".seqmap_labels");
    el("text", { x: 4, y: Y_SEQ + 14, class: "seqmap_label" }, lab).textContent = "seq";
    el("text", { x: 4, y: Y_NTC + NTC - 8, class: "seqmap_label" }, lab).textContent = "NtC";
    map.rows.forEach((r, k) => {
        let t = el("text", { x: 4, y: row_y(k) + 4, class: "seqmap_label" + (r.overflow ? " seqmap_over" : "") }, lab);
        t.textContent = r.name;
        t.style.fill = ROW_COLOUR[r.name] ?? OTHER_ROW;
    });

    let svg = scroll.querySelector(".seqmap_svg");
    let hover = el("g", { class: "seqmap_hover" }, svg);

    // Ruler: author numbers every ten, or every 50 or 500 as the columns
    // narrow; each strand named where it starts.
    let every = [10, 20, 50, 100, 200, 500, 1000, 2000].find((e) => e * w >= 36) ?? 5000;
    let ruler = el("g", { class: "seqmap_ruler" }, svg);
    map.cols.forEach((c, i) => {
        if (!c) {
            el("line", { x1: x_of(i), x2: x_of(i), y1: 2, y2: height - 2, class: "seqmap_sep" }, svg);
            return;
        }
        if (starts.includes(i)) {
            el("text", { x: i * w + 1, y: 11, class: "seqmap_strand" }, ruler).textContent = map.names[strand_of[i]] + " 5′";
            return;
        }
        let num = Number.parseInt(c[1], 10);
        if (Number.isInteger(num) && num % every === 0 && String(num) === String(c[1]) && i - starts.findLast((s) => s <= i) >= 4 * 14 / w) {
            el("line", { x1: x_of(i), x2: x_of(i), y1: 12, y2: 16 }, ruler);
            el("text", { x: x_of(i), y: 10, "text-anchor": "middle" }, ruler).textContent = num;
        }
    });

    // Sequence: letters when there is room; otherwise a line with modified
    // nucleotides as dark ticks and unmodelled ones as gaps.
    let kinds = { seen: [], gone: [], mod: [] };
    map.cols.forEach((c, i) => {
        if (c) kinds[!c[2] ? "gone" : c[0] !== c[0].toUpperCase() ? "mod" : "seen"].push(i);
    });
    if (wide) {
        for (const [kind, cols] of Object.entries(kinds)) {
            if (!cols.length) continue;
            el("text", { x: cols.map(x_of).join(" "), y: Y_SEQ + 14, class: `seqmap_seq seqmap_${kind}` }, svg)
                .textContent = cols.map((i) => map.cols[i][0]).join("");
        }
    } else {
        for (const s of starts) {
            let e = s;
            while (e + 1 < n && map.cols[e + 1]) e++;
            el("rect", { x: s * w, y: Y_SEQ + 7, width: (e - s + 1) * w, height: 4, class: "seqmap_line" }, svg);
        }
        for (const i of kinds.gone) el("rect", { x: i * w, y: Y_SEQ + 7, width: w, height: 4, class: "seqmap_line_gone" }, svg);
        for (const i of kinds.mod) el("rect", { x: i * w, y: Y_SEQ + 3, width: Math.max(1, w), height: 12, class: "seqmap_line_mod" }, svg);
    }

    // NtC bars, between the two nucleotides of each step.
    let bars = el("g", {}, svg);
    let bw = wide ? 10 * Math.min(1, w / W) : Math.max(0.8, w * 0.85);
    el("line", { x1: 0, x2: width, y1: Y_NTC + NTC + 0.5, y2: Y_NTC + NTC + 0.5, class: "seqmap_base" }, bars);
    for (const s of map.steps) {
        let h = 4 + (NTC - 6) * Math.max(0, Math.min(100, s.confal ?? 0)) / 100;
        let x = (s.i + 1) * w;
        if (s.ntc || bw >= 6) bar(bars, x, bw, h, Y_NTC + NTC, s.ntc);
        else el("rect", { x: x - bw / 2, y: Y_NTC + NTC - 3, width: bw, height: 3, class: "seqmap_nan_thin" }, bars);
    }

    // Rows: brackets in the row's colour over faint dots, or a tick per
    // paired base when narrow. Nothing is drawn under a bracket: a mark there
    // touches its tail and reads as a dot inside it. The pointer names a
    // partner on another strand.
    map.rows.forEach((r, k) => {
        let y = row_y(k) + 4;
        let colour = ROW_COLOUR[r.name] ?? OTHER_ROW;
        let ends = r.pairs.flat();
        if (wide) {
            let dots = [];
            [...r.text].forEach((ch, i) => { if (ch === ".") dots.push(i); });
            let marks = ends.sort((a, b) => a - b);
            el("text", { x: dots.map(x_of).join(" "), y, class: "seqmap_dots" }, svg).textContent = ".".repeat(dots.length);
            let t = el("text", { x: marks.map(x_of).join(" "), y, class: "seqmap_marks", fill: colour }, svg);
            t.textContent = marks.map((i) => r.text[i]).join("");
        } else {
            let g = el("g", { fill: colour }, svg);
            for (const i of ends) el("rect", { x: i * w, y: row_y(k) - 4, width: Math.max(0.8, w), height: 8 }, g);
        }
    });

    // The pointer: a band over the column, rings on its partners, and words.
    let info = box.querySelector(".seqmap_info");
    let st = box.state;
    let family_words = (f) => `${f[0] === "c" ? "cis" : "trans"} ${EDGE[f[1]]}–${EDGE[f[2]]}`;
    let step_words = (s, a, b) => !s ? "" : s.ntc
        ? `<span class="seqmap_step">step ${html(res(a))}→${html(res(b))}: ${swatch(s.ntc)} <b>${html(s.ntc)}</b> ${html(s.cana)} · confal ${s.confal ?? "–"}</span>`
        : `<span class="seqmap_step">step ${html(res(a))}→${html(res(b))}: no NtC class${s.closest ? ` (closest ${html(s.closest)})` : ""}</span>`;
    let band = Math.max(w, 2);

    function show(i) {
        hover.replaceChildren();
        if (i === null || !map.cols[i]) { info.innerHTML = HINT; return; }
        el("rect", { x: i * w + w / 2 - band / 2, y: 0, width: band, height, class: "seqmap_band" }, hover);
        for (const l of links[i]) {
            el("rect", { x: l.other * w + w / 2 - band / 2, y: 0, width: band, height, class: "seqmap_band seqmap_partner_band" }, hover);
            el("circle", { cx: x_of(l.other), cy: row_y(l.k), r: Math.max(4, Math.min(6.5, w / 2 + 1)), class: "seqmap_ring" }, hover);
            el("circle", { cx: x_of(l.other), cy: Y_SEQ + 10, r: Math.max(4, Math.min(8, w / 2 + 2)), class: "seqmap_ring" }, hover);
        }
        let c = map.cols[i];
        let pairs = links[i].map((l) => `<span class="seqmap_pair"><i style="background:${ROW_COLOUR[map.rows[l.k].name] ?? OTHER_ROW}"></i>${html(map.rows[l.k].name === "WC" ? "Watson–Crick" : l.family)} with <button type="button" class="seqmap_jump" data-col="${l.other}" title="Go to ${html(res(l.other))}">${html(res(l.other))}</button>${map.rows[l.k].name === "WC" ? "" : ` <em>(${family_words(l.family)})</em>`}</span>`);
        info.innerHTML = `<b class="seqmap_res">${html(res(i))}</b>${c[2] ? "" : ` <em>not in the model</em>`}
            ${pairs.length ? pairs.join("") : `<span class="seqmap_pair seqmap_none">unpaired</span>`}
            ${step_words(step_at.get(i - 1), i - 1, i)}${step_words(step_at.get(i), i, i + 1)}`;
    }
    st.show = show;
    let col_at = (event) => {
        let r = svg.getBoundingClientRect();
        let i = Math.floor((event.clientX - r.left) / w);
        return i >= 0 && i < n ? i : null;
    };
    svg.addEventListener("pointermove", (event) => { if (st.pinned === null && event.pointerType === "mouse") show(col_at(event)); });
    svg.addEventListener("pointerleave", () => { if (st.pinned === null) show(null); });
    svg.addEventListener("click", (event) => {
        let i = col_at(event);
        st.pinned = st.pinned === i ? null : i;
        show(i);
        svg.classList.toggle("seqmap_pinned", st.pinned !== null);
    });
    if (st.pinned !== null) { show(st.pinned); svg.classList.add("seqmap_pinned"); }
    else info.innerHTML = HINT;
}

// Scrolls so column i sits in the middle of the view.
function centre_on(box, i) {
    let scroll = box.querySelector(".seqmap_scroll");
    scroll.scrollLeft = i * box.state.w + box.state.w / 2 - (scroll.clientWidth - LABEL_W) / 2;
}

// A partner's name in the words jumps to it, and pins it.
function jumps(box) {
    box.querySelector(".seqmap_info").addEventListener("click", (event) => {
        let b = event.target.closest(".seqmap_jump");
        if (!b) return;
        let i = Number(b.dataset.col);
        centre_on(box, i);
        box.state.pinned = i;
        box.state.show(i);
        box.querySelector(".seqmap_svg").classList.add("seqmap_pinned");
    });
}

// The map in its section: strand chips, a download, and Expand.
function draw(box, map) {
    box.state = { map, p: prepare(map), w: W, pinned: null };
    box.innerHTML = `
        <div class="seqmap_tools">
            <div class="seqmap_chips" role="group" aria-label="Strands on the ruler"></div>
            <span class="seqmap_buttons">
                <button type="button" class="seqmap_full" aria-expanded="false" title="Expand here, with every strand and an overview">⤢ Expand</button>
                <a class="seqmap_file" href="${file_url(map)}" download title="The rows as text, in layered dot-bracket notation">Download notation</a>
            </span>
        </div>
        <div class="seqmap_scroll" tabindex="0" aria-label="Sequence map, scrolls sideways"></div>
        <div class="seqmap_info" aria-live="polite">${HINT}</div>
        <div class="seqmap_key">${key_html(map)}</div>`;

    // Strand chips: the ones on the ruler pressed; one press adds or drops a
    // strand, and the map is drawn again.
    let chips = box.querySelector(".seqmap_chips");
    for (const s of map.strands) {
        let on = map.shown.includes(s.key);
        let partner = !on && map.shown.some((k) => s.partners.includes(k));
        let b = document.createElement("button");
        b.type = "button";
        b.className = "seqmap_chip" + (partner ? " seqmap_partner" : "");
        b.setAttribute("aria-pressed", String(on));
        b.title = strand_note(map, s);
        b.textContent = s.name;
        b.addEventListener("click", () => {
            let keys = map.strands.map((t) => t.key)
                .filter((k) => (k === s.key ? !on : map.shown.includes(k)));
            if (keys.length) load(box, keys);
        });
        chips.append(b);
    }
    box.querySelector(".seqmap_full").addEventListener("click", (event) => open_full(map, event.currentTarget));
    draw_map(box, W);
    jumps(box);
}

const strand_note = (map, s) => `${s.length} nt` + (s.partners.length
    ? ` · pairs with ${s.partners.map((k) => map.strands.find((t) => t.key === k)?.name ?? k).join(", ")}` : " · no pairs");

async function fetch_map(id, keys = []) {
    let url = `/api/entries/${encodeURIComponent(id)}/sequence_map` + (keys.length ? `?strands=${encodeURIComponent(keys.join(","))}` : "");
    let res = await fetch(url);
    if (!res.ok) throw new Error(res.status);
    return res.json();
}

async function load(box, keys = []) {
    try {
        draw(box, await fetch_map(box.dataset.entry, keys));
    } catch {
        box.innerHTML = `<p class="section_none">The sequence map could not be drawn. Reload the page to try again.</p>`;
    }
}

// ---- Expanded -------------------------------------------------------------
// Every strand can go on the ruler; an overview of the whole ruler on top
// shows where the view is, and the columns zoom from letters down to a
// fraction of a pixel, so a ribosome fits on one screen.

let dialog = null;

function make_dialog() {
    dialog = document.createElement("dialog");
    dialog.className = "arc_viewer seqmap_dialog";
    dialog.setAttribute("aria-label", "Sequence map, expanded");
    dialog.innerHTML = `
        <div class="av_box">
            <div class="av_top">
                <strong class="smd_id"></strong>
                <span class="av_title">Sequence map</span>
                <span class="smd_zoom">
                    <button type="button" data-zoom="in" aria-label="Zoom in">＋</button>
                    <button type="button" data-zoom="out" aria-label="Zoom out">－</button>
                    <button type="button" data-zoom="fit" title="Every column on screen">Fit</button>
                    <button type="button" data-zoom="read" title="Columns wide enough to read">Letters</button>
                </span>
                <a class="seqmap_file smd_file" download>Download notation</a>
            </div>
            <div class="smd_main">
                <aside class="smd_side">
                    <h4>Strands on the ruler</h4>
                    <div class="smd_quick">
                        <button type="button" data-pick="all">All</button>
                        <button type="button" data-pick="partners">Pairing with the ticked</button>
                    </div>
                    <ul class="smd_strands"></ul>
                    <p class="smd_note">Tick strands to put them side by side on one ruler; their pairs to each other show in the rows. A name jumps to its 5′ end.</p>
                </aside>
                <div class="smd_stage">
                    <svg class="smd_overview" preserveAspectRatio="none" role="img" aria-label="The whole ruler; the box is the part on screen"></svg>
                    <div class="seqmap smd_map">
                        <div class="seqmap_scroll" tabindex="0" aria-label="Sequence map, scrolls sideways"></div>
                        <div class="seqmap_info" aria-live="polite">${HINT}</div>
                        <div class="seqmap_key"></div>
                    </div>
                </div>
            </div>
        </div>`;
    document.body.append(dialog);

    let box = dialog.querySelector(".smd_map");
    jumps(box);

    dialog.querySelector(".smd_zoom").addEventListener("click", (event) => {
        let b = event.target.closest("[data-zoom]");
        if (!b || !box.state) return;
        let z = b.dataset.zoom;
        zoom_to(box, z === "fit" ? fit_width(box) : z === "read" ? W : box.state.w * (z === "in" ? 1.6 : 1 / 1.6));
    });

    // The wheel zooms around the pointer; sideways scrolling still scrolls.
    let scroll = box.querySelector(".seqmap_scroll");
    scroll.addEventListener("wheel", (event) => {
        if (!box.state || event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
        event.preventDefault();
        let r = scroll.getBoundingClientRect();
        zoom_to(box, box.state.w * (event.deltaY < 0 ? 1.25 : 0.8), event.clientX - r.left - LABEL_W);
    }, { passive: false });
    scroll.addEventListener("scroll", () => frame(box), { passive: true });
    addEventListener("resize", () => { if (dialog.open && box.state) frame(box); });

    // The overview: a click or drag puts the view there.
    let over = dialog.querySelector(".smd_overview");
    let drag = (event) => {
        let r = over.getBoundingClientRect();
        centre_on(box, Math.round((event.clientX - r.left) / r.width * box.state.p.n));
    };
    over.addEventListener("pointerdown", (event) => {
        if (!box.state) return;
        over.setPointerCapture(event.pointerId);
        drag(event);
        over.onpointermove = drag;
    });
    over.addEventListener("pointerup", () => { over.onpointermove = null; });

    // The strand list: a tick redraws; a name jumps.
    let list = dialog.querySelector(".smd_strands");
    list.addEventListener("change", () => {
        let keys = [...list.querySelectorAll("input:checked")].map((i) => i.value);
        if (keys.length) full_load(keys);
        else list.querySelector(`input[value="${CSS.escape(box.state.map.shown[0])}"]`).checked = true;
    });
    list.addEventListener("click", (event) => {
        let b = event.target.closest(".smd_go");
        if (!b) return;
        let n = box.state.map.shown.indexOf(b.dataset.key);
        if (n >= 0) {
            let scroll = box.querySelector(".seqmap_scroll");
            scroll.scrollLeft = box.state.p.starts[n] * box.state.w;
        }
    });
    dialog.querySelector(".smd_quick").addEventListener("click", (event) => {
        let b = event.target.closest("[data-pick]");
        if (!b || !box.state) return;
        let { map } = box.state;
        let keys = b.dataset.pick === "all" ? map.strands.map((s) => s.key)
            : map.strands.filter((s) => map.shown.includes(s.key) || s.partners.some((k) => map.shown.includes(k))).map((s) => s.key);
        full_load(keys);
    });
}

// Narrow enough that every column is on screen.
function fit_width(box) {
    let scroll = box.querySelector(".seqmap_scroll");
    return Math.max(0.02, Math.min(W, (scroll.clientWidth - LABEL_W - 4) / box.state.p.n));
}

// A new column width, keeping the column under the pointer (or in the
// middle) where it was.
function zoom_to(box, w, at) {
    let scroll = box.querySelector(".seqmap_scroll");
    let view = scroll.clientWidth - LABEL_W;
    at ??= view / 2;
    w = Math.max(Math.min(W_MIN, fit_width(box)), Math.min(W_MAX, w));
    let col = (scroll.scrollLeft + at) / box.state.w;
    box.state.w = w;
    draw_map(box, w);
    scroll.scrollLeft = col * w - at;
    frame(box);
}

// The overview: each strand a grey band with its name, the NtC classes as
// colour under it, and the box that is the view.
function overview(box) {
    let { map, p } = box.state;
    let over = dialog.querySelector(".smd_overview");
    over.setAttribute("viewBox", `0 0 ${p.n} 30`);
    over.innerHTML = "";
    p.starts.forEach((s, k) => {
        let e = s;
        while (e + 1 < p.n && map.cols[e + 1]) e++;
        el("rect", { x: s, y: 2, width: e - s + 1, height: 12, class: k % 2 ? "smd_band smd_band_alt" : "smd_band" }, over);
    });
    let g = el("g", {}, over);
    for (const s of map.steps) {
        if (s.ntc) el("rect", { x: s.i + 0.5, y: 16, width: 1, height: 12, fill: ntc_fill(s.ntc)[0] }, g);
    }
    el("rect", { class: "smd_view", x: 0, y: 0.5, width: 0, height: 29 }, over);
    let names = dialog.querySelector(".smd_names") ?? Object.assign(document.createElement("div"), { className: "smd_names" });
    over.after(names);
    names.innerHTML = p.starts.map((s, k) => `<span style="left:${(s / p.n * 100).toFixed(3)}%">${html(map.names[k])}</span>`).join("");
}

function frame(box) {
    let scroll = box.querySelector(".seqmap_scroll");
    let view = dialog.querySelector(".smd_view");
    if (!view) return;
    let w = box.state.w;
    view.setAttribute("x", Math.max(0, scroll.scrollLeft / w));
    view.setAttribute("width", Math.min(box.state.p.n, (scroll.clientWidth - LABEL_W) / w));
}

function full_draw(map) {
    let box = dialog.querySelector(".smd_map");
    let old = box.state;
    box.state = { map, p: prepare(map), w: old?.w ?? W, pinned: null };
    dialog.querySelector(".smd_id").textContent = map.pdb_id;
    dialog.querySelector(".av_title").textContent = `Sequence map · ${map.names.join(" & ")}`;
    dialog.querySelector(".smd_file").href = file_url(map);
    box.querySelector(".seqmap_key").innerHTML = key_html(map);
    dialog.querySelector(".smd_strands").innerHTML = map.strands.map((s) => `
        <li><label><input type="checkbox" value="${html(s.key)}"${map.shown.includes(s.key) ? " checked" : ""}> ${html(s.name)}</label>
            <span class="smd_meta">${html(strand_note(map, s))}</span>
            ${map.shown.includes(s.key) ? `<button type="button" class="smd_go" data-key="${html(s.key)}" title="Go to its 5′ end">go ›</button>` : ""}</li>`).join("");
    overview(box);
    // Opens at letters; a new set of strands keeps the zoom, from its 5′ end.
    draw_map(box, box.state.w);
    box.querySelector(".seqmap_scroll").scrollLeft = 0;
    frame(box);
}

async function full_load(keys) {
    let box = dialog.querySelector(".smd_map");
    try {
        full_draw(await fetch_map(box.state.map.pdb_id, keys));
    } catch {
        box.querySelector(".seqmap_info").textContent = "Those strands could not be drawn; try again.";
    }
}

function open_full(map, button) {
    if (!dialog) make_dialog();
    if (!expand(dialog, button.closest(".seqmap"), button)) return;
    let box = dialog.querySelector(".smd_map");
    box.state = null;
    full_draw(map);
}

// Drawn once the section comes near the screen, so a ribosome's map costs
// nothing to a reader who never scrolls there.
for (const box of document.querySelectorAll(".seqmap")) {
    let seen = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        seen.disconnect();
        load(box);
    }, { rootMargin: "600px" });
    seen.observe(box);
}
