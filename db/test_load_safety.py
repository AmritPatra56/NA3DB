"""Loading is safe for the people using the site at the same time.

Each entry is one transaction: a reader sees the old version or the new one,
never half, and a crash leaves nothing behind. Runs against the test database
(.env.test) with a made-up entry ZZLS that is removed afterwards; skipped when
there is no .env.test.

    python3 -m unittest db/test_load_safety.py
"""
import os
import tempfile
import importlib.util
import unittest
from pathlib import Path
from unittest import mock

_spec = importlib.util.spec_from_file_location(
    "load_cif", Path(__file__).with_name("load_cif.py"))
lc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(lc)

ENV = Path(__file__).resolve().parent.parent / ".env.test"
if not ENV.exists():
    ENV = Path(os.environ.get("NA3DB_ENV_TEST", ENV))

ID = "ZZLS"


def cif(title, atoms):
    rows = "\n".join(
        f"ATOM {i} C C{i} . G A 1 1 ? {i}.0 0.0 0.0 1.0 20.0 1 G A C{i} 1"
        for i in range(1, atoms + 1))
    return f"""data_{ID}
_struct.entry_id {ID}
_struct.title '{title}'
_entity.id 1
_entity.type polymer
_entity.pdbx_description 'test RNA'
_struct_asym.id A
_struct_asym.entity_id 1
loop_
_atom_site.group_PDB
_atom_site.id
_atom_site.type_symbol
_atom_site.label_atom_id
_atom_site.label_alt_id
_atom_site.label_comp_id
_atom_site.label_asym_id
_atom_site.label_entity_id
_atom_site.label_seq_id
_atom_site.pdbx_PDB_ins_code
_atom_site.Cartn_x
_atom_site.Cartn_y
_atom_site.Cartn_z
_atom_site.occupancy
_atom_site.B_iso_or_equiv
_atom_site.auth_seq_id
_atom_site.auth_comp_id
_atom_site.auth_asym_id
_atom_site.auth_atom_id
_atom_site.pdbx_PDB_model_num
{rows}
"""


@unittest.skipUnless(ENV.exists(), "no .env.test")
class LoadSafety(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        lc.load_env_file(str(ENV))
        cls.uri = lc.external_uri()
        cls.dir = tempfile.TemporaryDirectory()

    @classmethod
    def tearDownClass(cls):
        cls.dir.cleanup()

    def setUp(self):
        self.remove()

    def tearDown(self):
        self.remove()

    def remove(self):
        with lc.psycopg.connect(self.uri) as c:
            c.execute("DELETE FROM entry WHERE id = %s", (ID,))
            c.execute("DELETE FROM loaded_entries WHERE entry_id = %s", (ID,))

    def file(self, title, atoms):
        path = Path(self.dir.name) / f"{ID.lower()}.cif"
        path.write_text(cif(title, atoms))
        return str(path)

    def seen(self):
        """What a visitor's connection sees right now: title, atoms, finished."""
        with lc.psycopg.connect(self.uri) as c:
            return c.execute("""
                SELECT (SELECT title FROM struct WHERE entry_id = %(id)s),
                       (SELECT count(*) FROM atom_site WHERE entry_id = %(id)s),
                       (SELECT count(*) FROM entry WHERE id = %(id)s),
                       (SELECT count(*) FROM loaded_entries WHERE entry_id = %(id)s)
            """, {"id": ID}).fetchone()

    def load(self, path, reload=False):
        with lc.psycopg.connect(self.uri) as c:
            return lc.load_one(c, path, ID, reload)

    def test_a_normal_load_saves_everything(self):
        S = self.load(self.file("Old title", 5))
        self.assertEqual(S["atom_site"], 5)
        self.assertEqual(self.seen(), ("Old title", 5, 1, 1))

    def test_nothing_is_visible_until_the_entry_is_complete(self):
        during = []
        real = lc.mark_loaded

        def look_then_save(*args):
            during.append(self.seen())
            real(*args)

        with mock.patch.object(lc, "mark_loaded", look_then_save):
            self.load(self.file("Old title", 5))

        self.assertEqual(during, [(None, 0, 0, 0)])
        self.assertEqual(self.seen(), ("Old title", 5, 1, 1))

    def test_many_atoms_in_batches_are_still_one_save(self):
        during = []
        real = lc.mark_loaded

        def look_then_save(*args):
            during.append(self.seen())
            real(*args)

        with mock.patch.object(lc, "ATOM_BATCH", 3), \
             mock.patch.object(lc, "mark_loaded", look_then_save):
            self.load(self.file("Old title", 10))

        self.assertEqual(during, [(None, 0, 0, 0)])
        self.assertEqual(self.seen(), ("Old title", 10, 1, 1))

    def test_a_crash_leaves_nothing_behind(self):
        def crash(*args):
            raise RuntimeError("power cut")

        with mock.patch.object(lc, "mark_loaded", crash):
            with self.assertRaises(RuntimeError):
                self.load(self.file("Old title", 5))

        self.assertEqual(self.seen(), (None, 0, 0, 0))

    def test_a_reload_shows_the_old_version_until_the_new_one_is_complete(self):
        self.load(self.file("Old title", 5))
        during = []
        real = lc.mark_loaded

        def look_then_save(*args):
            during.append(self.seen())
            real(*args)

        with mock.patch.object(lc, "mark_loaded", look_then_save):
            self.load(self.file("New title", 7), reload=True)

        self.assertEqual(during, [("Old title", 5, 1, 1)])
        self.assertEqual(self.seen(), ("New title", 7, 1, 1))

    def test_a_failed_reload_keeps_the_old_version(self):
        self.load(self.file("Old title", 5))

        def crash(*args):
            raise RuntimeError("power cut")

        with mock.patch.object(lc, "mark_loaded", crash):
            with self.assertRaises(RuntimeError):
                self.load(self.file("New title", 7), reload=True)

        self.assertEqual(self.seen(), ("Old title", 5, 1, 1))

    def test_a_file_that_cannot_be_loaded_saves_nothing(self):
        path = Path(self.dir.name) / "broken.cif"
        path.write_text("not a cif file\n")
        with lc.psycopg.connect(self.uri) as c:
            self.assertEqual(lc.load_one(c, str(path), ID), {})
        self.assertEqual(self.seen(), (None, 0, 0, 0))

    def test_backup_writes_a_whole_dump_and_no_part_file(self):
        out = Path(self.dir.name) / "backups"
        dump = lc.backup_before_load(out)
        self.assertTrue(dump.name.startswith(os.environ["DB_NAME"] + "-before-load-"))
        self.assertGreater(dump.stat().st_size, 1000)
        self.assertEqual(list(out.glob("*.part")), [])
        self.assertEqual(dump.read_bytes()[:5], b"PGDMP")

    def test_a_failed_backup_stops_before_anything_is_loaded(self):
        with mock.patch.dict(os.environ, {"DB_NAME": "na3db_no_such_database"}):
            with self.assertRaises(SystemExit):
                lc.backup_before_load(Path(self.dir.name) / "failed")
        self.assertEqual(list((Path(self.dir.name) / "failed").glob("*")), [])


if __name__ == "__main__":
    unittest.main()
