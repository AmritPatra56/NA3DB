// Same sequence in other entries, on a structure page: a table of every chain
// with this sequence letter for letter, and a comparison of any two of them.
// The comparison draws one ruler: chain A's backbone steps above the sequence,
// chain B's below, then the base pairs of both in dot-bracket rows, every
// difference numbered on the picture and said in words underneath.

import { expand, collapse } from "./expand.js";
import { ROW_COLOUR, OTHER_ROW, el, html, bar, swatch, class_key, KEY_NOTE } from "./seqmap.js";

const W = 14, W_FULL = 20;           // one column, in the section and full screen
const MARK = 17, RULER = 14, BAR = 26, SEQ = 20, GAP = 8, ROW = 16;
const LABEL_W = 78;
const ROWS_SHOWN = 10;               // entries listed before "Show all"
const ONLY = { a: "ss_only_a", b: "ss_only_b" };

const resolution = (r) => (r === null || r === undefined ? null : `${Number(r).toFixed(r < 10 ? 2 : 1)} Å`);
const method_short = (m) => String(m ?? "").replace(/ DIFFRACTION$/, "").replace(/^SOLUTION /, "").toLowerCase() || "unknown method";
const HINT = `<span class="seqmap_hint">Hover or tap a column: what each chain has there shows here.</span>`;
const WHO = { "=": "in both", a: "only in A", b: "only in B", n: "cannot be compared" };
const EDGE = { W: "Watson–Crick", H: "Hoogsteen", S: "sugar" };
const family_words = (f) => `${f[0] === "c" ? "cis" : "trans"} ${EDGE[f[1]]}/${EDGE[f[2]]}`;
const VERDICT_ICON = { same: "✓", same_fold: "≈", different_fold: "≠", no_pairs: "•" };

// ---- The table ---------------------------------------------------------------

function entry_rows(group, chosen) {
    let ref = group.ref;
    let entries = [...group.entries].sort((x, y) =>
        (y.this - x.this) || ((x.resolution ?? Infinity) - (y.resolution ?? Infinity)) || x.entry.localeCompare(y.entry));
    return entries.map((e, k) => {
        let where = e.this
            ? `<strong>${html(e.entry)}</strong><span class="ss_here">this page</span>`
            : `<a href="/structure/${encodeURIComponent(e.entry)}"><strong>${html(e.entry)}</strong></a>`;
        let res = resolution(e.resolution);
        return `<tbody class="ss_entry${k >= ROWS_SHOWN ? " ss_more" : ""}"${k >= ROWS_SHOWN ? " hidden" : ""}>` +
            e.chains.map((c, n) => {
                let vs = c.id === ref ? `<span class="ss_self">the chain compared against</span>`
                    : `<span class="ss_verdict ss_v_${c.summary.verdict}"><b aria-hidden="true">${VERDICT_ICON[c.summary.verdict]}</b>${html(c.summary.headline)}</span>`;
                let button = c.id === ref ? "" : `<button type="button" class="ss_go" data-a="${html(ref)}" data-b="${html(c.id)}"${chosen === c.id ? ' aria-pressed="true"' : ""}>Compare</button>`;
                let label = c.auth && c.auth !== c.label ? ` <span class="ss_label" title="label id">${html(c.label)}</span>` : "";
                return `<tr${c.id === ref ? ' class="ss_ref"' : ""}>
                    ${n ? "" : `<th scope="rowgroup" rowspan="${e.chains.length}" class="ss_id" data-th="Entry">${where}</th>
                    <td rowspan="${e.chains.length}" class="ss_title" data-th="What it is"><span title="${html(e.title ?? "")}">${html(e.title ?? "No title")}</span></td>
                    <td rowspan="${e.chains.length}" class="ss_res" data-th="Resolution">${res ? html(res) : `<span class="ss_dim">${html(method_short(e.method))}</span>`}</td>`}
                    <td class="ss_chain" data-th="Chain"><b>${html(c.auth ?? c.label)}</b>${label}${c.id === group.best ? ` <span class="ss_best" title="Best resolution, then the most confident backbone, then the most nucleotides modelled">best model</span>` : ""}
                        <span class="ss_dim">${c.seen === c.length ? `all ${c.length} nt modelled` : `${c.seen} of ${c.length} nt modelled`}${c.confal === null ? "" : ` · confal ${c.confal}`}</span></td>
                    <td class="ss_vs" data-th="Compared">${vs}</td>
                    <td class="ss_act">${button}</td>
                </tr>`;
            }).join("") + "</tbody>";
    }).join("");
}

