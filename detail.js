// detail.js - turns one entry into the rows a human reads.
// Server only, and the display counterpart to search.js: filters.js holds the
// facts, search.js makes SQL from them, this makes rows. It runs here so the
// detail panel and the structure page cannot format the same field differently.

import { COLUMNS } from "./filters.js";

// One value as display text, or null when there is nothing to show.
// The locale is pinned: toLocaleString() with none uses the viewer's machine,
// so 10,000 would read 10.000 in Germany.
function display(value, column) {
    if (value === null || value === undefined || value === "") return null;

    let text;

    if (column.decimals !== undefined) text = Number(value).toFixed(column.decimals);
    else if (column.thousands)         text = Number(value).toLocaleString("en-GB");
    else                               text = String(value);

    return column.unit ? `${text} ${column.unit}` : text;
}

// The rows a detail view shows, in registry order. An empty value is dropped
// rather than drawn blank. view "panel" is the short list beside the results;
// "page" is everything, for /structure/:id.
export function detail_rows(entry, view = "page") {
    let rows = [];

    for (const column of COLUMNS) {
        // === false, not falsy: every other column has undefined here.
        if (column.in_detail === false) continue;
        if (view === "panel" && !column.in_panel) continue;

        let raw = entry[column.key];
        if ((raw === null || raw === undefined || raw === "") && column.fallback) {
            raw = entry[column.fallback];
        }

        let value = display(raw, column);
        if (value !== null) rows.push({ label: column.label, value });
    }

    return rows;
}
