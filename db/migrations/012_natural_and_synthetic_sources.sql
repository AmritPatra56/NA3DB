-- Where each molecule came from, in all three ways the PDB records it:
--
--   entity_src_gen       expressed from a gene    (1OB5 EF-Tu: T. aquaticus, in E. coli)
--   entity_src_nat       purified from nature     (1OB5 tRNA-Phe: S. cerevisiae, 4932)
--   pdbx_entity_src_syn  chemically synthesised   (9L4E: Homo sapiens sequence, 9606)
--
-- Only the first was stored, so ribosomes and tRNAs purified from cells and
-- every synthetic oligo showed "Not recorded". The taxonomy ID is kept as a
-- number so it can be filtered on: names vary ("E. coli", "Escherichia coli
-- K-12"), taxon 562 does not.
--
-- All three tables share one shape: the key is the molecule plus pdbx_src_id
-- (a chimera has a source per segment, pdbx_beg/end_seq_num), and the foreign
-- key to entity cascades, so a source can neither be duplicated nor outlive
-- its molecule. Columns are the CIF item names; only those filled in more than
-- a handful of the 1,489 files are kept.

-- entity_src_gen: natural key instead of a row counter, plus the expression host.
ALTER TABLE entity_src_gen
    ADD COLUMN pdbx_src_id                    integer NOT NULL DEFAULT 1,
    ADD COLUMN pdbx_gene_src_gene             text,
    ADD COLUMN gene_src_strain                text,
    ADD COLUMN pdbx_host_org_scientific_name  text,
    ADD COLUMN pdbx_host_org_ncbi_taxonomy_id integer,
    ADD COLUMN pdbx_beg_seq_num               integer,
    ADD COLUMN pdbx_end_seq_num               integer;

-- Rows loaded before had no pdbx_src_id. Number them in load order so the key
-- holds; the reload that follows replaces them with the file's own numbers.
UPDATE entity_src_gen g SET pdbx_src_id = n.rn
  FROM (SELECT id, row_number() OVER (PARTITION BY entry_id, entity_id ORDER BY id) AS rn
          FROM entity_src_gen) n
 WHERE n.id = g.id AND n.rn <> 1;

ALTER TABLE entity_src_gen DROP CONSTRAINT entity_src_gen_pkey;
ALTER TABLE entity_src_gen DROP COLUMN id;
ALTER TABLE entity_src_gen ADD PRIMARY KEY (entry_id, entity_id, pdbx_src_id);
ALTER TABLE entity_src_gen
    ADD CONSTRAINT esgen_taxonomy_positive      CHECK (pdbx_gene_src_ncbi_taxonomy_id > 0),
    ADD CONSTRAINT esgen_host_taxonomy_positive CHECK (pdbx_host_org_ncbi_taxonomy_id > 0);
CREATE INDEX idx_esgen_taxonomy ON entity_src_gen (pdbx_gene_src_ncbi_taxonomy_id);

CREATE TABLE entity_src_nat (
    entry_id                 varchar(20) NOT NULL,
    entity_id                varchar(20) NOT NULL,
    pdbx_src_id              integer     NOT NULL DEFAULT 1,
    pdbx_organism_scientific text,
    pdbx_ncbi_taxonomy_id    integer CONSTRAINT esnat_taxonomy_positive CHECK (pdbx_ncbi_taxonomy_id > 0),
    common_name              text,
    strain                   text,
    pdbx_cell_line           text,
    details                  text,
    pdbx_beg_seq_num         integer,
    pdbx_end_seq_num         integer,
    PRIMARY KEY (entry_id, entity_id, pdbx_src_id),
    CONSTRAINT fk_esnat_entity FOREIGN KEY (entity_id, entry_id)
        REFERENCES entity (id, entry_id) ON DELETE CASCADE
);
CREATE INDEX idx_esnat_entity   ON entity_src_nat (entity_id, entry_id);
CREATE INDEX idx_esnat_taxonomy ON entity_src_nat (pdbx_ncbi_taxonomy_id);
CREATE INDEX idx_esnat_organism_trgm ON entity_src_nat USING gin (pdbx_organism_scientific gin_trgm_ops);

CREATE TABLE pdbx_entity_src_syn (
    entry_id             varchar(20) NOT NULL,
    entity_id            varchar(20) NOT NULL,
    pdbx_src_id          integer     NOT NULL DEFAULT 1,
    organism_scientific  text,
    ncbi_taxonomy_id     integer CONSTRAINT essyn_taxonomy_positive CHECK (ncbi_taxonomy_id > 0),
    organism_common_name text,
    details              text,
    pdbx_beg_seq_num     integer,
    pdbx_end_seq_num     integer,
    PRIMARY KEY (entry_id, entity_id, pdbx_src_id),
    CONSTRAINT fk_essyn_entity FOREIGN KEY (entity_id, entry_id)
        REFERENCES entity (id, entry_id) ON DELETE CASCADE
);
CREATE INDEX idx_essyn_entity   ON pdbx_entity_src_syn (entity_id, entry_id);
CREATE INDEX idx_essyn_taxonomy ON pdbx_entity_src_syn (ncbi_taxonomy_id);
CREATE INDEX idx_essyn_organism_trgm ON pdbx_entity_src_syn USING gin (organism_scientific gin_trgm_ops);

COMMENT ON TABLE entity_src_gen      IS 'Source of a molecule expressed from a gene (mmCIF entity_src_gen). See db/migrations/012.';
COMMENT ON TABLE entity_src_nat      IS 'Source of a molecule purified from nature (mmCIF entity_src_nat). See db/migrations/012.';
COMMENT ON TABLE pdbx_entity_src_syn IS 'Source of a chemically synthesised molecule (mmCIF pdbx_entity_src_syn). See db/migrations/012.';

ANALYZE entity_src_gen;
