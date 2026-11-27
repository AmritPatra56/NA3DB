import express from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import { search_entries, export_entries, export_molecules, export_ligands, export_dot_brackets, find_entry, query_problem,
         count_entries, entry_citation, entry_contents, entry_base_pairs, entry_sequence_tracks,
         entry_residues, ligand_suggestions, nonstandard_suggestions, organism_suggestions, pill_counts, database_stats, browse_counts,
         same_sequence, same_sequence_count, compare_same_sequence, entry_ntc_classes, entry_assemblies } from "./search.js";
import { query, DatabaseUnavailable } from "./db.js";
import { gate } from "./gate.js";
import help from "./help_texts.js";
import { citation_ris, citation_bibtex, citation_text, unpublished, short_name, full_name } from "./cite.js";
import { did_you_mean, box_suggestions, warm_box_names } from "./suggest.js";
import { public_registry, columns_answering, POLYMER_TYPE_ALIASES } from "./filters.js";
import { detail_rows, molecule_groups, base_pair_section, fasta_of,
         entry_fasta, base_pair_export, base_pairs_csv, sequence_map, sequence_map_text, arc_thumbnail, arc_summary,
         arc_views, ntc_section } from "./detail.js";

const app = express();

// Control characters stripped once, before any route reads :id.
app.param("id", (req, res, next, id) => {
    req.params.id = id.replace(/[\x00-\x1f\x7f]/g, "");
    next();
});

app.use(express.static(path.join(import.meta.dirname, "public")));

const viewer_dir = process.env.VIEWER_DIR
    ? path.resolve(process.env.VIEWER_DIR)
    : path.join(import.meta.dirname, "viewer");

export const viewer_installed = existsSync(path.join(viewer_dir, "index.html"));

// Moorhen needs SharedArrayBuffer, so the page and its frame must be cross-origin isolated.
function isolate(res) {
    res.set("Cross-Origin-Opener-Policy", "same-origin");
    res.set("Cross-Origin-Embedder-Policy", "require-corp");
}

if (viewer_installed) {
    app.use("/viewer", express.static(viewer_dir, {
        setHeaders: (res, file) => {
            isolate(res);
            res.set("Cross-Origin-Resource-Policy", "same-origin");
            // index.html names the hashed chunks, so it must not be cached.
            if (file.endsWith(".html")) res.set("Cache-Control", "no-cache");
        },
        maxAge: "1h"
    }));
}

const client_dir = path.resolve(process.env.CLIENT_DIR ?? path.join(import.meta.dirname, "client", "dist"));

if (!existsSync(path.join(client_dir, "index.html"))) {
    throw new Error(`No React build in ${client_dir}: run npm run build in client/, or set CLIENT_DIR`);
}

app.use("/app", express.static(path.join(client_dir, "app"), { immutable: true, maxAge: "1y" }));

// Every page is isolated: React moves to a structure in place.
function send_app(res, status = 200) {
    isolate(res);
    res.status(status).set("Cache-Control", "no-cache").sendFile(path.join(client_dir, "index.html"));
}

app.get("/api/health", async (req, res) => {
    try {
        await query("SELECT 1");
        res.json({ ok: true, database: "up" });
    } catch (err) {
        console.error("health check failed:", err.message);
        res.status(503).json({ ok: false, database: "down" });
    }
});

app.get("/api/stats", async (req, res) => {
    res.json(await database_stats());
});

app.get("/api/browse", async (req, res) => {
    let groups = await browse_counts();
    let option = ({ label, note, url, say, count, share }) =>
        ({ label, note: note ?? null, url, say: say ?? null, count, share });

    res.json(groups.map((g) => ({
        area: g.area, question: g.question, hint: g.hint, foot: g.foot ?? null,
        rows: g.rows.map((r) => ({
            label: r.label, count: r.count, share: r.share, url: r.url, no_url: r.no_url,
            say_yes: r.say_yes, say_no: r.say_no, options_name: r.options_name ?? null,
            options: r.options.map(option)
        }))
    })));
});

app.get("/api/fields", (req, res) => {
    res.json(public_registry());
});

app.get("/api/help", (req, res) => {
    res.json(help);
});

app.get("/api/pill_counts", async (req, res) => {
    res.json(await pill_counts());
});

