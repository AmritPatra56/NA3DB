#!/usr/bin/env python3
"""
NADB PostgreSQL Loader
======================
Unified port of all 4 MySQL loaders (Tiers 1-9) → PostgreSQL.

Changes from MySQL loaders:
  - mysql.connector  →  psycopg (psycopg3)
  - INSERT IGNORE    →  INSERT ... ON CONFLICT DO NOTHING
  - pgserver         →  embedded postgres, no sudo needed
  - SAVEPOINT isolation kept identical

Usage:
    python nadb_pg_loader.py --cif 6cly.cif          # load one file
    python nadb_pg_loader.py --cif-dir ./dnatco_extended_1500  # load all
"""

import os, re, sys, logging, argparse, traceback
from pathlib import Path
from datetime import date

import psycopg

# Embedded mode only; missing is fine, the normal path uses a real server.
try:
    import pgserver
except ImportError:
    pgserver = None

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("nadb_pg")

# Embedded mode builds from nothing, so it needs the schema itself.
SCHEMA_FILE = Path(__file__).parent / "migrations" / "001_init.sql"
PGDATA_DIR  = Path(__file__).parent.parent / "nadb_pgdata"
DB_NAME     = "nadb"
ATOM_BATCH  = 5_000

def load_env_file(path):
    """Reads KEY=value lines from the same .env the application uses.

    A variable already set in the shell wins over the file, the same rule as
    Node's --env-file, which is how a server or a container passes real
    values in without editing anything.
    """
    p = Path(path)
    if not p.exists():
        return
    for line in p.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


def external_uri():
    """Connection details from the environment, the five variables the
    application already uses. Returns None when DB_HOST is not set, which
    means fall back to the embedded server.
    """
    if not os.environ.get("DB_HOST"):
        return None

    return (
        f"host={os.environ['DB_HOST']} "
        f"port={os.environ.get('DB_PORT', '5432')} "
        f"dbname={os.environ.get('DB_NAME', 'na3db')} "
        f"user={os.environ['DB_USER']} "
        f"password={os.environ.get('DB_PASSWORD', '')}"
    )


def entry_id_from(path):
    """The PDB id a file holds, taken from its name. Checked against all 1,489
    files: the filename always matches the data_ block inside."""
    return Path(path).stem.upper()


def already_loaded(conn):
    """The entries that finished. Anything in `entry` but not here is partial."""
    with conn.cursor() as cur:
        cur.execute("SELECT entry_id FROM loaded_entries")
        return {r[0] for r in cur.fetchall()}


def clean_partial_entries(conn):
    """Removes any structure that was being written when a previous run stopped.

    Deleting the entry is enough: all 30 tables that reference it are
    ON DELETE CASCADE, so the atoms, authors and NtC steps go with it.
    """
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id FROM entry
            WHERE id NOT IN (SELECT entry_id FROM loaded_entries)
        """)
        partial = [r[0] for r in cur.fetchall()]

        if not partial:
            return []

        log.warning("Found %d partial entr%s from an interrupted run: %s",
                    len(partial), "y" if len(partial) == 1 else "ies",
                    ", ".join(partial[:10]) + ("..." if len(partial) > 10 else ""))
        cur.execute("DELETE FROM entry WHERE id = ANY(%s)", (partial,))
        conn.commit()
        log.warning("Deleted them. They will be loaded again.")
        return partial


def mark_loaded(conn, cur, entry_id, path):
    """Records that a file finished, and fills in the columns that are derived
    from its rows rather than read from the file.

    Until the loaded_entries row exists the entry counts as partial, which is
    what makes an interrupted run safe to repeat.
    """
    # has_nonstandard_residue is stored, not computed per search (migration
    # 006), so it has to be written here once this entry's residues are in.
    cur.execute("""
        UPDATE entry SET has_nonstandard_residue = EXISTS (
            SELECT 1 FROM entity_poly_seq eps
            JOIN chem_comp cc ON cc.id = eps.mon_id
            WHERE eps.entry_id = %s AND cc.mon_nstd_flag = 'n'
        ) WHERE id = %s
    """, (entry_id, entry_id))

    cur.execute("""
        INSERT INTO loaded_entries (entry_id, source) VALUES (%s, %s)
        ON CONFLICT (entry_id) DO UPDATE SET loaded_at = now()
    """, (entry_id, os.path.basename(path)))
    conn.commit()


ALL_TABLES = [
    # T1
    "entry", "pdbx_database_status", "struct", "citation", "citation_author",
    # T2
    "entity", "entity_poly", "entity_poly_seq", "entity_src_gen", "pdbx_entity_nonpoly",
    # T3
    "struct_asym", "pdbx_poly_seq_scheme", "struct_ref", "struct_ref_seq",
    # T4
    "atom_site", "atom_sites", "database_pdb_matrix",
    # T5
    "struct_conf_type", "struct_conf",
    "struct_sheet", "struct_sheet_order", "struct_sheet_range", "pdbx_struct_sheet_hbond",
    # T6
    "exptl", "cell", "symmetry", "reflns", "diffrn", "refine",
    # T7
    "chem_comp",
    # T8
    "ndb_struct_ntc_overall", "ndb_struct_ntc_step",
    "ndb_struct_ntc_step_summary", "ndb_struct_ntc_step_parameters",
    "ndb_struct_sugar_step_parameters",
    "ndb_base_pair_list", "ndb_base_pair_annotation",
    # T9
    "pdbx_validate_rmsd_bond", "pdbx_validate_rmsd_angle",
]


# ══════════════════════════════════════════════════════════════════════════════
#  CIF PARSING  (ported verbatim from original loaders)
# ══════════════════════════════════════════════════════════════════════════════

def _parse_single_values(text: str) -> dict:
    text2 = re.sub(
        r"(_[\w.\[\]-]+)\s*\n\s*'((?:[^'\\]|\\.)*)'",
        lambda m: f"{m.group(1)} '{m.group(2)}'",
        text, flags=re.DOTALL,
    )
    result = {}
    pat = re.compile(
        r"^(_[\w.\[\]-]+)\s+(.+?)(?=\n_[\w.\[\]-]|\nloop_|\Z)",
        re.MULTILINE | re.DOTALL,
    )
    for m in pat.finditer(text2):
        key = m.group(1).lower()
        val = m.group(2).strip()
        val = re.sub(r"^'(.*)'$", r"\1", val, flags=re.DOTALL)
        val = re.sub(r'^"(.*)"$', r"\1", val, flags=re.DOTALL)
        val = re.sub(r"\s+", " ", val).strip()
        result[key] = None if val in ("?", ".") else val
    return result


def _tokenise(text: str) -> list:
    tokens, i = [], 0
    text = text.strip()
    n = len(text)
    while i < n:
        while i < n and text[i] in " \t\r\n":
            i += 1
        if i >= n:
            break
        if text[i] == ";" and (i == 0 or text[i-1] == "\n"):
            end = text.find("\n;", i+1)
            if end == -1:
                tokens.append(text[i+1:].strip()); break
            tokens.append(text[i+1:end].strip()); i = end+2; continue
        if text[i] == "'":
            end = i+1
            while end < n:
                if text[end] == "'" and (end+1 >= n or text[end+1] in " \t\r\n"):
                    break
                end += 1
            tokens.append(text[i+1:end]); i = end+1; continue
        if text[i] == '"':
            end = i+1
            while end < n and text[end] != '"':
                end += 1
            tokens.append(text[i+1:end]); i = end+1; continue
        end = i
        while end < n and text[end] not in " \t\r\n":
            end += 1
        tokens.append(text[i:end]); i = end
    return tokens


def _parse_loop(text: str, category: str) -> list:
    cat_esc = re.escape(category)
    # Match the column header block only; find where data starts
    hdr_pat = re.compile(
        r"loop_\s+((?:_" + cat_esc + r"\.\S+\s*)+)",
        re.DOTALL | re.IGNORECASE,
    )
    # Stop data at next line-anchored loop_ or _category. (not mid-value)
    end_pat = re.compile(r'\n[ \t]*(loop_|_\S+\.)', re.IGNORECASE)
    rows = []
    for m in hdr_pat.finditer(text):
        cols = re.findall(r"_" + cat_esc + r"\.(\S+)", m.group(1), re.IGNORECASE)
        if not cols:
            continue
        data_start = m.end()
        end_m = end_pat.search(text, data_start)
        data_text = text[data_start: end_m.start() if end_m else len(text)]
        tokens = _tokenise(data_text)
        if not tokens:
            continue
        nc = len(cols)
        for i in range(0, len(tokens) - nc + 1, nc):
            chunk = tokens[i:i + nc]
            if len(chunk) != nc:
                break
            rows.append({c.lower(): (None if v in ("?", ".") else v)
                         for c, v in zip(cols, chunk)})
    return rows


def _get_mat(sv, prefix, row, col):
    v = sv.get(f"_{prefix}[{row}][{col}]")
    return v if v is not None else sv.get(f"_{prefix}_{row}_{col}")

def _get_vec(sv, prefix, idx):
    v = sv.get(f"_{prefix}[{idx}]")
    return v if v is not None else sv.get(f"_{prefix}_{idx}")

def _int(v):
    if v is None: return None
    try:    return int(str(v).strip().split(".")[0])
    except: return None

def _float(v):
    if v is None: return None
    try:    return float(str(v).strip())
    except: return None

def _date(v):
    if not v: return None
    try:
        p = v.strip().split("-")
        return date(int(p[0]), int(p[1]), int(p[2]))
    except: return None


# ══════════════════════════════════════════════════════════════════════════════
#  DATABASE HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _sp(cur, name):  cur.execute(f"SAVEPOINT {name}")
def _rb(cur, name):  cur.execute(f"ROLLBACK TO SAVEPOINT {name}")
def _rel(cur, name): cur.execute(f"RELEASE SAVEPOINT {name}")

def _count(cur, tbl, entry_id):
    cur.execute(f"SELECT COUNT(*) FROM {tbl} WHERE entry_id=%s", (entry_id,))
    return cur.fetchone()[0]

def _many(cur, sql, rows):
    if not rows: return 0
    cur.executemany(sql, rows)
    return len(rows)

def run_table(cur, name, fn, *args):
    _sp(cur, name)
    try:
        n = fn(*args); _rel(cur, name); return n or 0
    except psycopg.Error as e:
        _rb(cur, name)
        log.warning("    ⚠  %-38s skipped (PG): %s", name, str(e).split('\n')[0])
        return 0
    except Exception as e:
        _rb(cur, name)
        log.warning("    ⚠  %-38s skipped: %s", name, e)
        return 0


# ══════════════════════════════════════════════════════════════════════════════
#  TIER 1
# ══════════════════════════════════════════════════════════════════════════════

def load_entry(cur, eid):
    cur.execute("INSERT INTO entry (id) VALUES (%s) ON CONFLICT DO NOTHING", (eid,))
    return 1

def load_pdbx_database_status(cur, eid, sv):
    g = lambda k: sv.get(f"_pdbx_database_status.{k}")
    cur.execute("""
        INSERT INTO pdbx_database_status
          (entry_id,status_code,recvd_initial_deposition_date,
           deposit_site,process_site,status_code_sf,pdb_format_compatible)
        VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
        (eid, g("status_code"), _date(g("recvd_initial_deposition_date")),
         g("deposit_site"), g("process_site"),
         g("status_code_sf"), g("pdb_format_compatible")))
    return 1

