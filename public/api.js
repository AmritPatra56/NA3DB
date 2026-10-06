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
async function search_entries(filters, page = 1, sort = "") {
    let params = filters_to_params(filters);

    if (page > 1) params.set("page", page);
    if (sort) params.set("sort", sort);

    return get_json("/api/entries?" + params.toString());
}

// Every matching entry, for the report page: { results, total, truncated }.
async function export_entries(filters) {
    return get_json("/api/export?" + filters_to_params(filters).toString());
}

// One structure's full record, from our own server rather than data.rcsb.org.
// It carries more than RCSB did: every author, the confal percentile and the
// NtC classes, which come from the DNATCO analysis.
async function fetch_entry_detail(pdb_id) {
    return get_json("/api/entries/" + encodeURIComponent(pdb_id));
}