app.get("/", async (req, res) => {
    let query = req.originalUrl.split("?")[1];

    if (query) {
        res.redirect(301, "/search?" + query);
        return;
    }
    send_app(res);
});

const UNWRITTEN = { cite: "How to cite", help: "Help", contact: "Contact" };

for (const path of Object.keys(UNWRITTEN)) {
    app.get("/" + path, (req, res) => send_app(res));
}

function current_polymer_types(original_url) {
    let params = new URLSearchParams(original_url.split("?")[1] || "");
    let values = params.getAll("polymer_type").flatMap((v) => v.split(","));

    if (!values.some((v) => POLYMER_TYPE_ALIASES[v])) return null;

    let current = [...new Set(values.flatMap((v) => POLYMER_TYPE_ALIASES[v] || [v]))];
    params.set("polymer_type", current.join(","));
    return params.toString().replaceAll("+", "%20");
}

app.get("/search", async (req, res) => {
    // An old value would be dropped, silently widening the search.
    let rewritten = current_polymer_types(req.originalUrl);
    if (rewritten !== null) {
        res.redirect(301, "/search?" + rewritten);
        return;
    }
    send_app(res);
});

const DISPLAY = ["page", "sort", "view", "per_page", "match", "fields", "panel", "table", "proteins", "water"];

function filters_used(query) {
    return Object.keys(query).filter((k) => !DISPLAY.includes(k));
}

app.get("/report", (req, res) => {
    if (filters_used(req.query).length === 0) {
        res.redirect("/search");
        return;
    }
    send_app(res);
});

app.get("/structure/:id", async (req, res) => {
    let entry = await find_entry(req.params.id);

    send_app(res, entry ? 200 : 404);
});

// From the checked reference: the PDB copy has 35 papers still "To be published".
export function cited_rows(rows, c) {
    if (c?.source !== "reference") return rows;
    let published = [c.type === "preprint" ? `${c.journal} preprint` : c.journal_abbrev ?? c.journal, c.year]
        .filter(Boolean).join(" ");
    return rows.map((row) =>
        row.key === "published" ? { ...row, value: published }
        : row.key === "all_authors" && c.authors.length ? { ...row, value: c.authors.map(short_name).join(", ") }
        : row);
}

// attachment() guesses a type from the extension, so it is set after.
function send_fasta(res, filename, fasta) {
    res.attachment(filename).set("Content-Type", "text/plain; charset=utf-8").send(fasta);
}

const CITATION_FORMATS = {
    ris: { build: citation_ris,    type: "application/x-research-info-systems; charset=utf-8" },
    bib: { build: citation_bibtex, type: "application/x-bibtex; charset=utf-8" }
};
app.get("/structure/:id/citation", async (req, res) => {
    let format = CITATION_FORMATS[req.query.format];
    if (!format) {
        res.status(400).type("text").send("format must be ris or bib\n");
        return;
    }
    let entry = await find_entry(req.params.id);
    let citation = entry && await entry_citation(entry.pdb_id);
    if (!citation) {
        res.status(404).type("text").send(`No citation for ${req.params.id}\n`);
        return;
    }
    res.attachment(`${entry.pdb_id}.${req.query.format}`).set("Content-Type", format.type)
       .send(format.build(entry.pdb_id, citation));
});

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

app.get("/api/source_organisms", async (req, res) => {
    res.json(await organism_suggestions("source_organisms"));
});
app.get("/api/expression_hosts", async (req, res) => {
    res.json(await organism_suggestions("expression_hosts"));
});

app.get("/api/ligands", async (req, res) => {
    res.json(await ligand_suggestions());
});

app.get("/api/nonstandard_residues", async (req, res) => {
    res.json(await nonstandard_suggestions());
});

app.get("/api/box_suggestions", async (req, res) => {
    let problem = query_problem(req.query);
    if (problem) {
        res.status(400).json({ error: problem });
        return;
    }
    res.json(await box_suggestions(req.query));
});

app.get("/api/entries", async (req, res) => {
    let problem = query_problem(req.query);

    if (problem) {
        res.status(400).json({ error: problem });
        return;
    }

    let found = await search_entries(req.query);
    if (found.total === 0) found.suggestions = await did_you_mean(req.query);

    let answering = columns_answering(req.query);

    let summaries = await Promise.all(found.results.map((entry) => arc_numbers(entry.pdb_id)));

    found.results = found.results.map((entry, i) =>
        ({ ...entry, card: detail_rows(entry, "card", answering), arcs: summaries[i] }));

    res.json(found);
});

