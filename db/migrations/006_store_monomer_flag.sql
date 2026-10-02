-- "Does this entry contain a non-standard residue?" was answered per query by
-- scanning entity_poly_seq — 1,712 rows per entry, 1,489 times, hash-joined
-- against the 217 non-standard codes. 276 ms, the slowest filter on the page.
--
-- Three cheaper query shapes were tried first. ARRAY(SELECT ...), which fixed
-- the nonstandard_residue filter, made this one worse (821 ms) because 217
-- codes are not selective enough to seek on. Inverting the search and indexing
-- (mon_id, entry_id) got it to 141 ms. Neither is close to reading a column.
--
-- So the answer is stored. It is written once by the loader rather than worked
-- out on every search: 0.9 ms instead of 276 ms.
--
-- The cost is that it can go stale. db/load_cif.py sets it for every entry it
-- loads, and search.test.js checks the stored value still agrees with the
-- computed one, so a drift is a test failure rather than a silent wrong answer.

ALTER TABLE entry ADD COLUMN IF NOT EXISTS has_nonstandard_residue BOOLEAN;

COMMENT ON COLUMN entry.has_nonstandard_residue IS
    'True when any residue of this entry is chem_comp.mon_nstd_flag = n. '
    'Derived, maintained by db/load_cif.py. See db/migrations/006.';

UPDATE entry e SET has_nonstandard_residue = EXISTS (
    SELECT 1 FROM entity_poly_seq eps
    JOIN chem_comp cc ON cc.id = eps.mon_id
    WHERE eps.entry_id = e.id AND cc.mon_nstd_flag = 'n'
);

CREATE INDEX IF NOT EXISTS idx_entry_has_nonstandard
    ON entry (has_nonstandard_residue);

ANALYZE entry;