def load_struct(cur, eid, sv):
    cur.execute(
        "INSERT INTO struct (entry_id,title) VALUES (%s,%s) ON CONFLICT DO NOTHING",
        (eid, sv.get("_struct.title")))
    return 1

def load_citation(cur, eid, text, sv):
    sql = """INSERT INTO citation
      (id,entry_id,title,journal_abbrev,journal_volume,page_first,page_last,
       year,journal_id_ASTM,country,journal_id_ISSN,journal_id_CSD,
       book_publisher,pdbx_database_id_PubMed,pdbx_database_id_DOI)
      VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING"""
    rp = _parse_loop(text, "citation")
    if rp:
        rows = [(r.get("id") or "primary", eid,
                 r.get("title"), r.get("journal_abbrev"), r.get("journal_volume"),
                 r.get("page_first"), r.get("page_last"), _int(r.get("year")),
                 r.get("journal_id_astm"), r.get("country"),
                 r.get("journal_id_issn"), r.get("journal_id_csd"),
                 r.get("book_publisher"),
                 _int(r.get("pdbx_database_id_pubmed")),
                 r.get("pdbx_database_id_doi")) for r in rp]
        return _many(cur, sql, rows)
    else:
        g = lambda k: sv.get(f"_citation.{k}")
        cur.execute(sql, (g("id") or "primary", eid,
                    g("title"), g("journal_abbrev"), g("journal_volume"),
                    g("page_first"), g("page_last"), _int(g("year")),
                    g("journal_id_astm"), g("country"),
                    g("journal_id_issn"), g("journal_id_csd"),
                    g("book_publisher"),
                    _int(g("pdbx_database_id_pubmed")), g("pdbx_database_id_doi")))
        return 1

def load_citation_author(cur, eid, text):
    rp = _parse_loop(text, "citation_author")
    if not rp: return 0
    return _many(cur, """INSERT INTO citation_author
        (entry_id,citation_id,name,ordinal,identifier_ORCID)
        VALUES (%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
        [(eid, r.get("citation_id") or "primary",
          r.get("name"), _int(r.get("ordinal")), r.get("identifier_orcid"))
         for r in rp])


# ══════════════════════════════════════════════════════════════════════════════
#  TIER 2
# ══════════════════════════════════════════════════════════════════════════════

def load_entity(cur, eid, text, sv):
    rp = _parse_loop(text, "entity")
    if not rp:
        eid2 = sv.get("_entity.id")
        if eid2:
            rp = [{"id": eid2, "type": sv.get("_entity.type"),
                   "pdbx_description": sv.get("_entity.pdbx_description"),
                   "formula_weight": sv.get("_entity.formula_weight"),
                   "pdbx_number_of_molecules": sv.get("_entity.pdbx_number_of_molecules")}]
        else:
            log.warning("    entity: no data for %s", eid); return 0
    return _many(cur, """INSERT INTO entity
        (id,entry_id,type,pdbx_description,formula_weight,pdbx_number_of_molecules)
        VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
        [(r.get("id"), eid, r.get("type"), r.get("pdbx_description"),
          _float(r.get("formula_weight")), _int(r.get("pdbx_number_of_molecules")))
         for r in rp])

def load_entity_poly(cur, eid, text, sv):
    rp = _parse_loop(text, "entity_poly")
    if not rp:
        eid2 = sv.get("_entity_poly.entity_id")
        if eid2:
            rp = [{"entity_id": eid2, "type": sv.get("_entity_poly.type"),
                   "pdbx_seq_one_letter_code_can": sv.get("_entity_poly.pdbx_seq_one_letter_code_can")}]
    if not rp: return 0
    return _many(cur, """INSERT INTO entity_poly
        (entity_id,entry_id,type,pdbx_seq_one_letter_code_can)
        VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
        [(r.get("entity_id"), eid, r.get("type"),
          r.get("pdbx_seq_one_letter_code_can")) for r in rp])

def load_entity_poly_seq(cur, eid, text):
    rp = _parse_loop(text, "entity_poly_seq")
    if not rp: return 0
    return _many(cur, """INSERT INTO entity_poly_seq
        (entity_id,entry_id,num,mon_id,hetero) VALUES (%s,%s,%s,%s,%s)""",
        [(r.get("entity_id"), eid, _int(r.get("num")),
          r.get("mon_id"), r.get("hetero")) for r in rp])

def load_entity_src_gen(cur, eid, text):
    rp = _parse_loop(text, "entity_src_gen")
    if not rp: return 0
    return _many(cur, """INSERT INTO entity_src_gen
        (entity_id,entry_id,gene_src_common_name,
         pdbx_gene_src_scientific_name,pdbx_gene_src_ncbi_taxonomy_id)
        VALUES (%s,%s,%s,%s,%s)""",
        [(r.get("entity_id"), eid, r.get("gene_src_common_name"),
          r.get("pdbx_gene_src_scientific_name"),
          _int(r.get("pdbx_gene_src_ncbi_taxonomy_id"))) for r in rp])

def load_pdbx_entity_nonpoly(cur, eid, text):
    rp = _parse_loop(text, "pdbx_entity_nonpoly")
    if not rp: return 0
    return _many(cur, """INSERT INTO pdbx_entity_nonpoly
        (entity_id,entry_id,name,comp_id) VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
        [(r.get("entity_id"), eid, r.get("name"), r.get("comp_id")) for r in rp])


# ══════════════════════════════════════════════════════════════════════════════
#  TIER 3
# ══════════════════════════════════════════════════════════════════════════════