function chain_options(group, pick, other) {
    return group.entries.map((e) => `<optgroup label="${html(e.entry)}${e.this ? " (this page)" : ""}">${
        e.chains.map((c) => `<option value="${html(c.id)}"${c.id === pick ? " selected" : ""}${c.id === other ? " disabled" : ""}>${
            html(c.name)}${c.id === group.best ? " · best model" : ""}</option>`).join("")}</optgroup>`).join("");
}

function draw_group(box, group, k, many) {
    let ref_name = group.entries.flatMap((e) => e.chains).find((c) => c.id === group.ref).name;
    let others = group.entries.filter((e) => !e.this).length;
    let wrap = document.createElement("div");
    wrap.className = "ss_group";
    wrap.innerHTML = `
        <p class="ss_lead">${many ? `<b>${html(group.kind)}, ${group.length} nt.</b> ` : ""}${
            others === 1 ? "1 other entry has" : `${others} other entries have`} ${group.kind === "RNA" ? "an" : "a"} ${html(group.kind)} chain with exactly the sequence of ${html(ref_name)}, ${group.length} nt.</p>
        <div class="ss_table_wrap">
            <table class="ss_table">
                <thead><tr><th scope="col">Entry</th><th scope="col">What it is</th><th scope="col">Resolution</th>
                    <th scope="col">Chain</th><th scope="col">Compared with ${html(ref_name)}</th><th scope="col"><span class="visually_hidden">Compare</span></th></tr></thead>
                ${entry_rows(group)}
            </table>
        </div>
        ${group.entries.length > ROWS_SHOWN ? `<button type="button" class="ss_show">Show all ${group.entries.length} entries</button>` : ""}
        <div class="ss_compare">
            <div class="ss_bar" role="group" aria-label="Compare two chains">
                <span class="ss_bar_title">Compare any two</span>
                <label class="ss_pick"><span class="ss_ab ss_ab_a">A</span><select data-side="a" aria-label="Chain A"></select></label>
                <button type="button" class="ss_swap" title="Swap A and B" aria-label="Swap A and B">⇄</button>
                <label class="ss_pick"><span class="ss_ab ss_ab_b">B</span><select data-side="b" aria-label="Chain B"></select></label>
                <button type="button" class="ss_run">Compare</button>
                <button type="button" class="ss_full" aria-expanded="false" hidden>⤢ Expand</button>
            </div>
            <div class="ss_panel" hidden></div>
        </div>`;
    box.append(wrap);

    let first_other = group.entries.flatMap((e) => e.chains).find((c) => c.id !== group.ref && !c.id.startsWith(group.ref.split(":")[0] + ":"))
        ?? group.entries.flatMap((e) => e.chains).find((c) => c.id !== group.ref);
    let st = { group, a: group.ref, b: first_other.id, open: false, data: null, sel: null, w: W, wrap,
               compare: wrap.querySelector(".ss_compare") };
    wrap.state = st;
    fill_selects(st);

    wrap.querySelector(".ss_show")?.addEventListener("click", (event) => {
        for (const t of wrap.querySelectorAll(".ss_more")) t.hidden = false;
        event.currentTarget.remove();
    });
    wrap.querySelector(".ss_table").addEventListener("click", (event) => {
        let b = event.target.closest(".ss_go");
        if (!b) return;
        st.a = b.dataset.a;
        st.b = b.dataset.b;
        fill_selects(st);
        run(st, true);
    });
    for (const s of st.compare.querySelectorAll(".ss_bar select")) {
        s.addEventListener("change", () => {
            st[s.dataset.side] = s.value;
            fill_selects(st);
            if (st.open) run(st);
        });
    }
    wrap.querySelector(".ss_swap").addEventListener("click", () => {
        [st.a, st.b] = [st.b, st.a];
        fill_selects(st);
        if (st.open) run(st);
    });
    wrap.querySelector(".ss_run").addEventListener("click", () => run(st));
    wrap.querySelector(".ss_full").addEventListener("click", (event) => open_full(st, event.currentTarget));
}

