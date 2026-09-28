-- indexes.sql - indexes the search needs, beyond the keys init.sql creates.
--
-- init.sql already indexes every foreign key, which covers the joins. These
-- cover the two things the search does that a plain btree cannot help with:
-- looking up an id case-insensitively, and "contains" text matching.
--
-- Run after init.sql:  psql -d na3db -f db/indexes.sql

-- find_entry compares UPPER(e.id), and a btree on id cannot answer that.
-- A functional index stores the uppercased value, so the lookup is a seek
-- rather than a scan of every row.
CREATE INDEX IF NOT EXISTS idx_entry_id_upper ON entry (UPPER(id));

-- Trigram indexes make ILIKE '%text%' fast. A btree is useless for a pattern
-- that does not start at the beginning of the value; a trigram index breaks
-- each value into three-character pieces and indexes those instead.
-- pg_trgm is a trusted extension, so the database owner can create it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_entry_id_trgm
    ON entry USING gin (id gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_citation_author_name_trgm
    ON citation_author USING gin (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_entity_description_trgm
    ON entity USING gin (pdbx_description gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_src_gen_organism_trgm
    ON entity_src_gen USING gin (pdbx_gene_src_scientific_name gin_trgm_ops);

-- The polymer_type and monomer_flag expressions ask "does this entry have a
-- polymer of type X" and "any non-standard residue" once per row. These make
-- each of those a seek instead of a scan.
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
