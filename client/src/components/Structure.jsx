import { useState } from "react";
import StructureFacts from "./StructureFacts.jsx";
import Molecules from "./Molecules.jsx";
import Views from "./Views.jsx";

// Rows the page shows another way (detail.js SHOWN_ELSEWHERE), and the rows
// that sit under Conformation rather than Overview.
const SHOWN_ELSEWHERE = new Set(["nonstandard_residue", "monomer_flag", "ligands", "assigned_ntc", "ntc_classes"]);
const CONFORMATION = new Set(["confal_score", "confal_percentile", "ntc_step_count"]);
// detail.js NUCLEIC_KINDS: the Views draw only these chains.
const NUCLEIC_KINDS = new Set(["RNA", "DNA", "DNA/RNA hybrid"]);

// detail.js PAGE_GROUPS: the nav's groups, in page order.
const PAGE_GROUPS = [
  { key: "views", label: "Views" },
  { key: "overview", label: "Overview" },
  { key: "composition", label: "Composition" },
  { key: "structure", label: "Structure" },
  { key: "references", label: "References" },
];

function Section({ id, title, group, empty, tools, children }) {
  const groupLabel = PAGE_GROUPS.find((g) => g.key === group).label;
  return (
    <section id={id} className={`page_section group_${group}${empty ? " empty" : ""}`} aria-labelledby={`${id}-title`}>
      <div className="section_band">
        <div className="band_title">
          {/* JSX drops the line break EJS has here, so the space is written. */}
          {title !== groupLabel && <><span className="band_group">{groupLabel}</span>{" "}</>}
          <h2 id={`${id}-title`}>{title}</h2>
        </div>
        <div className="band_tools">{tools}</div>
      </div>
      <div className="section_body" id={`${id}-body`}>
        {children}
      </div>
    </section>
  );
}

// The sidebar: each group's sections, a group of one section being its own link.
function SectionNav({ sections, inert }) {
  return (
    <nav className="section_nav" id="section_nav" aria-label="Sections of this page" inert={inert}>
      {PAGE_GROUPS.map((group) => {
        const inGroup = sections.filter((s) => s.group === group.key);
        if (inGroup.length === 0) return null;
        return (
          <div className={`nav_group group_${group.key}`} key={group.key}>
            {inGroup[0].title !== group.label && <div className="nav_group_label">{group.label}</div>}
            {inGroup.map((s) => (
              <a href={`#${s.id}`} key={s.id}
                 className={`nav_item${s.title === group.label ? " nav_solo" : ""}${s.empty ? " empty" : ""}`}>{s.title}</a>
            ))}
          </div>
        );
      })}
    </nav>
  );
}

// The nav folded or open as last time, kept for the next structure (structure.ejs).
function navWasFolded() {
  try {
    return localStorage.getItem("section_nav") === "folded";
  } catch {
    return false;
  }
}

// The Views wide or narrow as last time (structure.ejs, views_wide).
function viewsWereWide() {
  try {
    return localStorage.getItem("views_wide") === "on";
  } catch {
    return false;
  }
}

function Structure({ entry, molecules }) {
  const [navFolded, setNavFolded] = useState(navWasFolded);
  const [viewsWide, setViewsWide] = useState(viewsWereWide);

  function toggleWide() {
    const wide = !viewsWide;
    setViewsWide(wide);
    try { localStorage.setItem("views_wide", wide ? "on" : "off"); } catch { /* storage blocked */ }
  }

  function toggleNav() {
    const folded = !navFolded;
    setNavFolded(folded);
    try { localStorage.setItem("section_nav", folded ? "folded" : "open"); } catch { /* storage blocked */ }
  }

  // Out of sight, the nav's links leave the tab order. Only beside the page:
  // on a narrow screen the nav is a strip that never folds. Read at each
  // render; following a resize as it happens needs useEffect (Phase 6).
  const navInert = navFolded && !matchMedia("(max-width: 1023px)").matches;
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
      body: nucleicChains > 0 && <Views pdbId={entry.pdb_id} viewer={entry.viewer} /> },
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
          <SectionNav sections={sections} inert={navInert} />
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