function fill_selects(st) {
    let [sa, sb] = st.compare.querySelectorAll(".ss_bar select");
    sa.innerHTML = chain_options(st.group, st.a, st.b);
    sb.innerHTML = chain_options(st.group, st.b, st.a);
    for (const b of st.wrap.querySelectorAll(".ss_go")) {
        b.setAttribute("aria-pressed", String(st.open && b.dataset.a === st.a && b.dataset.b === st.b));
    }
}

// ---- The comparison ------------------------------------------------------------

const cache = new Map();
async function fetch_compare(a, b) {
    let key = `${a}|${b}`;
    if (!cache.has(key)) {
        cache.set(key, fetch(`/api/same_sequence/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`)
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status)))));
    }
    try {
        return await cache.get(key);
    } catch (e) {
        cache.delete(key);
        throw e;
    }
}

async function run(st, scroll_to = false) {
    let panel = st.compare.querySelector(".ss_panel");
    st.open = true;
    st.sel = null;
    fill_selects(st);
    panel.hidden = false;
    st.compare.querySelector(".ss_full").hidden = false;
    panel.innerHTML = `<p class="seqmap_wait">Comparing…</p>`;
    if (scroll_to) st.compare.scrollIntoView({ behavior: "smooth", block: "start" });
    let asked = `${st.a}|${st.b}`;
    try {
        let data = await fetch_compare(st.a, st.b);
        if (`${st.a}|${st.b}` !== asked) return;
        st.data = data;
        draw_panel(st);
    } catch {
        panel.innerHTML = `<p class="seqmap_wait">These two chains could not be compared. Try again.</p>`;
    }
}

function draw_panel(st) {
    let d = st.data;
    let s = d.summary;
    let panel = st.compare.querySelector(".ss_panel");
    panel.innerHTML = `
        <div class="ss_head">
            <p class="ss_big ss_v_${s.verdict}"><b class="ss_icon" aria-hidden="true">${VERDICT_ICON[s.verdict]}</b>${html(s.headline)}</p>
            <p class="ss_facts"><span class="ss_ab ss_ab_a">A</span> ${html(d.a)} <span class="ss_ab ss_ab_b">B</span> ${html(d.b)}${
                s.facts.length ? ` <span class="ss_dot">·</span> ${s.facts.map(html).join(` <span class="ss_dot">·</span> `)}` : ""}</p>
        </div>
        <details class="ss_how">
            <summary>How to read the picture</summary>
            <ul>
                <li><b>Backbone:</b> A's steps stand up from the sequence, B's hang down. Colour is the shape, in DNATCO's NtC colours (5′ half, 3′ half), height is how sure (confal).</li>
                <li><b>Base pairs:</b> the pairs of both chains in dot-bracket rows, in the colours of the sequence map.
                    <span class="ss_swatch ss_only_a">( )</span> only in A, <span class="ss_swatch ss_only_b">( )</span> only in B,
                    <span class="ss_swatch ss_na">( )</span> cannot be compared, one of its nucleotides is not modelled in the other chain.</li>
                <li><b>Red numbers</b> mark each difference. The list under the picture says what each one is.</li>
                <li><b>Brackets and colours</b> read as in the sequence map: <a href="#sequence-map-guide" class="ss_guide_link">How to read the map</a>.</li>
            </ul>
        </details>
        <div class="ss_stage">
            <div class="ss_chart">
                <div class="seqmap_scroll ss_scroll" tabindex="0" aria-label="Comparison picture, scrolls sideways"></div>
                <div class="seqmap_info ss_info" aria-live="polite">${HINT}</div>
                <div class="seqmap_key ss_key"></div>
            </div>
            <div class="ss_list_box">
                ${d.diffs.length ? `<ol class="ss_list">${d.diffs.map((x) => `
                    <li><button type="button" data-n="${x.n}"><span class="ss_n">${x.n}</span><span class="ss_said">${html(x.text)}<span class="ss_detail">${html(x.detail)}</span></span></button></li>`).join("")}
                </ol>
                <p class="ss_note">Everything without a number is the same in both. Click a number to find it.</p>`
                : `<p class="ss_note">Every base pair, every confident backbone step and every nucleotide is the same in both.</p>`}
            </div>
        </div>`;
    draw_chart(st);
    panel.querySelector(".ss_list")?.addEventListener("click", (event) => {
        let b = event.target.closest("[data-n]");
        if (b) select(st, Number(b.dataset.n), true);
    });
}

