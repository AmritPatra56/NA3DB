-- Biological assemblies: which chains, moved by which operators, make the
-- molecule as it exists in the cell.
--
-- The asymmetric unit (what the database holds) is the smallest piece that
-- rebuilds the crystal. It is not always the molecule: 1TTT holds three
-- tRNA·EF-Tu complexes, one per assembly, and 1EN9 holds one strand of a
-- B-DNA duplex whose partner is made by crystal symmetry. Every mmCIF file
-- describes this in three categories, so no second file is needed:
--
--   _pdbx_struct_assembly      one row per assembly, and who defined it
--   _pdbx_struct_assembly_gen  which chains (asym_id_list) and which
--                              operators (oper_expression) build it
--   _pdbx_struct_oper_list     each operator: a 3x3 matrix and a vector
--
-- All 1,489 files have all three. Columns are the CIF item names, with
-- matrix[1][1] written matrix_1_1 as database_pdb_matrix does.
--
-- Keys:
--   * assembly and oper_list are keyed by entry + id, as the dictionary does.
--   * assembly_gen has no id of its own in mmCIF, so a row's position in the
--     file (ordinal, from 1) keys it. The dictionary's own key, assembly_id +
--     oper_expression + asym_id_list, is kept unique as well (by an index,
--     with the list as its md5, since a ribosome's list can run to KB).
--   * asym_id_list is a comma list, which no foreign key can check. Each
--     chain is also stored as its own row in pdbx_struct_assembly_gen_asym,
--     which points at struct_asym, so a chain that does not exist cannot be
--     named. That table is ours, not an mmCIF category.
--   * oper_expression ("1", "1,2", "(1-60)", "(1-5)(6-10)") is kept as text.
--     The loader checks that every operator it names is in oper_list.
--
-- Every row hangs off entry with ON DELETE CASCADE, as every other table
-- does, so --reload (delete the entry, load it again) replaces them cleanly.
-- Filled by db/load_cif.py; entries loaded before this migration get their
-- rows from db/backfill_assemblies.py, which reads only these categories.

create table pdbx_struct_assembly (
    entry_id           varchar(20) not null,
    id                 varchar(20) not null,
    details            text,
    method_details     text,
    oligomeric_details text,
    oligomeric_count   integer,
    primary key (entry_id, id),
    constraint fk_assembly_entry
        foreign key (entry_id) references entry(id) on delete cascade,
    constraint assembly_oligomeric_count_positive check (oligomeric_count > 0)
);

create table pdbx_struct_oper_list (
    entry_id           varchar(20) not null,
    id                 varchar(20) not null,
    type               text        not null,
    name               text,
    symmetry_operation text,
    matrix_1_1 double precision not null, matrix_1_2 double precision not null, matrix_1_3 double precision not null,
    matrix_2_1 double precision not null, matrix_2_2 double precision not null, matrix_2_3 double precision not null,
    matrix_3_1 double precision not null, matrix_3_2 double precision not null, matrix_3_3 double precision not null,
    vector_1   double precision not null,
    vector_2   double precision not null,
    vector_3   double precision not null,
    primary key (entry_id, id),
    constraint fk_oper_entry
        foreign key (entry_id) references entry(id) on delete cascade
);

create table pdbx_struct_assembly_gen (
    entry_id        varchar(20) not null,
    ordinal         integer     not null,
    assembly_id     varchar(20) not null,
    oper_expression text        not null,
    asym_id_list    text        not null,
    primary key (entry_id, ordinal),
    constraint fk_assembly_gen_assembly
        foreign key (entry_id, assembly_id)
        references pdbx_struct_assembly(entry_id, id) on delete cascade,
    constraint assembly_gen_ordinal_positive check (ordinal > 0),
    constraint assembly_gen_no_spaces
        check (oper_expression !~ '\s' and asym_id_list !~ '\s')
);

create table pdbx_struct_assembly_gen_asym (
    entry_id varchar(20) not null,
    ordinal  integer     not null,
    asym_id  varchar(20) not null,
    primary key (entry_id, ordinal, asym_id),
    constraint fk_gen_asym_gen
        foreign key (entry_id, ordinal)
        references pdbx_struct_assembly_gen(entry_id, ordinal) on delete cascade,
    -- struct_asym's key is (id, entry_id), in that order.
    constraint fk_gen_asym_struct_asym
        foreign key (asym_id, entry_id)
        references struct_asym(id, entry_id) on delete cascade
);

-- Each primary key starts with entry_id, so lookups by entry need no extra
-- index. These serve the joins the other way: an assembly's generator rows,
-- and the assemblies a chain belongs to.
-- The dictionary's own key. A ribosome's asym_id_list runs to several KB,
-- past the 2.7 KB a btree entry may hold (22 entries, e.g. 4V63, 5J4C), so
-- the list is keyed by its md5. The chains themselves are each checked in
-- pdbx_struct_assembly_gen_asym.
create unique index assembly_gen_dictionary_key
    on pdbx_struct_assembly_gen (entry_id, assembly_id, oper_expression, md5(asym_id_list));
create index idx_assembly_gen_assembly on pdbx_struct_assembly_gen (entry_id, assembly_id);
create index idx_gen_asym_chain        on pdbx_struct_assembly_gen_asym (asym_id, entry_id);

comment on table pdbx_struct_assembly is
    'Biological assemblies of an entry. PK=(entry_id,id). 1:N. Parent: entry. See db/migrations/016.';
comment on table pdbx_struct_oper_list is
    'Operators that build assemblies: x'' = matrix·x + vector. PK=(entry_id,id). Parent: entry. See db/migrations/016.';
comment on table pdbx_struct_assembly_gen is
    'Which chains, under which operators, build an assembly. PK=(entry_id,ordinal), ordinal = row in the file. Parent: pdbx_struct_assembly. See db/migrations/016.';
comment on table pdbx_struct_assembly_gen_asym is
    'NA3DB table, not mmCIF: asym_id_list of pdbx_struct_assembly_gen, one chain per row, so struct_asym can check it. See db/migrations/016.';
comment on column pdbx_struct_assembly.details is
    'Who defined it: author_defined_assembly, software_defined_assembly or author_and_software_defined_assembly.';
comment on column pdbx_struct_oper_list.type is
    'identity operation, crystal symmetry operation, point symmetry operation, helical symmetry operation, ...';
comment on column pdbx_struct_assembly_gen.oper_expression is
    'Operator ids from pdbx_struct_oper_list: "1", "1,2", "(1-60)", or a product such as "(1-5)(6-10)".';
