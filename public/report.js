// report.js - the report page. Reads the search from the URL, counts the
// matching entries, and picks which fields the CSV holds.
//
// The report has tables, one tab each: Structures, one row per entry, and
// Molecules and Ligands, one row per part of an entry. Fields belong to one
// table, so a file never mixes a structure's paper with its sequences.


let TABLES = REGISTRY.report_tables;
let ID_FIELD = REGISTRY.report_key;

// The open table, from the tab the server marked as selected.
let table = TABLES.find(function (t) {
    return t.key === document.querySelector('.report_tab[aria-selected="true"]').dataset.table;
});

// The ticked fields of each table, kept while switching tabs.
let ticked = {};
TABLES.forEach(function (t) {
    ticked[t.key] = [ID_FIELD].concat(t.defaults.filter(function (k) { return k !== ID_FIELD; }));
});

// Each table's rows and how many, once fetched. Structures loads with the
// page, another table the first time its tab opens.
let rows = {};
let totals = {};

// The latest request for each table: toggling an option twice quickly
// sends two, and only the second may fill the table.
let asking = {};

// The open table's rows; none while they load.
function current() {
    return rows[table.key] || [];
}

// Where each table's rows come from. A table with an option (Include
// proteins, Include water) passes it on when it is ticked in the address.
const SOURCES = {
    structures: "/api/export",
    molecules: "/api/export/molecules",
    ligands: "/api/export/ligands"
};

// How many rows the preview draws. All 1,489 would be 20,000-odd cells of DOM
// for a table nobody scrolls to the end of; the file itself is never capped.
const PREVIEW_ROWS = 200;


// The checkbox list of the open table, one block per group. Entry ID is
// ticked for good: it is what joins the tables back together.
function fields_html() {
    if (table.fields.length === 0) {
        return `<p class="report_summary">${escape_html(table.row)}. This table is being built;
                Structures is ready now.</p>`;
    }

    let groups = [];

    table.fields.forEach(function (field) {
        let last = groups[groups.length - 1];

        if (!last || last.name !== field.group) groups.push(last = { name: field.group, fields: [] });
        last.fields.push(field);
    });

    let note = `<p class="report_row_note">${escape_html(table.row)}</p>`;

    if (table.option) {
        let on = new URLSearchParams(location.search).get(table.option.key) === "1";

        note += `
            <div class="report_group report_option">
                <label class="check_row">
                    <input type="checkbox" id="table_option"${on ? " checked" : ""}>
                    <span>${escape_html(table.option.label)}</span>
                </label>
            </div>
        `;
    }

    return note + groups.map(function (group) {
        let boxes = group.fields.map(function (field) {
            let locked = field.key === ID_FIELD;
            let checked = ticked[table.key].includes(field.key) ? " checked" : "";

            return `
                <label class="check_row">
                    <input type="checkbox" class="field_box" value="${escape_html(field.key)}"${checked}${locked ? " disabled" : ""}>
                    <span>${escape_html(field.label)}</span>
                    ${locked ? `<span class="check_always">always</span>` : ""}
                </label>
            `;
        }).join("");

        return `
            <div class="report_group">
                <h2 class="report_group_title">${escape_html(group.name)}</h2>
                ${boxes}
            </div>
        `;
    }).join("");
}

// The ticked fields of the open table, in table order.
function chosen_fields() {
    return table.fields.filter(function (field) {
        return ticked[table.key].includes(field.key);
    });
}

// One value as a CSV cell: a comma, quote or line break means the whole cell
// is quoted, and a quote inside it is written twice.
function csv_escape(value) {
    let text = value === null || value === undefined ? "" : String(value);

    if (text.includes(",") || text.includes('"') || text.includes("\n") || text.includes("\r")) {
        return '"' + text.replaceAll('"', '""') + '"';
    }

    return text;
}

// The whole file: a header row of labels, then one row per entry. Starts with
// a byte-order mark, without which Excel reads UTF-8 as Latin-1 and an author
// like Ferré-D'Amaré comes out garbled.
function build_csv(fields, entries) {
    let header = fields.map(function (field) {
        return csv_escape(field.label);
    }).join(",");

    let rows = entries.map(function (entry) {
        return fields.map(function (field) {
            return csv_escape(entry[field.key]);
        }).join(",");
    });

    return "\uFEFF" + [header].concat(rows).join("\r\n") + "\r\n";
}