app.get("/api/count", async (req, res) => {
    let problem = query_problem(req.query);

    if (problem) {
        res.status(400).json({ error: problem });
        return;
    }

    let total = await count_entries(req.query);
    res.json(total === 0 ? { total, suggestions: await did_you_mean(req.query) } : { total });
});

app.get("/api/entries/:id", async (req, res) => {
    let entry = await find_entry(req.params.id);

    if (!entry) {
        res.status(404).json({ error: `No entry with id ${req.params.id}` });
        return;
    }

    let [contents, citation, same_entries] = await Promise.all([entry_contents(entry.pdb_id), entry_citation(entry.pdb_id),
                                                                 same_sequence_count(entry.pdb_id)]);
    res.json({ ...entry, rows: cited_rows(detail_rows(entry), citation),
               same_entries,
               entities: contents.entities, modified_nucleotides: contents.modified, citation,
               cite_text: citation && citation_text(entry.pdb_id, citation),
               cite_unpublished: citation && unpublished(citation),
               cite_authors: citation?.authors.map(full_name).join(", "),
               viewer: viewer_installed });
});

app.get("/api/entries/:id/molecules", async (req, res) => {
    let entry = await find_entry(req.params.id);

    if (!entry) {
        res.status(404).json({ error: `No entry with id ${req.params.id}` });
        return;
    }

    let [contents, residues] = await Promise.all([entry_contents(entry.pdb_id), entry_residues(entry.pdb_id)]);
    res.json(molecule_groups(contents, residues));
});

app.get("/api/entries/:id/pairs", async (req, res) => {
    let entry = await find_entry(req.params.id);

    if (!entry) {
        res.status(404).json({ error: `No entry with id ${req.params.id}` });
        return;
    }

    let [contents, residues, pairs, ntc_classes, assemblies] = await Promise.all([
        entry_contents(entry.pdb_id), entry_residues(entry.pdb_id), entry_base_pairs(entry.pdb_id),
        entry_ntc_classes(entry.pdb_id), entry_assemblies(entry.pdb_id)]);
    let view = arc_views(contents.entities, residues, pairs, assemblies, String(req.query.assembly ?? ""));
    res.json(pairs_reply(pairs, view, ntc_classes));
});

export function pairs_reply(pairs, { au, arcs, ...view }, ntc_classes) {
    let { layout, ...picture } = arcs ?? {};
    return { base_pairs: base_pair_section(pairs), arc_view: { ...view, arcs: arcs ? picture : null },
             ntc: ntc_section(ntc_classes) };
}

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

async function arcs_of(id, asked) {
    let [contents, residues, pairs, assemblies] = await Promise.all([entry_contents(id), entry_residues(id),
                                                                     entry_base_pairs(id), entry_assemblies(id)]);
    let view = arc_views(contents.entities, residues, pairs, assemblies, asked);
    ARC_NUMBERS.set(id, { at: Date.now(), value: arc_summary(view.au) });
    return view;
}

const ARC_NUMBERS = new Map();
const HOUR = 3600 * 1000;

async function arc_numbers(id) {
    let kept = ARC_NUMBERS.get(id);
    if (!kept || Date.now() - kept.at > HOUR) await arcs_of(id);
    return ARC_NUMBERS.get(id).value;
}

app.get("/structure/:id/arcs.svg", async (req, res) => {
    let entry = await find_entry(req.params.id);

    if (!entry) {
        res.status(404).type("text/plain").send(`No entry with id ${req.params.id}`);
        return;
    }

    res.set("Cache-Control", "public, max-age=3600")
       .type("image/svg+xml")
       .send(arc_thumbnail((await arcs_of(entry.pdb_id)).arcs, entry.pdb_id));
});

app.get("/api/entries/:id/arcs", async (req, res) => {
    let entry = await find_entry(req.params.id);

    if (!entry) {
        res.status(404).json({ error: `No entry with id ${req.params.id}` });
        return;
    }

    let view = await arcs_of(entry.pdb_id, String(req.query.assembly ?? ""));
    res.json({ pdb_id: entry.pdb_id, title: entry.title, view: view.key,
               ...(view.arcs?.layout ?? { strands: [], pairs: [] }) });
});

