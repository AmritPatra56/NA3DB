-- The resolution of a cryo-EM structure, from em_3d_reconstruction.
--
-- An EM map's resolution is not a diffraction limit, so the PDB records it in
-- _em_3d_reconstruction.resolution ("the final resolution (in angstroms) of
-- the 3D reconstruction"), not in refine or reflns. Only refine and reflns
-- were stored, so 441 of the 497 EM entries showed no resolution: their
-- refine.ls_d_res_high is "." or refine is absent. The other 56 repeat the EM
-- value in refine (all 56 equal).
--
-- Key: the dictionary keys the category on id + image_processing_id; with the
-- entry that is unique across the database. All 497 EM files have the
-- category, ids and image_processing_ids are never null, and only 6WDR has two
-- rows (both 3.7 A, FSC 0.143). The foreign key cascades, so a row can
-- neither outlive its entry nor exist without one, and a --reload (which
-- deletes the entry first) replaces it cleanly.
--
-- Columns are the CIF item names. Filled in by db/load_cif.py; existing
-- entries get rows from a reload of the EM files, not from this file.

create table em_3d_reconstruction (
    entry_id            varchar(20) not null,
    id                  varchar(20) not null,
    image_processing_id varchar(20) not null,
    resolution          real,
    resolution_method   text,
    num_particles       integer,
    symmetry_type       text,
    primary key (entry_id, id, image_processing_id),
    constraint fk_em3d_entry
        foreign key (entry_id) references entry(id) on delete cascade,
    constraint em3d_resolution_positive    check (resolution > 0),
    constraint em3d_num_particles_positive check (num_particles > 0)
);

-- The primary key starts with entry_id, so it already serves lookups by entry;
-- no separate index is needed.

comment on table em_3d_reconstruction is
    'EM 3D reconstruction(s). PK=(entry_id,id,image_processing_id). 1:N. Parent: entry. See db/migrations/015.';
comment on column em_3d_reconstruction.resolution is
    'Final resolution of the reconstruction in angstroms (_em_3d_reconstruction.resolution).';
comment on column em_3d_reconstruction.resolution_method is
    'How the resolution was estimated, e.g. FSC 0.143 CUT-OFF.';
