-- A PDB id is unique ignoring case: there is no structure '4tna' that is
-- different from '4TNA'. The primary key on id does not know that, so both
-- could exist as separate rows — and find_entry, which matches on UPPER(id)
-- with LIMIT 1, would return an arbitrary one of them.
--
-- The seed cannot produce that, because it is generated from clean data. The
-- loaders reading 1,489 CIF files are a different matter: one file with an id
-- in the wrong case, or a retry inserting a variant, and the database holds
-- two rows for one structure with nothing to say so.
--
-- 002 created this index non-unique, for speed. This replaces it with a unique
-- one: the same lookup, plus a guarantee the loaders cannot break by accident.

DROP INDEX IF EXISTS idx_entry_id_upper;

CREATE UNIQUE INDEX idx_entry_id_upper ON entry (UPPER(id));
