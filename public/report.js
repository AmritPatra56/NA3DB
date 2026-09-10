// report.js - the report page.
// Reads the search out of the URL, counts the matching entries,
// and lets you pick which fields the CSV should contain.


// Every field that can go in a report, with the label shown next to its checkbox
// and the category it belongs to. The order here is the column order in the CSV.
let REPORT_FIELDS = [
    { key: "pdb_id",              label: "Entry ID",              group: "Demographics" },
    { key: "title",               label: "Title",                 group: "Demographics" },
    { key: "author",              label: "Author name",           group: "Demographics" },
    { key: "method",              label: "Experimental method",   group: "Demographics" },
    { key: "deposition_date",     label: "Deposition date",       group: "Demographics" },
    { key: "resolution",          label: "Resolution",            group: "Demographics" },

    { key: "confal_score",        label: "Overall confal score",  group: "3D Features" },
    { key: "assigned_ntc",        label: "Assigned NtC",          group: "3D Features" },

    { key: "entity_name",         label: "Entity name",           group: "Structure Components" },
    { key: "source_organism",     label: "Source organism",       group: "Structure Components" },
    { key: "nonstandard_residue", label: "Non-standard residue",  group: "Structure Components" },
    { key: "polymer_type",        label: "Polymer type",          group: "Structure Components" },
    { key: "monomer_flag",        label: "Monomer standard flag", group: "Structure Components" }
];

// Ticked when the page opens, so the report is usable without choosing anything.
let DEFAULT_FIELDS = ["pdb_id", "title", "method", "deposition_date"];

// The entries the report will cover. Filled once the search comes back.
let report_entries = [];


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
                    <input type="checkbox" value="${field.key}"${checked}>
                    <span>${field.label}</span>
                </label>
            `;
        }).join("");

        return `
            <div class="report_group">
                <h2 class="report_group_title">${name}</h2>
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

// Makes one value safe to put in a CSV cell.
// Anything containing a comma, a quote or a line break has to be wrapped in quotes,
// and a quote inside the text is written twice.
function csv_escape(value) {
    let text = value === null ? "" : String(value);

    if (text.includes(",") || text.includes('"') || text.includes("\n")) {
        return '"' + text.replaceAll('"', '""') + '"';
    }

    return text;
}

// Builds the whole file: a header row of labels, then one row per entry.
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

// The export button only works when there are entries and at least one field ticked.
function update_export_button() {
    let button = document.getElementById("export_button");

    button.disabled = report_entries.length === 0 || read_selected_fields().length === 0;
}

// One line saying which filters the report will use.
function describe_filters(filters) {
    let parts = [];

    Object.keys(filters).forEach(function (key) {
        let value = filters[key];
        let text = Array.isArray(value) ? value.join(", ") : value;

        if (text !== "") parts.push(key + ": " + text);
    });

    if (parts.length === 0) return "No filters. This report covers every entry.";
    return "Filters carried over from your search — " + parts.join("  ·  ");
}

// Runs the search from the URL and shows how many entries the report will cover.
async function load_report_entries() {
    let count = document.querySelector(".report_count");
    let summary = document.querySelector(".report_summary");
    let button = document.getElementById("export_button");

    summary.textContent = "Loading the matching entries...";
    button.disabled = true;

    try {
        let filters = params_to_filters(new URLSearchParams(location.search));
        let reply = await export_entries(filters);

        report_entries = reply.results;

        count.textContent = `Entries (${reply.total})`;
        summary.textContent = describe_filters(filters);

        if (reply.truncated) {
            summary.textContent += `  ·  Only the first ${reply.results.length} entries will be exported.`;
        }

        update_export_button();
    } catch (err) {
        summary.textContent = err.message;
        summary.classList.add("detail_error");
    }
}


document.getElementById("report_fields").innerHTML = fields_html();

// Ticking or unticking any box can change whether there is anything to export.
document.getElementById("report_fields").addEventListener("change", update_export_button);

document.getElementById("export_button").addEventListener("click", function () {
    let csv = build_csv(read_selected_fields(), report_entries);
    let today = new Date().toISOString().slice(0, 10);

    download_text(csv, `na3db_report_${today}.csv`);
});

sync_rail_links();
load_report_entries();
