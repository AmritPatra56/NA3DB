// The Views section of a structure page: its tiles are tabs, each showing
// one panel and hiding the others. The 1D panel is the sequence and its base
// pairs in layered dot-bracket notation, as the Sequence map's text file has
// them, from the same /api/entries/:id/sequence_map. Pointing at a column
// says under the text what that nucleotide pairs with; a click keeps it.
// The 1D view is linked to the Base pairs section's table of other pairs: a
// row there is shown here, and a partner named here finds its row there.

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

// Column i as the base-pair rows key their ends: strand token and position,
// "A 12" or "A:2_755 12". null for a strand separator.
export function column_key(map, i) {
    if (!map.cols[i]) return null;
    return `${map.shown[map.seq.slice(0, i).split("&").length - 1]} ${map.cols[i][4]}`;
}

// The order of a pair's two ends does not matter.
export const pair_key = (a, b) => [a, b].sort().join("|");

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
        head: `${residue(map, i)}${gone}`,
        items: partners,
        text: `${residue(map, i)}${gone} · ${partners.length ? "pairs with " + partners.map((p) => p.text).join(", ") : "not paired"}`
    };
}

// The rows of the Base pairs table, by the pair they list.
function table_rows() {
    let rows = new Map();
    for (const tr of document.querySelectorAll(".pair_table tr[data-a]")) {
        let key = pair_key(tr.dataset.a, tr.dataset.b);
        rows.set(key, [...(rows.get(key) ?? []), tr]);
    }
    return rows;
}

// One row of the table marked as the pair on show.
function select_row(tr) {
    for (const on of document.querySelectorAll(".pair_table tr.pair_on")) on.classList.remove("pair_on");
    tr?.classList.add("pair_on");
}

// Open the table at a row: its list unfolded, the row marked, in sight.
function find_row(tr) {
    tr.closest("details").open = true;
    select_row(tr);
    tr.scrollIntoView({ block: "center" });
    tr.querySelector(".pair_show")?.focus({ preventScroll: true });
}

const SIDE = "(min-width: 1360px)";   // the Views beside the page (style.css)

