// app.js - the screen. Reads the form, draws the results, shows the loading
// and error states. It never decides which entries match.


// Clicking a category header folds that section of the form open or shut.
let cat_heads = document.querySelectorAll(".category_header");

cat_heads.forEach(function (header) {
    header.addEventListener("click", function () {
        this.parentElement.classList.toggle("collapsed");
    });
});


// ,----------------------------------------------------------->


// One listener per pill group, not per pill.
// Clicking "Any" clears the rest; clicking anything else clears "Any".
let pill_fields = document.querySelectorAll(".pill_field");

pill_fields.forEach(function (field) {
    field.addEventListener("click", function (e) {
        if (!e.target.classList.contains("pill")) return;

        let value = e.target.dataset.value;
        let any_pill = this.querySelector('[data-value="any"]');

        if (value === "any") {
            this.querySelectorAll(".pill").forEach(function (pill) {
                pill.classList.remove("selected");
            });
            e.target.classList.add("selected");
        } else {
            if (any_pill) any_pill.classList.remove("selected");
            e.target.classList.toggle("selected");
        }
        sync_revealed(false, this.dataset.name);
    });
});

// "N more" in a long pill group: the rest of its options, and back.
function unfold_pills(field, open) {
    let more = field.querySelector(".pill_more");
    if (!more) return;
    field.querySelectorAll(".pill_extra").forEach((pill) => { pill.hidden = !open; });
    more.setAttribute("aria-expanded", String(open));
    more.textContent = open ? more.dataset.less : more.dataset.more;
}

document.querySelectorAll(".pill_more").forEach(function (more) {
    more.addEventListener("click", function () {
        let field = more.closest(".pill_field");
        let open = more.getAttribute("aria-expanded") !== "true";
        // A picked option is never hidden: folding keeps it in view.
        unfold_pills(field, open || Boolean(field.querySelector(".pill_extra.selected")));
    });
});

// A field shown only while a pill it depends on is on: the resolution range,
// once X-ray, EM or another method that measures one is picked. Hidden, its
// boxes are emptied, so a filter nobody can see never narrows the search.
// keep_filled: on loading a link, a range already in it stays in view.
// only: the pill group that changed; other revealed fields are left alone.
function sync_revealed(keep_filled, only = null) {
    document.querySelectorAll(".revealed_field").forEach(function (field) {
        if (only && field.dataset.revealedBy !== only) return;
        let wanted = field.dataset.values.split("|");
        let picked = read_pills(field.dataset.revealedBy).some((v) => wanted.includes(v));
        let inputs = field.querySelectorAll("input");
        let filled = Array.from(inputs).some((i) => i.value.trim() !== "");
        let show = picked || (keep_filled && filled);

        field.hidden = !show;
        if (!show) inputs.forEach((i) => { i.value = ""; });
    });
}



// ,----------------------------------------------------------->



// Reads one input box and returns its text with the surrounding spaces removed.
function read_text(id) {
    return document.getElementById(id).value.trim();
}

// Reads one pill group and returns the values the user chose, dropping "any".
function read_pills(name) {
    let field = document.querySelector('[data-name="' + name + '"]');
    let selected = field.querySelectorAll(".pill.selected");

    return Array.from(selected)
        .map(function (pill) {
            return pill.dataset.value;
        })
        .filter(function (value) {
            return value !== "any";
        });
}

// The whole form as one filters object. The only screen-to-data function.
function read_filters() {
    let filters = {};

    TEXT_FILTERS.forEach(function (key) {
        filters[key] = read_text(key);
    });

    PILL_FILTERS.forEach(function (key) {
        filters[key] = read_pills(key);
    });

    return filters;
}

// Selects exactly these pills in one group and clears every other pill in it.
function select_pills(name, values) {
    let field = document.querySelector('[data-name="' + name + '"]');

    field.querySelectorAll(".pill").forEach(function (pill) {
        pill.classList.toggle("selected", values.includes(pill.dataset.value));
    });
}

