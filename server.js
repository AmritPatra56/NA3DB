import express from "express";
import path from "node:path";
import { search_entries, export_entries, find_entry, query_problem,
         count_entries } from "./search.js";
import { query, DatabaseUnavailable } from "./db.js";
import { public_registry, columns_answering, match_mode } from "./filters.js";
import { detail_rows } from "./detail.js";

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
app.get("/", (req, res) => {
    let query = req.originalUrl.split("?")[1];

    if (query) {
        res.redirect(301, "/search?" + query);
        return;
    }

    res.render("landing", { page: "landing" });
});

// The search page: the filter panel, the results and the sort control.
//
// The panel starts closed for a plain search from the box, and open for
// anything else, so arriving from the landing page shows results rather than
// a wall of filters. ?panel= overrides it, which is what the toggle writes.
app.get("/search", (req, res) => {
    res.render("search", {
        page: "search",
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
    res.render("structure", {
        page: "search",
        entry,
        rows: detail_rows(entry),
        rail_query: "?entry_id=" + encodeURIComponent(entry.pdb_id)
    });
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
    res.json({ ...entry, rows: detail_rows(entry) });
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
