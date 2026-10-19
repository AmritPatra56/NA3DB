// api.js - talks to the NA3DB server. It cannot see the screen.


// JSON from our own server, with any failure reply thrown. The server puts a
// readable message in the body, so that is used when there is one.
async function get_json(url) {
    let res = await fetch(url);

    let data = await res.json().catch(function () {
        return {};
    });

    if (!res.ok) {
        throw new Error(data.error || `Request failed (status ${res.status})`);
    }

    return data;
}

// One page of search results: { results, total, page, pages, page_size }.
async function search_entries(filters, page = 1, sort = "", per_page = "", match = "") {
    let params = filters_to_params(filters);

    if (page > 1) params.set("page", page);
    if (sort) params.set("sort", sort);
    if (per_page) params.set("per_page", per_page);
    if (match) params.set("match", match);

    return get_json("/api/entries?" + params.toString());
}

// Every matching entry, for the report page: { results, total, truncated }.
// match travels too: it decides which entries match, so a report of an
// Excludes search would otherwise quietly report the Contains one.
async function export_entries(filters, match = "") {
    let params = filters_to_params(filters);

    if (match) params.set("match", match);

    return get_json("/api/export?" + params.toString());
}