// The form set to what the query string says. A field the URL omits is reset.
function params_to_form(params) {
    let shape = read_filters();

    Object.keys(shape).forEach(function (key) {
        let value = params.get(key);

        if (Array.isArray(shape[key])) {
            select_pills(key, value === null ? ["any"] : value.split(","));
        } else {
            document.getElementById(key).value = value === null ? "" : value;
        }
    });

    document.querySelectorAll(".pill_field").forEach(function (field) {
        if (field.querySelector(".pill_extra.selected")) unfold_pills(field, true);
    });
    sync_revealed(true);
}

// Pressing Search: stop the browser reloading the page, then run the search.
let query_form = document.getElementById("query_form");

query_form.addEventListener("submit", function (e) {
    e.preventDefault();
    run_search();
});


// <----------------------------------------------------------->


// The long PDB method names mapped to the short labels shown on each row.
let method_labels = {
    "X-RAY DIFFRACTION": "X-ray",
    "ELECTRON MICROSCOPY": "EM",
    "SOLID-STATE NMR": "Solid NMR",
    "SOLUTION NMR": "NMR",
    "NEUTRON DIFFRACTION": "Neutron",
    "ELECTRON CRYSTALLOGRAPHY": "Electron cryst.",
    "POWDER DIFFRACTION": "Powder",
    "FIBER DIFFRACTION": "Fiber",
    "SOLUTION SCATTERING": "Scattering",
    "EPR": "EPR",
    "FLUORESCENCE TRANSFER": "FRET",
    "INFRARED SPECTROSCOPY": "IR",
    "THEORETICAL MODEL": "Model"
};

// One result as a card: the label and value rows detail.js built on the
// server, so a card and the structure page cannot describe the same entry
// differently. Clicking anywhere on it opens that page.
// Fields the card's head already says, so they are not repeated below it.
const CARD_HEAD = new Set(["title", "method", "deposition_date", "resolution", "polymer_type"]);
const fmt = (v) => Number(v).toLocaleString("en-GB");

// One result as a card: a blank picture slot on the left, kept for a snapshot
// of the 3D structure; on the right the id and title, a row of the numbers a
// reader compares first, then a row of every other field. The whole card opens
// the structure page; the id is also a real link, for a new tab or a keyboard.
function card_html(entry) {
    let id = escape_html(entry.pdb_id);
    let url_id = encodeURIComponent(entry.pdb_id);
    let a = entry.arcs;

    let method = method_labels[entry.method] || entry.method;
    let resolution = entry.resolution == null ? null : Number(entry.resolution).toFixed(2) + " Å";
    let facts = [
        ["Method", [method, resolution].filter(Boolean).join(" · ")],
        ["Deposited", entry.deposition_date ? String(entry.deposition_date).slice(0, 4) : null],
        ["Nucleotides", a ? fmt(a.nucleotides) : null],
        ["Base pairs", a ? `${fmt(a.pairs)} <small>(${fmt(a.wc)} WC)</small>` : "None annotated"],
        ["Modified", a ? fmt(a.modified) : null],
        ["Strands", a ? fmt(a.strands) : null]
    ].filter(([, value]) => value);

    // The phone card's short forms: first author, paper, organisms on one
    // line, and the modified residues as chips; the full fields wait behind More.
    let field = (key) => entry.card.find((row) => row.key === key)?.value ?? "";
    let authors = field("all_authors").split(/,\s*(?=[^,]+,)/);
    let first = authors[0] ? authors[0].replace(/,\s*/, " ").replace(/\.$/, "") + (authors.length > 1 ? " et al." : "") : "";
    let brief = [first, field("published"), field("source_organism").replace(/;\s*/g, ", ")].filter(Boolean);
    let residues = field("nonstandard_residue").split(/,\s*/).filter(Boolean);
    let ligands = field("ligands").split(/,\s*/).filter(Boolean).length;
    let chips = residues.map((r) => `<span class="card_chip">${escape_html(r)}</span>`).join("")
        + (ligands ? `<span class="card_chip card_chip_dim">+${ligands} ligand${ligands === 1 ? "" : "s"}</span>` : "");
    let year = entry.deposition_date ? String(entry.deposition_date).slice(0, 4) : "";
    let when = [[method, resolution].filter(Boolean).join(" "), year].filter(Boolean).join(" · ");
    let nums = a ? [["nt", a.nucleotides], ["pairs", a.pairs], ["WC", a.wc], ["modified", a.modified]]
        .map(([k, v]) => `<div><b>${fmt(v)}</b><span>${k}</span></div>`).join("") : "";

    let rows = entry.card.filter((row) => !CARD_HEAD.has(row.key) || row.searched).map(function (row) {
        return `
            <div class="card_field${row.searched ? " searched" : ""}" data-key="${escape_html(row.key)}">
                <div class="card_label">${escape_html(row.label)}</div>
                <div class="card_value">${escape_html(row.value)}</div>
            </div>
        `;
    }).join("");

    return `
        <article class="result_card" data-id="${id}">
            <div class="card_picture" aria-hidden="true"></div>
            <div class="card_head">
                <h3 class="card_id"><a href="/structure/${url_id}">${id}</a>${entry.polymer_type ? ` <span class="card_badge">${escape_html(entry.polymer_type)}</span>` : ""}</h3>
                <p class="card_title">${escape_html(entry.title)}</p>
                <p class="card_when">${escape_html(when)}</p>
            </div>
            <dl class="card_facts">${facts.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("")}</dl>
            <div class="card_brief">
                ${nums ? `<div class="card_nums">${nums}</div>` : ""}
                ${brief.length ? `<p class="card_cite">${escape_html(brief.join(" · "))}</p>` : ""}
                ${chips ? `<p class="card_chips">${chips}</p>` : ""}
                <div class="card_actions">
                    <button type="button" class="card_more" aria-expanded="false">More ▾</button>
                </div>
            </div>
            <div class="card_rest">${rows}</div>
        </article>
    `;
}