// Hands the browser a file to save. No server is involved.
function download_blob(blob, filename) {
    let url = URL.createObjectURL(blob);
    let link = document.createElement("a");

    link.href = url;
    link.download = filename;
    link.click();

    URL.revokeObjectURL(url);
}

// The file as a table: the ticked fields, one row per entry. It shows the same
// fields and values build_csv writes, so the screen and the download agree.
function render_preview() {
    let container = document.querySelector(".report_preview");
    let fields = chosen_fields();

    if (table.fields.length === 0 || current().length === 0) {
        container.innerHTML = "";
        return;
    }

    let head = fields.map(function (field) {
        return `<th>${escape_html(field.label)}</th>`;
    }).join("");

    let shown = current().slice(0, PREVIEW_ROWS);

    let body = shown.map(function (entry) {
        let cells = fields.map(function (field) {
            let value = entry[field.key];

            return `<td>${escape_html(value === null || value === undefined ? "" : value)}</td>`;
        }).join("");

        return `<tr>${cells}</tr>`;
    }).join("");

    let note = current().length > shown.length
        ? `<p class="preview_note">Showing the first ${shown.length} of
           ${current().length.toLocaleString("en-GB")} rows. The download has all of them.</p>`
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

// The heading says which table and how many rows.
function update_count() {
    let count = document.querySelector(".report_count");

    let total = totals[table.key];

    count.textContent = total === undefined || table.fields.length === 0
        ? table.name
        : `${table.name} (${total.toLocaleString("en-GB")})`;
}

// Download works once there are rows for a table that is built.
function update_export_button() {
    document.getElementById("export_button").disabled =
        current().length === 0 || table.fields.length === 0;
}

function refresh() {
    update_count();
    update_export_button();
    render_preview();
}

// The search in the URL as the export routes take it. filters_to_params keeps
// the filter keys only, so the match mode, the sort (the file comes in the
// order the results list showed) and a table's option are carried by hand.
function search_params(source) {
    let asked = new URLSearchParams(location.search);
    let params = filters_to_params(params_to_filters(asked));

    if (asked.get("match")) params.set("match", asked.get("match"));
    if (asked.get("sort")) params.set("sort", asked.get("sort"));
    if (source && source.option && asked.get(source.option.key) === "1") params.set(source.option.key, "1");
    return params;
}

// Fetches a table's rows for the search in the URL. Only the open table is
// drawn when they arrive: a slow answer for a tab already left waits unseen.
async function load_table(key) {
    let source = TABLES.find(function (t) { return t.key === key; });

    let ticket = asking[key] = {};

    rows[key] = undefined;
    totals[key] = undefined;

    if (key === table.key) {
        document.querySelector(".report_count").textContent = "Loading…";
        document.querySelector(".report_preview").innerHTML = "";
        update_export_button();
    }

    try {
        let reply = await get_json(SOURCES[key] + "?" + search_params(source).toString());

        if (asking[key] !== ticket) return;
        rows[key] = reply.results;
        totals[key] = reply.total;
        if (key === table.key) refresh();
    } catch (err) {
        if (asking[key] !== ticket || key !== table.key) return;
        update_count();
        document.querySelector(".report_preview").innerHTML =
            `<p class="preview_note">${escape_html(err.message)}</p>`;
    }
}

// Opens a table: its fields, its count, and ?table= in the address so a
// shared link opens on it. Structures, the first, is the default and unsaid.
function show_table(key) {
    table = TABLES.find(function (t) { return t.key === key; });

    document.querySelectorAll(".report_tab").forEach(function (tab) {
        let on = tab.dataset.table === key;

        tab.setAttribute("aria-selected", String(on));
        tab.tabIndex = on ? 0 : -1;
    });

    let panel = document.getElementById("report_fields");
    panel.setAttribute("aria-labelledby", "table-" + key);
    panel.innerHTML = fields_html();

    let params = new URLSearchParams(location.search);
    if (key === TABLES[0].key) params.delete("table");
    else params.set("table", key);
    history.replaceState(null, "", location.pathname + "?" + params.toString());
    sync_rail_links();

    if (SOURCES[key] && !(key in rows)) load_table(key);
    else refresh();
}


document.getElementById("report_fields").innerHTML = fields_html();

// Ticking a field changes the columns below; ticking the table's option
// (Include proteins) changes its rows, so they are fetched again, and goes
// in the address so a shared link keeps it.
document.getElementById("report_fields").addEventListener("change", function (e) {
    if (e.target.id === "table_option") {
        let params = new URLSearchParams(location.search);

        if (e.target.checked) params.set(table.option.key, "1");
        else params.delete(table.option.key);
        history.replaceState(null, "", location.pathname + "?" + params.toString());
        sync_rail_links();

        load_table(table.key);
        return;
    }

    let boxes = document.querySelectorAll("#report_fields input.field_box:checked");

    ticked[table.key] = Array.from(boxes).map(function (box) { return box.value; });
    render_preview();
});

// The tabs, as the ARIA tabs pattern has them: arrows wrap, Home and End go
// to the ends.
let tabs = Array.from(document.querySelectorAll(".report_tab"));

tabs.forEach(function (tab, at) {
    tab.addEventListener("click", function () { show_table(tab.dataset.table); });

    tab.addEventListener("keydown", function (e) {
        let n = { ArrowRight: (at + 1) % tabs.length, ArrowLeft: (at - 1 + tabs.length) % tabs.length,
                  Home: 0, End: tabs.length - 1 }[e.key];

        if (n === undefined) return;
        e.preventDefault();
        tabs[n].focus();
        show_table(tabs[n].dataset.table);
    });
});

document.getElementById("export_button").addEventListener("click", function () {
    let csv = build_csv(chosen_fields(), current());
    let today = new Date().toISOString().slice(0, 10);

    download_blob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `na3db_${table.key}_${today}.csv`);
});

