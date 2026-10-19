// detail.js - turns one entry into the rows a human reads.
// Server only, and the display counterpart to search.js: filters.js holds the
// facts, search.js makes SQL from them, this makes rows. It runs here so the
// detail panel and the structure page cannot format the same field differently.

import { columns_for } from "./filters.js";

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

// The rows a view shows, in registry order. An empty value is dropped rather
// than drawn blank. The view names come from each column's `show` list, so
// adding a place to display columns in means naming it there, not here.
//
// `also` names extra column keys for this one render: a card shows the field
// that was searched on even when it is not normally on the card.
export function detail_rows(entry, view = "page", also = []) {
    let rows = [];

    for (const column of columns_for(view, also)) {

        let raw = entry[column.key];
        if ((raw === null || raw === undefined || raw === "") && column.fallback) {
            raw = entry[column.fallback];
        }

        let value = display(raw, column);
        if (value !== null) rows.push({ label: column.label, value });
    }

    return rows;
}