def load_struct_asym(cur, eid, text, sv):
    rp = _parse_loop(text, "struct_asym")
    if not rp:
        aid = sv.get("_struct_asym.id")
        eid2 = sv.get("_struct_asym.entity_id")
        if aid and eid2:
            rp = [{"id": aid, "entity_id": eid2, "details": sv.get("_struct_asym.details")}]
        else:
            log.warning("    struct_asym: no data for %s", eid); return 0
    return _many(cur, """INSERT INTO struct_asym
        (id,entry_id,entity_id,details) VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
        [(r.get("id"), eid, r.get("entity_id"), r.get("details")) for r in rp])

def load_pdbx_poly_seq_scheme(cur, eid, text):
    rp = _parse_loop(text, "pdbx_poly_seq_scheme")
    if not rp: return 0
    return _many(cur, """INSERT INTO pdbx_poly_seq_scheme
        (asym_id,entry_id,entity_id,seq_id,mon_id,ndb_seq_num,pdb_seq_num,
         auth_seq_num,pdb_mon_id,auth_mon_id,pdb_strand_id,pdb_ins_code,hetero)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
        [(r.get("asym_id"), eid, r.get("entity_id"),
          _int(r.get("seq_id")), r.get("mon_id"),
          _int(r.get("ndb_seq_num")), _int(r.get("pdb_seq_num")),
          r.get("auth_seq_num"), r.get("pdb_mon_id"), r.get("auth_mon_id"),
          r.get("pdb_strand_id"), r.get("pdb_ins_code"), r.get("hetero"))
         for r in rp])

def load_struct_ref(cur, eid, text, sv):
    rp = _parse_loop(text, "struct_ref")
    if not rp:
        rid = sv.get("_struct_ref.id")
        eid2 = sv.get("_struct_ref.entity_id")
        if rid and eid2:
            rp = [{"id": rid, "entity_id": eid2,
                   "db_name": sv.get("_struct_ref.db_name"),
                   "db_code": sv.get("_struct_ref.db_code"),
                   "pdbx_db_accession": sv.get("_struct_ref.pdbx_db_accession")}]
    if not rp: return 0
    return _many(cur, """INSERT INTO struct_ref
        (id,entry_id,entity_id,db_name,db_code,pdbx_db_accession)
        VALUES (%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
        [(r.get("id"), eid, r.get("entity_id"), r.get("db_name"),
          r.get("db_code"), r.get("pdbx_db_accession")) for r in rp])

def load_struct_ref_seq(cur, eid, text):
    rp = _parse_loop(text, "struct_ref_seq")
    if not rp: return 0
    return _many(cur, """INSERT INTO struct_ref_seq
        (align_id,entry_id,ref_id,pdbx_PDB_id_code,pdbx_strand_id,
         seq_align_beg,pdbx_seq_align_beg_ins_code,
         seq_align_end,pdbx_seq_align_end_ins_code,
         pdbx_db_accession,db_align_beg,pdbx_db_align_beg_ins_code,
         db_align_end,pdbx_db_align_end_ins_code,
         pdbx_auth_seq_align_beg,pdbx_auth_seq_align_end)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
        [(r.get("align_id"), eid, r.get("ref_id"),
          r.get("pdbx_pdb_id_code"), r.get("pdbx_strand_id"),
          _int(r.get("seq_align_beg")), r.get("pdbx_seq_align_beg_ins_code"),
          _int(r.get("seq_align_end")), r.get("pdbx_seq_align_end_ins_code"),
          r.get("pdbx_db_accession"),
          _int(r.get("db_align_beg")), r.get("pdbx_db_align_beg_ins_code"),
          _int(r.get("db_align_end")), r.get("pdbx_db_align_end_ins_code"),
          r.get("pdbx_auth_seq_align_beg"), r.get("pdbx_auth_seq_align_end"))
         for r in rp])


# ══════════════════════════════════════════════════════════════════════════════
#  TIER 4
# ══════════════════════════════════════════════════════════════════════════════

def load_atom_site(cur, conn, eid, text):
    rp = _parse_loop(text, "atom_site")
    if not rp: return 0
    sql = """INSERT INTO atom_site
        (entry_id,group_PDB,type_symbol,label_atom_id,label_alt_id,
         label_comp_id,label_asym_id,label_entity_id,label_seq_id,
         Cartn_x,Cartn_y,Cartn_z,occupancy,B_iso_or_equiv,
         auth_seq_id,auth_asym_id,auth_comp_id,auth_atom_id,
         pdbx_PDB_model_num,pdbx_formal_charge,pdbx_PDB_ins_code)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)"""
    total, batch = 0, []
    for r in rp:
        batch.append((
            eid,
            r.get("group_pdb"), r.get("type_symbol"),
            r.get("label_atom_id"), r.get("label_alt_id"),
            r.get("label_comp_id"), r.get("label_asym_id"),
            r.get("label_entity_id"), _int(r.get("label_seq_id")),
            _float(r.get("cartn_x")), _float(r.get("cartn_y")), _float(r.get("cartn_z")),
            _float(r.get("occupancy")), _float(r.get("b_iso_or_equiv")),
            r.get("auth_seq_id"), r.get("auth_asym_id"),
            r.get("auth_comp_id"), r.get("auth_atom_id"),
            _int(r.get("pdbx_pdb_model_num")),
            _int(r.get("pdbx_formal_charge")),
            r.get("pdbx_pdb_ins_code"),
        ))
        if len(batch) >= ATOM_BATCH:
            cur.executemany(sql, batch)
            total += len(batch)
            conn.commit()
            batch = []
    if batch:
        cur.executemany(sql, batch)
        total += len(batch)
        conn.commit()
    return total

def load_atom_sites(cur, eid, sv):
    mp = "atom_sites.fract_transf_matrix"
    vp = "atom_sites.fract_transf_vector"
    cur.execute("""INSERT INTO atom_sites
        (entry_id,
         fract_transf_matrix_1_1,fract_transf_matrix_1_2,fract_transf_matrix_1_3,
         fract_transf_matrix_2_1,fract_transf_matrix_2_2,fract_transf_matrix_2_3,
         fract_transf_matrix_3_1,fract_transf_matrix_3_2,fract_transf_matrix_3_3,
         fract_transf_vector_1,fract_transf_vector_2,fract_transf_vector_3)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
        (eid,
         _float(_get_mat(sv, mp, 1, 1)), _float(_get_mat(sv, mp, 1, 2)), _float(_get_mat(sv, mp, 1, 3)),
         _float(_get_mat(sv, mp, 2, 1)), _float(_get_mat(sv, mp, 2, 2)), _float(_get_mat(sv, mp, 2, 3)),
         _float(_get_mat(sv, mp, 3, 1)), _float(_get_mat(sv, mp, 3, 2)), _float(_get_mat(sv, mp, 3, 3)),
         _float(_get_vec(sv, vp, 1)), _float(_get_vec(sv, vp, 2)), _float(_get_vec(sv, vp, 3))))
    return 1

def load_database_pdb_matrix(cur, eid, sv):
    mp = "database_pdb_matrix.origx"
    vp = "database_pdb_matrix.origx_vector"
    cur.execute("""INSERT INTO database_PDB_matrix
        (entry_id,
         origx_1_1,origx_1_2,origx_1_3,
         origx_2_1,origx_2_2,origx_2_3,
         origx_3_1,origx_3_2,origx_3_3,
         origx_vector_1,origx_vector_2,origx_vector_3)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
        (eid,
         _float(_get_mat(sv, mp, 1, 1)), _float(_get_mat(sv, mp, 1, 2)), _float(_get_mat(sv, mp, 1, 3)),
         _float(_get_mat(sv, mp, 2, 1)), _float(_get_mat(sv, mp, 2, 2)), _float(_get_mat(sv, mp, 2, 3)),
         _float(_get_mat(sv, mp, 3, 1)), _float(_get_mat(sv, mp, 3, 2)), _float(_get_mat(sv, mp, 3, 3)),
         _float(_get_vec(sv, vp, 1)), _float(_get_vec(sv, vp, 2)), _float(_get_vec(sv, vp, 3))))
    return 1


# ══════════════════════════════════════════════════════════════════════════════
#  TIER 5
# ══════════════════════════════════════════════════════════════════════════════

def load_struct_conf_type(cur, text):
    rp = _parse_loop(text, "struct_conf")
    if not rp: return 0
    type_ids = {r.get("conf_type_id") for r in rp if r.get("conf_type_id")}
    if not type_ids: return 0
    cur.executemany(
        "INSERT INTO struct_conf_type (id) VALUES (%s) ON CONFLICT DO NOTHING",
        [(t,) for t in sorted(type_ids)])
    return len(type_ids)

