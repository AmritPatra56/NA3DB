-- The monomer_flag filter asks, for every entry: does it contain any residue
-- that chem_comp marks non-standard? With 3.8M rows in entity_poly_seq that
-- took 748 ms, against 13-85 ms for every other filter.
--
-- The real fix was in search.js — the clause was wrapped in a CASE, which
-- forces PostgreSQL to evaluate the subquery for EVERY entry because it has
-- to produce a value to compare. A bare EXISTS stops at the first match.
-- That took it to 245 ms on its own.
--
-- This partial index holds only the non-standard codes (217 of 33,146
-- chem_comp rows) so the join has a small set to match against. It helps a
-- little and costs almost nothing.

CREATE INDEX IF NOT EXISTS idx_chem_comp_nonstandard
    ON chem_comp (id) WHERE mon_nstd_flag = 'n';

ANALYZE chem_comp;
ANALYZE entity_poly_seq;