// Where each difference's number sits: over its nucleotides, or between two
// for a backbone step. Numbers that would touch go on another line.
function marker_spots(d, w) {
    let x_of = (i) => i * w + w / 2;
    let spots = [];
    for (const x of d.diffs) {
        let xs = x.kind === "step" ? [(x.i + 1) * w] : x.kind === "chem" ? [x_of(x.i)] : [x_of(x.i), x_of(x.j)];
        for (const at of xs) spots.push({ n: x.n, x: at });
    }
    let lines = [];
    for (const s of spots.sort((p, q) => p.x - q.x || p.n - q.n)) {
        let r = String(s.n).length > 1 ? 8 : 7;
        let line = lines.findIndex((ends) => ends.every(([x, rr]) => Math.abs(x - s.x) >= r + rr + 1));
        if (line < 0) { line = lines.length; lines.push([]); }
        lines[line].push([s.x, r]);
        s.line = line;
        s.r = r;
    }
    return { spots, lines: Math.max(1, lines.length) };
}

function draw_chart(st) {
    let d = st.data;
    let w = st.w;
    let n = d.length;
    let x_of = (i) => i * w + w / 2;
    let { spots, lines } = marker_spots(d, w);
    let y_ruler = lines * MARK + 2;
    let y_a = y_ruler + RULER + BAR;            // A's bars stand on this line
    let y_seq = y_a + 2;
    let y_b = y_seq + SEQ + 2;                  // B's bars hang from this one
    let y_rows = y_b + BAR + GAP;
    let row_y = (k) => y_rows + k * ROW + ROW / 2;
    let height = y_rows + d.rows.length * ROW + 6;
    let width = Math.ceil(n * w) + 10;      // room for the last number's circle

    let scroll = st.compare.querySelector(".ss_scroll");
    scroll.innerHTML = `
        <svg class="seqmap_labels ss_labels" width="${LABEL_W}" height="${height}" aria-hidden="true"></svg>
        <svg class="seqmap_svg ss_svg" width="${width}" height="${height}" role="img"
             aria-label="${html(d.a)} against ${html(d.b)}: ${n} nucleotides, ${d.diffs.length} differences, numbered"></svg>`;
    let lab = scroll.querySelector(".ss_labels");
    let label = (y, text, cls = "", fill) => {
        let t = el("text", { x: 6, y, class: "seqmap_label " + cls, ...(fill ? { fill } : {}) }, lab);
        t.textContent = text;
    };
    if (d.diffs.length) label(MARK - 4, "differences", "ss_lab_mark");
    label(y_a - 8, "A backbone");
    label(y_seq + 14, "sequence");
    label(y_b + 16, "B backbone");
    d.rows.forEach((r, k) => label(row_y(k) + 4, r.overflow ? `${r.name} +` : r.name, r.overflow ? "seqmap_over" : "", ROW_COLOUR[r.name] ?? OTHER_ROW));

    let svg = scroll.querySelector(".ss_svg");
    st.hl = el("g", { class: "ss_hl" }, svg);

    // Ruler: A's author numbers every ten, where B numbers the same.
    let ruler = el("g", { class: "seqmap_ruler" }, svg);
    d.cols.forEach((c, i) => {
        let num = Number.parseInt(c[1], 10);
        if (c[1] !== c[2] || String(num) !== c[1] || num % 10 !== 0) return;
        el("line", { x1: x_of(i), x2: x_of(i), y1: y_ruler + 10, y2: y_ruler + 14 }, ruler);
        el("text", { x: x_of(i), y: y_ruler + 8, "text-anchor": "middle" }, ruler).textContent = num;
    });

    // Steps: A up, B down, each between its two nucleotides.
    let bw = 10 * Math.min(1, w / W);
    let h_of = (c) => 4 + (BAR - 6) * Math.max(0, Math.min(100, c ?? 0)) / 100;
    let ups = el("g", {}, svg);
    el("line", { x1: 0, x2: width, y1: y_a + 0.5, y2: y_a + 0.5, class: "seqmap_base" }, ups);
    for (const [i, cana, confal, ntc] of d.steps.a) bar(ups, (i + 1) * w, bw, h_of(confal), y_a, ntc);
    let downs = el("g", { transform: `translate(0 ${y_b}) scale(1 -1)` }, svg);
    el("line", { x1: 0, x2: width, y1: -0.5, y2: -0.5, class: "seqmap_base" }, downs);
    for (const [i, cana, confal, ntc] of d.steps.b) bar(downs, (i + 1) * w, bw, h_of(confal), 0, ntc);

    // Sequence: modified nucleotides in lower case; a nucleotide one chain
    // does not model is faint, with a mark under it on that side.
    let kinds = { seen: [], mod: [], gone: [] };
    d.cols.forEach((c, i) => kinds[!c[3] || !c[4] ? "gone" : c[0] !== c[0].toUpperCase() ? "mod" : "seen"].push(i));
    for (const [kind, cols] of Object.entries(kinds)) {
        if (!cols.length) continue;
        el("text", { x: cols.map(x_of).join(" "), y: y_seq + 14, class: `seqmap_seq seqmap_${kind}` }, svg)
            .textContent = cols.map((i) => d.cols[i][0]).join("");
    }
    d.cols.forEach((c, i) => {
        if (!c[3]) el("rect", { x: i * w + 2, y: y_seq, width: w - 4, height: 2, class: "ss_gap" }, svg);
        if (!c[4]) el("rect", { x: i * w + 2, y: y_seq + SEQ - 2, width: w - 4, height: 2, class: "ss_gap" }, svg);
    });

    // Pairs: a tint behind the two brackets of a pair only one chain has.
    d.rows.forEach((r, k) => {
        let y = row_y(k) + 4;
        let colour = ROW_COLOUR[r.name] ?? OTHER_ROW;
        let ends = new Map();
        for (const [i, j, who] of r.pairs) { ends.set(i, who); ends.set(j, who); }
        for (const [i, who] of ends) {
            if (ONLY[who]) el("rect", { x: i * w + 0.5, y: row_y(k) - ROW / 2 + 1, width: w - 1, height: ROW - 2, rx: 3, class: ONLY[who] }, svg);
        }
        let dots = [];
        [...r.text].forEach((ch, i) => { if (ch === ".") dots.push(i); });
        el("text", { x: dots.map(x_of).join(" "), y, class: "seqmap_dots" }, svg).textContent = ".".repeat(dots.length);
        for (const [mark, cols] of [["n", [...ends].filter(([, who]) => who === "n").map(([i]) => i)],
                                    ["", [...ends].filter(([, who]) => who !== "n").map(([i]) => i)]]) {
            if (!cols.length) continue;
            cols.sort((p, q) => p - q);
            el("text", { x: cols.map(x_of).join(" "), y, class: "seqmap_marks" + (mark ? " ss_na_text" : ""),
                         ...(mark ? {} : { fill: colour }) }, svg).textContent = cols.map((i) => r.text[i]).join("");
        }
    });

    // The numbers.
    let marks = el("g", { class: "ss_marks" }, svg);
    for (const s of spots) {
        let g = el("g", { class: "ss_mark", "data-n": s.n, transform: `translate(${s.x} ${s.line * MARK + MARK / 2 + 1})` }, marks);
        el("circle", { r: s.r }, g);
        el("text", { y: 3.5, "text-anchor": "middle" }, g).textContent = s.n;
        el("title", {}, g).textContent = d.diffs[s.n - 1].text;
    }
    marks.addEventListener("click", (event) => {
        let g = event.target.closest(".ss_mark");
        if (g) select(st, Number(g.dataset.n), false);
    });

    st.compare.querySelector(".ss_key").innerHTML = `
        <span class="seqmap_key_title">Backbone shape, in DNATCO's NtC colours</span>
        <span class="seqmap_group">${class_key([...d.steps.a, ...d.steps.b].map((s) => s[3]))}</span>
        ${KEY_NOTE}
        <span class="seqmap_key_title">Pairs</span>
        <span class="seqmap_group"><span><i style="background:${ROW_COLOUR.WC}"></i>WC: Watson–Crick</span><span><i style="background:${ROW_COLOUR.cWW}"></i>cWW: other cis W–W</span><span><i style="background:${OTHER_ROW}"></i>other families</span><span><i class="ss_only_a"></i>only in A</span><span><i class="ss_only_b"></i>only in B</span></span>`;
    hover_setup(st, svg, height);
    if (st.sel) select(st, st.sel, false, false);
}

