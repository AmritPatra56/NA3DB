import express from "express";
import path from "node:path";
import { search_entries, export_entries, find_entry, query_problem } from "./search.js";
import { query, DatabaseUnavailable } from "./db.js";

const app = express();

app.use(express.static(path.join(import.meta.dirname, "public")));

// Pages are built from templates in views/, which sits outside public/ so the
// template source is never downloadable. Only the rendered HTML is sent.
app.set("view engine", "ejs");
app.set("views", path.join(import.meta.dirname, "views"));

// Says whether the app can do its job, which now means reaching the database.
// A server that is running but cannot query is not healthy. it just looks it.
app.get("/api/health", async (req, res) => {
    try {
        await query("SELECT 1");
        res.json({ ok: true, database: "up" });
    } catch (err) {
        console.error("health check failed:", err.message);
        res.status(503).json({ ok: false, database: "down" });
    }
});

// How many entries the database holds. Asked fresh every time, so the number
// is right the moment after a load rather than the moment the server started.
app.get("/api/stats", async (req, res) => {
    let result = await query("SELECT count(*) FROM entry");

    // count(*) is a bigint, and pg returns those as strings so a huge value
    // cannot be silently rounded. Convert at the boundary, into the JSON.
    res.json({ total: Number(result.rows[0].count) });
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

    res.render("structure", { page: "search", entry });
});

// One page of entries, narrowed by whatever filters were passed.
app.get("/api/entries", async (req, res) => {
    let problem = query_problem(req.query);

    if (problem) {
        res.status(400).json({ error: problem });
        return;
    }

    res.json(await search_entries(req.query));
});

// One entry, by its PDB id. The id is in the path rather than the query string
// because it names *which* entry you want, instead of narrowing a list.
app.get("/api/entries/:id", async (req, res) => {
    let entry = await find_entry(req.params.id);

    if (!entry) {
        res.status(404).json({ error: `No entry with id ${req.params.id}` });
        return;
    }

    res.json(entry);
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

// Any page that matched nothing above. Sits below the /api catch-all so API
// paths still get JSON, and above the error handler so it is not mistaken for one.
app.use((req, res) => {
    res.status(404).render("error", {
        page: "none",
        heading: "Page not found",
        message: `There is nothing at ${req.originalUrl}.`
    });
});

// The last thing in the chain. Anything that threw anywhere above lands here.
// Four arguments is what tells Express this is an error handler, not a route.
//
// Two decisions: 503 when the database is away (not our bug, try again) versus
// 500 when our own SQL is wrong; and HTML for a browser versus JSON for a script.
app.use((err, req, res, next) => {
    // Logged first, so a failure while rendering the error page still leaves
    // the original cause in the log.
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

// Only listen when this file is run directly. A test imports it instead and
// starts its own server on a free port, so importing must have no side effects.
if (import.meta.main) {
    // The port to listen on. Docker or a hosting platform decides this, not the code.
    const port = Number(process.env.PORT) || 4000;

    app.listen(port, () => {
        console.log(`app is running on port ${port}`);
    });
}
