-- The loader commits in several places while reading one CIF file — every
-- 5,000 atoms, and again partway through. So an interruption does not leave
-- nothing: it leaves a PARTIAL structure, with an entry row, some atoms, and
-- none of the NtC data.
--
-- Worse, re-running that file does not repair it. Tables with a generated id
-- (atom_site, citation_author, entity_poly_seq) have nothing to conflict on,
-- so every row goes in a second time and the structure silently doubles.
--
-- This table is the record of which entries finished. A row appears only
-- after a file has loaded completely. Anything in `entry` without a row here
-- is partial, and the loader deletes and redoes it on the next run.

CREATE TABLE IF NOT EXISTS loaded_entries (
    entry_id  VARCHAR(20)  NOT NULL PRIMARY KEY,
    source    TEXT,
    loaded_at TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT fk_loaded_entry
        FOREIGN KEY (entry_id) REFERENCES entry(id) ON DELETE CASCADE
);

COMMENT ON TABLE loaded_entries IS
    'One row per fully loaded structure. An entry missing from here is partial.';

-- Backfill. The structures already in the database were loaded in one
-- uninterrupted run, so they are complete. Filenames follow lower(id).cif,
-- which was checked against all 1,489 files.
INSERT INTO loaded_entries (entry_id, source)
SELECT id, lower(id) || '.cif' FROM entry
ON CONFLICT (entry_id) DO NOTHING;
