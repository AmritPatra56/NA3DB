-- Modified nucleotides only in the search document, and their list stored.
--
-- 010 made the residue filter and the monomer flag ignore protein chains, but
-- doc.residues still held every chain's, so the box found 30 entries for MSE
-- (selenomethionine) where the filter found 0. Now both read the same rows.
--
-- residue_codes is the "Non-standard residues" list. Computed per row it
-- scanned entity_poly_seq for every entry of an export; read from here it
-- costs 10 ms. doc is rebuilt after every load (load_cif.py, seed.sql), and
-- search.test.js checks it agrees with the tables.
--
-- Otherwise the same view as 008.

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

        (SELECT string_agg(DISTINCT sg.pdbx_gene_src_scientific_name, E'\n')
           FROM entity_src_gen sg
          WHERE sg.entry_id = e.id)                               AS organisms,

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
