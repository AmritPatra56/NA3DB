// The Views section of a structure page: its tiles are tabs, each showing
// one panel and hiding the others. The 1D panel is the sequence and its base
// pairs in layered dot-bracket notation, as the Sequence map's text file has
// them, from the same /api/entries/:id/sequence_map. Pointing at a column
// says under the text what that nucleotide pairs with.

const LABEL = 7;   // "seq", "WC", "tWH"... padded so the columns line up

// The 1D lines: strand names over the first nucleotide of each strand, the
// sequence, then one line per bracket row. A name longer than its strand is
// cut so it never sits over the next one.
export function lbn_lines(map) {
    let names = "";
    let at = 0;
    map.seq.split("&").forEach((strand, n) => {
        names = names.padEnd(at) + map.names[n].slice(0, strand.length);
        at += strand.length + 1;
    });
    let line = (label, text) => label.padEnd(LABEL) + text;
    return [line("", names), line("seq", map.seq), ...map.rows.map((r) => line(r.name, r.text))];
}

export const HINT = "Point at or tap a nucleotide to see what it pairs with.";

// A column's nucleotide as the reader names it: strand, code, number
// ("B:G12"), the strand left out when there is only one.
function residue(map, i) {
    let strand = map.seq.slice(0, i).split("&").length - 1;
    let [, num, , code] = map.cols[i];
    return `${map.names.length > 1 ? map.names[strand] + ":" : ""}${code}${num ?? ""}`;
}

// What the 1D view says under the text for column i: the nucleotide and each
// partner with its row, read from this base (a tHW pair is tWH from the
// other end). null for a strand separator.
export function column_words(map, i) {
    if (!map.cols[i]) return null;
    let partners = [];
    for (const r of map.rows) {
        for (const [a, b] of r.pairs) {
            if (a !== i && b !== i) continue;
            let family = r.name === "WC" || a === i ? r.name : r.name[0] + r.name[2] + r.name[1];
            partners.push({ col: a === i ? b : a, text: `${residue(map, a === i ? b : a)} (${family})` });
        }
    }
    let gone = map.cols[i][2] ? "" : ", not in the model";
    return {
        partners: partners.map((p) => p.col),
        text: `${residue(map, i)}${gone} · ${partners.length ? "pairs with " + partners.map((p) => p.text).join(", ") : "not paired"}`
    };
}

function draw(box, map) {
    let pre = document.createElement("pre");
    pre.className = "lbn_text";
    pre.tabIndex = 0;
    pre.setAttribute("aria-label", `Sequence and base pairs of strands ${map.names.join(", ")} in layered dot-bracket notation`);
    let text = document.createTextNode(lbn_lines(map).join("\n"));
    pre.append(text);
    let info = document.createElement("p");
    info.className = "lbn_info";
    info.setAttribute("aria-live", "polite");
    info.textContent = HINT;
    let note = document.createElement("p");
    note.className = "lbn_note";
    let file = `/api/entries/${encodeURIComponent(map.pdb_id ?? box.dataset.entry)}/sequence_map?strands=${encodeURIComponent(map.shown.join(","))}&format=text`;
    note.innerHTML = `${map.rows.length ? "" : "No base pairs recorded. "}<a href="${file}" download>Download as text</a>`;
    box.replaceChildren(pre, info, note);

    // The column under the pointer, from the width of one character: the
    // text is monospaced, so columns are evenly spaced after the labels.
    let col_at = (event) => {
        // The seq line, the second: the first holds only the strand names.
        let from = text.data.indexOf("\n") + 1;
        let range = document.createRange();
        range.setStart(text, from);
        range.setEnd(text, from + LABEL + map.seq.length);
        let line = range.getBoundingClientRect();
        let width = line.width / (LABEL + map.seq.length);
        let i = Math.floor((event.clientX - line.left) / width) - LABEL;
        return { i: i >= 0 && i < map.seq.length ? i : null, width, left: line.left - pre.getBoundingClientRect().left - pre.clientLeft + pre.scrollLeft };
    };
    let shown = null;
    let show = (event) => {
        let { i, width, left } = col_at(event);
        let words = i === null ? null : column_words(map, i);
        let key = words ? i : null;
        if (key === shown) return;
        shown = key;
        pre.querySelectorAll(".lbn_band").forEach((b) => b.remove());
        info.textContent = words ? words.text : HINT;
        if (!words) return;
        [i, ...words.partners].forEach((c, n) => {
            let band = document.createElement("span");
            band.className = n ? "lbn_band lbn_partner" : "lbn_band";
            band.style.left = `${left + (LABEL + c) * width}px`;
            band.style.width = `${width}px`;
            pre.append(band);
        });
    };
    pre.addEventListener("pointermove", show);
    pre.addEventListener("pointerdown", show);
    pre.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") show({ clientX: -Infinity }); });
}

async function load(box) {
    try {
        let res = await fetch(`/api/entries/${encodeURIComponent(box.dataset.entry)}/sequence_map`);
        if (res.status === 404) {
            box.innerHTML = '<p class="section_none">No nucleic-acid chain to show.</p>';
            return;
        }
        if (!res.ok) throw new Error(res.status);
        draw(box, await res.json());
    } catch {
        box.innerHTML = '<p class="section_none">The base pairs could not be loaded. Reload the page to try again.</p>';
    }
}

// The address with ?view= set to the open view; the first view is the
// default, so it leaves no ?view=. Other parameters and the #section stay.
export function view_url(href, view, first) {
    let url = new URL(href);
    if (view === first) url.searchParams.delete("view");
    else url.searchParams.set("view", view);
    return url.pathname + url.search + url.hash;
}

// The tile a key moves to, as the ARIA tabs pattern has it: arrows wrap,
// Home and End go to the ends. null for any other key.
export function next_tile(key, at, count) {
    switch (key) {
        case "ArrowRight": return (at + 1) % count;
        case "ArrowLeft": return (at - 1 + count) % count;
        case "Home": return 0;
        case "End": return count - 1;
        default: return null;
    }
}

if (typeof document !== "undefined") {
    const tiles = [...document.querySelectorAll(".view_tile")];
    const show = (view) => {
        for (const tile of tiles) {
            let on = tile.dataset.view === view;
            tile.setAttribute("aria-selected", String(on));
            tile.tabIndex = on ? 0 : -1;
            document.getElementById(tile.getAttribute("aria-controls")).hidden = !on;
        }
        history.replaceState(history.state, "", view_url(location.href, view, tiles[0].dataset.view));
    };
    tiles.forEach((tile, at) => {
        tile.addEventListener("click", () => show(tile.dataset.view));
        tile.addEventListener("keydown", (e) => {
            let n = next_tile(e.key, at, tiles.length);
            if (n === null) return;
            e.preventDefault();
            tiles[n].focus();
            show(tiles[n].dataset.view);
        });
    });
    for (const box of document.querySelectorAll(".lbn")) load(box);
}