// --- Download all (ZIP) ----------------------------------------------------
// Every table with every field, whatever is ticked, plus the sequences as
// FASTA, the base pairs as dot-bracket and a README. Include proteins and
// Include water are honoured: they decide which rows there are.

// PDB ids Excel turns into numbers: 3E42 becomes 3 x 10^42 and stays so.
const EXCEL_NUMBER = /^\d+E\d+$/i;

// FASTA in the header layout of the structure page and RCSB:
// >1OB5_2|Chains B, D, F|TRANSFER-RNA, PHE|Saccharomyces cerevisiae (4932).
function fasta_text(molecules) {
    return molecules.filter(function (m) { return m.sequence; }).map(function (m) {
        let chains = String(m.chains || "").split(", ").filter(Boolean);
        let organism = m.organism && !m.organism.includes(";") && m.taxonomy_id && !String(m.taxonomy_id).includes(";")
            ? `${m.organism} (${m.taxonomy_id})`
            : m.organism;
        let header = [`${m.pdb_id}_${m.molecule_id}`,
                      chains.length ? `${chains.length === 1 ? "Chain" : "Chains"} ${chains.join(", ")}` : "",
                      m.molecule_name || "", organism || ""].filter(Boolean).join("|");
        return `>${header}\n${m.sequence.match(/.{1,80}/g).join("\n")}\n`;
    }).join("");
}