def load_struct_conf(cur, eid, text):
    rp = _parse_loop(text, "struct_conf")
    if not rp: return 0
    return _many(cur, """INSERT INTO struct_conf
        (id,entry_id,conf_type_id,pdbx_PDB_helix_id,
         beg_label_comp_id,beg_label_asym_id,beg_label_seq_id,pdbx_beg_PDB_ins_code,
         end_label_comp_id,end_label_asym_id,end_label_seq_id,pdbx_end_PDB_ins_code,
         beg_auth_comp_id,beg_auth_asym_id,beg_auth_seq_id,
         end_auth_comp_id,end_auth_asym_id,end_auth_seq_id,
         pdbx_PDB_helix_class,details,pdbx_PDB_helix_length)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT DO NOTHING""",
        [(r.get("id"), eid, r.get("conf_type_id"), r.get("pdbx_pdb_helix_id"),
          r.get("beg_label_comp_id"), r.get("beg_label_asym_id"), _int(r.get("beg_label_seq_id")),
          r.get("pdbx_beg_pdb_ins_code"),
          r.get("end_label_comp_id"), r.get("end_label_asym_id"), _int(r.get("end_label_seq_id")),
          r.get("pdbx_end_pdb_ins_code"),
          r.get("beg_auth_comp_id"), r.get("beg_auth_asym_id"), r.get("beg_auth_seq_id"),
          r.get("end_auth_comp_id"), r.get("end_auth_asym_id"), r.get("end_auth_seq_id"),
          r.get("pdbx_pdb_helix_class"), r.get("details"), _int(r.get("pdbx_pdb_helix_length")))
         for r in rp])

def load_struct_sheet(cur, eid, text):
    rp = _parse_loop(text, "struct_sheet")
    if not rp: return 0
    return _many(cur, """INSERT INTO struct_sheet
        (id,entry_id,type,number_strands,details)
        VALUES (%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
        [(r.get("id"), eid, r.get("type"),
          _int(r.get("number_strands")), r.get("details")) for r in rp])

def load_struct_sheet_order(cur, eid, text):
    rp = _parse_loop(text, "struct_sheet_order")
    if not rp: return 0
    # "offset" is a reserved PG keyword — must be double-quoted
    return _many(cur, """INSERT INTO struct_sheet_order
        (sheet_id,entry_id,range_id_1,range_id_2,"offset",sense)
        VALUES (%s,%s,%s,%s,%s,%s)""",
        [(r.get("sheet_id"), eid,
          r.get("range_id_1"), r.get("range_id_2"),
          r.get("offset"), r.get("sense")) for r in rp])

def load_struct_sheet_range(cur, eid, text):
    rp = _parse_loop(text, "struct_sheet_range")
    if not rp: return 0
    return _many(cur, """INSERT INTO struct_sheet_range
        (id,sheet_id,entry_id,
         beg_label_comp_id,beg_label_asym_id,beg_label_seq_id,pdbx_beg_PDB_ins_code,
         end_label_comp_id,end_label_asym_id,end_label_seq_id,pdbx_end_PDB_ins_code,
         beg_auth_comp_id,beg_auth_asym_id,beg_auth_seq_id,
         end_auth_comp_id,end_auth_asym_id,end_auth_seq_id)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
        [(r.get("id"), r.get("sheet_id"), eid,
          r.get("beg_label_comp_id"), r.get("beg_label_asym_id"), _int(r.get("beg_label_seq_id")),
          r.get("pdbx_beg_pdb_ins_code"),
          r.get("end_label_comp_id"), r.get("end_label_asym_id"), _int(r.get("end_label_seq_id")),
          r.get("pdbx_end_pdb_ins_code"),
          r.get("beg_auth_comp_id"), r.get("beg_auth_asym_id"), r.get("beg_auth_seq_id"),
          r.get("end_auth_comp_id"), r.get("end_auth_asym_id"), r.get("end_auth_seq_id"))
         for r in rp])

def load_pdbx_struct_sheet_hbond(cur, eid, text):
    rp = _parse_loop(text, "pdbx_struct_sheet_hbond")
    if not rp: return 0
    return _many(cur, """INSERT INTO pdbx_struct_sheet_hbond
        (sheet_id,entry_id,range_id_1,range_id_2,
         range_1_label_atom_id,range_1_label_comp_id,range_1_label_asym_id,range_1_label_seq_id,
         range_1_PDB_ins_code,range_1_auth_atom_id,range_1_auth_comp_id,
         range_1_auth_asym_id,range_1_auth_seq_id,
         range_2_label_atom_id,range_2_label_comp_id,range_2_label_asym_id,range_2_label_seq_id,
         range_2_PDB_ins_code,range_2_auth_atom_id,range_2_auth_comp_id,
         range_2_auth_asym_id,range_2_auth_seq_id)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
        [(r.get("sheet_id"), eid, r.get("range_id_1"), r.get("range_id_2"),
          r.get("range_1_label_atom_id"), r.get("range_1_label_comp_id"),
          r.get("range_1_label_asym_id"), _int(r.get("range_1_label_seq_id")),
          r.get("range_1_pdb_ins_code"),
          r.get("range_1_auth_atom_id"), r.get("range_1_auth_comp_id"),
          r.get("range_1_auth_asym_id"), r.get("range_1_auth_seq_id"),
          r.get("range_2_label_atom_id"), r.get("range_2_label_comp_id"),
          r.get("range_2_label_asym_id"), _int(r.get("range_2_label_seq_id")),
          r.get("range_2_pdb_ins_code"),
          r.get("range_2_auth_atom_id"), r.get("range_2_auth_comp_id"),
          r.get("range_2_auth_asym_id"), r.get("range_2_auth_seq_id"))
         for r in rp])


# ══════════════════════════════════════════════════════════════════════════════
#  TIER 6
# ══════════════════════════════════════════════════════════════════════════════

def load_exptl(cur, eid, text, sv):
    rp = _parse_loop(text, "exptl")
    if rp:
        r = rp[0]; method = r.get("method"); crystals = _int(r.get("crystals_number"))
    else:
        method = sv.get("_exptl.method"); crystals = _int(sv.get("_exptl.crystals_number"))
    cur.execute("""INSERT INTO exptl (entry_id,method,crystals_number)
        VALUES (%s,%s,%s) ON CONFLICT DO NOTHING""", (eid, method, crystals))
    return 1

def load_cell(cur, eid, text, sv):
    rp = _parse_loop(text, "cell")
    if rp:
        r = rp[0]
        la,lb,lc = r.get("length_a"),r.get("length_b"),r.get("length_c")
        aa,ab,ag = r.get("angle_alpha"),r.get("angle_beta"),r.get("angle_gamma")
        z = r.get("z_pdb")
    else:
        g = lambda k: sv.get(f"_cell.{k}")
        la,lb,lc = g("length_a"),g("length_b"),g("length_c")
        aa,ab,ag = g("angle_alpha"),g("angle_beta"),g("angle_gamma")
        z = g("z_pdb")
    cur.execute("""INSERT INTO cell
        (entry_id,length_a,length_b,length_c,angle_alpha,angle_beta,angle_gamma,Z_PDB)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
        (eid, _float(la),_float(lb),_float(lc),_float(aa),_float(ab),_float(ag),_int(z)))
    return 1

def load_symmetry(cur, eid, sv):
    hm  = sv.get("_symmetry.space_group_name_h-m")
    itn = _int(sv.get("_symmetry.int_tables_number"))
    cur.execute("""INSERT INTO symmetry
        (entry_id,space_group_name_H_M,Int_Tables_number)
        VALUES (%s,%s,%s) ON CONFLICT DO NOTHING""", (eid, hm, itn))
    return 1

