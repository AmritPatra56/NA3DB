import { useEffect, useState } from "react";
import StructureFacts from "./StructureFacts.jsx";
import Molecules from "./Molecules.jsx";
import Views from "./Views.jsx";
import Section from "./Section.jsx";
import SectionNav from "./SectionNav.jsx";
import { SHOWN_ELSEWHERE, CONFORMATION, NUCLEIC_KINDS } from "../structure.js";
import { remembered, remember } from "../remember.js";
import { viewForSection } from "../views.js";
import { NARROW, sectionBeingRead, hasScrolled } from "../reading.js";
import { useMedia } from "../hooks/useMedia.js";

function Structure({ entry, molecules }) {
  const [navFolded, setNavFolded] = useState(() => remembered("section_nav", "folded"));
  const [viewsWide, setViewsWide] = useState(() => remembered("views_wide", "on"));
  // The section being read, and the last view a section asked for. Views
  // follows that until the reader picks a view for themselves.
  const [reading, setReading] = useState(null);
  const [followView, setFollowView] = useState(null);
  const narrow = useMedia(NARROW);

  // The page follows the reading position (structure.ejs): at most once a
  // frame while scrolling, and on resize. The nav marks the section, the
  // address gets its #id once the page has moved. Listeners go in cleanup.
  useEffect(() => {
    let current = null;
    let frame = 0;
    function follow() {
      frame = 0;
      const here = sectionBeingRead();
      if (here === null || here === current) return;
      current = here;
      setReading(here);
      const view = viewForSection(here);
      if (view !== null) setFollowView(view);
      if (hasScrolled()) history.replaceState(null, "", "#" + here);
    }
    const soon = () => { if (!frame) frame = requestAnimationFrame(follow); };
    document.addEventListener("scroll", soon, { capture: true, passive: true });
    addEventListener("resize", follow);
    soon();
    return () => {
      document.removeEventListener("scroll", soon, { capture: true });
      removeEventListener("resize", follow);
      cancelAnimationFrame(frame);
    };
  }, []);

  function toggleWide() {
    const wide = !viewsWide;
    setViewsWide(wide);
    remember("views_wide", wide ? "on" : "off");
  }

  function toggleNav() {
    const folded = !navFolded;
    setNavFolded(folded);
    remember("section_nav", folded ? "folded" : "open");
  }

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
      body: nucleicChains > 0 && <Views pdbId={entry.pdb_id} viewer={entry.viewer} follow={followView} /> },
    { id: "overview", title: "Overview", group: "overview",
      body: <StructureFacts rows={shown.filter((row) => !CONFORMATION.has(row.key))} /> },
    { id: "molecules", title: "Molecules", group: "composition",
      empty: !molecules.groups.some((g) => g.polymer),
      body: <Molecules pdbId={entry.pdb_id} molecules={molecules} /> },
    { id: "conformation", title: "Conformation", group: "structure",
      empty: conformation.length === 0,
      body: <StructureFacts rows={conformation} /> },
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