function readme_text(counts, dbn, excel_ids, today) {
    let asked = new URLSearchParams(location.search);
    let link = location.origin + "/search?" + search_params().toString();
    let lines = [
        "NA3DB report",
        "",
        `Downloaded: ${today}`,
        `Search: ${link}`,
        "",
        "Files",
        `  structures.csv   one row per structure (${counts.structures})`,
        `  molecules.csv    one row per molecule in a structure (${counts.molecules}), ` +
            (asked.get("proteins") === "1" ? "proteins included" : "nucleic acids only"),
        `  ligands.csv      one row per ligand in a structure (${counts.ligands}), ` +
            (asked.get("water") === "1" ? "water included" : "water left out"),
        "  sequences.fasta  the sequences of the molecules in molecules.csv",
        `  base_pairs.dbn   dot-bracket, one record per structure (${dbn.records})`,
        "",
        "Entry ID is in every table: join on it to put them together.",
        "",
        "Counts (chains, copies, nucleotides) describe the deposited model, the",
        "asymmetric unit, not the biological assembly.",
        "",
        "Sequences are the full sequences studied, residues missing from the model",
        "included, each modified residue written as its parent (PSU as U).",
        "",
        "base_pairs.dbn",
        "  Each record: >Entry ID|chains, the sequence, then the structure.",
        "  Chains are joined by &, in the same order in both lines.",
        "  Pairs: canonical cWW only (A-U, G-C, G-U; a modified base counts as its",
        "  parent), within the chains of the file, first model. Pairs with a",
        "  symmetry copy are left out. Crossing pairs (pseudoknots) use [] then {}.",
        "  Other pair families are on each structure's page, as a layered map."
    ];

    if (dbn.unannotated.length) {
        lines.push("  No base-pair annotation yet, so no record: " + dbn.unannotated.join(" "));
    }

    lines.push("", "Excel",
        "  Excel reads some PDB ids as numbers (3E42 becomes 3.00E+42) and the",
        "  change cannot be undone after saving. Import with Data > From Text/CSV",
        "  and set Entry ID to Text instead of opening the file directly.");
    if (excel_ids.length) lines.push("  Ids in this download that are affected: " + excel_ids.join(" "));

    lines.push("", "How to cite: " + location.origin + "/cite", "");
    return lines.join("\r\n");
}

async function download_all() {
    let button = document.getElementById("zip_button");
    let label = button.dataset.label ??= button.textContent;

    button.disabled = true;
    button.textContent = "Preparing…";

    try {
        let missing = TABLES.filter(function (t) { return SOURCES[t.key] && !rows[t.key]; });
        await Promise.all(missing.map(function (t) { return load_table(t.key); }));
        if (TABLES.some(function (t) { return !rows[t.key]; })) throw new Error("A table could not be loaded.");

        let dbn = await get_json("/api/export/dbn?" + search_params().toString());
        let today = new Date().toISOString().slice(0, 10);
        let excel_ids = rows.structures.map(function (r) { return r[ID_FIELD]; })
            .filter(function (id) { return EXCEL_NUMBER.test(id); });
        let counts = {};
        let files = TABLES.map(function (t) {
            counts[t.key] = rows[t.key].length;
            return { name: `${t.key}.csv`, text: build_csv(t.fields, rows[t.key]) };
        });

        files.push({ name: "sequences.fasta", text: fasta_text(rows.molecules) },
                   { name: "base_pairs.dbn", text: dbn.text },
                   { name: "README.txt", text: readme_text(counts, dbn, excel_ids, today) });

        download_blob(await make_zip(files), `na3db_report_${today}.zip`);
        button.textContent = label;
    } catch (err) {
        button.textContent = "Download failed, try again";
    } finally {
        button.disabled = false;
    }
}

document.getElementById("zip_button").addEventListener("click", download_all);

// Opening or closing the field list. The choice goes in the URL beside the
// search, so a shared link opens the way the sender left it.
let fields_toggle = document.querySelector(".fields_toggle");
let fields_panel = document.querySelector(".query_panel");

fields_toggle.addEventListener("click", function () {
    let open = fields_panel.classList.contains("hidden");

    fields_panel.classList.toggle("hidden", !open);
    fields_toggle.setAttribute("aria-expanded", String(open));

    let params = new URLSearchParams(location.search);

    // A phone starts with the list shut (below), so there "open" is a
    // choice worth keeping; elsewhere it is the default and stays unsaid.
    if (open) phone.matches ? params.set("fields", "open") : params.delete("fields");
    else params.set("fields", "closed");

    history.replaceState(null, "", location.pathname + "?" + params.toString());
    sync_rail_links();
});


// On a phone the field list sits above the table, and twenty boxes would
// push the table off the screen, so it starts shut unless the link says
// otherwise. The tabs and the Download button stay on screen either way.
const phone = window.matchMedia("(max-width: 640px)");

if (phone.matches && !new URLSearchParams(location.search).has("fields")) {
    fields_panel.classList.add("hidden");
    fields_toggle.setAttribute("aria-expanded", "false");
}

sync_rail_links();
if (SOURCES[table.key]) load_table(table.key);
else refresh();
