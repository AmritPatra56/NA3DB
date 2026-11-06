-- "Non-Standard" meant any modified residue, protein included, so 51 of 385
-- flagged entries had no modified nucleotide at all: 1P8K for its
-- selenomethionine (MSE), 1BF5 for a phosphotyrosine (PTR). In a nucleic acid
-- database the flag is about the DNA and RNA, so only their residues count.
--
-- Recomputes the column migration 006 stored. load_cif.py writes it the same
-- way from now on, and search.test.js checks the two still agree.

COMMENT ON COLUMN entry.has_nonstandard_residue IS
    'True when a residue of a DNA, RNA or hybrid chain of this entry is '
    'chem_comp.mon_nstd_flag = n. Derived, maintained by db/load_cif.py. '
    'See db/migrations/010.';

UPDATE entry e SET has_nonstandard_residue = EXISTS (
    SELECT 1 FROM entity_poly_seq eps
    JOIN entity_poly ep ON ep.entry_id = eps.entry_id AND ep.entity_id = eps.entity_id
    JOIN chem_comp cc ON cc.id = eps.mon_id
    WHERE eps.entry_id = e.id
      AND ep.type ILIKE '%nucleotide%'
      AND cc.mon_nstd_flag = 'n'
);

ANALYZE entry;
