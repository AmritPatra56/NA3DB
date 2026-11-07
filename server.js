import express from "express";
import path from "node:path";
import { search_entries, export_entries, find_entry, query_problem,
         count_entries, entry_citations, entry_contents, entry_base_pairs,
         entry_residues, ligand_suggestions, pill_counts, database_stats } from "./search.js";
import { query, DatabaseUnavailable } from "./db.js";
import { public_registry, columns_answering, match_mode,
         POLYMER_TYPE_ALIASES } from "./filters.js";
import { detail_rows, molecule_groups, base_pair_section, fasta_of,
         entry_fasta, base_pair_export, base_pairs_csv, structure_sections,
         PAGE_GROUPS } from "./detail.js";

const app = express();

app.use(express.static(path.join(import.meta.dirname, "public")));

// views/ sits outside public/, so the template source is never downloadable.
app.set("view engine", "ejs");
app.set("views", path.join(import.meta.dirname, "views"));

// The registry for a page: an object for the templates, text for the <script>
// tag. app.locals reaches every res.render, so no route passes it along. Both
// use the stripped copy, so a template cannot print SQL even by mistake, and
// < becomes \u003c so a value can never close the <script> tag it sits in.
app.locals.registry = public_registry();
app.locals.registry_json =
    JSON.stringify(app.locals.registry).replaceAll("<", "\\u003c");

// Whether the app can do its job, which means reaching the database. A server
// that is up but cannot query is not healthy, it only looks it.
app.get("/api/health", async (req, res) => {
    try {
        await query("SELECT 1");
        res.json({ ok: true, database: "up" });
    } catch (err) {
        console.error("health check failed:", err.message);
        res.status(503).json({ ok: false, database: "down" });
    }
});

// How many entries the database holds, asked fresh so a load shows up at once.
app.get("/api/stats", async (req, res) => {
    let result = await query("SELECT count(*) FROM entry");

    // pg returns bigint as a string so nothing is silently rounded.
    res.json({ total: Number(result.rows[0].count) });
});


// What this API understands, so a client can discover it instead of hard-coding
// it. public_registry picks the safe fields, so no SQL leaves the server.
app.get("/api/fields", (req, res) => {
    res.json(public_registry());
});


// The front door. A bare visit gets the landing page; a visit carrying a
// search is a bookmark from before the split, so it is sent to the page that
// can answer it rather than being dropped on the floor.
app.get("/", async (req, res) => {
    let query = req.originalUrl.split("?")[1];

    if (query) {
        res.redirect(301, "/search?" + query);
        return;
    }

    res.render("landing", { page: "landing", stats: await database_stats() });
});

// The footer's pages, linked before they are written. A 200 that says so,
// not a 404: the link is right, the page is what is missing.
const UNWRITTEN = { cite: "How to cite", help: "Help", contact: "Contact" };

for (const [path, heading] of Object.entries(UNWRITTEN)) {
    app.get("/" + path, (req, res) => {
        res.render("error", { page: "none", heading,
                              message: "This page is being written." });
    });
}

// The search page: the filter panel, the results and the sort control.
//
// The panel starts closed for a plain search from the box, and open for
// anything else, so arriving from the landing page shows results rather than
// a wall of filters. ?panel= overrides it, which is what the toggle writes.
// A polymer type spelt the way links were before DNA and RNA were split, put
// into its current values. null when there is nothing to rewrite.
function current_polymer_types(original_url) {
    let params = new URLSearchParams(original_url.split("?")[1] || "");
    let values = params.getAll("polymer_type").flatMap((v) => v.split(","));

    if (!values.some((v) => POLYMER_TYPE_ALIASES[v])) return null;

    let current = [...new Set(values.flatMap((v) => POLYMER_TYPE_ALIASES[v] || [v]))];
    params.set("polymer_type", current.join(","));
    return params.toString().replaceAll("+", "%20");
}

app.get("/search", async (req, res) => {
    // The page's script selects only the pills it knows, so an old value would
    // be dropped and the search silently widened to every entry.
    let rewritten = current_polymer_types(req.originalUrl);
    if (rewritten !== null) {
        res.redirect(301, "/search?" + rewritten);
        return;
    }

    // A pill the URL selects is drawn even at 0, or the page script would
    // drop it and silently widen the search.
    let selected = Object.values(req.query).flatMap((v) => String(v).split(","));

    res.render("search", {
        page: "search",
        counts: await pill_counts(),
        selected,
        panel_open: panel_open(req.query),
        view: req.query.view === "lines" ? "lines" : "cards",
        match: match_mode(req.query.match)
    });
});

