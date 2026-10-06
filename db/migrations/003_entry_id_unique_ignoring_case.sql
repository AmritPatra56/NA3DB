-- A PDB id is unique ignoring case, but the primary key does not know that, so
-- '4tna' and '4TNA' could both exist and find_entry would pick one at random.
-- 002 made this index for speed; unique makes it a guarantee the loader cannot
-- break by accident.

DROP INDEX IF EXISTS idx_entry_id_upper;

CREATE UNIQUE INDEX idx_entry_id_upper ON entry (UPPER(id));
