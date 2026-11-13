"""Fill the assembly tables (migration 016) for entries loaded before them.

Reads only _pdbx_struct_assembly, _pdbx_struct_oper_list and
_pdbx_struct_assembly_gen, with the same functions load_cif.py uses, so a
backfilled entry matches a freshly loaded one. Nothing else is touched.

Each entry is its own transaction: all four tables or none. Entries that
already have assembly rows are skipped, so running it twice is harmless.
Any failure is reported and the script exits 1.

Run: python3 db/backfill_assemblies.py --cif-dir <dir> [--env-file .env] [--dry-run]
"""
import argparse
import importlib.util
import os
import sys
from pathlib import Path

import psycopg

_spec = importlib.util.spec_from_file_location(
    "load_cif", os.path.join(os.path.dirname(__file__), "load_cif.py"))
lc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(lc)

TABLES = ["pdbx_struct_assembly", "pdbx_struct_oper_list",
          "pdbx_struct_assembly_gen", "pdbx_struct_assembly_gen_asym"]


def backfill_entry(cur, eid: str, text: str) -> list[int]:
    """Inserts one entry's rows; raises on anything incomplete."""
    if lc.load_pdbx_struct_assembly(cur, eid, text) == 0:
        raise ValueError("no _pdbx_struct_assembly rows")
    if lc.load_pdbx_struct_oper_list(cur, eid, text) == 0:
        raise ValueError("no _pdbx_struct_oper_list rows")
    if lc.load_pdbx_struct_assembly_gen(cur, eid, text) == 0:
        raise ValueError("no _pdbx_struct_assembly_gen rows")
    return [lc._count(cur, t, eid) for t in TABLES]


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--cif-dir", required=True)
    p.add_argument("--env-file", default=".env")
    p.add_argument("--dry-run", action="store_true",
                   help="Do every insert, then roll each entry back")
    args = p.parse_args()

    lc.load_env_file(args.env_file)
    uri = lc.external_uri()
    if not uri:
        sys.exit("DB_HOST is not set")
    files = {lc.entry_id_from(f): f for f in Path(args.cif_dir).glob("*.cif")}

    with psycopg.connect(uri) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT current_database()")
            print(f"database {cur.fetchone()[0]}{'  (dry run)' if args.dry_run else ''}")
            cur.execute("""SELECT e.id FROM entry e WHERE NOT EXISTS
                (SELECT 1 FROM pdbx_struct_assembly a WHERE a.entry_id = e.id)
                ORDER BY e.id""")
            todo = [r[0] for r in cur.fetchall()]
        conn.commit()
        print(f"{len(todo)} entries without assemblies")

        totals, failed = [0] * len(TABLES), []
        for i, eid in enumerate(todo, 1):
            path = files.get(eid.upper())
            if not path:
                failed.append((eid, "no CIF file")); continue
            text = path.read_text(encoding="utf-8", errors="replace")
            try:
                with conn.transaction(force_rollback=args.dry_run), conn.cursor() as cur:
                    counts = backfill_entry(cur, eid, text)
            except (psycopg.Error, ValueError) as e:
                failed.append((eid, str(e).split("\n")[0])); continue
            totals = [t + c for t, c in zip(totals, counts)]
            if i % 100 == 0:
                print(f"  {i}/{len(todo)}")

    for t, n in zip(TABLES, totals):
        print(f"{t:32s} {n:>7,}")
    print(f"{len(todo) - len(failed)} entries filled, {len(failed)} failed")
    for eid, why in failed:
        print(f"  FAILED {eid}: {why}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