def load_reflns(cur, eid, text, sv):
    rp = _parse_loop(text, "reflns")
    if rp:
        r = rp[0]
        sig_i,sig_f = r.get("observed_criterion_sigma_i"),r.get("observed_criterion_sigma_f")
        dlo,dhi = r.get("d_resolution_low"),r.get("d_resolution_high")
        nobs,nall,pct = r.get("number_obs"),r.get("number_all"),r.get("percent_possible_obs")
    else:
        g = lambda k: sv.get(f"_reflns.{k}")
        sig_i,sig_f = g("observed_criterion_sigma_i"),g("observed_criterion_sigma_f")
        dlo,dhi = g("d_resolution_low"),g("d_resolution_high")
        nobs,nall,pct = g("number_obs"),g("number_all"),g("percent_possible_obs")
    cur.execute("""INSERT INTO reflns
        (entry_id,observed_criterion_sigma_I,observed_criterion_sigma_F,
         d_resolution_low,d_resolution_high,number_obs,number_all,percent_possible_obs)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
        (eid,_float(sig_i),_float(sig_f),_float(dlo),_float(dhi),
         _int(nobs),_int(nall),_float(pct)))
    return 1

def load_diffrn(cur, eid, text, sv):
    rp = _parse_loop(text, "diffrn")
    if rp:
        return _many(cur, """INSERT INTO diffrn
            (id,entry_id,ambient_temp) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING""",
            [(r.get("id"), eid, _float(r.get("ambient_temp"))) for r in rp])
    did = sv.get("_diffrn.id")
    if not did: return 0
    cur.execute("""INSERT INTO diffrn (id,entry_id,ambient_temp)
        VALUES (%s,%s,%s) ON CONFLICT DO NOTHING""",
        (did, eid, _float(sv.get("_diffrn.ambient_temp"))))
    return 1

def load_refine(cur, eid, text, sv):
    rp = _parse_loop(text, "refine")
    g = (lambda k: rp[0].get(k)) if rp else (lambda k: sv.get(f"_refine.{k}"))
    gf = lambda k: _float(g(k))
    gi = lambda k: _int(g(k))
    cur.execute("""INSERT INTO refine
        (entry_id,pdbx_refine_id,
         ls_number_reflns_obs,ls_number_reflns_all,
         pdbx_ls_sigma_I,pdbx_ls_sigma_F,
         ls_d_res_low,ls_d_res_high,ls_percent_reflns_obs,
         ls_R_factor_obs,ls_R_factor_all,ls_R_factor_R_work,ls_R_factor_R_free,
         ls_percent_reflns_R_free,ls_number_reflns_R_free,
         solvent_model_details,pdbx_solvent_vdw_probe_radii,pdbx_solvent_shrinkage_radii,
         pdbx_starting_model,pdbx_method_to_determine_struct,
         pdbx_stereochemistry_target_values,pdbx_R_Free_selection_details,
         overall_SU_ML,pdbx_overall_phase_error,pdbx_diffrn_id)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT DO NOTHING""",
        (eid, g("pdbx_refine_id"),
         gi("ls_number_reflns_obs"), gi("ls_number_reflns_all"),
         gf("pdbx_ls_sigma_i"), gf("pdbx_ls_sigma_f"),
         gf("ls_d_res_low"), gf("ls_d_res_high"), gf("ls_percent_reflns_obs"),
         gf("ls_r_factor_obs"), gf("ls_r_factor_all"),
         gf("ls_r_factor_r_work"), gf("ls_r_factor_r_free"),
         gf("ls_percent_reflns_r_free"), gi("ls_number_reflns_r_free"),
         g("solvent_model_details"),
         gf("pdbx_solvent_vdw_probe_radii"), gf("pdbx_solvent_shrinkage_radii"),
         g("pdbx_starting_model"), g("pdbx_method_to_determine_struct"),
         g("pdbx_stereochemistry_target_values"), g("pdbx_r_free_selection_details"),
         gf("overall_su_ml"), gf("pdbx_overall_phase_error"), g("pdbx_diffrn_id")))
    return 1


# ══════════════════════════════════════════════════════════════════════════════
#  TIER 7
# ══════════════════════════════════════════════════════════════════════════════

def load_chem_comp(cur, text):
    rp = _parse_loop(text, "chem_comp")
    if not rp: return 0
    return _many(cur, """INSERT INTO chem_comp
        (id,type,mon_nstd_flag,name,pdbx_synonyms,formula,formula_weight)
        VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
        [(r.get("id"), r.get("type"), r.get("mon_nstd_flag"),
          r.get("name"), r.get("pdbx_synonyms"), r.get("formula"),
          _float(r.get("formula_weight"))) for r in rp])


# ══════════════════════════════════════════════════════════════════════════════
#  TIER 8
# ══════════════════════════════════════════════════════════════════════════════

def load_ndb_struct_ntc_overall(cur, eid, sv):
    g = lambda k: sv.get(f"_ndb_struct_ntc_overall.{k}")
    if g("num_steps") is None and g("confal_score") is None: return 0
    cur.execute("""INSERT INTO ndb_struct_ntc_overall
        (entry_id,confal_score,confal_percentile,ntc_version,cana_version,
         num_steps,num_classified,num_unclassified,num_unclassified_rmsd_close)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
        (eid, _float(g("confal_score")), _int(g("confal_percentile")),
         g("ntc_version"), g("cana_version"),
         _int(g("num_steps")), _int(g("num_classified")),
         _int(g("num_unclassified")), _int(g("num_unclassified_rmsd_close"))))
    return 1

def load_ndb_struct_ntc_step(cur, eid, text):
    rp = _parse_loop(text, "ndb_struct_ntc_step")
    if not rp: return 0
    return _many(cur, """INSERT INTO ndb_struct_ntc_step
        (id,entry_id,name,PDB_model_number,
         label_entity_id_1,label_asym_id_1,label_seq_id_1,label_comp_id_1,label_alt_id_1,
         label_entity_id_2,label_asym_id_2,label_seq_id_2,label_comp_id_2,label_alt_id_2,
         auth_asym_id_1,auth_seq_id_1,auth_asym_id_2,auth_seq_id_2,
         PDB_ins_code_1,PDB_ins_code_2)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT DO NOTHING""",
        [(_int(r.get("id")), eid, r.get("name"), _int(r.get("pdb_model_number")),
          r.get("label_entity_id_1"), r.get("label_asym_id_1"), _int(r.get("label_seq_id_1")),
          r.get("label_comp_id_1"), r.get("label_alt_id_1"),
          r.get("label_entity_id_2"), r.get("label_asym_id_2"), _int(r.get("label_seq_id_2")),
          r.get("label_comp_id_2"), r.get("label_alt_id_2"),
          r.get("auth_asym_id_1"), r.get("auth_seq_id_1"),
          r.get("auth_asym_id_2"), r.get("auth_seq_id_2"),
          r.get("pdb_ins_code_1"), r.get("pdb_ins_code_2")) for r in rp])

def load_ndb_struct_ntc_step_summary(cur, eid, text):
    rp = _parse_loop(text, "ndb_struct_ntc_step_summary")
    if not rp: return 0
    return _many(cur, """INSERT INTO ndb_struct_ntc_step_summary
        (step_id,entry_id,assigned_CANA,assigned_NtC,confal_score,
         euclidean_distance_NtC_ideal,cartesian_rmsd_closest_NtC_representative,
         closest_CANA,closest_NtC,closest_step_golden)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
        [(_int(r.get("step_id")), eid,
          r.get("assigned_cana"), r.get("assigned_ntc"),
          _float(r.get("confal_score")),
          _float(r.get("euclidean_distance_ntc_ideal")),
          _float(r.get("cartesian_rmsd_closest_ntc_representative")),
          r.get("closest_cana"), r.get("closest_ntc"),
          r.get("closest_step_golden")) for r in rp])

def load_ndb_struct_ntc_step_parameters(cur, eid, text):
    rp = _parse_loop(text, "ndb_struct_ntc_step_parameters")
    if not rp: return 0
    f = _float
    sql = """INSERT INTO ndb_struct_ntc_step_parameters
        (step_id,entry_id,
         tor_delta_1,tor_epsilon_1,tor_zeta_1,tor_alpha_2,tor_beta_2,tor_gamma_2,tor_delta_2,
         tor_chi_1,tor_chi_2,dist_NN,dist_CC,tor_NCCN,
         diff_tor_delta_1,diff_tor_epsilon_1,diff_tor_zeta_1,
         diff_tor_alpha_2,diff_tor_beta_2,diff_tor_gamma_2,diff_tor_delta_2,
         diff_tor_chi_1,diff_tor_chi_2,diff_dist_NN,diff_dist_CC,diff_tor_NCCN,
         confal_tor_delta_1,confal_tor_epsilon_1,confal_tor_zeta_1,
         confal_tor_alpha_2,confal_tor_beta_2,confal_tor_gamma_2,confal_tor_delta_2,
         confal_tor_chi_1,confal_tor_chi_2,confal_dist_NN,confal_dist_CC,confal_tor_NCCN,
         details)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                %s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT DO NOTHING"""
    rows = [
        (_int(r.get("step_id")), eid,
         f(r.get("tor_delta_1")),    f(r.get("tor_epsilon_1")), f(r.get("tor_zeta_1")),
         f(r.get("tor_alpha_2")),    f(r.get("tor_beta_2")),    f(r.get("tor_gamma_2")),
         f(r.get("tor_delta_2")),    f(r.get("tor_chi_1")),     f(r.get("tor_chi_2")),
         f(r.get("dist_nn")),        f(r.get("dist_cc")),       f(r.get("tor_nccn")),
         f(r.get("diff_tor_delta_1")),   f(r.get("diff_tor_epsilon_1")), f(r.get("diff_tor_zeta_1")),
         f(r.get("diff_tor_alpha_2")),   f(r.get("diff_tor_beta_2")),    f(r.get("diff_tor_gamma_2")),
         f(r.get("diff_tor_delta_2")),
         f(r.get("diff_tor_chi_1")),     f(r.get("diff_tor_chi_2")),
         f(r.get("diff_dist_nn")),       f(r.get("diff_dist_cc")),       f(r.get("diff_tor_nccn")),
         f(r.get("confal_tor_delta_1")), f(r.get("confal_tor_epsilon_1")), f(r.get("confal_tor_zeta_1")),
         f(r.get("confal_tor_alpha_2")), f(r.get("confal_tor_beta_2")),    f(r.get("confal_tor_gamma_2")),
         f(r.get("confal_tor_delta_2")),
         f(r.get("confal_tor_chi_1")),   f(r.get("confal_tor_chi_2")),
         f(r.get("confal_dist_nn")),     f(r.get("confal_dist_cc")),     f(r.get("confal_tor_nccn")),
         r.get("details"))
        for r in rp
    ]
    return _many(cur, sql, rows)

