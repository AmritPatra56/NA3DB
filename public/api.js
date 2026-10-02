// api.js - talks to the NA3DB server.
// It cannot see the screen, so everything it needs is passed in as an argument.


// Fetches JSON from our own server, turning any failure reply into a thrown error.
// The server puts a readable message in the body, so that message is used when there is one.
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

// Asks the server for one page of search results.
// Returns { results, total, page, pages, page_size }.
async function search_entries(filters, page = 1) {
    let params = filters_to_params(filters);

    if (page > 1) params.set("page", page);

    return get_json("/api/entries?" + params.toString());
}

// Asks the server for every entry matching the filters, for the report page.
// Returns { results, total, truncated }.
async function export_entries(filters) {
    return get_json("/api/export?" + filters_to_params(filters).toString());
}

// Asks our own server for one structure's full record.
//
// This used to call data.rcsb.org directly. That made every click on a result
// depend on a server 8,000 km away — and asked someone else for information
// this database already holds. It now returns more than RCSB did: every
// author, the confal percentile, and the NtC classes, which only DNATCO has.
async function fetch_entry_detail(pdb_id) {
    return get_json("/api/entries/" + encodeURIComponent(pdb_id));
}
