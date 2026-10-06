-- "Any non-standard residue?" cost 276 ms per search, scanning 1,712 rows per
-- entry across 1,489 entries. Three cheaper query shapes were tried and the
-- best reached 141 ms, so the answer is stored instead: 0.9 ms.
--
-- A stored answer can go stale. load_cif.py sets it for every entry it loads,
-- and search.test.js checks it still agrees with the computed value.

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