def load_ndb_struct_sugar_step_parameters(cur, eid, text):
    rp = _parse_loop(text, "ndb_struct_sugar_step_parameters")
    if not rp: return 0
    f = _float
    return _many(cur, """INSERT INTO ndb_struct_sugar_step_parameters
        (step_id,entry_id,P_1,tau_1,Pn_1,P_2,tau_2,Pn_2,
         nu_1_1,nu_1_2,nu_1_3,nu_1_4,nu_1_5,
         nu_2_1,nu_2_2,nu_2_3,nu_2_4,nu_2_5,
         diff_nu_1_1,diff_nu_1_2,diff_nu_1_3,diff_nu_1_4,diff_nu_1_5,
         diff_nu_2_1,diff_nu_2_2,diff_nu_2_3,diff_nu_2_4,diff_nu_2_5)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,
                %s,%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
        [(_int(r.get("step_id")), eid,
          f(r.get("p_1")),   f(r.get("tau_1")), r.get("pn_1"),
          f(r.get("p_2")),   f(r.get("tau_2")), r.get("pn_2"),
          f(r.get("nu_1_1")),f(r.get("nu_1_2")),f(r.get("nu_1_3")),
          f(r.get("nu_1_4")),f(r.get("nu_1_5")),
          f(r.get("nu_2_1")),f(r.get("nu_2_2")),f(r.get("nu_2_3")),
          f(r.get("nu_2_4")),f(r.get("nu_2_5")),
          f(r.get("diff_nu_1_1")),f(r.get("diff_nu_1_2")),f(r.get("diff_nu_1_3")),
          f(r.get("diff_nu_1_4")),f(r.get("diff_nu_1_5")),
          f(r.get("diff_nu_2_1")),f(r.get("diff_nu_2_2")),f(r.get("diff_nu_2_3")),
          f(r.get("diff_nu_2_4")),f(r.get("diff_nu_2_5"))) for r in rp])

def load_ndb_base_pair_list(cur, eid, text):
    rp = _parse_loop(text, "ndb_base_pair_list")
    if not rp: return 0
    return _many(cur, """INSERT INTO ndb_base_pair_list
        (base_pair_id,entry_id,PDB_model_number,
         asym_id_1,entity_id_1,seq_id_1,comp_id_1,PDB_ins_code_1,alt_id_1,struct_oper_id_1,
         asym_id_2,entity_id_2,seq_id_2,comp_id_2,PDB_ins_code_2,alt_id_2,struct_oper_id_2,
         auth_asym_id_1,auth_seq_id_1,auth_asym_id_2,auth_seq_id_2)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT DO NOTHING""",
        [(_int(r.get("base_pair_id")), eid, _int(r.get("pdb_model_number")),
          r.get("asym_id_1"),  r.get("entity_id_1"), _int(r.get("seq_id_1")), r.get("comp_id_1"),
          r.get("pdb_ins_code_1"), r.get("alt_id_1"), r.get("struct_oper_id_1"),
          r.get("asym_id_2"),  r.get("entity_id_2"), _int(r.get("seq_id_2")), r.get("comp_id_2"),
          r.get("pdb_ins_code_2"), r.get("alt_id_2"), r.get("struct_oper_id_2"),
          r.get("auth_asym_id_1"), r.get("auth_seq_id_1"),
          r.get("auth_asym_id_2"), r.get("auth_seq_id_2")) for r in rp])

def load_ndb_base_pair_annotation(cur, eid, text):
    rp = _parse_loop(text, "ndb_base_pair_annotation")
    if not rp: return 0
    return _many(cur, """INSERT INTO ndb_base_pair_annotation
        (base_pair_id,entry_id,orientation,base_1_edge,base_2_edge,
         lw_family_num,lw_family,class,subclass)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) ON CONFLICT DO NOTHING""",
        [(_int(r.get("base_pair_id")), eid,
          r.get("orientation"), r.get("base_1_edge"), r.get("base_2_edge"),
          _int(r.get("l-w_family_num")),   # hyphen key preserved by _parse_loop
          r.get("l-w_family"),
          r.get("class"), r.get("subclass")) for r in rp])


# ══════════════════════════════════════════════════════════════════════════════
#  TIER 9
# ══════════════════════════════════════════════════════════════════════════════

def load_pdbx_validate_rmsd_bond(cur, eid, text):
    rp = _parse_loop(text, "pdbx_validate_rmsd_bond")
    if not rp: return 0
    return _many(cur, """INSERT INTO pdbx_validate_rmsd_bond
        (entry_id,PDB_model_num,
         auth_atom_id_1,auth_asym_id_1,auth_comp_id_1,auth_seq_id_1,PDB_ins_code_1,label_alt_id_1,
         auth_atom_id_2,auth_asym_id_2,auth_comp_id_2,auth_seq_id_2,PDB_ins_code_2,label_alt_id_2,
         bond_value,bond_target_value,bond_deviation,bond_standard_deviation,linker_flag)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
        [(eid, _int(r.get("pdb_model_num")),
          r.get("auth_atom_id_1"), r.get("auth_asym_id_1"), r.get("auth_comp_id_1"),
          r.get("auth_seq_id_1"), r.get("pdb_ins_code_1"), r.get("label_alt_id_1"),
          r.get("auth_atom_id_2"), r.get("auth_asym_id_2"), r.get("auth_comp_id_2"),
          r.get("auth_seq_id_2"), r.get("pdb_ins_code_2"), r.get("label_alt_id_2"),
          _float(r.get("bond_value")), _float(r.get("bond_target_value")),
          _float(r.get("bond_deviation")), _float(r.get("bond_standard_deviation")),
          r.get("linker_flag")) for r in rp])