app.get("/api/entries/:id/sequence_map", async (req, res) => {
    let entry = await find_entry(req.params.id);

    if (!entry) {
        res.status(404).json({ error: `No entry with id ${req.params.id}` });
        return;
    }

    let [contents, tracks, pairs] = await Promise.all([entry_contents(entry.pdb_id),
                                                       entry_sequence_tracks(entry.pdb_id),
                                                       entry_base_pairs(entry.pdb_id)]);
    let wanted = String(req.query.strands ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    let map = sequence_map(contents.entities, tracks, pairs, wanted);

    if (!map) {
        res.status(404).json({ error: `${entry.pdb_id} has no nucleic-acid chain` });
        return;
    }
    if (req.query.format === "text") {
        res.attachment(`${entry.pdb_id}_${map.shown.join("_").replaceAll(":", "-")}.lbn.txt`)
           .type("text/plain; charset=utf-8")
           .send(sequence_map_text(entry.pdb_id, map));
        return;
    }
    res.json({ pdb_id: entry.pdb_id, ...map });
});

app.get("/api/entries/:id/same_sequence", async (req, res) => {
    let entry = await find_entry(req.params.id);

    if (!entry) {
        res.status(404).json({ error: `No entry with id ${req.params.id}` });
        return;
    }
    res.json({ pdb_id: entry.pdb_id, groups: await same_sequence(entry.pdb_id) });
});

app.get("/api/same_sequence/compare", async (req, res) => {
    let [a, b] = [String(req.query.a ?? ""), String(req.query.b ?? "")];

    if (!/^[^:]+:[^:]+$/.test(a) || !/^[^:]+:[^:]+$/.test(b)) {
        res.status(400).json({ error: "Give two chains as ?a=ENTRY:CHAIN&b=ENTRY:CHAIN" });
        return;
    }
    if (a.toUpperCase() === b.toUpperCase()) {
        res.status(400).json({ error: "Pick two different chains" });
        return;
    }
    let result = await compare_same_sequence(a, b);
    if (result === null) {
        res.status(404).json({ error: `${a} or ${b} is not a nucleic-acid chain with a plain A, C, G, T, U sequence` });
        return;
    }
    if (result === false) {
        res.status(400).json({ error: `${a} and ${b} do not have the same sequence` });
        return;
    }
    res.json(result);
});

// A structures export holds 2 of the 10 database connections, the others 1,
// so 2 at a time leaves at least 6 for everyone browsing. A zip download asks
// for 4 at once and simply waits its turn; a flood is turned away.
export const export_gate = gate({
    slots: 2,
    queue_max: 20,
    wait_ms: 15000,
    message: "Too many downloads at once. Please try again in a few seconds."
});
app.use("/api/export", export_gate);

app.get("/api/export", async (req, res) => {
    let problem = query_problem(req.query);

    if (problem) {
        res.status(400).json({ error: problem });
        return;
    }

    res.json(await export_entries(req.query));
});

app.get("/api/export/molecules", async (req, res) => {
    let problem = query_problem(req.query);

    if (problem) {
        res.status(400).json({ error: problem });
        return;
    }

    res.json(await export_molecules(req.query));
});

app.get("/api/export/ligands", async (req, res) => {
    let problem = query_problem(req.query);

    if (problem) {
        res.status(400).json({ error: problem });
        return;
    }

    res.json(await export_ligands(req.query));
});

app.get("/api/export/dbn", async (req, res) => {
    let problem = query_problem(req.query);

    if (problem) {
        res.status(400).json({ error: problem });
        return;
    }

    res.json(await export_dot_brackets(req.query));
});

app.use("/api", (req, res) => {
    res.status(404).json({ error: `No such endpoint: ${req.method} ${req.originalUrl}` });
});

app.use((req, res) => send_app(res, 404));

// Four arguments mark an error handler.
app.use((err, req, res, next) => {
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

    send_app(res, status);
});

export default app;

// Only listen when run directly, so tests can import it.
if (import.meta.main) {
    const port = Number(process.env.PORT) || 4000;

    let server = app.listen(port, () => {
        console.log(`app is running on port ${port}`);
        warm_box_names();
    });

    // Node as PID 1 ignores SIGTERM unless handled.
    process.on("SIGTERM", () => {
        server.close(() => process.exit(0));
    });
}