function draw(box, map) {
    // The row names stay put while the lines scroll under a long sequence,
    // so a row is never read without its name.
    let lines = lbn_lines(map);
    let frame = document.createElement("div");
    frame.className = "lbn_text";
    let names = document.createElement("pre");
    names.className = "lbn_names";
    names.setAttribute("aria-hidden", "true");
    names.textContent = lines.map((l) => l.slice(0, LABEL)).join("\n");
    let pre = document.createElement("pre");
    pre.className = "lbn_lines";
    pre.tabIndex = 0;
    pre.setAttribute("aria-label", `Sequence and base pairs of strands ${map.names.join(", ")} in layered dot-bracket notation`);
    let text = document.createTextNode(lines.map((l) => l.slice(LABEL)).join("\n"));
    pre.append(text);
    frame.append(names, pre);
    let info = document.createElement("p");
    info.className = "lbn_info";
    info.setAttribute("aria-live", "polite");
    info.textContent = HINT;
    let note = document.createElement("p");
    note.className = "lbn_note";
    let file = `/api/entries/${encodeURIComponent(map.pdb_id ?? box.dataset.entry)}/sequence_map?strands=${encodeURIComponent(map.shown.join(","))}&format=text`;
    note.innerHTML = `${map.rows.length ? "" : "No base pairs recorded. "}<a class="download download_small" href="${file}" download>Download as text</a>`;
    box.replaceChildren(frame, info, note);

    // Where the columns are, from the width of one character: the text is
    // monospaced, so columns are evenly spaced after the labels.
    let ruler = () => {
        // The seq line, the second: the first holds only the strand names.
        let from = text.data.indexOf("\n") + 1;
        let range = document.createRange();
        range.setStart(text, from);
        range.setEnd(text, from + map.seq.length);
        let line = range.getBoundingClientRect();
        let width = line.width / map.seq.length;
        return { line, width, left: line.left - pre.getBoundingClientRect().left - pre.clientLeft + pre.scrollLeft };
    };
    let col_at = (event) => {
        let { line, width } = ruler();
        let i = Math.floor((event.clientX - line.left) / width);
        return i >= 0 && i < map.seq.length && map.cols[i] ? i : null;
    };

    // The words under the text; a partner whose pair the table lists is a
    // link to its row, and a pair shown from the table can be gone back to.
    let rows = table_rows();
    let back = null;
    let say = (i, words) => {
        if (!words) { info.textContent = HINT; return; }
        info.replaceChildren(`${words.head} · `);
        if (!words.items.length) info.append("not paired");
        else info.append("pairs with ");
        words.items.forEach((p, n) => {
            if (n) info.append(", ");
            let row = rows.get(pair_key(column_key(map, i), column_key(map, p.col)))?.[0];
            if (!row) { info.append(p.text); return; }
            let a = document.createElement("a");
            a.href = "#bp-all";
            a.className = "lbn_find";
            a.title = "Find this pair in the Base pairs table";
            a.textContent = p.text;
            // After the page's own handler has opened a folded section.
            a.addEventListener("click", (e) => { e.preventDefault(); setTimeout(() => find_row(row), 0); });
            info.append(a);
        });
        if (back && i === pinned && !matchMedia(SIDE).matches) {
            let a = document.createElement("a");
            a.href = "#bp-all";
            a.className = "lbn_find";
            a.textContent = "Back to the table";
            let row = back;
            a.addEventListener("click", (e) => { e.preventDefault(); setTimeout(() => find_row(row), 0); });
            info.append(" · ", a);
        }
    };

    // The column on show: the one under the pointer, or else the one a
    // click or a table row chose, with its partners marked behind the text.
    let pinned = null;
    let shown;
    let mark = (i) => {
        if (i === shown) return;
        shown = i;
        pre.querySelectorAll(".lbn_band").forEach((b) => b.remove());
        let words = i === null ? null : column_words(map, i);
        say(i, words);
        if (!words) return;
        let { width, left } = ruler();
        [i, ...words.partners].forEach((c, n) => {
            let band = document.createElement("span");
            band.className = n ? "lbn_band lbn_partner" : "lbn_band";
            band.style.left = `${left + c * width}px`;
            band.style.width = `${width}px`;
            pre.append(band);
        });
    };
    pre.addEventListener("pointermove", (e) => mark(col_at(e) ?? pinned));
    pre.addEventListener("pointerleave", (e) => { if (e.pointerType === "mouse") mark(pinned); });
    pre.addEventListener("click", (e) => {
        let i = col_at(e);
        pinned = i === pinned ? null : i;
        back = null;
        shown = undefined;
        mark(pinned);
    });

    // Show a pair from the table: its first end kept, the text scrolled so
    // both ends are in sight when they fit, else the first.
    box.map = map;
    box.pin = (a, b, row) => {
        let at = new Map(map.cols.map((c, i) => [column_key(map, i), i]));
        let [i, j] = [at.get(a), at.get(b)];
        if (i === undefined || j === undefined) return false;
        pinned = i;
        back = row;
        shown = undefined;
        mark(i);
        let { width, left } = ruler();
        let [x, y] = [left + Math.min(i, j) * width, left + (Math.max(i, j) + 1) * width];
        pre.scrollLeft = y - x < pre.clientWidth - 2 * width ? (x + y - pre.clientWidth) / 2 : x - pre.clientWidth / 2;
        return true;
    };
}

// The 1D lines for the strands asked for, or the server's choice.
async function load(box, strands = []) {
    try {
        let ask = strands.length ? `?strands=${encodeURIComponent(strands.join(","))}` : "";
        let res = await fetch(`/api/entries/${encodeURIComponent(box.dataset.entry)}/sequence_map${ask}`);
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
    const box = document.querySelector(".lbn");
    let ready = box ? load(box) : null;

    // A row of the Base pairs table, selected: the 1D view opens on its pair,
    // with the pair's strands if the view had others. Above the page, the
    // page goes up to the view.
    document.addEventListener("click", async (e) => {
        let link = e.target.closest(".pair_table .pair_show");
        if (!link || !box) return;
        e.preventDefault();
        let tr = link.closest("tr");
        select_row(tr);
        show("1d");
        await ready;
        let { a, b } = tr.dataset;
        if (!box.pin?.(a, b, tr)) {
            ready = load(box, [...new Set([a, b].map((k) => k.split(" ")[0]))]);
            await ready;
            if (!box.pin?.(a, b, tr)) box.querySelector(".lbn_info")?.replaceChildren("This pair is not in the 1D view.");
        }
        // Beside the page, a short window scrolls the Views inside: their
        // words come into sight there, the page stays where it is.
        if (matchMedia(SIDE).matches) box.querySelector(".lbn_info")?.scrollIntoView({ block: "nearest" });
        else document.getElementById("views").scrollIntoView({ block: "start" });
    });
}
