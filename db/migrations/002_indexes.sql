-- Indexes beyond the foreign keys 001 already covers: a case-insensitive id
-- lookup and "contains" text matching, neither of which a plain btree helps.

-- find_entry compares UPPER(e.id); a functional index stores that value, so
-- the lookup seeks instead of scanning.
CREATE INDEX IF NOT EXISTS idx_entry_id_upper ON entry (UPPER(id));

-- Trigram indexes make ILIKE '%text%' fast: a btree cannot help a pattern
-- that does not start at the beginning of the value.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_entry_id_trgm
    ON entry USING gin (id gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_citation_author_name_trgm
    ON citation_author USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_entity_description_trgm
    ON entity USING gin (pdbx_description gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_src_gen_organism_trgm
    ON entity_src_gen USING gin (pdbx_gene_src_scientific_name gin_trgm_ops);

-- polymer_type and monomer_flag ask their question once per row, so each of
-- those lookups needs to be a seek.
CREATE INDEX IF NOT EXISTS idx_entity_poly_entry_type
    ON entity_poly (entry_id, type);

CREATE INDEX IF NOT EXISTS idx_poly_seq_entry_mon
    ON entity_poly_seq (entry_id, mon_id);

CREATE INDEX IF NOT EXISTS idx_chem_comp_nstd
    ON chem_comp (mon_nstd_flag, id);

ANALYZE entry;
ANALYZE entity_poly;
ANALYZE entity_poly_seq;
ANALYZE chem_comp;
ANALYZE citation_author;
ANALYZE entity;
ANALYZE entity_src_gen;
