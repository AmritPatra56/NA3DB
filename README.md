# NA3DB

A searchable database of nucleic acid 3D structures, built on data from the
Protein Data Bank. Filter structures by demographics, 3D features and
structural components, then export the results as CSV.

Under active development. See [What is not done yet](#what-is-not-done-yet).

## Requirements

- **Node 24 or newer** — the code uses `import.meta.dirname` and `import.meta.main`
- **PostgreSQL 16 or newer**

Everything else comes from npm: Express, EJS and `pg`. Three dependencies.

## Setting it up

From nothing to a working NA3DB, in five steps.

**1. Install PostgreSQL** (Ubuntu/Debian; use your package manager elsewhere):

```bash
sudo apt install -y postgresql postgresql-client
```

**2. Create a role and a database:**

```bash
sudo -u postgres psql
```

At the `postgres=#` prompt:

```sql
CREATE ROLE na3db LOGIN PASSWORD 'pick_a_password';
CREATE DATABASE na3db OWNER na3db;
\q
```

The database must be **owned** by that role, or loading the schema fails with
`permission denied for schema public`.

*Shortcut for your own machine: name the role after your Linux username and
`psql -d na3db` will connect with no password at all. The application still
connects over TCP with a password, so set one either way.*

**3. Build the database — three files, in this order:**

```bash
psql -h localhost -U na3db -d na3db -f db/init.sql      # 39 tables
node db/make_seed.mjs                                    # writes db/seed.sql
psql -h localhost -U na3db -d na3db -f db/seed.sql      # 120 entries
psql -h localhost -U na3db -d na3db -f db/indexes.sql   # search indexes
```

| file | what it does |
| --- | --- |
| `db/init.sql` | The schema. 39 tables, 47 foreign keys. |
| `db/make_seed.mjs` | Turns `entries.json` into SQL, spread across 10 tables. |
| `db/seed.sql` | Generated. 120 entries, for development and tests. |
| `db/indexes.sql` | Indexes the search needs, plus the `pg_trgm` extension. |

**4. Tell the app how to connect:**

```bash
cp .env.example .env
```

Then edit `.env` and set `DB_USER` and `DB_PASSWORD` to what you chose.
`.env` is never committed — that is why `.env.example` exists.

**5. Run it:**

```bash
npm install
npm test          # 136 tests, about two seconds
npm run dev
```

Then open <http://localhost:4000>.

### Starting over

Nothing here is precious. To wipe the data and reload:

```bash
psql -d na3db -c "TRUNCATE entry, chem_comp CASCADE;"
psql -d na3db -f db/seed.sql
```

To wipe everything including the schema:

```bash
psql -d na3db -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
```

## Running it day to day

`npm run dev` restarts the server whenever a server file changes. `npm start`
runs it once without watching, which is what a server should do.

The port defaults to 4000. Set it in the shell or in `.env`:

```bash
PORT=5000 npm run dev
```

A value already set in the shell wins over the file, which is how a container
or a hosting platform passes real values in.

## Tests

```bash
npm test
```

**136 tests, about two seconds, no test framework installed** — `node --test`
ships with Node. They need a running PostgreSQL with the schema and seed data
loaded, because they check the real SQL rather than a pretend version of it.

| file | covers |
| --- | --- |
| `search.test.js` | Filtering, paging, validation, ordering, and that the indexes exist. |
| `server.test.js` | Routes, status codes, response formats, and which files must not be downloadable. |
| `equivalence.test.js` | 150+ filter combinations checked against the JavaScript implementation this replaced. |
| `errors.test.js` | 503 versus 500, HTML versus JSON, and that nothing leaks. |

`equivalence.test.js` is the unusual one. Instead of hand-written expected
answers, it runs every filter through **two** implementations and demands they
agree: the SQL in `search.js`, and `search.reference.mjs`, which is the
JavaScript this project used before PostgreSQL, still reading `entries.json`.

That is called differential testing, and it is what makes it possible to cover
150+ combinations rather than a dozen — including 60 generated from a fixed
seed, so any failure is reproducible. It found four bugs a hand-written suite
would have missed, among them that `%` and `_` were being treated as wildcards
in a search box documented as "contains".

`server.test.js` checks that `server.js`, `search.js`, `db.js`, `entries.json`,
`package.json`, `.env` and the raw templates all return 404. One careless
change to the `express.static` line would serve the whole project directory,
including the file holding the database password, with no error and no visible
difference.

**A green suite proves less than it looks.** Every group here was checked by
deliberately breaking the code it covers and confirming the right tests failed.
Several tests that looked fine turned out to prove nothing until that was done —
one test file was empty and still reported `pass 1`.

## How it is organised

There are four folders and one rule.

**Everything inside `public/` is downloaded by every visitor. Everything
outside it can only be read by the server.** That is why the browser's files
live in a folder of their own, and the server code, the templates and the data
do not.

Server side, at the root:

| file | job |
| --- | --- |
| `server.js` | The only file that knows about HTTP. Routes, port, static files, rendering, error handling. No filtering logic. Exports the app; only listens when run directly, so tests can import it. |
| `search.js` | Builds the SQL. Decides what matches, in what order, and which slice. Knows nothing about HTTP or the screen. |
| `db.js` | The only file that opens a database connection. A pool, one `query()` function, and the `DatabaseUnavailable` error. |
| `entries.json` | 120 PDB records. No longer read by the running app — it is the source for the seed and the yardstick for the tests. |
| `search.reference.mjs` | The JavaScript filtering this project used before SQL. Kept only so the tests can check the SQL agrees with it. |
| `*.test.js` | The tests. Outside `public/`, like everything else the browser has no business reading. |

The database, in `db/`:

| file | job |
| --- | --- |
| `init.sql` | The schema. 39 tables, 47 foreign keys, 40 indexes. |
| `make_seed.mjs` | Turns `entries.json` into SQL across 10 tables. |
| `seed.sql` | Generated by the above. Development and test data. |
| `indexes.sql` | The indexes the search needs, beyond the keys. |

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
order results come in. All of that is in `search.js`.

That rule is what made the move to PostgreSQL possible without touching the
browser at all. `search.js` was rewritten from array filtering to SQL, about
sixty lines of JavaScript were deleted, and `app.js`, `api.js`, `report.js` and
every template were left exactly as they were.

### One entry comes from seven tables

The flat shape the browser receives is assembled by the database:

| what you see | where it lives |
| --- | --- |
| `pdb_id` | `entry.id` |
| `title` | `struct.title` |
| `author` | `citation_author.name` |
| `method` | `exptl.method` |
| `resolution` | `reflns.d_resolution_high` |
| `deposition_date` | `pdbx_database_status.recvd_initial_deposition_date` |
| `entity_name` | `entity.pdbx_description` |
| `source_organism` | `entity_src_gen.pdbx_gene_src_scientific_name` |
| `polymer_type` | **computed** from every `entity_poly.type` the entry has |
| `monomer_flag` | **computed** — does any residue have `chem_comp.mon_nstd_flag = 'n'`? |
| `nonstandard_residue` | **aggregated** from `entity_poly_seq` joined to `chem_comp` |
| `confal_score` | `ndb_struct_ntc_overall` |
| `assigned_ntc` | `ndb_struct_ntc_step_summary` |

The last five are not columns anywhere. `polymer_type` in particular has to be
worked out from what the entry contains, and the order of the tests matters: a
structure with both a protein chain and a nucleic acid is `Protein/NA`, and
must be checked for that **before** it is checked for being a nucleic acid,
or every hybrid is mislabelled.

Values never reach the SQL as text. Every filter goes in as a numbered
parameter, so a visitor typing `' OR '1'='1` ends up as a harmless string:

```js
query("SELECT ... WHERE e.id ILIKE $1", ["%' OR '1'='1%"])
```

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
| `GET /api/health` | `{"ok":true,"database":"up"}`, or `503` with `"down"`. Runs `SELECT 1` — it tests the connection, never the data. |
| `GET /api/stats` | `{"total":120}`. Counted fresh on every request. |
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
unknown path under `/api` returns 404 as JSON.

Two kinds of failure are told apart, because they need different responses:

| status | means | example |
| --- | --- | --- |
| `503` | the database is unreachable or refusing work — try again | PostgreSQL restarting |
| `500` | a fault in this code | a query naming a table that does not exist |

A browser gets the styled error page for either; a request under `/api` gets
JSON. The message is always generic — the host, the port and the failing query
go to the server log, never to the client.

## Scaling

Measured, not guessed. The same queries against copies of the database at three
sizes, on a laptop:

| | 1,440 entries | 15,000 | 200,040 |
| --- | --- | --- | --- |
| one entry by id | 6 ms | 6 ms | 6 ms |
| first page, no filters | 18 ms | 46 ms | 198 ms |
| `entry_id` contains | 20 ms | 57 ms | 428 ms |
| `polymer_type` filter | 97 ms | 91 ms | 1.78 s |
| last page | 112 ms | 214 ms | 4.85 s |

**Comfortable to roughly 20,000 entries.** Past that, three things need work,
and each fix has been measured on a 200,000-entry copy:

- **The computed filters.** `polymer_type` and `monomer_flag` are worked out per
  row, so PostgreSQL has to visit every entry. Storing them as columns on
  `entry`, written once by the loader, takes the filter from **828 ms to 27 ms**.
- **Deep pagination.** `OFFSET 99990` makes the database find and discard 99,990
  rows. Keyset pagination — "the ten after `9TUA`" instead of "skip 99,990" —
  takes it from **95 ms to 0.095 ms**, at the cost of Next/Previous instead of
  numbered pages.
- **The count on every search.** Counting all matches is linear. Capping it
  ("1000+") or using PostgreSQL's estimate for large results is the usual fix.

None of those is worth doing at 1,489 entries, and all three live in
`search.js` and the schema — the browser is unaffected.

Disk is the other limit. 200,000 entries of metadata is about 450 MB, but
`atom_site` stores every atom of every structure, which is a different order of
magnitude: 200,000 structures would be roughly 200 GB.

## What is not done yet

- **Only 120 of 1,489 structures are loaded.** The database runs on the real
  39-table schema, and every query is written and tested — but 12 of the 39
  tables have rows. The 1,489 DNATCO `.cif` files are loaded by Python scripts
  that are still written for MySQL: `mysql.connector` has to become `psycopg`
  and 76 `INSERT IGNORE` statements have to become `ON CONFLICT DO NOTHING`.
  No application code changes when that happens.
- **No confal scores or NtC assignments.** Those come from DNATCO and arrive
  with the loaders above, so both filters currently match nothing. The queries
  against `ndb_struct_ntc_overall` and `ndb_struct_ntc_step_summary` are already
  written. This is expected, not a bug.
- **The detail panel calls RCSB from the browser.** Clicking a result fetches
  that structure's record from `data.rcsb.org` directly. It should come from
  this database once the citation and entity data is loaded.
- **The page number is not in the URL.** Reloading a page of results takes you
  back to page 1.
- **A structure can be viewed two ways.** The slide-out panel reads from RCSB
  and shows a few fields this database does not hold yet; `/structure/<id>`
  reads from here. Once the real data is loaded, `/structure/<id>` will show
  everything the panel does and the panel will be retired, so clicking a result
  goes straight to its page.
- **Results are drawn with `innerHTML`, unescaped.** Safe with curated PDB data,
  but it must be fixed before anything a user types is drawn on the page.
- **No 3D viewer.** Planned. It needs `Cross-Origin-Opener-Policy: same-origin`
  and `Cross-Origin-Embedder-Policy: require-corp` on every response, including
  worker scripts, so the reverse proxy in front of this app has to be able to
  set those.
- **Not deployed.** Runs locally only.
