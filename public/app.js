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

// One result row. Guards resolution, null for NMR, and unknown methods.
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

// Draws one page of rows into the results list, replacing whatever was there.
function render_results(list) {
    let container = document.querySelector(".results_list");
    container.innerHTML = list.map(row_html).join("");
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

    // The entry the panel is showing is not part of the new result set, so it
    // goes away rather than sitting there beside answers it has nothing to do
    // with.
    close_detail();

    let filters = read_filters();
    update_url(filters, page);

    try {
        current_reply = await search_entries(filters, page, sort_select.value);
        current_page = current_reply.page;
        show_page();
    } catch (err) {
        show_error(err.message);
    } finally {
        set_loading(false);
    }
}

// The rows into the panel body, plus a link out to the PDB page.
function render_detail(data) {
    let body = document.querySelector(".detail_body");

    // panel_rows, not rows: the panel is a summary and the full page below
    // carries the rest. Both are built by detail.js from one registry, so the
    // units and labels cannot disagree. Escaped anyway: innerHTML.
    let fields = data.panel_rows.map(function (row) {
        return `
            <div class="detail_field">
                <div class="detail_label">${escape_html(row.label)}</div>
                <div class="detail_value">${escape_html(row.value)}</div>
            </div>
        `;
    }).join("");

    let id = escape_html(data.pdb_id);

    body.innerHTML = fields + `
        <a class="detail_link" target="_blank" rel="noopener"
           href="https://www.rcsb.org/structure/${id}">View on rcsb.org</a>
        <a class="detail_link" href="/structure/${id}">Open full page</a>
    `;
}

// Which structure the panel is waiting for. A reply for anything else is
// stale and thrown away.
let detail_wanted = null;

// Replaces the panel body with a single line: a spinner while loading, or a message.
function show_detail_status(message, is_error) {
    let body = document.querySelector(".detail_body");
    let spinner = is_error ? "" : `<span class="spinner"></span>`;
    let css = is_error ? "detail_status detail_error" : "detail_status";

    body.innerHTML = `<div class="${css}">${spinner}<span class="status_text"></span></div>`;
    body.querySelector(".status_text").textContent = message;
}

// Opens the panel, shows a spinner, then fetches that structure's record and draws it.
async function open_detail(pdb_id) {
    let panel = document.querySelector(".detail_panel");

    panel.querySelector(".detail_id").textContent = pdb_id;
    panel.classList.remove("hidden");

    detail_wanted = pdb_id;
    show_detail_status("Loading " + pdb_id, false);

    try {
        let data = await fetch_entry_detail(pdb_id);

        if (detail_wanted !== pdb_id) return;
        render_detail(data);
    } catch (err) {
        if (detail_wanted !== pdb_id) return;
        show_detail_status(err.message, true);
    }
}

// Hides the panel and forgets what it was waiting for, so a late reply is ignored.
function close_detail() {
    detail_wanted = null;
    document.querySelector(".detail_panel").classList.add("hidden");
}

// A click anywhere on a row opens its panel. The listener is on the list,
// because the rows are rebuilt on every search.
let results_list = document.querySelector(".results_list");

results_list.addEventListener("click", function (e) {
    let row = e.target.closest(".result_row");
    if (!row) return;

    open_detail(row.dataset.id);
});

document.querySelector(".detail_close").addEventListener("click", close_detail);


// A different order is a different first page, so it starts again at page 1.
sort_select.addEventListener("change", function () {
    run_search();
});


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
    run_search(page_from_url());
});

// On load, take the search out of the URL, fill the form in, then run it.
params_to_form(new URLSearchParams(location.search));
sort_select.value = sort_from_url();
sync_rail_links();
run_search(page_from_url());