// Hover or tap a column: a band over it, its partners ringed, and in words
// what A and B each have there: the nucleotide, its pairs, the steps on
// either side and the numbers of the differences at it.
function hover_setup(st, svg, height) {
    let d = st.data;
    let w = st.w;
    let n = d.length;
    let links = Array.from({ length: n }, () => []);
    for (const r of d.rows) {
        for (const [i, j, who] of r.pairs) {
            links[i].push({ to: j, family: r.family, wc: r.name === "WC", who });
            links[j].push({ to: i, family: r.family.length === 3 ? r.family[0] + r.family[2] + r.family[1] : r.family, wc: r.name === "WC", who });
        }
    }
    let steps = { a: new Map(d.steps.a.map((s) => [s[0], s])), b: new Map(d.steps.b.map((s) => [s[0], s])) };
    let at = Array.from({ length: n }, () => []);
    for (const x of d.diffs) for (const i of x.cols) if (!at[i].includes(x.n)) at[i].push(x.n);
    let name = (i) => `${d.cols[i][0].toUpperCase()}${d.cols[i][1] === d.cols[i][2] ? d.cols[i][1] : i + 1}`;
    let step_text = (s) => !s ? `<span class="ss_dim">no step</span>`
        : s[3] ? `${swatch(s[3])} <b>${html(s[3])}</b> ${html(s[1])} · confal ${s[2] === null ? "?" : Math.round(s[2])}`
        : `${swatch(null)} <span class="ss_dim">no NtC class</span>`;
    let hov = el("g", { class: "ss_hover" }, svg);
    svg.insertBefore(hov, svg.firstChild);
    let info = st.compare.querySelector(".ss_info");
    let pinned = null;
    st.show = (i) => show(i);

    function show(i) {
        hov.replaceChildren();
        if (i === null) { info.innerHTML = HINT; return; }
        el("rect", { x: i * w, y: 0, width: w, height, class: "seqmap_band" }, hov);
        for (const l of links[i]) el("rect", { x: l.to * w, y: 0, width: w, height, class: "seqmap_partner_band", opacity: 0.6 }, hov);
        let c = d.cols[i];
        let nums = c[1] === c[2] ? "" : ` <span class="ss_dim">A numbers it ${html(c[1])}, B ${html(c[2])}</span>`;
        let chem = c[5] === c[6] ? (c[5] !== c[0].toUpperCase() ? ` <span class="ss_dim">${html(c[5])} in both</span>` : "")
            : ` <span>A: <b>${html(c[5])}</b>, B: <b>${html(c[6])}</b></span>`;
        let gone = [!c[3] && "not modelled in A", !c[4] && "not modelled in B"].filter(Boolean);
        let pairs = links[i].length
            ? links[i].sort((p, q) => p.to - q.to).map((l) => `<span class="ss_hpair ss_w_${l.who === "=" ? "both" : l.who}">pairs with <b>${html(name(l.to))}</b>, ${html(l.wc ? "Watson–Crick" : l.family)} <span class="ss_dim">(${family_words(l.family)})</span>: ${WHO[l.who]}</span>`).join("")
            : `<span class="ss_dim">no base pair in either chain</span>`;
        let step = (k, label) => k < 0 || k >= n - 1 ? "" : `<span class="ss_hstep">${label} ${html(name(k))}→${html(name(k + 1))}: A ${step_text(steps.a.get(k))} · B ${step_text(steps.b.get(k))}</span>`;
        info.innerHTML = `
            <span class="seqmap_res"><b>${html(name(i))}</b>${nums}${chem}${gone.length ? ` <span class="ss_gone_text">${gone.join(", ")}</span>` : ""}
                ${at[i].length ? `<span class="ss_hdiff">${at[i].length === 1 ? "difference" : "differences"} ${at[i].map((k) => `<span class="ss_n">${k}</span>`).join("")}</span>` : `<span class="ss_dim">· nothing differs here</span>`}</span>
            <span class="ss_hpairs">${pairs}</span>
            ${step(i - 1, "step")}${step(i, "step")}`;
    }
    let col_of = (event) => {
        let r = svg.getBoundingClientRect();
        let i = Math.floor((event.clientX - r.left) / w);
        return i >= 0 && i < n ? i : null;
    };
    svg.addEventListener("pointermove", (event) => {
        if (event.pointerType === "mouse" && pinned === null) show(col_of(event));
    });
    svg.addEventListener("pointerleave", (event) => {
        if (event.pointerType === "mouse" && pinned === null) show(null);
    });
    // A click or tap pins the column, so the words stay while the reader
    // looks; another click on it lets go.
    svg.addEventListener("click", (event) => {
        if (event.target.closest(".ss_mark")) return;
        let i = col_of(event);
        pinned = pinned === i ? null : i;
        show(i);
    });
}

