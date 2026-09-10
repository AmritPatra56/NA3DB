import express from "express";
import path from "node:path";
import entries from "./entries.json" with { type: "json" };
import { search_entries, export_entries, query_problem } from "./search.js";

const app = express();

app.use(express.static(path.join(import.meta.dirname, "public")));

// Says whether the server is alive. Deliberately touches no data.
app.get("/api/health", (req, res) => {
    res.json({ ok: true });
});

// How many entries the database holds.
app.get("/api/stats", (req, res) => {
    res.json({ total: entries.length });
});

// Runs a search and returns one page of matching entries.
app.get("/api/search", (req, res) => {
    let problem = query_problem(req.query);

    if (problem) {
        res.status(400).json({ error: problem });
        return;
    }

    res.json(search_entries(entries, req.query));
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

// The last thing in the chain. Anything that threw anywhere above lands here.
// Four arguments is what tells Express this is an error handler, not a route.
app.use((err, req, res, next) => {
    console.error(err);

    if (res.headersSent) return next(err);

    res.status(500).json({ error: "Something went wrong on the server" });
});

// The port to listen on. Docker or a hosting platform decides this, not the code.
const port = Number(process.env.PORT) || 4000;

app.listen(port, () => {
    console.log(`app is running on port ${port}`);
});
