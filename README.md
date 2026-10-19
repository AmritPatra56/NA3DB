# NA3DB

**A search engine for the 3D shapes of DNA and RNA.**

Every entry here is a real molecule whose structure was measured in a
laboratory and published. NA3DB puts 1,489 of them behind one search box: find
them by id, molecule, author or organism, narrow by how they were measured and
what shape they take, read any one in full, and download the results as a CSV.

**1,489 structures · 50.7 million atoms · 1,487 confal scores · 97 NtC classes**

The records come from the [Protein Data Bank](https://www.rcsb.org/) and the
conformational analysis from [DNATCO](https://dnatco.datmos.org/).

Under active development. See [What is not done yet](#what-is-not-done-yet).

## What you can ask it

Type one thing in the box and it searches the id, the title, the authors, the
molecule descriptions and the source organisms at once. These are the examples
offered on the landing page, with what they find today:

| you type | you get |
| --- | --- |
| `119D` | 1 structure, by its PDB id |
| `tRNA` | 163 structures whose title or molecule mentions transfer RNA |
| `ribozyme` | 20 structures of RNA that acts as an enzyme |
| `Z-DNA` | 7 structures of the left-handed form of DNA |
| `Escherichia coli` | 86 structures taken from *E. coli* |
| `Leonard` | 2 structures deposited by an author of that name |
| `PSU` | 90 structures containing pseudouridine, a modified base |

Open the filter panel and you can be exact instead: solved by X-ray, better
than 2 Å, containing a modified residue, scoring above 80 for conformational
quality. Order the results eight ways, read any single structure in full at its
own address, and export the whole set as a CSV.

Every choice you make is in the URL, so a link carries your search, your page,
your ordering and your layout to whoever you send it to.

Nothing is behind a login, and the browser contacts no host but this one. It
runs as a single Node process in front of a single PostgreSQL database.

## Contents

- [What you can ask it](#what-you-can-ask-it)
- [The words on the screen](#the-words-on-the-screen) — confal, NtC, resolution and the rest, in plain terms
- [Requirements](#requirements)
- [Setting it up](#setting-it-up) — [quick start](#quick-start), [the real data](#loading-the-real-data), [schema changes](#changing-the-schema)
- [Two databases](#two-databases) — why `npm test` reads a different one
- [Running it day to day](#running-it-day-to-day)
- [Tests](#tests)
- [How it is organised](#how-it-is-organised) — [adding a filter](#adding-a-filter-or-a-column), [the search box](#the-one-search-box), [seven tables](#one-entry-comes-from-seven-tables)
- [Pages](#pages) — [what a result looks like](#what-a-result-looks-like), [the controls](#the-controls-over-the-results)
- [API](#api)
- [Performance](#performance) — [beyond this size](#beyond-this-size)
- [What is not done yet](#what-is-not-done-yet)

**In a hurry?** [Quick start](#quick-start) has it running in five commands.

## The words on the screen

Two sources, each with its own vocabulary. You need these seven to read a
result:

| word | what it means |
| --- | --- |
| **PDB id** | The four-character name a structure was published under, like `4TNA`. It is the permanent, citable handle for that structure. |
| **Resolution** | How much detail the measurement resolved, in ångström. **Lower is better**: 1.5 Å separates individual atoms, 3.5 Å shows little more than the overall shape. Blank for methods that do not produce one. |
| **Experimental method** | How the shape was measured. X-ray diffraction is the most common here; NMR and electron microscopy are the others you will meet often. |
| **Polymer type** | What the entry is made of: DNA, RNA, a hybrid of the two, or a nucleic acid together with a protein. Worked out from the chains it contains rather than stored as a field. |
| **Non-standard residue** | A building block that is not one of the four usual bases, nearly always a chemical modification of one. `PSU` is pseudouridine, the most common. |
| **NtC class** | A name for the shape of one step between two neighbouring residues, one of 97, such as `AA00`. It is a vocabulary of known conformations: rather than list angles, you say which shape the step matches. |
| **Confal score** | 0 to 96, how closely a whole structure's steps match those known shapes. High means conventional geometry; low means unusual, which may be a real finding or a modelling problem. |

The last two come from DNATCO, which analyses published structures and releases
the conformational assignment. Everything else is in the PDB entry itself.

## Requirements

- **Node 24 or newer**: the code uses `import.meta.dirname` and `import.meta.main`
- **PostgreSQL 16 or newer**

Everything else comes from npm: Express, EJS and `pg`. Three dependencies.

## Setting it up

### Quick start

This gets a working NA3DB with the 120-entry sample data. It needs no
structure files, so it works on a fresh clone.

```bash
# 1. PostgreSQL, and a role and two databases owned by it
sudo apt install -y postgresql postgresql-client
sudo -u postgres psql -c "CREATE ROLE na3db LOGIN PASSWORD 'pick_a_password'"
sudo -u postgres psql -c "CREATE DATABASE na3db      OWNER na3db"
sudo -u postgres psql -c "CREATE DATABASE na3db_test OWNER na3db"

# 2. Config. Edit .env and put your password in DB_PASSWORD,
#    then edit .env.test and change DB_NAME to na3db_test
cp .env.example .env
cp .env .env.test

# 3. Build the schema in both
npm install
node --env-file-if-exists=.env      db/migrate.mjs
node --env-file-if-exists=.env.test db/migrate.mjs

# 4. Load the sample data into both (psql asks for the password each time)
psql -h localhost -U na3db -d na3db      -f db/seed.sql
psql -h localhost -U na3db -d na3db_test -f db/seed.sql

# 5. Check and run
npm test
npm run dev
```

Open <http://localhost:4000>. You should see **Entries (120)**.

If `npm test` fails with `no password supplied`, `.env.test` is missing or has
no `DB_PASSWORD`. If a page is blank, check that `DB_NAME` in `.env` is `na3db`
and not `na3db_test`.

To load the real 1,489 structures instead, see
[Loading the real data](#loading-the-real-data).

### What each step is for

**The two databases are not optional.** `na3db` is what the application reads.
`na3db_test` is what `npm test` reads, and it must hold the 120-entry seed and
nothing else, because every expected number in the suite is counted from those
120. See [Two databases](#two-databases).

**The role must own both databases**, or applying the schema fails with
`permission denied for schema public`.

*On your own machine you can name the role after your Linux username, and
`psql -d na3db` will then connect with no password. The application still
connects over TCP with a password, so set one anyway.*

**The config files hold the password, so they are not committed.**
`.gitignore` has `.env*` with `!.env.example`, so the template is tracked and
nothing holding a real password is. They have to exist before step 3, because
that is where `migrate.mjs` reads the user and password from.

**The schema and the data are loaded separately.** `migrate.mjs` applies every
file in `db/migrations/` that has not run yet, each in a transaction, recording
it in `schema_migrations`. Running it twice does nothing. The data is loaded by
hand because it is data rather than structure, which is also why `db/seed.sql`
is not a migration.

| file | what it does |
| --- | --- |
| `db/migrate.mjs` | Applies any migration that has not run yet. Safe to run twice. |
| `db/migrations/*.sql` | The schema, one file per change, applied in filename order. |
| `db/seed.sql` | Committed. 120 entries across 10 tables, for development and tests. |
| `db/make_seed.mjs` | Regenerates `db/seed.sql` from `entries.json`. Only needed if `entries.json` changes. |

### Loading the real data

The 1,489 structures come from DNATCO CIF files, which are not in this
repository. With a copy of them:

```bash
python3 db/load_cif.py --cif-dir /path/to/dnatco_extended_1500
```

About 90 minutes for the full set. It reads the same `.env` the application
does, so it writes to `na3db` and never touches `na3db_test`.

Try one file first. It prints a 21-point check of what it wrote:

```bash
python3 db/load_cif.py --cif /path/to/1dn8.cif
```

**An interrupted run is repaired by running it again.** A structure is recorded
in `loaded_entries` only once its file has finished, so anything in `entry`
without a record is partial. The loader deletes and redoes those, and skips
everything already done.

That matters because re-running a file does *not* repair it on its own: the
tables with a generated id (`atom_site`, `citation_author`, `entity_poly_seq`)
have nothing to conflict on, so the rows would simply go in twice. To redo a
finished file deliberately, use `--reload`, which deletes the entry first:

```bash
python3 db/load_cif.py --reload --cif /path/to/6wlo.cif
```

Once the real data is in, reload the seed into `na3db_test` only, not into
`na3db`.

### Changing the schema

Add a file to `db/migrations/` with the next number and a name that says what
it does, then run the runner:

```bash
# db/migrations/003_widen_auth_comp_id.sql
ALTER TABLE pdbx_poly_seq_scheme ALTER COLUMN auth_comp_id TYPE VARCHAR(20);
```

```bash
node --env-file-if-exists=.env db/migrate.mjs
```

It applies only what has not run, inside a transaction, and records it in
`schema_migrations`. Running it twice does nothing.

**Never edit a migration that has already run.** It has been applied on your
machine and on the server; editing the file changes neither of those, and
leaves your repository quietly disagreeing with both databases. Migrations are
append-only, to change something, add another one.

Three digits in the number, not one: `9_x.sql` sorts after `10_x.sql`
alphabetically, and alphabetical order is how the runner decides what to do first.

### Starting over

Nothing here is precious. To wipe the data and reload:

```bash
psql -d na3db -c "TRUNCATE entry, chem_comp CASCADE;"
psql -d na3db -f db/seed.sql
```

To wipe everything including the schema, then rebuild it:

```bash
psql -d na3db -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
node --env-file-if-exists=.env db/migrate.mjs
```

That second command is why the schema lives in migrations: once real data is
loaded, wiping is no longer an option, and the only way to change the shape of
the database is to add to it.

## Two databases

```
na3db        the application    npm start · npm run dev    reads .env
             1,489 real structures from DNATCO CIF files

na3db_test   the tests          npm test                   reads .env.test
             the 120-entry seed, fixed forever
```

Same PostgreSQL server, same schema, different data. They differ in exactly one
line of configuration:

```
.env       DB_NAME=na3db
.env.test  DB_NAME=na3db_test
```

`db.js` reads `process.env.DB_NAME` and has no opinion about what is in it,
which is why no code changes to move between them, and why there is one
codebase rather than a copy of the project per environment.

**Why the split exists.** Every expected number in the test suite traces back
to the 120 seeded entries:

```js
[{}, 120]
[{ entry_id: "tna" }, 2]
[{ polymer_type: "Nucleic acid" }, 60]
```

They are a yardstick, not arbitrary values. `na3db` now holds 1,489 real
structures and almost none of the seeded 120, only two overlap, so a test
suite pointed at it would be measuring nothing. That is why the tests read a
database the loader never touches.

You can see it work. Add a row to the application's database and the suite is
unaffected; point the suite at that same database and most of it goes red:

```bash
psql -d na3db -c "INSERT INTO entry (id) VALUES ('MARKER');"
npm test                  # 149 pass, reads na3db_test
DB_NAME=na3db npm test    # 71 fail, a shell variable wins over the file
psql -d na3db -c "DELETE FROM entry WHERE id = 'MARKER';"
```

That last command is also how you run the suite against the real data
deliberately, once there is any.

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

**223 tests, about two seconds, no test framework installed**: `node --test`
ships with Node. They check the real SQL rather than a pretend version of it,
so they need a running PostgreSQL, specifically `na3db_test`, which holds the
120 seeded entries and is never touched by the loaders. See
[Two databases](#two-databases).

| file | covers |
| --- | --- |
| `search.test.js` | Filtering, paging, validation, ordering, and that the indexes exist. |
| `server.test.js` | Routes, status codes, response formats, which files must not be downloadable, that no SQL reaches `/api/fields`, and that the generated form carries a control for every filter. |
| `equivalence.test.js` | 150+ filter combinations checked against the JavaScript implementation this replaced. |
| `errors.test.js` | 503 versus 500, HTML versus JSON, and that nothing leaks. |
| `landing.test.js` | The count-as-you-type logic, run against stubbed browser globals: the debounce, the wording, and that a slow reply arriving late is thrown away. |

`equivalence.test.js` is the unusual one. Instead of hand-written expected
answers, it runs every filter through **two** implementations and demands they
agree: the SQL in `search.js`, and `search.reference.mjs`, which is the
JavaScript this project used before PostgreSQL, still reading `entries.json`.

That is called differential testing, and it is what makes it possible to cover
150+ combinations rather than a dozen, including 60 generated from a fixed
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
Several tests that looked fine turned out to prove nothing until that was done:
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
| `filters.js` | The registry. Every question the search can answer and every column it can return, as data: labels, categories, pill options, and the SQL for each. The one file a new field is added to. |
| `search.js` | The SQL engine. Turns the registry into `WHERE` clauses and `SELECT` lists, runs them, pages the results. Knows nothing about HTTP or the screen. |
| `detail.js` | The display engine. Turns one entry into the labelled rows a result card and the structure page both draw. |
| `landing.test.js` | Runs `public/landing.js` against stubbed browser globals, so the count logic is tested without a browser. |
| `db.js` | The only file that opens a database connection. A pool, one `query()` function, and the `DatabaseUnavailable` error. |
| `entries.json` | 120 PDB records. No longer read by the running app, it is the source for the seed and the yardstick for the tests. |
| `search.reference.mjs` | The JavaScript filtering this project used before SQL. Kept only so the tests can check the SQL agrees with it. |
| `*.test.js` | The tests. Outside `public/`, like everything else the browser has no business reading. |

The database, in `db/`:

| file | job |
| --- | --- |
| `migrate.mjs` | Applies any migration that has not run yet, each in a transaction, recording it in `schema_migrations`. Safe to run twice. |
| `migrations/001_init.sql` | The schema. 39 tables, 47 foreign keys, 40 indexes. |
| `migrations/002_indexes.sql` | The indexes the search needs, beyond the keys. |
| `migrations/003_entry_id_unique_ignoring_case.sql` | Makes a PDB id unique ignoring case, so `4TNA` and `4tna` cannot both exist. |
| `migrations/004_speed_up_monomer_flag.sql` | A partial index over the non-standard residue codes. |
| `migrations/005_track_loaded_entries.sql` | Records which structures finished loading, so an interrupted run can be repeated safely. |
| `migrations/006_store_monomer_flag.sql` | Stores `entry.has_nonstandard_residue` instead of working it out per query. |
| `load_cif.py` | Parses DNATCO CIF files into all 39 tables. Reads the same `.env` as the app; falls back to an embedded PostgreSQL when `DB_HOST` is unset. |
| `make_seed.mjs` | Turns `entries.json` into SQL across 10 tables. |
| `seed.sql` | Generated by the above. Test data only, deliberately **not** a migration, because it is data rather than structure. |

Page templates, in `views/`:

| file | job |
| --- | --- |
| `landing.ejs` | The landing page at `/`. A plain GET form, so the box works before any script runs. |
| `search.ejs` | Structure of the search page at `/search`. |
| `report.ejs` | Structure of the report page. |
| `structure.ejs` | One structure's own page, at `/structure/<id>`. |
| `error.ejs` | Shown for any address that matches nothing. |
| `includes/rail.ejs` | The sidebar. Written once, included by every page. |

These are rendered by the server and only the resulting HTML is sent. The
templates themselves are never downloadable, which is why `views/` sits outside
`public/`, put it inside and `/search.ejs` would serve the source instead of
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
| `shared.js` | HTML escaping, and conversion between a query string and a filters object. Takes the filter names from the registry the server injects. |
| `api.js` | The browser's only door to the server. Nothing in the browser contacts any other host. |
| `app.js` | The search page. Reads the form, draws the cards or lines, runs the layout and panel controls. Decides nothing about the data. |
| `report.js` | The report page. Field selection and CSV building. |
| `landing.js` | The count under the landing box. An addition, never a dependency: the form works without it. |

There is no HTML in `public/`. The split is exact: `public/` is what the
browser downloads, `views/` is what the server builds.

The second rule follows from the first: **the browser draws, the server
decides.** The frontend does not know that a confal score is a number, that
pill filters mean "any one of these", how many rows fit on a page, or what
order results come in. All of that is in `search.js`.

That rule is what made the move to PostgreSQL possible without touching the
browser at all. `search.js` was rewritten from array filtering to SQL, about
sixty lines of JavaScript were deleted, and `app.js`, `api.js`, `report.js` and
every template were left exactly as they were.

### Adding a filter or a column

Every searchable question and every returnable column lives in `filters.js`.
Adding one is one object in that file; nothing else is edited.

A filter object:

```js
{
    key:   "journal",              // the name in the URL and the form
    label: "Journal",              // what the reader sees
    group: "Demographics",         // which category box it sits in
    kind:  "text",                 // text, range or pills
    where: `AND EXISTS (SELECT 1 FROM citation c
                        WHERE c.entry_id = e.id AND c.journal_abbrev ILIKE ?)`
}
```

That is enough for the form to grow an input, the search to understand the
parameter, and `GET /api/fields` to advertise it. `kind` decides how the value
is read and drawn: `text` is a contains-search, `range` is one end of a pair
(joined by `pair_with`), `pills` is a set of buttons listed in `options`. A
filter whose SQL takes no parameter uses `clause`, a function returning the
finished clause, instead of `where`.

A column object:

```js
{
    key:    "journal_name",        // the SQL alias and the JSON property
    label:  "Journal",
    group:  "Citation",
    scope:  "detail",              // entry = every result, detail = one entry
    select: `(SELECT c.journal_abbrev FROM citation c
              WHERE c.entry_id = e.id AND c.id = 'primary')`
}
```

That gives a CSV column and a row on the structure page. Where a column is
displayed is one field:

```js
show: ["page", "card"]    // the structure page and a result card
show: []                  // fetched, shown nowhere
                          // absent means ["page"] alone
```

`scope` and `show` answer different questions. `scope` is about cost, which
query fetches it; `show` is about placement. `pdb_id` is `scope: "entry"` and
`show: []`: fetched with every result because the links are built from it,
displayed nowhere because the heading already says it.

`decimals`, `unit` and `thousands` format the value, and `fallback` names
another column to use when this one is empty.

**A card also shows whatever was searched on.** Three columns are not on a card
by default, so a filter can name the column that explains a match:

```js
{ key: "assigned_ntc", answered_by: "assigned_ntc", ... }
{ key: "confal_min",   answered_by: "confal_score", ... }
```

Search by NtC class and every card gains an Assigned NtC row, placed in
registry order rather than appended. Without it a search on a field the card
does not show leaves the reader taking the match on trust.

Columns and filters are two lists because they overlap without containing each
other: `title` is shown and not searched, `confal_score` has two filters
pointing at it, and three columns are named differently from their filter.

Three smaller lists live beside those two, and are reached the same way:

| list | holds |
| --- | --- |
| `GROUPS` | the category boxes, in the order they appear down the panel |
| `SORTS` | the eight orders the results can be put in |
| `MATCH_MODES` | whether the search means Contains or Excludes |
| `EXAMPLES` | the chips under the landing box, each naming a different kind of thing |

A filter marked `prominent: true` is drawn across the top of the page instead of
inside the panel. That is how the one search box gets there, and `q` is the only
filter using it today.

**The SQL never reaches the browser.** `public_registry()` picks the safe
fields by name rather than stripping the unsafe ones, so a field added later
stays on the server unless it is deliberately listed. `server.test.js` walks
every filter and every column in the response and fails if one carries a field
that is not on the allowed list, or carries `where`, `clause` or `select`.

### The one search box

`q` is a filter like any other, with a `where` that is an `OR` across five
fields: the entry id, the title, the authors, the entity descriptions and the
source organisms. Five `?` marks and one value, because `add()` replaces every
`?` with the same `$n`.

Residues are deliberately not among them. Folding `entity_poly_seq` into that
`OR` measured **348-643 ms** against **6-45 ms** without it, because the `OR`
stops PostgreSQL finishing at the cheap branches. They stay on their own filter,
which is where the `PSU` example on the landing page points.

**Punctuation is optional, in prose only.** Typing `zdna` finds `Z-DNA`,
because three of the five branches match a copy of the text with punctuation
dropped on both sides. Two branches deliberately stay literal:

| branch | matched | why |
| --- | --- | --- |
| entry id | literally | `119D` is a name, not a phrase |
| entity description | literally | these are chemical names. `11,19-DIMETHYL` normalises to `1119dimethyl`, which would then answer a search for `119D` |
| title, authors, organisms | with punctuation dropped | prose, where a hyphen is a typing choice |

**Spaces survive; only punctuation goes.** Dropping spaces as well looks like
the same idea and is not: it stops a space separating two words, so
`ATP-dependent RNA` becomes `dependentrna` and answers a search for `tRNA`.
Measured on the real data, that turned 163 tRNA hits into 209, and all 46
extras were wrong. `A DNA` colliding with `A-DNA` is the sharper case, because
both are things somebody would type. `search.test.js` pins `9IBC` and `1BDN`
against exactly that.

A search with nothing alphanumeric in it, such as `%`, still finds nothing: the
stripped value would be empty, and an empty `LIKE` pattern would match every
row, so it is replaced by one that cannot match.

### One entry comes from seven tables

The flat shape the browser receives is assembled by the database:

| what you see | where it lives |
| --- | --- |
| `pdb_id` | `entry.id`: unique ignoring case, so `4TNA` and `4tna` cannot both exist |
| `title` | `struct.title` |
| `author` | `citation_author.name` |
| `method` | `exptl.method` |
| `resolution` | `reflns.d_resolution_high` |
| `deposition_date` | `pdbx_database_status.recvd_initial_deposition_date` |
| `entity_name` | `entity.pdbx_description` |
| `source_organism` | `entity_src_gen.pdbx_gene_src_scientific_name` |
| `polymer_type` | **computed** from every `entity_poly.type` the entry has |
| `monomer_flag` | **computed**: does any residue have `chem_comp.mon_nstd_flag = 'n'`? |
| `nonstandard_residue` | **aggregated** from `entity_poly_seq` joined to `chem_comp` |
| `confal_score` | `ndb_struct_ntc_overall`: 0 to 96, absent for 2 structures |
| `assigned_ntc` | `ndb_struct_ntc_step_summary`: one of 97 classes, e.g. `AA00` |

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
| `GET /` | The landing page: one search box, a line of examples, and a link to the filters. |
| `GET /search` | Structure query: the filter panel, the results, and the controls over them. |
| `GET /report` | Report. Reads its filters from its own query string, so a link carries the search with it. Arriving with no search goes to `/search`. |
| `GET /structure/:id` | One structure, by its PDB id. |
| anything else | The not-found page, with status 404. |

`/` with a query string is a link saved before the split, so it is redirected
with a `301` to `/search` carrying the same query rather than being dropped on
the landing page.

Filters travel in the query string, so `/report?entry_id=tna` reports on exactly
what `/search?entry_id=tna` found. The rail links rewrite themselves to carry
the current search across, and the structure page, which runs no script of its
own, has them built on the server from the id it is showing.

Everything about how the results are shown travels too: the page, the order,
the layout, how many a page holds, whether the search means Contains or
Excludes.
So reloading or sharing a link lands on exactly what the sender was looking at.

A report covers a search, so the Report icon is not offered on the landing page
and `/report` turns away anything that is not one. A display parameter is not a
search: `/report?view=lines` goes to `/search` like a bare `/report` does.

**The filter panel opens by itself when it is the thing you need.** A plain
search from the box shows results alone; a search using any filter, or arriving
with no query at all, opens the panel. The `Filters` button overrides either
way, and writes its choice into the URL.

### What a result looks like

Two layouts, chosen with `Cards | Lines` and remembered in the URL. Switching
between them redraws what the browser already holds, so it makes no request:
the reply behind the current page carries every field both views need.

A **card** is the ten fields `show: [..., "card"]` names, drawn by `detail.js`
from the same registry the structure page reads, so the two cannot describe one
entry differently. Six across on a wide screen, stepping down to one as the
space narrows. The count follows the results area rather than the window,
because a media query cannot see the filter panel: with it open at 1366px the
results have 856px, and six cards there would be unreadable.

A **line** is the id, date, resolution, title and method. Clicking either opens
that structure's page.

### The controls over the results

| control | what it does |
| --- | --- |
| `Contains \| Excludes` | whether the search finds those entries or every other one. Inverts the whole search, box and filters together, so the two halves always add up to the database |
| `Show _n_ per page` | any whole number, capped at 200 |
| `Sort by` | eight orders, two each for deposition date, resolution, confal score and entry id |
| `Cards \| Lines` | the layout |
| `Filters` | the panel |

`/structure/4TNA` is built on the server, so the whole record is in the HTML
before any script runs, and an id that does not exist returns a genuine **404**
rather than a 200 page that says "not found". That distinction matters for a
database whose links are meant to be cited: a link checker, a crawler or a
journal's reference validator only sees the status code. Ids are matched
case-insensitively, so `/structure/4tna` works too.

An unknown address under `/api` returns JSON; any other unknown address returns
the HTML page. Browsers and `api.js` each get the format they can use.

## API

Seven endpoints, all returning JSON.

| endpoint | returns |
| --- | --- |
| `GET /api/health` | `{"ok":true,"database":"up"}`, or `503` with `"down"`. Runs `SELECT 1`: it tests the connection, never the data. |
| `GET /api/stats` | `{"total":1489}`. Counted fresh on every request. |
| `GET /api/fields` | The filters and columns this API understands, so a client can discover them instead of hard-coding them. Labels, categories, kinds and pill options; never the SQL. |
| `GET /api/entries` | One page of matching entries, plus the counts needed to draw pagination. Each result carries the rows its card draws. Takes `page`, `sort`, `per_page` and `match`. |
| `GET /api/count` | How many entries a search would return, and nothing else. 6-45 ms, which is what lets the landing page count as you type. |
| `GET /api/entries/:id` | One entry, by its PDB id. 404 if there is no such entry. |
| `GET /api/export` | Every matching entry, for the report. Capped at 5000 rows. Takes `sort` and `match` too, so a downloaded file matches what was on screen. |

The two are different questions, and they fail differently. `/api/entries`
narrows a list, so matching nothing is a successful `200` with an empty
`results`. `/api/entries/4TNA` names one thing, so an unknown id is a `404`.

`/api/entries` returns:

```json
{
  "results": [ ... ],
  "total": 163,
  "page": 1,
  "pages": 9,
  "page_size": 20
}
```

Each result carries its raw fields **and** the rows a card draws, never one
instead of the other: `resolution` stays the number `2.2` while `card` has it
as `"2.20 Å"`. The formatting lives in `detail.js` and cannot cross JSON, so
the finished list is built on the server rather than in the browser.

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
| `match` | `contains` or `excludes`. `excludes` inverts the whole search, so the two halves always add up to the database. Anything else is read as `contains`. |

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
| `503` | the database is unreachable or refusing work, try again | PostgreSQL restarting |
| `500` | a fault in this code | a query naming a table that does not exist |

A browser gets the styled error page for either; a request under `/api` gets
JSON. The message is always generic, the host, the port and the failing query
go to the server log, never to the client.

## Performance

Measured on the real 1,489 structures, warm:

| | |
| --- | --- |
| one entry by id | 4 ms |
| first page, no filters | 11 ms |
| `entry_id` contains | 5 ms |
| author contains | 5 ms |
| organism contains | 10 ms |
| `nonstandard_residue` | 16 ms |
| `polymer_type` | 17 ms |
| `monomer_flag` | 8 ms |
| `confal` range | 7 ms |
| `assigned_ntc` | 36 ms |
| last page (`OFFSET 1480`) | 11 ms |
| export, every row (the report page) | 1,045 ms |

Everything the search page does is under 40 ms. The export is honest work: it
genuinely builds all thirteen columns for all 1,489 rows, and nothing is
discarded.

Four things were slow when the real data landed, and each needed a different
answer. They are worth reading together, because the obvious fix was wrong
three times out of four.

**`monomer_flag`, 748 ms.** The clause was built like `polymer_type`:

```sql
AND (CASE WHEN EXISTS (...) THEN 'Non-Standard' ELSE 'Standard' END) = ANY($1)
```

Wrapping a subquery in a `CASE` forces PostgreSQL to evaluate it for *every*
row, because it has to produce a value to compare. A bare `EXISTS` stops at the
first match. That took it to 232 ms. Getting the rest meant storing the answer:
`entry.has_nonstandard_residue`, written by the loader and read as a column, at
**4 ms**. See `db/migrations/006`.

**`nonstandard_residue`, 385 ms.** The subquery joined `chem_comp`, and because
it also mentioned `e.id` the whole thing was correlated, PostgreSQL re-ran the
`chem_comp` scan once per entry. An index made it *worse*; rewriting as
`IN (...)` changed nothing. The fix was to make that part uncorrelated:

```sql
AND eps.mon_id = ANY (ARRAY(SELECT cc.id FROM chem_comp cc WHERE ...))
```

`ARRAY(SELECT ...)` mentions nothing outside itself, so it becomes an InitPlan
and runs exactly once. **16 ms.**

**The last page, 1,747 ms.** Not the `OFFSET`: that costs 1 ms on its own. The
cost was that all thirteen columns, several of them subqueries, were computed
for every row up to the offset and then thrown away. The ids are now found
first and the columns built for those ten. **11 ms**, and numbered pages are
kept, keyset pagination was not needed.

That change also exposed a correctness bug. The joins to `citation_author` and
`entity_src_gen` could return an entry more than once: 18 entries have several
`entity_src_gen` rows for entity 1, usually the same organism recorded twice.
1,489 entries were coming back as 1,512 rows while the total still said 1,489.
Both are scalar subqueries now, which can only ever return one row.

**The detail panel, 400–800 ms and sometimes nothing.** This is now history:
the panel was retired once a result card showed the same rows. It fetched each
structure from `data.rcsb.org`. It now reads this database, which is faster and
shows more, every author rather than the first, plus the confal percentile and
NtC classes that RCSB does not have.

### Beyond this size

The same queries against synthetic copies at three sizes:

| | 1,440 | 15,000 | 200,040 |
| --- | --- | --- | --- |
| one entry by id | 6 ms | 6 ms | 6 ms |
| first page | 18 ms | 46 ms | 198 ms |
| `polymer_type` | 97 ms | 91 ms | 1.78 s |
| last page | 112 ms | 214 ms | 4.85 s |

Comfortable to roughly 20,000 entries. Past that, three things need work, each
measured on a 200,000-entry copy:

- **The computed filters.** `polymer_type` and `monomer_flag` are worked out per
  row. Storing them as columns on `entry`, written once by the loader, takes a
  filter from **828 ms to 27 ms**.
- **Deep pagination**, as above.
- **The count on every search.** Counting all matches is linear. Capping it
  ("1000+") or using PostgreSQL's estimate for large results is the usual fix.

All three live in `search.js` and the schema, the browser is unaffected.

Disk: 1,489 structures occupy **9.6 GB**, of which `atom_site` is 7.6 GB. At
200,000 structures that would be roughly 200 GB, which is why the production
host needs real storage rather than a default volume.

## What is not done yet

- **Two structures have no confal score.** `2JJA` and `363D`: DNATCO produced
  no overall analysis for them. Expected, not a bug.
- **`entry.has_nonstandard_residue` is derived.** It is written by the loader
  rather than computed per query, so it could drift from the rows it came from.
  `search.test.js` checks the two still agree, which makes a drift a test
  failure rather than a wrong answer.
- **No automated backups.** `pg_dump -Fc` takes about four minutes and produces
  1.2 GB from a 9.6 GB database. Nothing runs it on a schedule yet, and no
  restore has been tested.
- **`public/app.js` is 470 lines doing six jobs**, reading the form, drawing
  the cards or lines, pagination, the layout and panel controls, and history.
  It works, and it is the next file that will want splitting.
- **Searching cannot reach residues.** `nonstandard_residue` has its own filter,
  but folding `entity_poly_seq` into the search box's `OR` measured 348-643 ms
  against 6-45 without it, so the box leaves them alone.
- **Some entity names have a space missing.** `DNA-directedRNA polymerase`
  appears in 47 rows, so a search for the spaced form misses them. It is in the
  source data rather than the loader, but it is worth a look.
- **No 3D viewer.** Planned, and the atom coordinates are loaded. It needs
  `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp` on every response, including
  worker scripts, so the reverse proxy has to be able to set those.
- **Not deployed.** Runs locally only.