// One difference picked: a band over its columns in the picture, scrolled
// into view, and its line in the list lit.
function select(st, n, from_list, scroll = true) {
    let d = st.data;
    let x = d.diffs[n - 1];
    if (!x) return;
    st.sel = n;
    st.show?.(Math.min(...x.cols));
    let w = st.w;
    let svg = st.compare.querySelector(".ss_svg");
    st.hl.replaceChildren();
    let h = Number(svg.getAttribute("height"));
    for (const i of x.cols) el("rect", { x: i * w, y: 0, width: w, height: h, class: "ss_band" }, st.hl);
    for (const g of svg.querySelectorAll(".ss_mark")) g.classList.toggle("ss_on", Number(g.dataset.n) === n);
    for (const b of st.compare.querySelectorAll(".ss_list [data-n]")) {
        let on = Number(b.dataset.n) === n;
        b.classList.toggle("ss_on", on);
        if (on && !from_list && scroll) b.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    if (!scroll) return;
    let box = st.compare.querySelector(".ss_scroll");
    let mid = (Math.min(...x.cols) + Math.max(...x.cols) + 1) / 2 * w;
    let span = (Math.max(...x.cols) - Math.min(...x.cols) + 1) * w;
    let view = box.clientWidth - LABEL_W;
    let left = span > view ? Math.min(...x.cols) * w - 20 : mid - view / 2;
    box.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
    if (from_list && span > view) {
        // A long-range pair: its two ends cannot both be on screen, so the
        // second click on it goes to the other end.
        if (st.end === n) { box.scrollTo({ left: Math.max(0, Math.max(...x.cols) * w - view + 40), behavior: "smooth" }); st.end = null; }
        else st.end = n;
    }
}

// ---- Expanded -------------------------------------------------------------------

let dialog = null;
function open_full(st, button) {
    if (!dialog) {
        dialog = document.createElement("dialog");
        dialog.className = "arc_viewer ss_dialog";
        dialog.setAttribute("aria-label", "Compare two chains, expanded");
        dialog.innerHTML = `
            <div class="av_box">
                <div class="av_top">
                    <strong>Compare</strong>
                    <span class="av_title">Same sequence, two chains</span>
                </div>
                <div class="ss_dialog_body"></div>
            </div>`;
        document.body.append(dialog);
        dialog.addEventListener("close", () => {
            let back = dialog.state;
            back.wrap.append(back.compare);
            back.w = W;
            if (back.data) draw_chart(back);
        });
    }
    // Another comparison is open: put it back first, then open this one.
    if (dialog.open && dialog.state !== st) {
        dialog.addEventListener("close", () => open_full(st, button), { once: true });
        collapse();
        return;
    }
    if (!expand(dialog, st.wrap, button)) return;
    dialog.state = st;
    dialog.querySelector(".ss_dialog_body").append(st.compare);
    st.w = W_FULL;
    if (st.data) draw_chart(st);
}

// ---- Loading ----------------------------------------------------------------------

async function load(box) {
    try {
        let r = await fetch(`/api/entries/${encodeURIComponent(box.dataset.entry)}/same_sequence`);
        if (!r.ok) throw new Error(r.status);
        let { groups } = await r.json();
        box.replaceChildren();
        if (!groups.length) {
            box.innerHTML = `<p class="section_none">No other entry has a chain with exactly this sequence.</p>`;
            return;
        }
        groups.forEach((g, k) => draw_group(box, g, k, groups.length > 1));
    } catch {
        box.innerHTML = `<p class="seqmap_wait">The chains with this sequence could not be listed. Reload the page to try again.</p>`;
    }
}

for (const box of document.querySelectorAll(".sameseq")) {
    let seen = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        seen.disconnect();
        load(box);
    }, { rootMargin: "600px" });
    seen.observe(box);
}

// The comparison's guide points to the sequence map's: open it there.
document.addEventListener("click", (event) => {
    let link = event.target.closest(".ss_guide_link");
    let guide = link && document.getElementById("sequence-map-guide");
    if (!guide) return;
    event.preventDefault();
    guide.open = true;
    guide.scrollIntoView({ behavior: "smooth", block: "start" });
});