// The parameters that say how to show results rather than which ones. Both
// the panel rule and the report gate have to ignore them, or a layout choice
// would look like a search.
const DISPLAY = ["page", "sort", "view", "per_page", "match", "fields"];

function filters_used(query) {
    return Object.keys(query).filter((k) => !DISPLAY.includes(k));
}

// `q` with nothing but a page or an order beside it is a simple search.
// Anything else means a filter was used, so the panel that holds it is shown.
function panel_open(query) {
    if (query.panel === "open")   return true;
    if (query.panel === "closed") return false;

    let used = filters_used(query);

    return !(used.length === 1 && used[0] === "q" && query.q !== "");
}



// The report page. Built from views/report.ejs, not served as a file.
//
// A report is about a search, so arriving with no search at all is a wrong
// turn rather than a request for everything. Those go to /search, where there
// is something to do.
app.get("/report", (req, res) => {
    // Counted on the filters alone: ?fields=closed is a layout choice, not a
    // search, and must not let anyone past the gate.
    if (filters_used(req.query).length === 0) {
        res.redirect("/search");
        return;
    }

    res.render("report", {
        page: "report",
        fields_open: req.query.fields !== "closed"
    });
});

// One structure's page. The id is in the path so the address can be cited.
// An unknown id is a real 404, not a 200 that says "not found".
app.get("/structure/:id", async (req, res) => {
    let entry = await find_entry(req.params.id);

    if (!entry) {
        res.status(404).render("error", {
            page: "none",
            heading: "Page not found",
            message: `There is nothing at ${req.originalUrl}.`
        });
        return;
    }

    // The rail on this page has no script to rewrite its links, so it is given
    // the one filter that makes sense from here: this structure.
    let page = {
        entry,
        rows: detail_rows(entry),
        citations: await entry_citations(entry.pdb_id),
        molecules: molecule_groups(await entry_contents(entry.pdb_id), await entry_residues(entry.pdb_id)),
        base_pairs: base_pair_section(await entry_base_pairs(entry.pdb_id))
    };

    res.render("structure", {
        ...page,
        page: "search",
        sections: structure_sections(page),
        PAGE_GROUPS,
        rail_query: "?entry_id=" + encodeURIComponent(entry.pdb_id)
    });
});

// FASTA has no registered media type; plain text is what tools expect.
// attachment() guesses one from the extension, so the type is set after it.
function send_fasta(res, filename, fasta) {
    res.attachment(filename).set("Content-Type", "text/plain; charset=utf-8").send(fasta);
}

// Every sequenced molecule in the entry; ?only=na keeps the nucleic acids.
app.get("/structure/:id/fasta", async (req, res) => {
    let entry = await find_entry(req.params.id);
    let na_only = req.query.only === "na";
    let fasta = entry && entry_fasta(entry.pdb_id, (await entry_contents(entry.pdb_id)).entities, { na_only });

    if (!fasta) {
        res.status(404).type("text").send(`No ${na_only ? "nucleic acid " : ""}sequence for ${req.params.id}\n`);
        return;
    }
    send_fasta(res, `${entry.pdb_id}${na_only ? "_na" : ""}.fasta`, fasta);
});

// One molecule's sequence as a FASTA file, from the link under its sequence.
app.get("/structure/:id/fasta/:entity", async (req, res) => {
    let entry = await find_entry(req.params.id);
    let entity = entry && (await entry_contents(entry.pdb_id)).entities
        .find((e) => e.id === req.params.entity);
    let fasta = entity && fasta_of(entry.pdb_id, entity);

    if (!fasta) {
        res.status(404).type("text").send(`No sequence for ${req.params.id} molecule ${req.params.entity}\n`);
        return;
    }
    send_fasta(res, `${entry.pdb_id}_${entity.id}.fasta`, fasta);
});

// The ligands the Ligand box can suggest, with how many entries hold each.
app.get("/api/ligands", async (req, res) => {
    res.json(await ligand_suggestions());
});