// One result as a line. Guards resolution, null for NMR, and unknown methods.
function row_html(entry) {
    let resolution = entry.resolution === null ? "" : entry.resolution.toFixed(2) + " Å";
    let method = method_labels[entry.method] || entry.method;

    // Escaped even though the data is ours: this is where a title would
    // otherwise become markup.
    return `
        <div class="result_row" data-id="${escape_html(entry.pdb_id)}">
            <div class="result_meta">
                <div class="result_id">${escape_html(entry.pdb_id)}</div>
                <div class="result_date">${escape_html(entry.deposition_date)}</div>
                <div class="result_res">${escape_html(resolution)}</div>
            </div>
            <div class="result_main">
                <div class="result_title">${escape_html(entry.title)}</div>
                <div class="result_method">${escape_html(method)}</div>
            </div>
        </div>
    `;
}

// One result as a tile in the Grid view: a blank picture slot, kept for a
// snapshot of the 3D structure, then its id, title and one line of facts. The
// whole tile is one link to the structure page.
function tile_html(entry) {
    let id = escape_html(entry.pdb_id);
    let url_id = encodeURIComponent(entry.pdb_id);
    let facts = [method_labels[entry.method] || entry.method,
                 entry.resolution === null ? null : entry.resolution.toFixed(2) + " Å",
                 entry.deposition_date ? String(entry.deposition_date).slice(0, 4) : null]
        .filter(Boolean).map(escape_html).join(" · ");

    return `
        <a class="grid_tile" data-id="${id}" href="/structure/${url_id}">
            <span class="grid_tile_picture" aria-hidden="true"></span>
            <span class="grid_tile_text">
                <b>${id}</b>
                <span class="grid_tile_title">${escape_html(entry.title)}</span>
                <span class="grid_tile_facts">${facts}</span>
            </span>
        </a>
    `;
}

// Cards is the default: the picture and the facts side by side.
// "grid" and "lines" are the only other accepted values, so a stale or
// hand-edited URL falls back rather than drawing nothing. "arcs" is the
// Grid's old name, kept for links made before the rename.
const VIEWS = { cards: card_html, lines: row_html, grid: tile_html };

function view_from_url() {
    let view = new URLSearchParams(location.search).get("view");
    if (view === "arcs") return "grid";
    return Object.hasOwn(VIEWS, view) ? view : "cards";
}

let current_view = view_from_url();

// Draws one page into the results list, replacing whatever was there.
function render_results(list) {
    let container = document.querySelector(".results_list");
    container.classList.toggle("as_cards", current_view === "cards");
    container.classList.toggle("as_grid", current_view === "grid");
    container.innerHTML = list.map(VIEWS[current_view]).join("");
}

