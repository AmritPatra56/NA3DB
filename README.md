# NA3DB

**A search engine for the 3D structures of DNA and RNA.** Live at **[na3db.org](https://na3db.org)**.

Every entry is a real molecule whose structure was measured in a lab and
published. NA3DB puts 1,489 of them behind one search box, so you can:

- **find** them by id, molecule, author, organism or ligand
- **narrow** them by how they were measured and what shape they take
- **see** every base pair at a glance, drawn as arcs
- **read** any one in full, compare chains with the same sequence, and **download** the data

**1,489 structures · 50.7 million atoms · 1,487 confal scores · 96 NtC classes**

The records come from the [Protein Data Bank](https://www.rcsb.org/), the
backbone analysis from [DNATCO](https://dnatco.datmos.org/).

## Contents

**Using the website**

1. [Search in one minute](#1-search-in-one-minute)
2. [Step by step](#2-step-by-step)
3. [The structure page](#3-the-structure-page)
4. [Reading the pictures](#4-reading-the-pictures): arcs, the sequence map, the conformation colours
5. [The words on the screen](#5-the-words-on-the-screen)
6. [Getting the data out](#6-getting-the-data-out)

**Running your own copy**

7. [Set it up in five commands](#7-set-it-up-in-five-commands)
8. [Day to day](#8-day-to-day): run, test, load the real data, change the schema
9. [Shipping to na3db.org](#9-shipping-to-na3dborg)

**How it works inside**

10. [Where everything lives](#10-where-everything-lives)
11. [Adding a filter or a column](#11-adding-a-filter-or-a-column)
12. [The search box](#12-the-search-box)
13. [API reference](#13-api-reference)
14. [Speed](#14-speed)
15. [Not done yet](#15-not-done-yet)

---

# Using the website

## 1. Search in one minute

Type one thing in the box. It looks in the id, title, authors, molecule
names, source organisms and modified nucleotides all at once.

| you type | you get |
| --- | --- |
| `119D` | 1 structure, by its PDB id |
| `tRNA` | 163 structures of transfer RNA |
| `ribozyme` | 20 structures of RNA that acts as an enzyme |
| `Z-DNA` | 7 structures of left-handed DNA |
| `Escherichia coli` | 191 structures from *E. coli* |
| `Leonard` | 2 structures by an author of that name |
| `PSU` | 90 structures containing pseudouridine |

The **Ligand** box in the filters finds what is bound: `SAM` gives 10
structures, `MG` gives 507 with a magnesium ion.

Three things to know:

- **Capitals never matter.**
- **Punctuation is optional:** `zdna` finds `Z-DNA`.
- **It finds text inside words:** `tRNA` also finds `tRNApro`.
- **Quotes ask for an exact phrase:** `"yeast tRNA"`.
- **A typo is not corrected silently:** `ribozime` finds nothing and offers
  `ribozyme (20)` as a link.

Below the box on the front page, five **Browse** cards ask simple questions
(what is it made of, how was it measured, which organism...). Each row has
`Yes` and `No` buttons and a count, so you can build a search without typing.

No login and no tracking. Nothing is loaded from another site until you open
the 3D view.

## 2. Step by step

Works the same on a laptop and a phone.

1. **Search.** Type in the box. The number under it tells you how many
   structures match before you press `Search`.
2. **Narrow it down.** Press `Filters`: method, polymer type, organism,
   ligand, confal score and more. The button at the bottom says how many you
   will get (`Show 50 results`), so you never land on an empty page.
   `Contains | Excludes` next to the box turns the whole search round.
3. **See what is on.** Each filter in use is a chip above the results, like
   `Experimental method: X-ray ×`. Press `×` to drop it.
4. **Pick a view** at the top: `Grid` (small tiles), `Cards` (the facts, the
   default) or `Lines` (one row each). Change the order with `Sort`. The empty
   frame on each card and tile is kept for a picture of the 3D structure.
   `Best match` is the default order: whole-word and whole-phrase matches first.
5. **Open a structure.** Press anywhere on a card, tile or line. The arc picture
   of its base pairs, with a full-screen view, is on the structure page. See [The structure page](#3-the-structure-page).
6. **Share it.** Copy the address. Your search, filters, order, page and view
   are all in the link, so whoever opens it sees exactly what you saw.

## 3. The structure page

`/structure/1B23` holds everything about one entry, in four coloured groups.

| group | section | what is there |
| --- | --- | --- |
| Overview | Overview | title, method, date, resolution, authors, sizes |
| Composition | Molecules | each polymer, its chains and sequence, a copy button and a `FASTA` download |
| | Sources | where each molecule came from: Natural, Expressed or Synthetic |
| | Modified nucleotides | each code, its name, chain and positions |
| | Ligands | each small molecule, linked to its RCSB page |
| Structure | Base pairs | the arc picture, counts by kind, the pair families, a `CSV` download |
| | Conformation | confal score and percentile, and every NtC step grouped by shape, each colour named |
| | Sequence map | sequence, backbone shape and every base pair on one ruler |
| | Same sequence | every other chain in NA3DB with exactly this sequence, and a side-by-side comparison |
| References | Citations | the primary paper, with DOI and PubMed links, and `Save reference` (RIS or BibTeX) |
| | Links and downloads | RCSB, FASTA, base pairs as CSV, the report, the entry as JSON |

- **The sidebar** lists the sections and marks the one you are reading. On a
  phone it becomes a row of chips under the top bar.
- **Every section has its own link**, like `/structure/1B23#base-pairs`, to put
  in a paper or an email.
- **An empty section stays in the list, greyed out.** "None recorded" is a
  fact about the entry too.
- **On each section's band**, `?` explains the terms and the chevron folds it.

## 4. Reading the pictures

### Arc picture

The molecule is a straight line, 5′ on the left, 3′ on the right. Each base
pair is an arc joining its two bases.

| you see | it means |
| --- | --- |
| green arc | cWW Watson–Crick pair (A–U or A–T, G–C) |
| orange arc | cWW G–U wobble |
| purple arc | any other pair (Others) |
| nested arcs | a stem: bases pairing in a row |
| crossing arcs | a pseudoknot or a long-range contact |
| dark dot on the line | a modified nucleotide |
| gap in the line | a new strand, named under it |

Full screen adds every pair in a list, a chip per family (press `tWH` to see
only those), a plain-words line for the pair under your pointer, and zoom.
Close enough, the letters appear.

### Sequence map

One ruler, one column per nucleotide. From top to bottom:

1. **Bars:** the backbone shape (NtC step) to the next nucleotide. Colour is
   the shape, height is the confal score.
2. **seq:** the sequence. Lower case is a modified nucleotide.
3. **Bracket rows:** the base pairs, **one row per Leontis–Westhof family**.

```
seq   G C U G A c G U A A C A G C
WC    ( ( ( . . . . . . . . ) ) )     G–C and A–U
cWW   . . . ( . . . ) . . . . . .     other cis Watson–Crick, here a G·U wobble
tHS   . . . . ( . [ . . ) . ] . .     [ ] crosses ( )
tHS   . . . . . . . . . ( . . . )     A10's second tHS pair, so a second row
```

How to read it:

- **The row name** is c or t (cis or trans), then the edge of the left
  nucleotide, then the edge of the right one: **W** Watson–Crick,
  **H** Hoogsteen, **S** sugar. So `tHS` is a trans pair, Hoogsteen edge on
  the left, sugar edge on the right.
- **Order of rows:** `WC` first (canonical G–C and A–U), then `cWW` (other cis
  Watson–Crick pairs, such as G·U), then the other families. A family with no
  pairs in the entry gets no row.
- **`(` and its matching `)`** are the two nucleotides of one pair.
- **A pair that crosses another** in the same row takes `[ ]`, then `{ }`, then `< >`.
- **A nucleotide pairs once per row.** A second pair of the same family goes
  to an extra row of that name at the bottom, its name in italics.
- **A dot** means no pair of that kind. In the downloaded text, `&` separates strands.

The page has the same guide under **How to read the map**, with a picture.

### Conformation colours

Every step between two neighbouring nucleotides gets an NtC class (like
`AA00`), and every NtC class belongs to one of 15 shape groups (CANA). The
colours are DNATCO's, as https://dnatco.datmos.org draws them, so a figure
means the same here as there (`public/cana.js`).

- **Colour is the conformer class:** yellow A-form, pale blue B-form, deep
  blue BII, cyan minor B, green Z-form, magenta intercalated, red opened,
  orange syn, light grey no class.
- **Two halves** mark a transition, read 5′ to 3′ (`A-B` is A then B).
- **An empty box** is a step with no class.

The Conformation section lists the steps by family, each colour with its
name, and the full key is under **How the colours work**. Class meanings follow
[Černý et al. 2020](https://doi.org/10.1093/nar/gkaa383).

### Same sequence

Every chain in NA3DB with exactly this sequence, letter for letter (plain A,
C, G, T or U only). Pick any two to compare their base pairs, the backbone
shape of each step and the chemistry of each nucleotide, position by
position. A nucleotide one of them does not model is never counted as a
difference.

## 5. The words on the screen

| word | what it means |
| --- | --- |
| **PDB id** | The four-character name a structure was published under, like `1B23`. Permanent and citable. |
| **Resolution** | How much detail was measured, in ångström. **Lower is better**: 1.5 Å shows single atoms, 3.5 Å little more than the shape. |
| **Experimental method** | How the shape was measured: X-ray diffraction, NMR or electron microscopy. |
| **Polymer type** | What the entry is made of: `DNA`, `RNA`, `DNA/RNA`, or one of those with a protein, such as `Protein/RNA`. |
| **Modified nucleotide** | A building block that is not one of the usual bases, nearly always a chemical change to one. `PSU` (pseudouridine) is the most common. |
| **Ligand** | A small molecule bound to the structure: an ion (`MG`), a cofactor (`SAM`) or a drug. Water is left out. |
| **Base pair** | Two bases held together by hydrogen bonds. |
| **Leontis–Westhof family** | How two bases pair: which edge of each touches (**W**atson–Crick, **H**oogsteen, **S**ugar) and whether it is **c**is or **t**rans. `cWW` is the classic pair. Twelve families in all. |
| **NtC class** | The shape of one step between two neighbouring nucleotides, one of 96, such as `AA00`. From DNATCO. |
| **CANA class** | A group of similar NtC classes, one of 15, such as `AAA` (A-form). Each has its own colour. |
| **Confal score** | 0 to 100, how closely the steps match known shapes. High means usual geometry; low means unusual, a real finding or a modelling problem. |
| **FASTA** | The standard text format for sequences. Any sequence tool reads it. |

## 6. Getting the data out

| what | where |
| --- | --- |
| sequences | `FASTA` button, for one molecule or the whole entry |
| base pairs | `CSV` button in Base pairs |
| sequence map | `Download notation` in Sequence map |
| a reference | `Save reference` in Citations: RIS (EndNote, Zotero, Mendeley) or BibTeX |
| a list of results | the Report icon: pick your fields, then `Download CSV` for one table (Structures, Molecules, Ligands) or `Download all (ZIP)`, which adds the base pairs as dot-bracket |
| anything, by script | the [API](#13-api-reference) |

From Python:

```python
import pandas as pd
pairs = pd.read_csv("https://na3db.org/api/entries/119D/base_pairs?format=csv")
```

---

# Running your own copy

## 7. Set it up in five commands

You need **Node 24+** and **PostgreSQL 16+**. Everything else comes from npm
(Express and `pg`, and React and Vite for the pages).

This gives a working copy with 120 sample entries. No structure files needed.

```bash
# 1. PostgreSQL, one role, two databases it owns
sudo apt install -y postgresql postgresql-client
sudo -u postgres psql -c "CREATE ROLE na3db LOGIN PASSWORD 'pick_a_password'"
sudo -u postgres psql -c "CREATE DATABASE na3db      OWNER na3db"
sudo -u postgres psql -c "CREATE DATABASE na3db_test OWNER na3db"

# 2. Config: put your password in .env as DB_PASSWORD,
#    then in .env.test set DB_NAME=na3db_test
cp .env.example .env
cp .env .env.test

# 3. Build the tables in both
npm install
node --env-file-if-exists=.env      db/migrate.mjs
node --env-file-if-exists=.env.test db/migrate.mjs

# 4. Load the sample data into both
psql -h localhost -U na3db -d na3db      -f db/seed.sql
psql -h localhost -U na3db -d na3db_test -f db/seed.sql

# 5. Build the pages, test, then run
(cd client && npm install && npm run build)
npm test
(cd client && npm test)
npm run dev
```

Open <http://localhost:4000>. You should see **Entries (120)**.

**If something goes wrong:**

| you see | fix |
| --- | --- |
| `npm test` says `no password supplied` | `.env.test` is missing or has no `DB_PASSWORD` |
| `permission denied for schema public` | the role does not own the database (step 1) |
| the server stops with `client/dist/index.html` missing | build the pages first: `cd client && npm run build` |
| a blank page | `DB_NAME` in `.env` must be `na3db`, not `na3db_test` |
| filters work but the search box finds nothing | the search index is stale: `psql -d na3db -c "REFRESH MATERIALIZED VIEW doc"` |

`.env` and `.env.test` hold the password, so git ignores them. Only
`.env.example` is committed.

### Why two databases

```
na3db        the website    npm run dev / npm start   reads .env       the real data
na3db_test   the tests      npm test                  reads .env.test  the 120 sample entries, never changed
```

Every number the tests expect is counted from those 120 entries. Point the
tests at the real data and most of them fail, because they would be
measuring something else. The two files differ in one line, `DB_NAME`.

### A read-only account for the website

The website only ever reads. On na3db.org it logs in as `na3db_web`, an
account that can read every table and change nothing, so a bug or an attack
through a page cannot alter or delete data. The loader and `db/migrate.mjs`
keep using the owner account.

```bash
# once per database, as a superuser (creating a role needs one)
sudo -u postgres psql -d na3db < db/web_role.sql
sudo -u postgres psql -d na3db -c '\password na3db_web'
```

Then set `DB_USER=na3db_web` and its `DB_PASSWORD` for the website only.
Tables added by later migrations are readable without running it again.
`db/web_role.test.js` checks the account reads everything and writes nothing;
it runs when `.env.test` also has `WEB_DB_USER` and `WEB_DB_PASSWORD`, and is
skipped otherwise.

## 8. Day to day

**Run.** `npm run dev` restarts the server on every change; `npm start` runs
it once. Port 4000 by default, or `PORT=5000 npm run dev`. A value set in the
shell wins over `.env`.

**Work on the pages.** Express serves the built pages from `client/dist`, so
after a change in `client/` either rebuild (`cd client && npm run build`) or
run Vite beside the server for live reload:

```bash
npm run dev                  # Express on :4000
cd client && npm run dev     # Vite on :5173, forwards /api and the files to :4000
```

Open <http://localhost:5173>. `API_TARGET=http://localhost:4001 npm run dev`
points Vite at another server.

**Test.** Two suites, both against real code, no mocks of the database:

```bash
npm test                     # server: 656 tests on na3db_test, about twenty seconds
cd client && npm test        # pages: 101 Vitest tests, no database
cd client && npm run lint    # ESLint
```

| file | checks |
| --- | --- |
| `search.test.js` | filtering, paging, ordering, validation, indexes |
| `server.test.js` | every route, status codes, formats, private files stay private |
| `contents.test.js` | what each section of the structure page shows, the NtC grouping |
| `equivalence.test.js` | 150+ filter combinations, checked against an older independent implementation |
| `errors.test.js` | 503 vs 500, HTML vs JSON, nothing leaks |
| `arcs.test.js`, `assembly.test.js` | the arc picture and biological assemblies |
| `seqmap.test.js`, `sameseq.test.js` | the sequence map and the chain comparison |
| `suggest.test.js`, `taxonomy.test.js` | "Did you mean", suggestions, organism names |
| `report.test.js`, `zip.test.js` | the report tables and the ZIP |
| `theme.test.js`, `arrow.test.js` | both dark-theme blocks agree, one arrow everywhere |
| `client/test/` | the React helpers, hooks and pages |

**Load the real data.** The 1,489 structures come from DNATCO CIF files, which
are not in this repository.

```bash
python3 db/load_cif.py --backup backups --cif /path/to/1dn8.cif            # one file first, prints a check
python3 db/load_cif.py --backup backups --cif-dir /path/to/dnatco_files    # all of them, about 90 minutes
python3 db/load_cif.py --backup backups --reload --cif /path/to/6wlo.cif   # redo one finished file
```

It writes to `na3db` only, never `na3db_test`. **It dumps the database into
the `--backup` folder before it changes anything**, and does not start if the
dump fails; to undo a whole load, restore that dump. `--no-backup` skips it,
for scratch databases only.

**The site stays usable while it runs.** Each structure is saved in one go,
together with its "finished" mark: visitors see a structure complete or not
at all, and with `--reload` they keep seeing the old version until the new
one is in. A run that stops leaves no half structure; run it again and
finished files are skipped. Use `--reload` to redo a finished file on purpose;
running it plain would add its rows twice. `db/test_load_safety.py` checks
all of this against the test database
(`python3 -m unittest db/test_load_safety.py`).

After a load that brings new entries, refresh the files built from the data:

```bash
node --env-file=.env db/fetch_taxonomy.mjs     # taxonomy.json: organism names from NCBI
node --env-file=.env db/fetch_citations.mjs    # caches papers from RCSB, Crossref, PubMed
node --env-file=.env db/build_citations.mjs    # citations.json: one checked reference per entry
```

**Change the schema.** Add the next numbered file to `db/migrations/`, like
`017_what_it_does.sql`, then run:

```bash
node --env-file-if-exists=.env db/migrate.mjs
```

It applies only what has not run yet, each in a transaction. **Never edit a
migration that has already run**: the databases will not see the edit. Add a
new one instead.

## 9. Shipping to na3db.org

1. Commit on the feature branch, fast-forward `main` to it, push both.
2. On the server, run:

   ```bash
   /opt/na3db/main/app/deploy/update.sh
   ```

   It pulls `main`, builds a new image (the React pages are built inside it),
   restarts the app and checks `/api/health`. The database is not touched. If
   the new version does not answer, it prints the two commands that bring the
   previous one back.

| file | what it does |
| --- | --- |
| `deploy/update.sh` | the update above |
| `deploy/backup.sh` | a nightly database dump, keeping the last 7 days |
| `deploy/na3db.org.nginx` | the web server in front of the app |
| `Containerfile` | how the app image is built: the pages first, then the server |

Passwords live only on the server, never in git.

### The 3D viewer

The **3D** view frames our own viewer: the Moorhen pane of the NAPAIR browser
(`BASEPAIRING_WEB/napair_browser`). It downloads the entry from RCSB and
annotates every base pair in WebAssembly, in the reader's tab. A build is
117 MB, so it is not in this repository.

```bash
cd ../napair_browser
npm install && npm run build          # writes dist/
rm -rf ../na3db-react/viewer          # a rebuild cannot empty a live one
cp -R dist ../na3db-react/viewer
```

`viewer/` is gitignored but goes into the image, so shipping it is the
ordinary `deploy/update.sh`. Or set `VIEWER_DIR=/path/to/napair_browser/dist`
to use a build where it is.

- **Found once, at boot.** With no build, the 3D view says the viewer is not
  installed. Install one and restart.
- **Every page is cross-origin isolated** (`Cross-Origin-Opener-Policy:
  same-origin`, `Cross-Origin-Embedder-Policy: require-corp`). Moorhen needs
  `SharedArrayBuffer`, which only an isolated page gets, and React moves to a
  structure without a new page load. So **an image, script or font from
  another site cannot be added** unless it sends CORP or CORS headers.
- **The frame loads only when a reader asks for 3D**, never on its own.

---

# How it works inside

## 10. Where everything lives

**The server decides, the browser draws.** What counts as a match, the order,
the page size and every formatted value are worked out on the server; React
only shows what `/api` sends. Every page address returns the same
`client/dist/index.html`, and React Router picks the page.

**Server**, at the root:

| file | job |
| --- | --- |
| `server.js` | every route. The only file that knows about HTTP. |
| `filters.js` | every filter, column and sort, as data. The one file a new field goes in. |
| `search.js` | turns filters into SQL, runs it, pages the results |
| `detail.js` | turns one entry into what the pages show: rows, arcs, the sequence map, the NtC groups |
| `suggest.js` | "Did you mean" and the suggestions under the search box |
| `taxonomy.js` | which organisms a typed name means (`mouse` is *Mus musculus*), from `taxonomy.json` |
| `sameseq.js` | compares two chains with the same sequence |
| `cite.js` | the citation as RIS and BibTeX |
| `help_texts.js` | the wording of every `?` note. Edit text here. |
| `db.js` | the only file that opens a database connection |
| `citations.json`, `taxonomy.json` | built from the data by the scripts in `db/` (section 8) |
| `entries.json`, `search.reference.mjs` | the old 120-entry data and the old search, kept only so the tests can check the SQL agrees |

**Database**, in `db/`:

| file | job |
| --- | --- |
| `migrations/*.sql` | the schema, one file per change, applied in number order (001 to 016) |
| `migrate.mjs` | applies what has not run yet. Safe to run twice. |
| `load_cif.py` | reads DNATCO CIF files into the tables |
| `backfill_assemblies.py` | fills the assembly tables for entries loaded before migration 016 |
| `fetch_taxonomy.mjs`, `fetch_citations.mjs`, `build_citations.mjs` | build `taxonomy.json` and `citations.json` |
| `seed.sql` | the 120 sample entries, for development and tests. Made by `make_seed.mjs`. |

**Pages**, in `client/` (React 19, built by Vite into `client/dist`):

| file | job |
| --- | --- |
| `index.html` | the one page: sets the saved theme before it paints, then loads the app |
| `src/routes.jsx` | which page draws which address: `/`, `/search`, `/report`, `/structure/:id` |
| `src/components/` | the pages and their parts, one component per file |
| `src/hooks/` | state and effects: fetching (`useApi`), folds, the reading position, the 3D choice |
| `src/*.js` | plain helpers with no React in them, tested in `client/test/` |

**Static files**, in `public/`, served as they are:

| file | job |
| --- | --- |
| `style.css` | every visual decision, both themes |
| `assets/` | fonts, icons, the favicon |
| `cana.js` | the 15 CANA colours and names, shared by the server and the pages |

**The 3D viewer**, in `viewer/`: a build of the NAPAIR browser, gitignored and
installed by hand (section 9). Served at `/viewer/`.

## 11. Adding a filter or a column

One object in `filters.js`. Nothing else changes: the form grows an input,
the search understands it, the API lists it.

A filter:

```js
{
    key:   "journal",              // its name in the URL
    label: "Journal",              // what the reader sees
    group: "Demographics",         // which box it sits in
    kind:  "text",                 // text, number, range or pills
    where: `AND EXISTS (SELECT 1 FROM citation c
                        WHERE c.entry_id = e.id AND c.journal_abbrev ILIKE ?)`
}
```

A column:

```js
{
    key:    "journal_name",
    label:  "Journal",
    group:  "Citation",
    scope:  "detail",              // entry = fetched with every result, detail = one entry only
    show:   ["page", "card"],      // where it appears; [] = nowhere, absent = page only
    select: `(SELECT c.journal_abbrev FROM citation c
              WHERE c.entry_id = e.id AND c.id = 'primary')`
}
```

**The SQL never reaches the browser.** The API sends only fields picked by
name, and a test fails if `where`, `clause` or `select` ever leaks.

Values never enter the SQL as text: every one is a numbered parameter, so
typing `' OR '1'='1` just searches for that string.

## 12. The search box

All searchable text sits in one materialized view, `doc`, one row per entry,
with trigram indexes. That took the box from 28 ms to 7 ms.

- **Every word must match**, in any order. Quotes keep a phrase whole.
- **Best match** ranks a whole phrase and whole words above parts of words,
  so `TAR` lists HIV TAR before "target".
- **Each field is kept apart by a newline**, so `rna hall` cannot match a title
  ending in RNA plus an author named Hall.
- **Only punctuation is dropped, never spaces.** Dropping spaces turned
  `ATP-dependent RNA` into a false hit for `tRNA`.
- **The id and molecule names stay literal**, because punctuation means
  something there (`11,19-DIMETHYL` must not match `119D`).
- **Names are read as the PDB stores them:** `Jiri Sponer` also finds
  `Sponer, J.`, and the page says so.
- **Organisms by any name:** `mouse`, `E. coli` and `human` find their taxa
  and every strain under them (`taxonomy.js`).
- **Nothing found** offers up to three close spellings that do find
  something, each with its count (`suggest.js`). Nothing is changed silently.

`doc` is a copy, so it must be rebuilt after loading data. `seed.sql` and
`load_cif.py` both do it; if it is ever stale, `npm test` fails and prints the
command.

## 13. API reference

All JSON unless noted. Filters go in the query string, the same as on the website.

**Searching**

| endpoint | returns |
| --- | --- |
| `GET /api/health` | `{"ok":true,"database":"up"}`, or `503` |
| `GET /api/stats` | `{"total":1489,"updated":...}` |
| `GET /api/fields` | every filter, column and sort the API understands (never the SQL) |
| `GET /api/count` | how many entries a search finds |
| `GET /api/entries` | one page of results. Takes `page`, `sort`, `per_page`, `match`. A search that finds nothing adds `suggestions` |
| `GET /api/pill_counts` | how many entries each pill option finds |
| `GET /api/browse` | the front page's Browse cards with their counts |
| `GET /api/box_suggestions?q=` | names to offer under the search box as you type |
| `GET /api/ligands`, `/api/nonstandard_residues`, `/api/source_organisms`, `/api/expression_hosts` | what each filter box can suggest, with counts |
| `GET /api/help` | the `?` notes |

**One entry**

| endpoint | returns |
| --- | --- |
| `GET /api/entries/:id` | the entry and its display rows, or `404` |
| `GET /api/entries/:id/molecules` | the Molecules, Modified nucleotides and Ligands tables |
| `GET /api/entries/:id/pairs` | the Base pairs section and its arc picture. `?assembly=` picks a view |
| `GET /api/entries/:id/base_pairs` | every base pair of the first model. `?format=csv` for a file |
| `GET /api/entries/:id/arcs` | the arc layout, for the full-screen viewer |
| `GET /api/entries/:id/sequence_map` | the sequence map. `?format=text` for the dot-bracket file |
| `GET /api/entries/:id/same_sequence` | the chains sharing a sequence with this entry |
| `GET /api/same_sequence/compare?a=&b=` | two chains compared, each given as `ENTRY:CHAIN` |
| `GET /structure/:id/arcs.svg` | the small arc picture, as SVG |
| `GET /structure/:id/fasta` | FASTA of every molecule. `?only=na` for nucleic acids only |
| `GET /structure/:id/fasta/:entity` | FASTA of one molecule |
| `GET /structure/:id/citation?format=ris` | the primary citation, `ris` or `bib` |

**The report**, same filters as a search

| endpoint | returns |
| --- | --- |
| `GET /api/export` | every matching structure, up to 5,000 |
| `GET /api/export/molecules` | their molecules. `?proteins=1` adds proteins |
| `GET /api/export/ligands` | their ligands. `?water=1` adds water |
| `GET /api/export/dbn` | their base pairs as dot-bracket |

Filter parameters:

| parameter | matches |
| --- | --- |
| `q` | the one search box |
| `entry_id`, `author_name`, `entity_name`, `source_organism`, `nonstandard_residue`, `expression_host`, `assigned_ntc` | contains, any case |
| `ligand` | the exact code (`SAM`), or 3+ letters of the name |
| `taxonomy_id` | exact number |
| `confal_min`, `confal_max`, `resolution_min`, `resolution_max` | a range |
| `experimental_method`, `polymer_type`, `monomer_flag`, `source_kind`, `modification`, `has_ligand`, `has_water`, `synthetic` | one of, comma-separated |
| `not_<key>` | the opposite of that one filter |
| `match` | `contains` (default) or `excludes`, which flips the whole search |

Examples:

```
/api/entries?q=tRNA
/api/entries?polymer_type=RNA&page=2
/api/entries/1B23
/api/entries?ligand=SAM
/api/entries/119D/base_pairs?format=csv
/structure/119D/fasta?only=na
```

Searching for a list and finding nothing is a `200` with no results. Asking
for one entry that does not exist is a `404`. A question that makes no sense
(an impossible range) is a `400`. The database being down is a `503`; a bug
here is a `500`. Error messages never show the host, port or query.

## 14. Speed

On the real 1,489 structures, warm:

| | |
| --- | --- |
| one entry by id | 4 ms |
| first page | 11 ms |
| any single filter | 5 to 36 ms |
| last page | 11 ms |
| export, every row | about 1 s |

Comfortable up to about 20,000 entries. Past that, three things need work:
store `polymer_type` as a column, page by key instead of offset, and cap the
total count. All three are in `search.js` and the schema; the browser would
not change.

The database takes 9.6 GB, 7.6 GB of it atom coordinates.

## 15. Not done yet

- **Two structures have no confal score** (`2JJA`, `363D`). DNATCO gave none. Expected.
- **Some molecule names miss a space** (`DNA-directedRNA polymerase`, 47 rows),
  as in the source data.
- **The 3D view fetches its own coordinates.** The viewer downloads the entry
  from RCSB and annotates it in WebAssembly, so it ignores the 7.6 GB of
  atoms in our own database. A precalculated library served from here would
  save both the download and the compute.
- **The 3D viewer is light only**, so it stays white inside a dark page.
- **The card pictures are empty frames**, kept for a snapshot of the 3D structure.
