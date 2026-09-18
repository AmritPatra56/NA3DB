import express from "express";
import path from "node:path";
import entries from "./entries.json" with { type: "json" };
import { search_entries, export_entries, find_entry, query_problem } from "./search.js";

const app = express();

app.use(express.static(path.join(import.meta.dirname, "public")));

// Pages are built from templates in views/, which sits outside public/ so the
// template source is never downloadable. Only the rendered HTML is sent.
app.set("view engine", "ejs");
app.set("views", path.join(import.meta.dirname, "views"));

// Says whether the server is alive. Deliberately touches no data.
app.get("/api/health", (req, res) => {
    res.json({ ok: true });
});

// How many entries the database holds.
app.get("/api/stats", (req, res) => {
    res.json({ total: entries.length });
});


app.get("/", (req, res) => {
    res.render("index", { page: "search" });
});



// The report page. Built from views/report.ejs, not served as a file.
app.get("/report", (req, res) => {
    res.render("report", { page: "report" });
});

// One structure's own page. The id is in the path so the address can be
// bookmarked, shared and cited. An unknown id is a real 404, not a 200 that
// happens to say "not found".
app.get("/structure/:id", (req, res) => {
    let entry = find_entry(entries, req.params.id);

    if (!entry) {
        res.status(404).render("error", { page: "none", tried: req.originalUrl });
        return;
    }

    res.render("structure", { page: "search", entry });
});

// One page of entries, narrowed by whatever filters were passed.
app.get("/api/entries", (req, res) => {
    let problem = query_problem(req.query);

    if (problem) {
        res.status(400).json({ error: problem });
        return;
    }

    res.json(search_entries(entries, req.query));
});

// One entry, by its PDB id. The id is in the path rather than the query string
// because it names *which* entry you want, instead of narrowing a list.
app.get("/api/entries/:id", (req, res) => {
    let entry = find_entry(entries, req.params.id);

    if (!entry) {
        res.status(404).json({ error: `No entry with id ${req.params.id}` });
        return;
    }

    res.json(entry);
});

// Returns every matching entry for the report page, not just one page.
app.get("/api/export", (req, res) => {
    let problem = query_problem(req.query);

    if (problem) {
        res.status(400).json({ error: problem });
        return;
    }

    res.json(export_entries(entries, req.query));
});

// Anything under /api that got this far matched no route above.
app.use("/api", (req, res) => {
    res.status(404).json({ error: `No such endpoint: ${req.method} ${req.originalUrl}` });
});

// Any page that matched nothing above. Sits below the /api catch-all so API
// paths still get JSON, and above the error handler so it is not mistaken for one.
app.use((req, res) => {
    res.status(404).render("error", { page: "none", tried: req.originalUrl });
});

// The last thing in the chain. Anything that threw anywhere above lands here.
// Four arguments is what tells Express this is an error handler, not a route.
app.use((err, req, res, next) => {
    console.error(err);

    if (res.headersSent) return next(err);

    res.status(500).json({ error: "Something went wrong on the server" });
});

export default app;

// Only listen when this file is run directly. A test imports it instead and
// starts its own server on a free port, so importing must have no side effects.
if (import.meta.main) {
    // The port to listen on. Docker or a hosting platform decides this, not the code.
    const port = Number(process.env.PORT) || 4000;

    app.listen(port, () => {
        console.log(`app is running on port ${port}`);
    });
}