// What the results area is showing: the last reply from the server.
let current_page = 1;
let current_reply = { results: [], total: 0, page: 1, pages: 0, page_size: 10 };

// Writes the "Entries (120)" count and the "1 - 10 of 120" range above the list.
function update_header(total, start, shown) {
    let title = document.querySelector(".results_area_header h1");
    let range = document.querySelector(".results_range");

    title.textContent = `Entries (${total})`;

    if (total === 0) {
        range.textContent = "";
    } else {
        range.textContent = `${start + 1} – ${start + shown} of ${total}`;
    }
}

// Shows "No entries found" when the count is zero, and nothing else does.
// Under it, any searches the server found close to what was typed, each a
// real link with the count it gives. Never applied without a click.
function update_empty_state(count, suggestions = []) {
    let empty = document.querySelector(".empty_state");
    empty.classList.toggle("hidden", count > 0);

    let line = empty.querySelector(".did_you_mean");
    line.replaceChildren();
    line.classList.toggle("hidden", count > 0 || suggestions.length === 0);
    if (count > 0 || suggestions.length === 0) return;

    line.append("Did you mean ");
    suggestions.forEach(function (s, i) {
        if (i > 0) line.append(i === suggestions.length - 1 ? " or " : ", ");
        let params = new URLSearchParams(location.search);
        params.set(s.field, s.value);
        params.delete("page");
        let link = document.createElement("a");
        link.href = location.pathname + "?" + params.toString().replaceAll("+", "%20");
        link.dataset.field = s.field;
        link.dataset.value = s.value;
        link.textContent = s.value;
        line.append(link, ` (${s.total.toLocaleString("en-GB")})`);
    });
    line.append("?");
}

