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
    });
});



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
function card_html(entry) {
    let id = escape_html(entry.pdb_id);

    let rows = entry.card.map(function (row) {
        return `
            <div class="card_field">
                <div class="card_label">${escape_html(row.label)}</div>
                <div class="card_value">${escape_html(row.value)}</div>
            </div>
        `;
    }).join("");

    return `
        <article class="result_card" data-id="${id}">
            <h3 class="card_id">${id}</h3>
            ${rows}
            <div class="card_links">
                <a class="detail_link" target="_blank" rel="noopener"
                   href="https://www.rcsb.org/structure/${id}">View on rcsb.org</a>
                <a class="detail_link" href="/structure/${id}">Open full page</a>
            </div>
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

// Cards is the default: it is the view that shows the conformational data.
// "lines" is the only other accepted value, so a stale or hand-edited URL
// falls back rather than drawing nothing.
function view_from_url() {
    return new URLSearchParams(location.search).get("view") === "lines"
        ? "lines"
        : "cards";
}

let current_view = view_from_url();

// Draws one page into the results list, replacing whatever was there.
function render_results(list) {
    let container = document.querySelector(".results_list");
    let cards = current_view === "cards";

    container.classList.toggle("as_cards", cards);
    container.innerHTML = list.map(cards ? card_html : row_html).join("");
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
function update_empty_state(count) {
    let empty = document.querySelector(".empty_state");
    empty.classList.toggle("hidden", count > 0);
}

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
    update_empty_state(current_reply.total);
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
    if (panel_chosen) params.set("panel", panel_is_open() ? "open" : "closed");
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
    // A link inside a card is its own destination.
    if (e.target.closest("a")) return;

    let result = e.target.closest(".result_card, .result_row");
    if (!result) return;

    location.href = "/structure/" + encodeURIComponent(result.dataset.id);
});


// Opening or closing the filters. The choice goes in the URL so a reload keeps
// it, and so a link shared from here opens the way the sender left it.
let filters_toggle = document.querySelector(".filters_toggle");
let query_panel = document.querySelector(".query_panel");

// Only written to the URL once someone has actually used the toggle. Until
// then the server's own rule decides, and the address stays clean.
let panel_chosen = new URLSearchParams(location.search).has("panel");

function panel_is_open() {
    return !query_panel.classList.contains("hidden");
}

filters_toggle.addEventListener("click", function () {
    let open = !panel_is_open();

    query_panel.classList.toggle("hidden", !open);
    filters_toggle.setAttribute("aria-expanded", String(open));

    panel_chosen = true;
    update_url(read_filters(), current_page);
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
