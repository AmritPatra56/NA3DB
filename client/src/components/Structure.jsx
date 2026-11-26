import StructureFacts from "./StructureFacts.jsx";
import Molecules from "./Molecules.jsx";
import Views from "./Views.jsx";
import Sources from "./Sources.jsx";
import BasePairs from "./BasePairs.jsx";
import NtcFamilies from "./NtcFamilies.jsx";
import MapGuide from "./MapGuide.jsx";
import SeqMap from "./SeqMap.jsx";
import Citation from "./Citation.jsx";
import Links from "./Links.jsx";
import Section from "./Section.jsx";
import SectionNav from "./SectionNav.jsx";
import { SHOWN_ELSEWHERE, CONFORMATION, NUCLEIC_KINDS, groupsBySection, rowCount } from "../structure.js";
import { NARROW } from "../reading.js";
import { useMedia } from "../hooks/useMedia.js";
import { useReading } from "../hooks/useReading.js";
import { useRemembered } from "../hooks/useRemembered.js";
import { useViewChoice } from "../hooks/useViewChoice.js";
import { usePairLink } from "../hooks/usePairLink.js";
import { rowsByPair } from "../lbn.js";
import { pushMark, back } from "../address.js";

function Structure({ entry, molecules, pairs, expanded }) {
  const [navFolded, toggleNav] = useRemembered("section_nav", "folded", "open");
  const [viewsWide, toggleWide] = useRemembered("views_wide", "on", "off");
  const { reading, view: followView } = useReading();
  const narrow = useMedia(NARROW);
  const choice = useViewChoice(entry.viewer, followView);
  const link = usePairLink();
  // A row of the other pairs, selected: the 1D view opens on its pair.
  const showPair = (a, b, row) => {
    choice.onShow("1d");
    link.onShowPair(a, b, row);
  };

  // Out of sight, the nav's links leave the tab order. Only beside the page:
  // on a narrow screen the nav is a strip that never folds.
  const navInert = navFolded && !narrow;
  const navLabel = navFolded ? "Show the sections" : "Hide the sections";

  const shown = entry.rows.filter((row) => !SHOWN_ELSEWHERE.has(row.key));
  const conformation = shown.filter((row) => CONFORMATION.has(row.key));

  // One list drives both the nav and the page. JSX is a value, so each
  // section's body can sit in the list like any other field.
  const nucleicChains = entry.entities
    .filter((e) => NUCLEIC_KINDS.has(e.kind))
    .reduce((n, e) => n + e.chains.length, 0);

  const groups = groupsBySection(molecules);
  const sections = [
    // Without nucleic chains the Views stay listed, marked empty, with no tiles (structure.ejs).
    { id: "views", title: "Views", group: "views", empty: nucleicChains === 0,
      // Which column is the wide one. The words say what the click does, not
      // what is on screen; style.css shows it only where there are two columns.
      tools: (
        <button type="button" className="download download_small band_swap" aria-pressed={viewsWide} onClick={toggleWide}>
          <span className="band_swap_say">{viewsWide ? "Shrink views" : "Enlarge views"}</span>
        </button>
      ),
      body: nucleicChains > 0 && <Views pdbId={entry.pdb_id} viewer={entry.viewer} choice={choice} pin={link.pin}
                                         tableRows={rowsByPair(pairs.base_pairs?.noncanonical ?? [])} onFindRow={link.onFindRow} /> },
    { id: "overview", title: "Overview", group: "overview",
      body: <StructureFacts rows={shown.filter((row) => !CONFORMATION.has(row.key))} pdbId={entry.pdb_id} cited={Boolean(entry.citation)} /> },
    { id: "molecules", title: "Molecules", group: "composition", empty: rowCount(groups.molecules) === 0,
      body: <Molecules sectionId="molecules" pdbId={entry.pdb_id} groups={groups.molecules} summary={molecules.summary} /> },
    { id: "sources", title: "Sources", group: "composition", empty: !molecules.sources?.rows.length,
      body: molecules.sources?.rows.length > 0 && <Sources sources={molecules.sources} /> },
    { id: "modified-nucleotides", title: "Modified nucleotides", group: "composition",
      empty: rowCount(groups["modified-nucleotides"]) === 0,
      body: <Molecules sectionId="modified-nucleotides" pdbId={entry.pdb_id} groups={groups["modified-nucleotides"]} /> },
    { id: "ligands", title: "Ligands", group: "composition", empty: rowCount(groups.ligands) === 0,
      body: <Molecules sectionId="ligands" pdbId={entry.pdb_id} groups={groups.ligands} /> },
    { id: "base-pairs", title: "Base pairs", group: "structure", empty: !pairs.base_pairs,
      body: pairs.base_pairs && <BasePairs pdbId={entry.pdb_id} bp={pairs.base_pairs} view={pairs.arc_view}
                                      expanded={expanded?.arc === pairs.arc_view.key}
                                      onExpand={() => pushMark({ arc: pairs.arc_view.key })} onCollapse={back}
                                      rowOn={link.rowOn} find={link.find} onShowPair={showPair} /> },
    { id: "conformation", title: "Conformation", group: "structure",
      empty: conformation.length === 0,
      body: <><StructureFacts rows={conformation} />{pairs.ntc?.families.length > 0 && <NtcFamilies ntc={pairs.ntc} />}</> },
    { id: "sequence-map", title: "Sequence map", group: "structure", empty: nucleicChains === 0,
      body: nucleicChains > 0 && <><MapGuide /><SeqMap pdbId={entry.pdb_id} expanded={expanded?.seqmap === true}
                                                        onExpand={() => pushMark({ seqmap: true })} onCollapse={back} /></> },
    // The id stays "citations" so old #citations links still land here.
    { id: "citations", title: "Citation", group: "references", empty: !entry.citation,
      body: entry.citation && <Citation pdbId={entry.pdb_id} c={entry.citation} text={entry.cite_text}
                                        unpublished={entry.cite_unpublished} authors={entry.cite_authors} /> },
    { id: "links", title: "Links and downloads", group: "references",
      body: <Links pdbId={entry.pdb_id} fasta={molecules.fasta.all} pairs={Boolean(pairs.base_pairs)} /> },
  ];

  return (
    <div className="results_area">
      <div className="results_area_header">
        <h1>{entry.pdb_id}</h1>
      </div>
      <div className="results_area_body">
        <div className={`structure_page${navFolded ? " nav_folded" : ""}${viewsWide ? " views_wide" : ""}`}>
          <SectionNav sections={sections} current={reading} inert={navInert} />
          {/* The fold handle: the sidebar slides away and the handle stays on the edge. */}
          <div className="nav_edge">
            <button type="button" className="panel_handle nav_handle" aria-controls="section_nav"
                    aria-expanded={!navFolded} aria-label={navLabel} title={navLabel} onClick={toggleNav}>
              <i className="arrow arrow_side" aria-hidden="true"></i>
            </button>
          </div>
          {/* --rows: how many grid rows the sections take on a wide screen (style.css). */}
          <div className="detail_body" style={{ "--rows": sections.length }}>
            {sections.map((s) => (
              <Section key={s.id} id={s.id} title={s.title} group={s.group} empty={s.empty} tools={s.tools}>{s.body}</Section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Structure;