// One page of entries, narrowed by whatever filters were passed.
app.get("/api/entries", async (req, res) => {
    let problem = query_problem(req.query);

    if (problem) {
        res.status(400).json({ error: problem });
        return;
    }

    let found = await search_entries(req.query);

    // The display rows travel with each result, the same way /api/entries/:id
    // carries them: the formatting lives in detail.js and cannot cross JSON,
    // so the finished list is built here rather than in the browser. No extra
    // query - every field is already on the row.
    // A card also shows whatever was searched on. Filter by NtC class and
    // every card gains an Assigned NtC row, so a result never has to be taken
    // on trust. No extra query: the field is already on the row.
    let answering = columns_answering(req.query);

    found.results = found.results.map((entry) =>
        ({ ...entry, card: detail_rows(entry, "card", answering) }));

    res.json(found);
});

// How many entries a search would return, and nothing else. Separate from
// /api/entries because the landing page asks this on every keystroke and has
// no use for the rows.
app.get("/api/count", async (req, res) => {
    let problem = query_problem(req.query);

    if (problem) {
        res.status(400).json({ error: problem });
        return;
    }

    res.json({ total: await count_entries(req.query) });
});

// One entry by its PDB id. In the path, because it names which entry rather
// than narrowing a list.
app.get("/api/entries/:id", async (req, res) => {
    let entry = await find_entry(req.params.id);

    if (!entry) {
        res.status(404).json({ error: `No entry with id ${req.params.id}` });
        return;
    }

    // The raw fields and the display rows, never one instead of the other:
    // entry.resolution stays 2.2, rows has it as "2.20 Å".
    let contents = await entry_contents(entry.pdb_id);
    res.json({ ...entry, rows: detail_rows(entry),
               entities: contents.entities, modified_nucleotides: contents.modified,
               citations: await entry_citations(entry.pdb_id) });
});

// Every base pair of one entry, first model, as the page lists them.
// ?format=csv gives a file to open in a spreadsheet or pandas.
app.get("/api/entries/:id/base_pairs", async (req, res) => {
    let entry = await find_entry(req.params.id);

    if (!entry) {
        res.status(404).json({ error: `No entry with id ${req.params.id}` });
        return;
    }

    let pairs = await entry_base_pairs(entry.pdb_id);

    if (req.query.format === "csv") {
        res.attachment(`${entry.pdb_id}_base_pairs.csv`)
           .set("Content-Type", "text/csv; charset=utf-8")
           .send(base_pairs_csv(pairs));
        return;
    }
    res.json(base_pair_export(entry.pdb_id, pairs));
});

// Returns every matching entry for the report page, not just one page.
app.get("/api/export", async (req, res) => {
    let problem = query_problem(req.query);

    if (problem) {
        res.status(400).json({ error: problem });
        return;
    }

    res.json(await export_entries(req.query));
});

// Anything under /api that got this far matched no route above.
app.use("/api", (req, res) => {
    res.status(404).json({ error: `No such endpoint: ${req.method} ${req.originalUrl}` });
});

// Any page that matched nothing. Below the /api catch-all so API paths still
// get JSON, above the error handler so Express does not mistake it for one.
app.use((req, res) => {
    res.status(404).render("error", {
        page: "none",
        heading: "Page not found",
        message: `There is nothing at ${req.originalUrl}.`
    });
});

// Anything that threw above lands here; four arguments is what marks it as an
// error handler. 503 when the database is away, 500 when our SQL is wrong.
app.use((err, req, res, next) => {
    // Logged first, so a failure rendering the error page keeps the cause.
    console.error(err);

    if (res.headersSent) return next(err);

    let away = err instanceof DatabaseUnavailable;
    let status = away ? 503 : 500;
    let message = away
        ? "The database is temporarily unavailable. Please try again shortly."
        : "Something went wrong on the server";

    if (req.path.startsWith("/api")) {
        res.status(status).json({ error: message });
        return;
    }

    res.status(status).render("error", {
        page: "none",
        heading: away ? "Temporarily unavailable" : "Something went wrong",
        message: message
    });
});

export default app;

// Only listen when run directly: a test imports this and starts its own
// server on a free port, so importing must have no side effects.
if (import.meta.main) {
    // The host decides the port, not the code.
    const port = Number(process.env.PORT) || 4000;

    app.listen(port, () => {
        console.log(`app is running on port ${port}`);
    });
}
