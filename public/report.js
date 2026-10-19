// report.js - the report page. Reads the search from the URL, counts the
// matching entries, and picks which fields the CSV holds.


// The entry-scope columns, in registry order, which is the CSV column order.
let REPORT_FIELDS = REGISTRY.columns.filter(function (c) {
    return c.scope === "entry";
});

// Ticked when the page opens, so the report is usable without choosing anything.
let DEFAULT_FIELDS = ["pdb_id", "title", "method", "deposition_date"];

// The entries the report will cover. Filled once the search comes back.
let report_entries = [];

// How many rows the preview draws. All 1,489 would be 20,000-odd cells of DOM
// for a table nobody scrolls to the end of; the file itself is never capped.
const PREVIEW_ROWS = 200;


// Builds the checkbox list, one block per category.
function fields_html() {
    let groups = {};

    REPORT_FIELDS.forEach(function (field) {
        if (!groups[field.group]) groups[field.group] = [];
        groups[field.group].push(field);
    });

    return Object.keys(groups).map(function (name) {
        let boxes = groups[name].map(function (field) {
            let checked = DEFAULT_FIELDS.includes(field.key) ? " checked" : "";

            return `
                <label class="check_row">
                    <input type="checkbox" value="${escape_html(field.key)}"${checked}>
                    <span>${escape_html(field.label)}</span>
                </label>
            `;
        }).join("");

        return `
            <div class="report_group">
                <h2 class="report_group_title">${escape_html(name)}</h2>
                ${boxes}
            </div>
        `;
    }).join("");
}

// The field keys currently ticked, in the order they appear in REPORT_FIELDS.
function read_selected_fields() {
    let boxes = document.querySelectorAll("#report_fields input:checked");

    return Array.from(boxes).map(function (box) {
        return box.value;
    });
}

// One value as a CSV cell: a comma, quote or line break means the whole cell
// is quoted, and a quote inside it is written twice.
function csv_escape(value) {
    let text = value === null ? "" : String(value);

    if (text.includes(",") || text.includes('"') || text.includes("\n")) {
        return '"' + text.replaceAll('"', '""') + '"';
    }

    return text;
}

// The whole file: a header row of labels, then one row per entry.
function build_csv(keys, entries) {
    let chosen = REPORT_FIELDS.filter(function (field) {
        return keys.includes(field.key);
    });

    let header = chosen.map(function (field) {
        return csv_escape(field.label);
    }).join(",");

    let rows = entries.map(function (entry) {
        return chosen.map(function (field) {
            return csv_escape(entry[field.key]);
        }).join(",");
    });

    return [header].concat(rows).join("\n");
}

// Hands the browser a file to save. No server is involved.
function download_text(text, filename) {
    let blob = new Blob([text], { type: "text/csv;charset=utf-8" });
    let url = URL.createObjectURL(blob);
    let link = document.createElement("a");

    link.href = url;
    link.download = filename;
    link.click();

    URL.revokeObjectURL(url);
}

// The file as a table: the ticked fields in registry order, one row per entry.
// It reads the same REPORT_FIELDS and shows the same values build_csv writes,
// so ticking a box here and opening the download cannot disagree.
function render_preview() {
    let container = document.querySelector(".report_preview");
    let keys = read_selected_fields();

    if (report_entries.length === 0) {
        container.innerHTML = "";
        return;
    }

    if (keys.length === 0) {
        container.innerHTML = `<p class="preview_note">Tick a field to see the report.</p>`;
        return;
    }

    let chosen = REPORT_FIELDS.filter(function (field) {
        return keys.includes(field.key);
    });

    let head = chosen.map(function (field) {
        return `<th>${escape_html(field.label)}</th>`;
    }).join("");

    let shown = report_entries.slice(0, PREVIEW_ROWS);

    let body = shown.map(function (entry) {
        let cells = chosen.map(function (field) {
            let value = entry[field.key];

            return `<td>${escape_html(value === null ? "" : value)}</td>`;
        }).join("");

        return `<tr>${cells}</tr>`;
    }).join("");

    let note = report_entries.length > shown.length
        ? `<p class="preview_note">Showing the first ${shown.length} of
           ${report_entries.length.toLocaleString("en-GB")} rows. The download has all of them.</p>`
        : "";

    container.innerHTML = `
        <div class="preview_scroll">
            <table class="preview_table">
                <thead><tr>${head}</tr></thead>
                <tbody>${body}</tbody>
            </table>
        </div>
        ${note}
    `;
}

// The export button only works when there are entries and at least one field ticked.
function update_export_button() {
    let button = document.getElementById("export_button");

    button.disabled = report_entries.length === 0 || read_selected_fields().length === 0;
}

// Runs the search from the URL and shows how many entries the report will cover.
async function load_report_entries() {
    let count = document.querySelector(".report_count");
    let button = document.getElementById("export_button");

    count.textContent = "Loading...";
    button.disabled = true;

    try {
        let asked = new URLSearchParams(location.search);
        let filters = params_to_filters(asked);

        // params_to_filters reads the filter keys only, so the match mode has
        // to be carried across by hand.
        let reply = await export_entries(filters, asked.get("match") || "");

        report_entries = reply.results;

        count.textContent = `Entries (${reply.total})`;

        update_export_button();
        render_preview();
    } catch (err) {
        document.querySelector(".report_preview").innerHTML =
            `<p class="preview_note">${escape_html(err.message)}</p>`;
    }
}


document.getElementById("report_fields").innerHTML = fields_html();

// Ticking or unticking a box changes both the button and the table below it.
document.getElementById("report_fields").addEventListener("change", function () {
    update_export_button();
    render_preview();
});

document.getElementById("export_button").addEventListener("click", function () {
    let csv = build_csv(read_selected_fields(), report_entries);
    let today = new Date().toISOString().slice(0, 10);

    download_text(csv, `na3db_report_${today}.csv`);
});

// Opening or closing the field list. The choice goes in the URL beside the
// search, so a shared link opens the way the sender left it.
let fields_toggle = document.querySelector(".fields_toggle");
let fields_panel = document.querySelector(".query_panel");

fields_toggle.addEventListener("click", function () {
    let open = fields_panel.classList.contains("hidden");

    fields_panel.classList.toggle("hidden", !open);
    fields_toggle.setAttribute("aria-expanded", String(open));

    let params = new URLSearchParams(location.search);

    if (open) params.delete("fields");
    else params.set("fields", "closed");

    history.replaceState(null, "", location.pathname + "?" + params.toString());
    sync_rail_links();
});


sync_rail_links();
load_report_entries();
