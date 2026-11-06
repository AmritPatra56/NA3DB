-- The search box finds an organism whichever way the molecule was made.
--
-- doc.organisms read entity_src_gen alone, so typing Saccharomyces missed the
-- yeast tRNAs purified from cells (entity_src_nat, migration 012): 68 entries
-- found of 103. Now natural and synthetic sources are gathered too.
--
-- Otherwise the same view as 011.

DROP MATERIALIZED VIEW doc;

CREATE MATERIALIZED VIEW doc AS
WITH gathered AS (
    SELECT
        e.id,

        (SELECT st.title
           FROM struct st
          WHERE st.entry_id = e.id)                               AS title,

        (SELECT string_agg(DISTINCT en.pdbx_description, E'\n')
           FROM entity en
          WHERE en.entry_id = e.id)                               AS entities,

        (SELECT string_agg(DISTINCT ca.name, E'\n')
           FROM citation_author ca
          WHERE ca.entry_id = e.id)                               AS authors,

        -- Every way a molecule is made. The expression host is left out:
        -- E. coli is the host in 816 entries and the source in 189.
        (SELECT string_agg(DISTINCT s.organism, E'\n')
           FROM (SELECT sg.pdbx_gene_src_scientific_name AS organism
                   FROM entity_src_gen sg WHERE sg.entry_id = e.id
                 UNION ALL
                 SELECT sn.pdbx_organism_scientific
                   FROM entity_src_nat sn WHERE sn.entry_id = e.id
                 UNION ALL
                 SELECT sy.organism_scientific
                   FROM pdbx_entity_src_syn sy WHERE sy.entry_id = e.id) s) AS organisms,

        -- Code and chemical name together, one residue per line, so a search
        -- cannot run the end of one residue into the start of the next.
        (SELECT string_agg(DISTINCT cc.id || ' ' || COALESCE(cc.name, ''), E'\n')
           FROM entity_poly_seq eps
           JOIN entity_poly ep ON ep.entry_id = eps.entry_id
                              AND ep.entity_id = eps.entity_id
           JOIN chem_comp cc ON cc.id = eps.mon_id
          WHERE eps.entry_id = e.id
            AND ep.type ILIKE '%nucleotide%'
            AND cc.mon_nstd_flag = 'n')                           AS residues,

        -- The list a card shows, ready made: worked out per export it read
        -- 3.8 million residue rows and cost 1.6 s of a 2.4 s export.
        (SELECT string_agg(DISTINCT cc.id, ', ' ORDER BY cc.id)
           FROM entity_poly_seq eps
           JOIN entity_poly ep ON ep.entry_id = eps.entry_id
                              AND ep.entity_id = eps.entity_id
           JOIN chem_comp cc ON cc.id = eps.mon_id
          WHERE eps.entry_id = e.id
            AND ep.type ILIKE '%nucleotide%'
            AND cc.mon_nstd_flag = 'n')                           AS residue_codes

      FROM entry e
)
SELECT
    g.*,
    -- Punctuation dropped so "zdna" finds "Z-DNA". Spaces are kept, or
    -- "ATP-dependent RNA" would run together and answer a search for tRNA.
    -- Newlines are kept too, and that is what keeps the three fields apart.
    regexp_replace(lower(concat_ws(E'\n', g.title, g.authors, g.organisms)),
                   E'[^a-z0-9 \n]', '', 'g')                      AS prose
  FROM gathered g;

CREATE UNIQUE INDEX doc_id_key ON doc (id);

CREATE INDEX doc_prose_trgm    ON doc USING gin (prose    gin_trgm_ops);
CREATE INDEX doc_entities_trgm ON doc USING gin (entities gin_trgm_ops);
CREATE INDEX doc_residues_trgm ON doc USING gin (residues gin_trgm_ops);