// A suggestion searches in place, like typing it and pressing Search.
document.querySelector(".did_you_mean").addEventListener("click", function (e) {
    let link = e.target.closest("a[data-field]");
    if (!link || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    document.getElementById(link.dataset.field).value = link.dataset.value;
    run_search(1);
});

// Switches spinner, list, error box and Search button between waiting and not.
function set_loading(is_loading) {
    let loading = document.querySelector(".loading_state");
    let list = document.querySelector(".results_list");
    let empty = document.querySelector(".empty_state");
    let error = document.querySelector(".error_state");
    let button = document.querySelector(".search");

    loading.classList.toggle("hidden", !is_loading);
    list.classList.toggle("hidden", is_loading);
    button.disabled = is_loading;

    if (is_loading) {
        empty.classList.add("hidden");
        error.classList.add("hidden");
    }
}

// Puts a message in the red box and clears the stale rows, page buttons and count.
function show_error(message) {
    let error = document.querySelector(".error_state");

    error.querySelector(".error_text").textContent = message;
    error.classList.remove("hidden");

    document.querySelector(".results_list").innerHTML = "";
    document.querySelector(".pagination").innerHTML = "";
    update_header(0, 0, 0);
}

// Which page numbers to show, with "..." for the gaps. No HTML.
function page_numbers(page, total_pages) {
    let pages = [];

    if (total_pages <= 7) {
        for (let i = 1; i <= total_pages; i++) {
            pages.push(i);
        }
        return pages;
    }

    pages.push(1);

    if (page > 3) pages.push("...");

    let from = Math.max(2, page - 1);
    let to = Math.min(total_pages - 1, page + 1);

    for (let i = from; i <= to; i++) {
        pages.push(i);
    }

    if (page < total_pages - 2) pages.push("...");

    pages.push(total_pages);

    return pages;
}

// Draws the arrows and page buttons. Hides the whole bar when there is only one page.
function render_pagination(total_pages) {
    let bar = document.querySelector(".pagination");

    if (total_pages <= 1) {
        bar.innerHTML = "";
        bar.classList.add("hidden");
        return;
    }

    bar.classList.remove("hidden");

    let html = `<button type="button" class="page_arrow" data-page="${current_page - 1}" ${current_page === 1 ? "disabled" : ""}>←</button>`;

    page_numbers(current_page, total_pages).forEach(function (p) {
        if (p === "...") {
            html += `<span class="page_dots">…</span>`;
        } else {
            html += `<button type="button" class="page_num ${p === current_page ? "active" : ""}" data-page="${p}">${p}</button>`;
        }
    });

    html += `<button type="button" class="page_arrow" data-page="${current_page + 1}" ${current_page === total_pages ? "disabled" : ""}>→</button>`;

    bar.innerHTML = html;
}

// Redraws the results area from the last reply. The server did the slicing.
function show_page() {
    let start = (current_reply.page - 1) * current_reply.page_size;

    render_results(current_reply.results);
    update_header(current_reply.total, start, current_reply.results.length);
    update_empty_state(current_reply.total, current_reply.suggestions);
    render_pagination(current_reply.pages);
}


// The sort control, and the order the URL asks for. An unknown key is left to
// the server, which falls back to its default rather than failing.
let sort_select = document.getElementById("sort_by");

function sort_from_url() {
    return new URLSearchParams(location.search).get("sort") || REGISTRY.default_sort;
}

// Whether the box means "find these" or "find everything but these". It only
// changes what the box does, so it goes in the URL beside the search itself.
let match_switch = document.querySelector(".match_switch");

function match_from_url() {
    let asked = new URLSearchParams(location.search).get("match");

    return REGISTRY.match_modes.some((m) => m.key === asked)
        ? asked
        : REGISTRY.default_match;
}

let current_match = match_from_url();

function paint_match_switch() {
    match_switch.querySelectorAll("button").forEach(function (button) {
        button.setAttribute("aria-pressed",
                            String(button.dataset.match === current_match));
    });
}

match_switch.addEventListener("click", function (e) {
    let button = e.target.closest("button[data-match]");
    if (!button || button.dataset.match === current_match) return;

    current_match = button.dataset.match;
    paint_match_switch();

    // A different answer, so back to the first page of it.
    run_search();
});


// How many results a page holds. The server validates it too; this only keeps
// the control showing what is actually in force.
let per_page_select = document.getElementById("per_page");

function per_page_from_url() {
    let asked = Math.floor(Number(new URLSearchParams(location.search).get("per_page")));

    if (!Number.isFinite(asked) || asked < 1) return String(REGISTRY.default_page_size);

    return String(Math.min(asked, REGISTRY.max_page_size));
}

// The page the URL asks for, or 1 when it says nothing usable.
function page_from_url() {
    let n = Number(new URLSearchParams(location.search).get("page"));

    return Number.isInteger(n) && n > 0 ? n : 1;
}

// The current search in the address bar, with a history entry so Back works,
// unless the URL already is that search. The page goes in too, so reloading
// or sharing the link lands on the same page rather than back at the first.
function update_url(filters, page) {
    let params = filters_to_params(filters);

    if (page > 1) params.set("page", page);
    if (sort_select.value !== REGISTRY.default_sort) params.set("sort", sort_select.value);
    if (!panel_is_open()) params.set("panel", "closed");
    if (current_view !== "cards") params.set("view", current_view);

    if (Number(per_page_select.value) !== REGISTRY.default_page_size) {
        params.set("per_page", per_page_select.value);
    }

    if (current_match !== REGISTRY.default_match) params.set("match", current_match);

    let query = params.toString();
    let url = query === "" ? location.pathname : location.pathname + "?" + query;

    if (url === location.pathname + location.search) return;

    history.pushState(null, "", url);
    sync_rail_links();
}

// The whole search: spinner on, ask the server, draw the answer or the error,
// spinner off either way.
async function run_search(page = 1) {
    set_loading(true);

    let filters = read_filters();
    update_url(filters, page);

    try {
        current_reply = await search_entries(filters, page, sort_select.value,
                                             per_page_select.value, current_match);
        current_page = current_reply.page;
        show_page();
        count_wanted = "";
        paint_count(current_reply.total);
        // The results header has the number now.
        box_readout.textContent = "";
        paint_chips(filters);
    } catch (err) {
        show_error(err.message);
    } finally {
        set_loading(false);
    }
}

// A click anywhere on a result opens that structure's page. The listener is on
// the list, because the results are rebuilt on every search.
let results_list = document.querySelector(".results_list");

results_list.addEventListener("click", function (e) {
    // A link inside a card is its own destination; More only unfolds the card.
    let more = e.target.closest(".card_more");
    if (more) {
        let open = more.closest(".result_card").classList.toggle("show_more");
        more.setAttribute("aria-expanded", open);
        more.textContent = open ? "Less ▴" : "More ▾";
        return;
    }
    if (e.target.closest("a")) return;

    let result = e.target.closest(".result_card, .result_row");
    if (!result) return;

    location.href = "/structure/" + encodeURIComponent(result.dataset.id);
});


// Folding or unfolding the filters with the drawer handle. A fold goes in the
// URL as panel=closed, so a reload or a shared link keeps it; open is the
// default and needs nothing.
let query_panel = document.querySelector(".query_panel");
let panel_handle = document.querySelector(".panel_handle");

function panel_is_open() {
    return !query_panel.classList.contains("folded");
}

function set_panel(open) {
    query_panel.classList.toggle("folded", !open);
    query_panel.inert = !open;
    panel_handle.setAttribute("aria-expanded", String(open));
    let label = open ? "Hide the filters" : "Show the filters";
    panel_handle.setAttribute("aria-label", label);
    panel_handle.title = label;
    update_url(read_filters(), current_page);
}

query_panel.inert = !panel_is_open();
panel_handle.addEventListener("click", () => set_panel(!panel_is_open()));


// The panel's Search button says how many entries it would show, kept up to
// date as filters are picked, so nobody applies filters that leave nothing.
const COUNT_SETTLE_MS = 250;
let search_button = query_form.querySelector(".search");
let count_timer = null;
let count_wanted = "";

function paint_count(total) {
    search_button.textContent = total === 0 ? "No results"
        : total === 1 ? "Show 1 result"
        : `Show ${total.toLocaleString("en-GB")} results`;
}

async function refresh_count() {
    let params = filters_to_params(read_filters());
    if (current_match) params.set("match", current_match);

    let asked = params.toString();
    count_wanted = asked;

    try {
        let res = await fetch("/api/count?" + asked);
        if (!res.ok) throw new Error();
        let data = await res.json();
        if (count_wanted !== asked) return;
        paint_count(data.total);
        paint_box_count(data);
    } catch {
        // The button still searches; only the number is lost.
        if (count_wanted === asked) {
            search_button.textContent = "Search";
            box_readout.textContent = "";
        }
    }
}

function count_soon() {
    clearTimeout(count_timer);
    count_timer = setTimeout(refresh_count, COUNT_SETTLE_MS);
}

// "click" for the pills, "input" for the boxes. A pill's own listener runs
// first, so the selection has changed by the time this reads it.
query_form.addEventListener("input", count_soon);


// The count under the top box, as on the front page. The box belongs to the
// form through form="query_form" but sits outside it, so its typing never
// reaches the form's listener above.
const BOX_MIN_LENGTH = 2;
let top_box = document.querySelector(".top_search_box input");
let box_readout = document.querySelector(".top_search_count");

function box_show_none(suggestions) {
    box_readout.textContent = "no structures match";
    if (suggestions.length === 0) return;

    box_readout.append(". Did you mean ");
    suggestions.forEach(function (s, i) {
        if (i > 0) box_readout.append(i === suggestions.length - 1 ? " or " : ", ");
        let link = document.createElement("button");
        link.type = "button";
        link.className = "link_button";
        link.dataset.field = s.field;
        link.dataset.value = s.value;
        link.textContent = s.value;
        box_readout.append(link, ` (${s.total.toLocaleString("en-GB")})`);
    });
    box_readout.append("?");
}

// Called with every count the panel asks for, so the line under the box
// follows the filters too: picking X-ray changes it as it changes the button.
function paint_box_count(data) {
    if (top_box.value.trim().length < BOX_MIN_LENGTH) {
        box_readout.textContent = "";
        return;
    }
    if (data.total === 0)      box_show_none(data.suggestions || []);
    else if (data.total === 1) box_readout.textContent = "1 structure";
    else                       box_readout.textContent = data.total.toLocaleString("en-GB") + " structures";
}

top_box.addEventListener("input", function () {
    if (top_box.value.trim().length < BOX_MIN_LENGTH) box_readout.textContent = "";
    count_soon();
});

// A suggestion keeps every other filter: it changes the one box and searches.
box_readout.addEventListener("click", function (e) {
    let pick = e.target.closest("button[data-value]");
    if (!pick) return;
    let input = document.getElementById(pick.dataset.field);
    if (input) input.value = pick.dataset.value;
    box_readout.textContent = "";
    run_search(1);
});
query_form.addEventListener("click", function (e) {
    if (e.target.closest(".pill")) count_soon();
});


// Switching layout redraws what the browser already has. No request: the reply
// behind the current page carries every field both views need.
let view_switch = document.querySelector(".view_switch");

function paint_view_switch() {
    view_switch.querySelectorAll("button").forEach(function (button) {
        button.setAttribute("aria-pressed",
                            String(button.dataset.view === current_view));
    });
}

view_switch.addEventListener("click", function (e) {
    let button = e.target.closest("button[data-view]");
    if (!button || button.dataset.view === current_view) return;

    current_view = button.dataset.view;
    paint_view_switch();

    if (current_reply) show_page();
    update_url(read_filters(), current_page);
});


// A different order is a different first page, so it starts again at page 1.
sort_select.addEventListener("change", function () {
    run_search();
});

// So is a different page size: page 4 of twenty is not page 4 of a hundred.
//
// "change" and not "input": typing 100 passes through 1 and 10 on the way, and
// a search for each would be three requests and a flash of one result.
per_page_select.addEventListener("change", function () {
    per_page_select.value = per_page_clamped();
    run_search();
});

// What the box should read after the server has had its say, so a typed 5000
// settles back to 200 rather than lying about what is on screen.
function per_page_clamped() {
    let asked = Math.floor(Number(per_page_select.value));

    if (!Number.isFinite(asked) || asked < 1) return String(REGISTRY.default_page_size);

    return String(Math.min(asked, REGISTRY.max_page_size));
}


// Clicking a page button asks the server for that page.
let pagination = document.querySelector(".pagination");

pagination.addEventListener("click", function (e) {
    if (!e.target.dataset.page) return;

    run_search(Number(e.target.dataset.page));
});

// Back and forward: the URL has already changed, so refill the form and search.
window.addEventListener("popstate", function () {
    params_to_form(new URLSearchParams(location.search));
    sort_select.value = sort_from_url();
    per_page_select.value = per_page_from_url();
    current_match = match_from_url();
    paint_match_switch();
    current_view = view_from_url();
    paint_view_switch();
    run_search(page_from_url());
});

// On load, take the search out of the URL, fill the form in, then run it.
params_to_form(new URLSearchParams(location.search));
sort_select.value = sort_from_url();
per_page_select.value = per_page_from_url();
paint_match_switch();
paint_view_switch();
sync_rail_links();
run_search(page_from_url());

// A box with suggestions: a short list under it, narrowed as you type.
// Codes that start with the text come first, then names that contain it.
const SUGGESTIONS_SHOWN = 8;

document.querySelectorAll("input[data-suggest]").forEach((input) => {
    let list = document.getElementById(input.getAttribute("aria-controls"));
    let all = null;
    let shown = [];
    let active = -1;

    // One request however many events ask before it answers.
    let loading = null;
    function load() {
        loading ??= fetch("/api/" + input.dataset.suggest)
            .then((response) => (response.ok ? response.json() : []))
            .then((rows) => { all = rows; }, () => { all = []; });
        return loading;
    }

    function close() {
        list.hidden = true;
        input.setAttribute("aria-expanded", "false");
        active = -1;
    }

    function draw() {
        // Best match first, as UniProt's taxonomy suggester does: "human"
        // puts Homo sapiens (common name human) above Human adenovirus 2.
        // Within a rank, the server's order (most entries first) stands.
        let text = input.value.trim().toLowerCase();
        function rank(s) {
            let code = s.code.toLowerCase();
            let names = (s.name ?? "").toLowerCase().split(/,\s*/).filter(Boolean);
            if (code === text || names.includes(text)) return 0;
            if (code.startsWith(text)) return 1;
            if (text.length < 3) return null;
            let words = `${code} ${names.join(" ")}`.split(/[^a-z0-9']+/);
            if (words.some((w) => w.startsWith(text))) return 2;
            // From three letters, anywhere: musculus finds Mus musculus.
            return `${code} ${s.name ?? ""}`.toLowerCase().includes(text) ? 3 : null;
        }
        shown = all.map((s, i) => [rank(s), i, s])
                   .filter(([r]) => r !== null)
                   .sort((a, b) => a[0] - b[0] || a[1] - b[1])
                   .slice(0, SUGGESTIONS_SHOWN)
                   .map(([, , s]) => s);

        list.replaceChildren(...shown.map((s, i) => {
            let li = document.createElement("li");
            li.role = "option";
            li.id = `${list.id}_${i}`;
            li.setAttribute("aria-selected", String(i === active));
            let code = document.createElement("b");
            code.textContent = s.code;
            let name = document.createElement("span");
            name.textContent = s.name ?? "";
            // A modified nucleotide's parent base, before its long name.
            if (s.parent) name.prepend(Object.assign(document.createElement("em"), { textContent: `from ${s.parent} · ` }));
            let count = document.createElement("small");
            count.textContent = s.entries;
            li.append(code, name, count);
            // mousedown, not click: click comes after the box's blur closes the list.
            li.addEventListener("mousedown", (event) => { event.preventDefault(); pick(i); });
            return li;
        }));
        list.hidden = shown.length === 0;
        input.setAttribute("aria-expanded", String(!list.hidden));
        if (active >= 0) input.setAttribute("aria-activedescendant", `${list.id}_${active}`);
        else input.removeAttribute("aria-activedescendant");
    }

    function pick(i) {
        input.value = shown[i].code;
        close();
    }

    input.addEventListener("focus", async () => { await load(); if (document.activeElement === input) draw(); });
    input.addEventListener("input", async () => { await load(); active = -1; draw(); });
    input.addEventListener("blur", close);
    input.addEventListener("keydown", (event) => {
        if (list.hidden) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            let step = event.key === "ArrowDown" ? 1 : -1;
            active = (active + step + shown.length) % shown.length;
            draw();
            list.children[active]?.scrollIntoView({ block: "nearest" });
        } else if (event.key === "Enter" && active >= 0) {
            event.preventDefault();
            pick(active);
        } else if (event.key === "Escape") {
            close();
        }
    });
});


// The filters in use as chips above the results, so a phone shows what
// narrowed the list without opening the sheet. Built from the registry, like
// the panel: nothing here names a filter. The search box is left out; it is
// on screen already.
let chips_bar = document.querySelector(".active_filters");
let FILTER_BY_KEY = Object.fromEntries(REGISTRY.filters.map((f) => [f.key, f]));
let RANGE_TOP = new Set(REGISTRY.filters.map((f) => f.pair_with).filter(Boolean));

function chip_text(f, value) {
    if (f.kind === "pills") {
        let option = f.options.find((o) => o.value === value);
        return `${f.label}: ${option ? option.label : value}`;
    }
    if (f.kind === "range") return `${f.label} ${RANGE_TOP.has(f.key) ? "≤" : "≥"} ${value}`;
    return `${f.label}: ${value}`;
}

function paint_chips(filters) {
    let chips = [];

    Object.entries(filters).forEach(function ([key, value]) {
        let f = FILTER_BY_KEY[key];
        if (!f || f.prominent) return;

        let values = Array.isArray(value) ? value : (value === "" ? [] : [value]);
        values.forEach((v) => chips.push({ key, value: v, text: chip_text(f, v) }));
    });

    chips_bar.innerHTML = chips.map((c) => `
        <button type="button" class="filter_chip" data-key="${escape_html(c.key)}"
                data-value="${escape_html(c.value)}" aria-label="Remove ${escape_html(c.text)}">
            ${escape_html(c.text)}<span aria-hidden="true">&times;</span>
        </button>`).join("");

    document.querySelector(".handle_count").textContent = chips.length || "";
}

chips_bar.addEventListener("click", function (e) {
    let chip = e.target.closest(".filter_chip");
    if (!chip) return;

    let { key, value } = chip.dataset;

    if (PILL_FILTERS.includes(key)) {
        let left = read_pills(key).filter((v) => v !== value);
        select_pills(key, left.length ? left : ["any"]);
        sync_revealed(false, key);
    } else {
        document.getElementById(key).value = "";
    }

    run_search();
});
