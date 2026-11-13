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
        self.params = rows
        if "(" not in sql: return
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


class EmReconstruction(unittest.TestCase):
    def em(self, entry):
        return [(r["id"], r["image_processing_id"], r["resolution"], r["resolution_method"],
                 r["num_particles"], r["symmetry_type"])
                for r in load(lc.load_em_3d_reconstruction, entry)]

    def test_3jcs_resolution_missing_from_refine(self):
        self.assertEqual(self.em("3JCS"), [("1", "1", 2.8, "FSC 0.143 CUT-OFF", 107134, "POINT")])

    def test_2go5_null_particles_other_method(self):
        self.assertEqual(self.em("2GO5"), [("1", "1", 7.4, "FSC 0.5 CUT-OFF", None, "POINT")])

    def test_6wdr_two_reconstructions(self):
        self.assertEqual(self.em("6WDR"), [("1", "1", 3.7, "FSC 0.143 CUT-OFF", 90692, "POINT"),
                                          ("2", "2", 3.7, "FSC 0.143 CUT-OFF", 90692, "POINT")])

    def test_xray_entry_has_none(self):
        cur = Rows()
        self.assertEqual(lc.load_em_3d_reconstruction(cur, "1B23", cif("1B23")), 0)
        self.assertFalse(hasattr(cur, "rows"))


class ParentBases(unittest.TestCase):
    def test_1ob5_modified_bases_name_their_parent(self):
        cur = Rows()
        lc.load_parent_bases(cur, cif("1OB5"))
        pairs = {(code, par) for par, code in cur.params}
        self.assertTrue({("5MC", "C"), ("PSU", "U"), ("M2G", "G")} <= pairs)


class FakeCursor:
    """Records inserts; answers the oper_list lookup with the given ids."""
    def __init__(self, known=()):
        self.known, self.rows = list(known), {}

    def execute(self, sql, args=None):
        self.last = sql

    def fetchall(self):
        return [(k,) for k in self.known]

    def executemany(self, sql, rows):
        table = sql.split("INSERT INTO")[1].split()[0]
        self.rows.setdefault(table, []).extend(rows)


class Assemblies(unittest.TestCase):
    def test_operator_ids_reads_every_shape_in_the_files(self):
        ids = lc.operator_ids
        self.assertEqual(ids("1"), ["1"])
        self.assertEqual(ids("1,2"), ["1", "2"])
        self.assertEqual(ids("(1-3)"), ["1", "2", "3"])
        self.assertEqual(ids("(1,2,6)"), ["1", "2", "6"])
        self.assertEqual(ids("P"), ["P"])
        self.assertEqual(ids("(X0)(1-2,5-6)"), ["X0", "1", "2", "5", "6"])
        self.assertEqual(ids(" 1,\n2 "), ["1", "2"])

    def test_operator_ids_refuses_what_it_cannot_read(self):
        for bad in ["", "(3-1)", "1,,2", "(1-2", "1(2)"]:
            with self.assertRaises(ValueError, msg=bad):
                lc.operator_ids(bad)

    def test_generators_and_their_chains_go_in_together(self):
        text = ("loop_\n_pdbx_struct_assembly_gen.assembly_id\n_pdbx_struct_assembly_gen.oper_expression\n"
                "_pdbx_struct_assembly_gen.asym_id_list\n1 '1,\n2' A,B\n2 1 'C,\nD'\n#\n")
        cur = FakeCursor(["1", "2"])
        self.assertEqual(lc.load_pdbx_struct_assembly_gen(cur, "ZZ01", text), 2)
        self.assertEqual(cur.rows["pdbx_struct_assembly_gen"],
                         [("ZZ01", 1, "1", "1,2", "A,B"), ("ZZ01", 2, "2", "1", "C,D")])
        self.assertEqual(cur.rows["pdbx_struct_assembly_gen_asym"],
                         [("ZZ01", 1, "A"), ("ZZ01", 1, "B"), ("ZZ01", 2, "C"), ("ZZ01", 2, "D")])

    def test_an_unknown_operator_stops_the_whole_category(self):
        text = ("loop_\n_pdbx_struct_assembly_gen.assembly_id\n_pdbx_struct_assembly_gen.oper_expression\n"
                "_pdbx_struct_assembly_gen.asym_id_list\n1 1 A\n2 1,3 A\n#\n")
        cur = FakeCursor(["1", "2"])
        with self.assertRaisesRegex(ValueError, r"unknown operator\(s\) \['3'\]"):
            lc.load_pdbx_struct_assembly_gen(cur, "ZZ01", text)
        self.assertEqual(cur.rows, {})

    def test_an_operator_without_its_matrix_is_refused(self):
        text = ("_pdbx_struct_oper_list.id 1\n_pdbx_struct_oper_list.type 'identity operation'\n"
                + "".join(f"_pdbx_struct_oper_list.matrix[{i}][{j}] {1 if i == j else 0}\n"
                          for i in (1, 2, 3) for j in (1, 2, 3) if (i, j) != (3, 3))
                + "_pdbx_struct_oper_list.vector[1] 0\n_pdbx_struct_oper_list.vector[2] 0\n"
                  "_pdbx_struct_oper_list.vector[3] 0\n#\n")
        with self.assertRaisesRegex(ValueError, r"matrix\[3\]\[3\]"):
            lc.load_pdbx_struct_oper_list(FakeCursor(), "ZZ01", text)

    def test_1ttt_three_copies_three_assemblies(self):
        text = cif("1TTT")
        cur = FakeCursor(["1"])
        self.assertEqual(lc.load_pdbx_struct_assembly(cur, "1TTT", text), 3)
        self.assertEqual(lc.load_pdbx_struct_assembly_gen(cur, "1TTT", text), 3)
        first = [a for (_, n, a) in cur.rows["pdbx_struct_assembly_gen_asym"] if n == 1]
        self.assertEqual(first, ["A", "D", "G", "H", "M", "N", "S", "V"])

    def test_1en9_one_strand_and_its_symmetry_mate(self):
        text = cif("1EN9")
        cur = FakeCursor()
        self.assertEqual(lc.load_pdbx_struct_oper_list(cur, "1EN9", text), 2)
        ops = cur.rows["pdbx_struct_oper_list"]
        self.assertEqual([(o[1], o[2]) for o in ops],
                         [("1", "identity operation"), ("2", "crystal symmetry operation")])
        self.assertEqual(ops[0][5:], (1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0))
        self.assertNotEqual(ops[1][5:], ops[0][5:])
        cur.known = ["1", "2"]
        lc.load_pdbx_struct_assembly_gen(cur, "1EN9", text)
        self.assertEqual(cur.rows["pdbx_struct_assembly_gen"][0][2:4], ("1", "1,2"))

    def test_1bmv_icosahedral_operators_with_letters(self):
        text = cif("1BMV")
        cur = FakeCursor()
        self.assertEqual(lc.load_pdbx_struct_oper_list(cur, "1BMV", text), 62)
        cur.known = [o[1] for o in cur.rows["pdbx_struct_oper_list"]]
        self.assertEqual(lc.load_pdbx_struct_assembly_gen(cur, "1BMV", text), 6)
        self.assertEqual(cur.rows["pdbx_struct_assembly_gen"][5][3], "(X0)(1-15,21-35)")


if __name__ == "__main__":
    unittest.main()
