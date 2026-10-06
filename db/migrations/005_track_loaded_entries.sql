-- The loader commits several times per CIF file, so an interruption leaves a
-- partial structure, and re-running doubles it: the tables with generated ids
-- have nothing to conflict on. A row appears here only once a file has loaded
-- completely, so an entry missing from here is partial and gets redone.

CREATE TABLE IF NOT EXISTS loaded_entries (
    entry_id  VARCHAR(20)  NOT NULL PRIMARY KEY,
    source    TEXT,
    loaded_at TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT fk_loaded_entry
        FOREIGN KEY (entry_id) REFERENCES entry(id) ON DELETE CASCADE
);

COMMENT ON TABLE loaded_entries IS
    'One row per fully loaded structure. An entry missing from here is partial.';

-- Backfill: the structures already loaded came from one uninterrupted run.
-- Filenames follow lower(id).cif, checked against all 1,489 files.
INSERT INTO loaded_entries (entry_id, source)
SELECT id, lower(id) || '.cif' FROM entry
ON CONFLICT (entry_id) DO NOTHING;
