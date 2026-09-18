# NA3DB

A searchable database of nucleic acid 3D structures, built on data from the
Protein Data Bank. Filter structures by demographics, 3D features and
structural components, then export the results as CSV.

Under active development. See [What is not done yet](#what-is-not-done-yet).

## Requirements

Node 24 or newer. Nothing else. Express and EJS are installed by npm, the test
runner is built into Node, and there is no database to set up yet.

## Running it

```bash
npm install
npm run dev
```

Then open <http://localhost:4000>.

`npm run dev` restarts the server whenever a server file changes. Use
`npm start` to run it once without watching, which is what a server should do.

The port defaults to 4000. To change it, either set it in the shell or put it
in a `.env` file:

```bash
PORT=5000 npm run dev
```

## Tests

```bash
npm test
```

Sixty tests, no test framework installed — `node --test` ships with Node. They
run in well under a second and need no server running: `server.js` exports the
app and only calls `listen` when it is run directly, so a test can import it
and start it on a free port while `npm run dev` still holds 4000.

| file | covers |
| --- | --- |
| `search.test.js` | Lookup, filtering, paging, validation and result order. No HTTP involved. |
| `server.test.js` | Routes, status codes, response formats, and which files must not be downloadable. |

Two of those are worth their weight on their own. `search.test.js` is the
written-down specification of what filtering means — contains-matching,
case-insensitive, pills mean "any of these" within a field and "all of these"
across fields, a null confal score excludes. When that file is rewritten
against SQL, those tests are how it will be judged.

`server.test.js` checks that `server.js`, `search.js`, `entries.json`,
`package.json`, `.env` and the raw templates all return 404. A single careless
change to the `express.static` line would serve the whole project directory,
with no error and no visible difference.

A green suite proves less than it looks. Each group here was checked by
deliberately breaking the code it covers and confirming the right tests failed;
three tests that looked fine turned out to prove nothing until that was done.

`.env` is never committed. Copy `.env.example` to `.env` and edit it. A value
already set in the shell wins over the file, which is how Docker will pass real
values in later.

## How it is organised

There are three folders and one rule.

**Everything inside `public/` is downloaded by every visitor. Everything
outside it can only be read by the server.** That is why the browser's files
live in a folder of their own, and the server code, the templates and the data
do not.

Server side, at the root:

| file | job |
| --- | --- |
| `server.js` | The only file that knows about HTTP. Routes, port, static files, rendering, error handling. No filtering logic. Exports the app; only listens when run directly, so tests can import it. |
| `search.js` | Decides what matches, in what order, and which slice. Knows nothing about HTTP or the screen. |
| `entries.json` | The data. 120 entries, read and parsed once at startup. |
| `search.test.js`, `server.test.js` | The tests. Outside `public/`, like everything else the browser has no business reading. |

Page templates, in `views/`:

| file | job |
| --- | --- |
| `index.ejs` | Structure of the search page. |
| `report.ejs` | Structure of the report page. |
| `structure.ejs` | One structure's own page, at `/structure/<id>`. |
| `error.ejs` | Shown for any address that matches nothing. |
| `includes/rail.ejs` | The sidebar. Written once, included by every page. |

These are rendered by the server and only the resulting HTML is sent. The
templates themselves are never downloadable, which is why `views/` sits outside
`public/` — put it inside and `/index.ejs` would serve the source instead of
the page.

Each route tells the rail which icon to highlight by passing a `page` value, so
the one shared copy still knows where it is:

```js
res.render("report", { page: "report" });
```

Browser side, in `public/`:

| file | job |
| --- | --- |
| `style.css` | Every visual decision. |
| `shared.js` | The eleven filter names, and conversion between a query string and a filters object. Used by both pages. |
| `api.js` | The browser's only door to the server. |
| `app.js` | The search page. Reads the form, draws results, runs the detail panel. Decides nothing about the data. |
| `report.js` | The report page. Field selection and CSV building. |

There is no HTML in `public/`. The split is exact: `public/` is what the
browser downloads, `views/` is what the server builds.

`scripts/` holds the loader that generated `entries.json`. It is a development
tool, not part of the running site, and it deliberately sits outside `public/`.

The second rule follows from the first: **the browser draws, the server
decides.** The frontend does not know that a confal score is a number, that
pill filters mean "any one of these", how many rows fit on a page, or what
order results come in. All of that is in `search.js`. That is what makes
replacing `entries.json` with PostgreSQL a change to one file rather than to
the whole project.

## Pages

| address | page |
| --- | --- |
| `GET /` | Structure query. |
| `GET /report` | Report. Reads its filters from its own query string, so a link carries the search with it. |
| `GET /structure/:id` | One structure, by its PDB id. |
| anything else | The not-found page, with status 404. |

Filters travel in the query string, so `/report?entry_id=tna` reports on exactly
what `/?entry_id=tna` found. The rail links rewrite themselves to carry the
current search across.

`/structure/4TNA` is built on the server, so the whole record is in the HTML
before any script runs, and an id that does not exist returns a genuine **404**
rather than a 200 page that says "not found". That distinction matters for a
database whose links are meant to be cited: a link checker, a crawler or a
journal's reference validator only sees the status code. Ids are matched
case-insensitively, so `/structure/4tna` works too.

An unknown address under `/api` returns JSON; any other unknown address returns
the HTML page. Browsers and `api.js` each get the format they can use.

## API

Five endpoints, all returning JSON.

| endpoint | returns |
| --- | --- |
| `GET /api/health` | `{"ok":true}`. Touches no data on purpose, so it stays trustworthy when everything else is broken. |
| `GET /api/stats` | `{"total":120}`. How many entries exist. |
| `GET /api/entries` | One page of matching entries, plus the counts needed to draw pagination. |
| `GET /api/entries/:id` | One entry, by its PDB id. 404 if there is no such entry. |
| `GET /api/export` | Every matching entry, for the report. Capped at 5000 rows. |

The two are different questions, and they fail differently. `/api/entries`
narrows a list, so matching nothing is a successful `200` with an empty
`results`. `/api/entries/4TNA` names one thing, so an unknown id is a `404`.

`/api/entries` returns:

```json
{
  "results": [ ... ],
  "total": 120,
  "page": 1,
  "pages": 12,
  "page_size": 10
}
```

`/api/export` returns `results`, `total`, and `truncated`, which says whether
the cap was reached.

Both accept the same filter parameters. Anything omitted means no filtering on
that field. Any unknown parameter is ignored.

| parameter | matching |
| --- | --- |
| `entry_id` | contains, case-insensitive |
| `author_name` | contains, case-insensitive |
| `entity_name` | contains, case-insensitive |
| `source_organism` | contains, case-insensitive |
| `nonstandard_residue` | contains, case-insensitive |
| `assigned_ntc` | contains, case-insensitive |
| `confal_min`, `confal_max` | numeric range |
| `experimental_method` | one of, comma-separated |
| `polymer_type` | one of, comma-separated |
| `monomer_flag` | one of, comma-separated |
| `page` | whole number, 1 or more. `/api/entries` only. |

Examples:

```
/api/entries?entry_id=tna
/api/entries?polymer_type=Nucleic%20acid&page=2
/api/entries/4TNA
/api/export?source_organism=sacch
```

A query that cannot be answered returns 400 with a readable message, for
example an impossible score range or a page number that is not a number. An
unknown path under `/api` returns 404 as JSON. A server fault returns 500 with
a generic message, and the full detail goes to the server log rather than to
the client.

## What is not done yet

- **No database.** `entries.json` is 120 entries standing in for PostgreSQL. The
  schema and loader exist in an earlier version of this project and have not
  been connected here.
- **No confal scores or NtC assignments.** Those come from DNATCO and are not
  loaded, so both of those filters currently match nothing. This is expected,
  not a bug.
- **The detail panel calls RCSB from the browser.** Clicking a result fetches
  that structure's record from `data.rcsb.org` directly. It should be served by
  this project's own database once the data is loaded.
- **The page number is not in the URL.** Reloading a page of results takes you
  back to page 1.
- **A structure can be viewed two ways.** The slide-out panel reads from RCSB
  and shows a few fields this database does not hold yet; `/structure/<id>`
  reads from here. Once the real database is connected, `/structure/<id>` will
  show everything the panel does and the panel will be retired, so clicking a
  result goes straight to its page.
- **No 3D viewer.** Planned. It needs `Cross-Origin-Opener-Policy: same-origin`
  and `Cross-Origin-Embedder-Policy: require-corp` on every response, including
  worker scripts, so the reverse proxy in front of this app has to be able to
  set those.
- **Not deployed.** Runs locally only.
