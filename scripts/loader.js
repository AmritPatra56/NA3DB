// One-off script. Open loader.html, wait for it to finish, then copy the JSON
// it prints into entries.json. This is not part of the app.

let DATA_API = "https://data.rcsb.org/rest/v1/core";
let SEARCH_API = "https://search.rcsb.org/rcsbsearch/v2/query";

// The PDB calls this "polymer composition". These are the values that mean
// "there is a nucleic acid in here".
let NA_ONLY = ["DNA", "RNA", "NA-hybrid", "DNA/RNA"];
let WITH_PROTEIN = ["protein/NA"];

let polymer_type_labels = {
    "DNA": "Nucleic acid",
    "RNA": "Nucleic acid",
    "NA-hybrid": "Nucleic acid",
    "DNA/RNA": "Nucleic acid",
    "protein/NA": "Protein/NA"
};


function build_query(compositions, direction, rows) {
    return {
        query: {
            type: "terminal",
            service: "text",
            parameters: {
                attribute: "rcsb_entry_info.polymer_composition",
                operator: "in",
                value: compositions
            }
        },
        return_type: "entry",
        request_options: {
            paginate: { start: 0, rows: rows },
            results_content_type: ["experimental"],
            sort: [{ sort_by: "rcsb_accession_info.initial_release_date", direction: direction }]
        }
    };
}


async function fetch_json(url) {
    let res = await fetch(url);

    if (!res.ok) {
        throw new Error(`Request failed (status ${res.status}) for ${url}`);
    }

    return await res.json();
}


async function fetch_id_list(query) {
    let text = JSON.stringify(query);
    let url = SEARCH_API + "?json=" + encodeURIComponent(text);

    let data = await fetch_json(url);

    return data.result_set.map(function (row) {
        return row.identifier;
    });
}


// An entry can hold several molecules. We want the nucleic acid one, which is
// not always the first, so walk them until we find it.
async function find_na_entity(pdb_id, entity_ids) {
    let first = null;

    for (let i = 0; i < entity_ids.length && i < 4; i++) {
        let polymer = await fetch_json(`${DATA_API}/polymer_entity/${pdb_id}/${entity_ids[i]}`);

        if (first === null) first = polymer;

        let type = polymer.entity_poly.rcsb_entity_polymer_type;

        if (type === "DNA" || type === "RNA" || type === "NA-hybrid") {
            return polymer;
        }
    }

    return first;
}


async function build_entry(pdb_id) {
    let entry = await fetch_json(`${DATA_API}/entry/${pdb_id}`);

    let entity_ids = entry.rcsb_entry_container_identifiers.polymer_entity_ids;
    let polymer = await find_na_entity(pdb_id, entity_ids);

    let resolution = null;
    if (entry.rcsb_entry_info.resolution_combined) {
        resolution = entry.rcsb_entry_info.resolution_combined[0];
    }

    let organism = "";
    if (polymer.rcsb_entity_source_organism) {
        organism = polymer.rcsb_entity_source_organism[0].ncbi_scientific_name;
    }

    let nonstandard = "";
    if (polymer.entity_poly.rcsb_non_std_monomers) {
        nonstandard = polymer.entity_poly.rcsb_non_std_monomers.join(", ");
    }

    let composition = entry.rcsb_entry_info.polymer_composition;

    return {
        pdb_id: entry.rcsb_id,
        title: entry.struct.title,
        author: entry.audit_author[0].name,
        method: entry.exptl[0].method,
        resolution: resolution,
        deposition_date: entry.rcsb_accession_info.deposit_date.slice(0, 10),
        entity_name: polymer.rcsb_polymer_entity.pdbx_description,
        source_organism: organism,
        nonstandard_residue: nonstandard,
        assigned_ntc: null,
        confal_score: null,
        polymer_type: polymer_type_labels[composition] || "Other",
        monomer_flag: nonstandard === "" ? "Standard" : "Non-Standard"
    };
}


async function build_all() {
    let old_na = await fetch_id_list(build_query(NA_ONLY, "asc", 60));
    let new_complexes = await fetch_id_list(build_query(WITH_PROTEIN, "desc", 60));

    let ids = old_na.concat(new_complexes);
    console.log("got", ids.length, "ids");

    let built = [];

    for (let i = 0; i < ids.length; i++) {
        try {
            let entry = await build_entry(ids[i]);
            built.push(entry);
            console.log(i + 1, "of", ids.length, entry.pdb_id);
        } catch (err) {
            console.log("skipped", ids[i], err.message);
        }
    }

    return built;
}


build_all().then(function (built) {
    console.log("done,", built.length, "entries");
    console.log(JSON.stringify(built, null, 2));
});
