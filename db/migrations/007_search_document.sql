-- One row per entry, holding all of its searchable text.
--
-- The text a visitor searches is spread over five tables, so the search box
-- was five correlated subqueries, one per field, run for every entry. This
-- gathers them once. Residues are the reason it is worth doing: they live in
-- entity_poly_seq, 3.8 million rows, which cost 1,708 ms to search and were
-- left out of the box entirely.
--
-- A materialized view rather than columns on entry, so the loader does not
-- have to remember to fill anything in. It is rebuilt with
--     REFRESH MATERIALIZED VIEW CONCURRENTLY doc;
-- which needs the unique index below, and keeps the old copy readable while
-- it runs.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE MATERIALIZED VIEW doc AS
WITH gathered AS (
    SELECT
        e.id,

        (SELECT st.title
           FROM struct st
          WHERE st.entry_id = e.id)                            AS title,

        (SELECT string_agg(DISTINCT en.pdbx_description, ' ')
           FROM entity en
          WHERE en.entry_id = e.id)                            AS entities,

        (SELECT string_agg(DISTINCT ca.name, ' ')
           FROM citation_author ca
          WHERE ca.entry_id = e.id)                            AS authors,

        (SELECT string_agg(DISTINCT sg.pdbx_gene_src_scientific_name, ' ')
           FROM entity_src_gen sg
          WHERE sg.entry_id = e.id)                            AS organisms,

        -- Code and chemical name both, and only the non-standard ones, so
        -- this answers the same question the nonstandard_residue filter does.
        -- Spaces around each code let a search match a whole code rather than
        -- a piece of one: without them "A" finds every entry holding DA.
        (SELECT string_agg(DISTINCT ' ' || cc.id || ' ' || COALESCE(cc.name, ''), ' ')
           FROM entity_poly_seq eps
           JOIN chem_comp cc ON cc.id = eps.mon_id
          WHERE eps.entry_id = e.id
            AND cc.mon_nstd_flag = 'n')                        AS residues

      FROM entry e
)
SELECT
    g.*,
    -- The prose fields with punctuation dropped, so "zdna" finds "Z-DNA".
    -- Spaces are kept: dropping them would let "ATP-dependent RNA" answer a
    -- search for tRNA. The id and the entity descriptions are deliberately
    -- not in here, because punctuation means something in an identifier and
    -- in a chemical name.
    regexp_replace(lower(concat_ws(' ', g.title, g.authors, g.organisms)),
                   '[^a-z0-9 ]', '', 'g')                      AS prose
  FROM gathered g;

-- Required by REFRESH ... CONCURRENTLY, and it is the join back to entry.
CREATE UNIQUE INDEX doc_id_key ON doc (id);

-- Trigram indexes, because every search here is "contains", and a btree
-- cannot answer a pattern that starts with a wildcard.
CREATE INDEX doc_prose_trgm    ON doc USING gin (prose    gin_trgm_ops);
CREATE INDEX doc_entities_trgm ON doc USING gin (entities gin_trgm_ops);
CREATE INDEX doc_residues_trgm ON doc USING gin (residues gin_trgm_ops);
