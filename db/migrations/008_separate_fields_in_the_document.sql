-- Stop one search matching across two fields.
--
-- 007 gathered every searchable field into one row and joined them with a
-- space. That made the joins themselves searchable: "rna hall" found two
-- structures whose title ends in RNA and whose author is named Hall, and no
-- title or author anywhere contains that phrase. 1,484 of 1,489 entries could
-- produce a match like it. Before the view each field was its own EXISTS, so
-- a phrase could not span two of them; this restores that.
--
-- The separator is a newline. Nothing a visitor can search with survives as
-- one: the normalised needle keeps only [a-z0-9 ], and the literal needle has
-- its newlines stripped in like_contains, so a crafted ?q=%0A cannot breach
-- the wall either. Every multi-valued field is joined the same way, so two
-- authors or two entity descriptions cannot be read as one run of text.

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
           JOIN chem_comp cc ON cc.id = eps.mon_id
          WHERE eps.entry_id = e.id
            AND cc.mon_nstd_flag = 'n')                           AS residues

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