def load_pdbx_validate_rmsd_angle(cur, eid, text):
    rp = _parse_loop(text, "pdbx_validate_rmsd_angle")
    if not rp: return 0
    return _many(cur, """INSERT INTO pdbx_validate_rmsd_angle
        (entry_id,PDB_model_num,
         auth_atom_id_1,auth_asym_id_1,auth_comp_id_1,auth_seq_id_1,PDB_ins_code_1,label_alt_id_1,
         auth_atom_id_2,auth_asym_id_2,auth_comp_id_2,auth_seq_id_2,PDB_ins_code_2,label_alt_id_2,
         auth_atom_id_3,auth_asym_id_3,auth_comp_id_3,auth_seq_id_3,PDB_ins_code_3,label_alt_id_3,
         angle_value,angle_target_value,angle_deviation,angle_standard_deviation,linker_flag)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
        [(eid, _int(r.get("pdb_model_num")),
          r.get("auth_atom_id_1"), r.get("auth_asym_id_1"), r.get("auth_comp_id_1"),
          r.get("auth_seq_id_1"), r.get("pdb_ins_code_1"), r.get("label_alt_id_1"),
          r.get("auth_atom_id_2"), r.get("auth_asym_id_2"), r.get("auth_comp_id_2"),
          r.get("auth_seq_id_2"), r.get("pdb_ins_code_2"), r.get("label_alt_id_2"),
          r.get("auth_atom_id_3"), r.get("auth_asym_id_3"), r.get("auth_comp_id_3"),
          r.get("auth_seq_id_3"), r.get("pdb_ins_code_3"), r.get("label_alt_id_3"),
          _float(r.get("angle_value")), _float(r.get("angle_target_value")),
          _float(r.get("angle_deviation")), _float(r.get("angle_standard_deviation")),
          r.get("linker_flag")) for r in rp])


# ══════════════════════════════════════════════════════════════════════════════
#  MAIN FILE PROCESSOR
# ══════════════════════════════════════════════════════════════════════════════

def process_cif(cur, conn, filepath: str) -> dict:
    text = open(filepath, encoding="utf-8", errors="replace").read()
    m = re.search(r"^data_(\S+)", text, re.MULTILINE)
    if not m:
        log.warning("  No data_ block: %s", filepath); return {}

    eid = m.group(1).strip()
    log.info("  %-12s  %s", eid, os.path.basename(filepath))
    sv = _parse_single_values(text)
    S  = {}

    # T1
    _sp(cur, "root")
    try:
        load_entry(cur, eid); _rel(cur, "root"); S["entry"] = 1
    except psycopg.Error as e:
        _rb(cur, "root")
        log.error("  Cannot insert entry %s — skipping: %s", eid, e); return {}

    S["pdbx_database_status"] = run_table(cur, "pdbx_database_status", load_pdbx_database_status, cur, eid, sv)
    S["struct"]                = run_table(cur, "struct",                load_struct,                cur, eid, sv)
    S["citation"]              = run_table(cur, "citation",              load_citation,              cur, eid, text, sv)
    S["citation_author"]       = run_table(cur, "citation_author",       load_citation_author,       cur, eid, text)

    # T2
    S["entity"] = run_table(cur, "entity", load_entity, cur, eid, text, sv)
    if _count(cur, "entity", eid) == 0:
        log.warning("    entity absent — skipping T2/T3/T4 dependents")
        for t in ["entity_poly","entity_poly_seq","entity_src_gen","pdbx_entity_nonpoly",
                  "struct_asym","pdbx_poly_seq_scheme","struct_ref","struct_ref_seq","atom_site"]:
            S[t] = 0
        S["atom_sites"]         = run_table(cur, "atom_sites",         load_atom_sites,         cur, eid, sv)
        S["database_pdb_matrix"]= run_table(cur, "database_pdb_matrix",load_database_pdb_matrix,cur, eid, sv)
        conn.commit()
        return S

    S["entity_poly"]         = run_table(cur, "entity_poly",         load_entity_poly,         cur, eid, text, sv)
    S["entity_poly_seq"]     = run_table(cur, "entity_poly_seq",     load_entity_poly_seq,     cur, eid, text)
    S["entity_src_gen"]      = run_table(cur, "entity_src_gen",      load_entity_src_gen,      cur, eid, text)
    S["pdbx_entity_nonpoly"] = run_table(cur, "pdbx_entity_nonpoly", load_pdbx_entity_nonpoly, cur, eid, text)

    # T3
    S["struct_asym"] = run_table(cur, "struct_asym", load_struct_asym, cur, eid, text, sv)
    asym_ok = _count(cur, "struct_asym", eid) > 0

    S["pdbx_poly_seq_scheme"] = run_table(cur, "pdbx_poly_seq_scheme", load_pdbx_poly_seq_scheme, cur, eid, text) if asym_ok else 0
    S["struct_ref"]           = run_table(cur, "struct_ref",           load_struct_ref,            cur, eid, text, sv)
    S["struct_ref_seq"]       = run_table(cur, "struct_ref_seq",       load_struct_ref_seq,        cur, eid, text) if _count(cur, "struct_ref", eid) > 0 else 0

    # T4
    S["atom_sites"]          = run_table(cur, "atom_sites",          load_atom_sites,         cur, eid, sv)
    S["database_pdb_matrix"] = run_table(cur, "database_pdb_matrix", load_database_pdb_matrix,cur, eid, sv)
    if asym_ok:
        try:
            n = load_atom_site(cur, conn, eid, text)
            S["atom_site"] = n
            log.info("    atom_site: %d atoms", n)
        except Exception as e:
            log.warning("    ⚠  atom_site failed: %s", e)
            S["atom_site"] = 0
    else:
        S["atom_site"] = 0

    # T5
    _sp(cur, "struct_conf_type")
    try:
        S["struct_conf_type"] = load_struct_conf_type(cur, text); _rel(cur, "struct_conf_type")
    except Exception as e:
        _rb(cur, "struct_conf_type"); S["struct_conf_type"] = 0

    S["struct_conf"]  = run_table(cur, "struct_conf",  load_struct_conf,  cur, eid, text)
    S["struct_sheet"] = run_table(cur, "struct_sheet", load_struct_sheet, cur, eid, text)

    if _count(cur, "struct_sheet", eid) > 0:
        S["struct_sheet_order"]      = run_table(cur, "struct_sheet_order",      load_struct_sheet_order,      cur, eid, text)
        S["struct_sheet_range"]      = run_table(cur, "struct_sheet_range",      load_struct_sheet_range,      cur, eid, text)
        S["pdbx_struct_sheet_hbond"] = run_table(cur, "pdbx_struct_sheet_hbond",load_pdbx_struct_sheet_hbond, cur, eid, text)
    else:
        S["struct_sheet_order"] = S["struct_sheet_range"] = S["pdbx_struct_sheet_hbond"] = 0

    # T6
    S["exptl"]    = run_table(cur, "exptl",    load_exptl,    cur, eid, text, sv)
    S["cell"]     = run_table(cur, "cell",     load_cell,     cur, eid, text, sv)
    S["symmetry"] = run_table(cur, "symmetry", load_symmetry, cur, eid, sv)
    S["reflns"]   = run_table(cur, "reflns",   load_reflns,   cur, eid, text, sv)
    S["diffrn"]   = run_table(cur, "diffrn",   load_diffrn,   cur, eid, text, sv)
    S["refine"]   = run_table(cur, "refine",   load_refine,   cur, eid, text, sv)

    # T7
    S["chem_comp"] = run_table(cur, "chem_comp", load_chem_comp, cur, text)

    # T8
    S["ndb_struct_ntc_overall"] = run_table(cur, "ndb_struct_ntc_overall", load_ndb_struct_ntc_overall, cur, eid, sv)
    S["ndb_struct_ntc_step"]    = run_table(cur, "ndb_struct_ntc_step",    load_ndb_struct_ntc_step,    cur, eid, text)
    step_ok = _count(cur, "ndb_struct_ntc_step", eid) > 0
    if step_ok:
        S["ndb_struct_ntc_step_summary"]      = run_table(cur, "ndb_struct_ntc_step_summary",      load_ndb_struct_ntc_step_summary,      cur, eid, text)
        S["ndb_struct_ntc_step_parameters"]   = run_table(cur, "ndb_struct_ntc_step_parameters",   load_ndb_struct_ntc_step_parameters,   cur, eid, text)
        S["ndb_struct_sugar_step_parameters"] = run_table(cur, "ndb_struct_sugar_step_parameters", load_ndb_struct_sugar_step_parameters, cur, eid, text)
    else:
        S["ndb_struct_ntc_step_summary"] = S["ndb_struct_ntc_step_parameters"] = S["ndb_struct_sugar_step_parameters"] = 0

    S["ndb_base_pair_list"] = run_table(cur, "ndb_base_pair_list", load_ndb_base_pair_list, cur, eid, text)
    S["ndb_base_pair_annotation"] = run_table(cur, "ndb_base_pair_annotation", load_ndb_base_pair_annotation, cur, eid, text) if _count(cur, "ndb_base_pair_list", eid) > 0 else 0

    # T9
    S["pdbx_validate_rmsd_bond"]  = run_table(cur, "pdbx_validate_rmsd_bond",  load_pdbx_validate_rmsd_bond,  cur, eid, text)
    S["pdbx_validate_rmsd_angle"] = run_table(cur, "pdbx_validate_rmsd_angle", load_pdbx_validate_rmsd_angle, cur, eid, text)

    conn.commit()
    return S


# ══════════════════════════════════════════════════════════════════════════════
#  SCHEMA VERIFICATION
# ══════════════════════════════════════════════════════════════════════════════

def verify(conn, eid):
    log.info("")
    log.info("══════════════════════════════════════════════════")
    log.info("  SCHEMA VERIFICATION — %s", eid)
    log.info("══════════════════════════════════════════════════")
    checks = [
        ("entry",                "SELECT id FROM entry WHERE id=%s"),
        ("struct title",         "SELECT title FROM struct WHERE entry_id=%s"),
        ("exptl method",         "SELECT method FROM exptl WHERE entry_id=%s"),
        ("space group",          "SELECT space_group_name_h_m FROM symmetry WHERE entry_id=%s"),
        ("cell a-axis",          "SELECT length_a FROM cell WHERE entry_id=%s"),
        ("refine R-work",        "SELECT ls_r_factor_r_work FROM refine WHERE entry_id=%s"),
        ("entity count",         "SELECT COUNT(*) FROM entity WHERE entry_id=%s"),
        ("entity_poly count",    "SELECT COUNT(*) FROM entity_poly WHERE entry_id=%s"),
        ("struct_asym count",    "SELECT COUNT(*) FROM struct_asym WHERE entry_id=%s"),
        ("atom_site count",      "SELECT COUNT(*) FROM atom_site WHERE entry_id=%s"),
        ("chem_comp count",      "SELECT COUNT(*) FROM chem_comp"),
        ("ntc_step count",       "SELECT COUNT(*) FROM ndb_struct_ntc_step WHERE entry_id=%s"),
        ("ntc_summary count",    "SELECT COUNT(*) FROM ndb_struct_ntc_step_summary WHERE entry_id=%s"),
        ("ntc_params count",     "SELECT COUNT(*) FROM ndb_struct_ntc_step_parameters WHERE entry_id=%s"),
        ("sugar_params count",   "SELECT COUNT(*) FROM ndb_struct_sugar_step_parameters WHERE entry_id=%s"),
        ("base_pair count",      "SELECT COUNT(*) FROM ndb_base_pair_list WHERE entry_id=%s"),
        ("bp_annotation count",  "SELECT COUNT(*) FROM ndb_base_pair_annotation WHERE entry_id=%s"),
        ("bond_outliers",        "SELECT COUNT(*) FROM pdbx_validate_rmsd_bond WHERE entry_id=%s"),
        ("angle_outliers",       "SELECT COUNT(*) FROM pdbx_validate_rmsd_angle WHERE entry_id=%s"),
        ("FK atom→chain",
         "SELECT COUNT(*) FROM atom_site a JOIN struct_asym sa "
         "ON a.label_asym_id=sa.id AND a.entry_id=sa.entry_id WHERE a.entry_id=%s"),
        ("FK chain→entity",
         "SELECT COUNT(*) FROM struct_asym sa JOIN entity e "
         "ON sa.entity_id=e.id AND sa.entry_id=e.entry_id WHERE sa.entry_id=%s"),
        ("FK ntc_step→entry",
         "SELECT COUNT(*) FROM ndb_struct_ntc_step s JOIN entry e ON s.entry_id=e.id WHERE s.entry_id=%s"),
    ]
    ok = warn = 0
    with conn.cursor() as cur:
        for name, q in checks:
            try:
                if "%s" in q:
                    cur.execute(q, (eid,))
                else:
                    cur.execute(q)
                val = cur.fetchone()[0]
                status = "✓" if val not in (None, 0, "") else "⚠"
                if status == "⚠": warn += 1
                else: ok += 1
                log.info("  %s  %-28s %s", status, name, val)
            except Exception as e:
                log.error("  ✗  %-28s ERROR: %s", name, e)
                warn += 1
    log.info("")
    log.info("  %d checks passed, %d warnings/empty", ok, warn)


# ══════════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════

def main():
    p = argparse.ArgumentParser(description="NADB PostgreSQL unified loader (Tiers 1-9)")
    grp = p.add_mutually_exclusive_group(required=True)
    grp.add_argument("--cif",     help="Path to a single CIF file")
    grp.add_argument("--cif-dir", help="Directory of CIF files")
    p.add_argument("--pgdata", default=str(PGDATA_DIR), help="Postgres data directory")
    p.add_argument("--reset",  action="store_true",
                   help="Embedded mode only: drop and recreate the nadb database")
    p.add_argument("--env-file", default=".env",
                   help="File holding DB_HOST, DB_USER and friends (default: .env)")
    p.add_argument("--reload", action="store_true",
                   help="Load files even if they are already recorded as complete. "
                        "Each one is deleted first, so nothing is duplicated.")
    args = p.parse_args()

    pgdata = Path(args.pgdata)
    pgdata.mkdir(parents=True, exist_ok=True)

    # Decided before scanning the disk, so the log names the database even
    # when no files are found.
    load_env_file(args.env_file)
    db_uri = external_uri()

    if db_uri:
        # A real server: db/migrate.mjs owns the schema, so nothing to apply.
        log.info("Using PostgreSQL at %s/%s",
                 os.environ["DB_HOST"], os.environ.get("DB_NAME", "na3db"))
        log.info("Schema is owned by db/migrations, not applying %s",
                 SCHEMA_FILE.name)
    else:
        # No DB_HOST: the embedded server, which creates its own schema.
        if pgserver is None:
            log.error("No DB_HOST set and pgserver is not installed.")
            log.error("Either set DB_HOST (see .env) or: pip install pgserver")
            sys.exit(1)

        log.info("No DB_HOST set, starting embedded postgres at %s", pgdata)
        server = pgserver.get_server(str(pgdata))
        log.info("Server URI: %s", server.get_uri())

        with psycopg.connect(server.get_uri(), autocommit=True) as c:
            with c.cursor() as cur:
                if args.reset:
                    cur.execute(f"DROP DATABASE IF EXISTS {DB_NAME}")
                    log.info("Dropped database %s", DB_NAME)
                cur.execute("SELECT 1 FROM pg_database WHERE datname=%s", (DB_NAME,))
                if not cur.fetchone():
                    cur.execute(f"CREATE DATABASE {DB_NAME} ENCODING 'UTF8'")
                    log.info("Created database %s", DB_NAME)
                else:
                    log.info("Database %s already exists", DB_NAME)

        db_uri = server.get_uri(database=DB_NAME)

        with psycopg.connect(db_uri) as c:
            with c.cursor() as cur:
                cur.execute(SCHEMA_FILE.read_text())
            c.commit()
        log.info("Schema applied ✓  (%d tables)", len(ALL_TABLES))

    cif_files = [args.cif] if args.cif else sorted(
        str(f) for f in Path(args.cif_dir).glob("*.cif"))
    if not cif_files:
        log.error("No CIF files found"); sys.exit(1)
    log.info("Found %d CIF file(s)", len(cif_files))

    # Repair what a previous run left half-written, then list what is left.
    with psycopg.connect(db_uri) as conn:
        clean_partial_entries(conn)
        done = set() if args.reload else already_loaded(conn)

    pending = [f for f in cif_files if entry_id_from(f) not in done]
    skipped = len(cif_files) - len(pending)

    if skipped:
        log.info("Skipping %d file(s) already loaded. %d to do.", skipped, len(pending))
    if not pending:
        log.info("Nothing to do — every file is already loaded.")
        return

    # Load files
    totals = {t: 0 for t in ALL_TABLES}
    errors = []

    for fp in pending:
        eid = entry_id_from(fp)
        try:
            with psycopg.connect(db_uri) as conn:
                with conn.cursor() as cur:
                    # --reload: drop the old copy, or rows double in the
                    # tables with generated ids.
                    if args.reload:
                        cur.execute("DELETE FROM entry WHERE id = %s", (eid,))
                        conn.commit()

                    S = process_cif(cur, conn, fp)

                    if S:
                        mark_loaded(conn, cur, eid, fp)

                if not S:
                    errors.append(fp)
                for t, n in S.items():
                    totals[t] = totals.get(t, 0) + (n or 0)
        except Exception as e:
            log.error("  ✗ Crash on %s: %s", fp, e)
            log.debug(traceback.format_exc())
            errors.append(fp)

    # Summary
    log.info("")
    log.info("══════════════════════════════════════════════════")
    log.info("  LOAD COMPLETE — %d file(s), %d error(s)", len(pending), len(errors))
    log.info("══════════════════════════════════════════════════")
    log.info("  %-40s  %s", "Table", "Rows")
    log.info("  " + "-"*50)
    for t in ALL_TABLES:
        log.info("  %-40s  %d", t, totals.get(t, 0))

    # Verify last loaded entry
    if cif_files and not errors:
        last = cif_files[-1]
        text = open(last, encoding="utf-8", errors="replace").read()
        m = re.search(r"^data_(\S+)", text, re.MULTILINE)
        if m:
            with psycopg.connect(db_uri) as conn:
                verify(conn, m.group(1).strip())

    if errors:
        log.warning("Files with errors: %s", errors)


if __name__ == "__main__":
    main()
