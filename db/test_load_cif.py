"""Parser tests for load_cif.py, on real files and small hand-written CIF.

Run: python3 db/test_load_cif.py
Real-file tests skip when the CIF folder is not on this machine.
"""
import os
import sys
import unittest
import importlib.util

sys.modules.setdefault("psycopg", type(sys)("psycopg"))
_spec = importlib.util.spec_from_file_location(
    "load_cif", os.path.join(os.path.dirname(__file__), "load_cif.py"))
lc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(lc)

CIF_DIR = os.environ.get("NA3DB_CIF_DIR",
                         "/home/amrit/Documents/1500_database/dnatco_extended_1500")


def cif(entry: str) -> str:
    path = os.path.join(CIF_DIR, f"{entry.lower()}.cif")
    if not os.path.exists(path):
        raise unittest.SkipTest(f"{path} not found")
    with open(path) as f:
        return f.read()


class SingleRow(unittest.TestCase):
    def test_key_value_category_is_one_row(self):
        text = "#\n_entity_src_gen.entity_id 1\n_entity_src_gen.pdbx_gene_src_scientific_name 'Thermus aquaticus'\n#\n"
        self.assertEqual(lc._parse_loop(text, "entity_src_gen"),
                         [{"entity_id": "1", "pdbx_gene_src_scientific_name": "Thermus aquaticus"}])

    def test_category_name_must_match_exactly(self):
        text = ("#\n_entity_poly.entity_id 1\n_entity_poly.type polyribonucleotide\n#\n"
                "_entity.id 1\n_entity.type polymer\n#\n")
        self.assertEqual(lc._parse_loop(text, "entity"), [{"id": "1", "type": "polymer"}])

    def test_values_read_like_loop_values(self):
        text = ("#\n_citation.id primary\n_citation.title\n;Crystal structure\nof a tRNA\n;\n"
                "_citation.journal_abbrev \"Nature\"\n_citation.year ?\n_citation.country .\n#\n")
        self.assertEqual(lc._parse_loop(text, "citation"),
                         [{"id": "primary", "title": "Crystal structure of a tRNA",
                           "journal_abbrev": "Nature", "year": None, "country": None}])

    def test_absent_category_gives_nothing(self):
        self.assertEqual(lc._parse_loop("#\n_entity.id 1\n#\n", "entity_src_nat"), [])

    def test_loop_form_is_unchanged(self):
        text = ("loop_\n_entity_src_gen.entity_id\n_entity_src_gen.pdbx_gene_src_scientific_name\n"
                "1 'Escherichia coli'\n2 'Thermus aquaticus'\n#\n")
        self.assertEqual([r["pdbx_gene_src_scientific_name"] for r in lc._parse_loop(text, "entity_src_gen")],
                         ["Escherichia coli", "Thermus aquaticus"])


class RealFiles(unittest.TestCase):
    def test_7ccd_organism_written_as_one_row(self):
        rows = lc._parse_loop(cif("7CCD"), "entity_src_gen")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["pdbx_gene_src_scientific_name"], "Streptomyces pristinaespiralis")
        self.assertTrue(rows[0]["pdbx_gene_src_ncbi_taxonomy_id"].isdigit())

    def test_1ob5_natural_source(self):
        rows = lc._parse_loop(cif("1OB5"), "entity_src_nat")
        self.assertEqual([(r["entity_id"], r["pdbx_organism_scientific"], r["pdbx_ncbi_taxonomy_id"])
                          for r in rows], [("2", "SACCHAROMYCES CEREVISIAE", "4932")])

    def test_1dnk_single_ligand(self):
        rows = lc._parse_loop(cif("1DNK"), "pdbx_entity_nonpoly")
        self.assertEqual(len(rows), 1)
        self.assertTrue(rows[0]["comp_id"])

    def test_1b23_loop_categories(self):
        text = cif("1B23")
        self.assertEqual({r["pdbx_gene_src_scientific_name"] for r in lc._parse_loop(text, "entity_src_gen")},
                         {"Escherichia coli", "Thermus aquaticus"})
        self.assertGreater(len(lc._parse_loop(text, "entity")), 1)


class Rows:
    """Cursor stand-in that keeps what a loader would insert, keyed by column name."""
    def executemany(self, sql, rows):
        cols = sql[sql.index("(") + 1:sql.index(")")]
        self.rows = [dict(zip([c.strip() for c in cols.split(",")], r)) for r in rows]


def load(fn, entry):
    cur = Rows()
    fn(cur, entry, cif(entry))
    return cur.rows


class Sources(unittest.TestCase):
    def test_taxid_trims_and_drops_non_positive(self):
        self.assertEqual([lc._taxid(v) for v in ["\t759272", "32630 ", "0", "-5", "?", None]],
                         [759272, 32630, None, None, None, None])

    def test_1ob5_natural_trna(self):
        self.assertEqual([(r["entity_id"], r["pdbx_src_id"], r["pdbx_organism_scientific"],
                           r["pdbx_ncbi_taxonomy_id"]) for r in load(lc.load_entity_src_nat, "1OB5")],
                         [("2", 1, "SACCHAROMYCES CEREVISIAE", 4932)])

    def test_5swm_synthetic_construct(self):
        self.assertEqual({(r["organism_scientific"], r["ncbi_taxonomy_id"])
                          for r in load(lc.load_pdbx_entity_src_syn, "5SWM")},
                         {("synthetic construct", 32630)})

    def test_9l5r_tab_in_taxid(self):
        self.assertEqual({r["pdbx_ncbi_taxonomy_id"] for r in load(lc.load_entity_src_nat, "9L5R")},
                         {759272})

    def test_3wfr_chimera_segments_and_host(self):
        rows = [r for r in load(lc.load_entity_src_gen, "3WFR") if r["entity_id"] == "3"]
        self.assertEqual([(r["pdbx_src_id"], r["pdbx_gene_src_scientific_name"],
                           r["pdbx_beg_seq_num"], r["pdbx_end_seq_num"]) for r in rows],
                         [(1, "synthetic construct", 1, 15),
                          (2, "Aquifex aeolicus (strain VF5)", 16, 453),
                          (3, "synthetic construct", 454, 512)])
        self.assertEqual({(r["pdbx_host_org_scientific_name"], r["pdbx_host_org_ncbi_taxonomy_id"])
                          for r in rows}, {("Escherichia coli", 562)})


if __name__ == "__main__":
    unittest.main()
