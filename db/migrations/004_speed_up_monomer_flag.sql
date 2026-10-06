-- A partial index over the 217 non-standard codes out of 33,146 chem_comp
-- rows, so the join has a small set to match. Kept for completeness: the real
-- fix for monomer_flag was dropping the CASE wrapper, then migration 006.

CREATE INDEX IF NOT EXISTS idx_chem_comp_nonstandard
    ON chem_comp (id) WHERE mon_nstd_flag = 'n';

ANALYZE chem_comp;
ANALYZE entity_poly_seq;
