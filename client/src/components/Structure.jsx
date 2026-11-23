import StructureFacts from "./StructureFacts.jsx";
import Molecules from "./Molecules.jsx";

// Rows the page shows another way (detail.js SHOWN_ELSEWHERE), and the rows
// that sit under Conformation rather than Overview.
const SHOWN_ELSEWHERE = new Set(["nonstandard_residue", "monomer_flag", "ligands", "assigned_ntc", "ntc_classes"]);
const CONFORMATION = new Set(["confal_score", "confal_percentile", "ntc_step_count"]);

// detail.js PAGE_GROUPS: the nav's groups, in page order.
const PAGE_GROUPS = [
  { key: "views", label: "Views" },
  { key: "overview", label: "Overview" },
  { key: "composition", label: "Composition" },
  { key: "structure", label: "Structure" },
  { key: "references", label: "References" },
];

function Section({ id, title, group, empty, children }) {
  const groupLabel = PAGE_GROUPS.find((g) => g.key === group).label;
  return (
    <section id={id} className={`page_section group_${group}${empty ? " empty" : ""}`} aria-labelledby={`${id}-title`}>
      <div className="section_band">
        <div className="band_title">
          {/* JSX drops the line break EJS has here, so the space is written. */}
          {title !== groupLabel && <><span className="band_group">{groupLabel}</span>{" "}</>}
          <h2 id={`${id}-title`}>{title}</h2>
        </div>
      </div>
      <div className="section_body" id={`${id}-body`}>
        {children}
      </div>
    </section>
  );
}

// The sidebar: each group's sections, a group of one section being its own link.
function SectionNav({ sections }) {
  return (
    <nav className="section_nav" id="section_nav" aria-label="Sections of this page">
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

function Structure({ entry, molecules }) {
  const shown = entry.rows.filter((row) => !SHOWN_ELSEWHERE.has(row.key));
  const conformation = shown.filter((row) => CONFORMATION.has(row.key));

  // One list drives both the nav and the page. JSX is a value, so each
  // section's body can sit in the list like any other field.
  const sections = [
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
        <div className="structure_page">
          <SectionNav sections={sections} />
          {/* The fold handle; folding it needs state (Phase 3). */}
          <div className="nav_edge">
            <button type="button" className="panel_handle nav_handle" aria-controls="section_nav"
                    aria-expanded="true" aria-label="Hide the sections" title="Hide the sections">
              <i className="arrow arrow_side" aria-hidden="true"></i>
            </button>
          </div>
          {/* --rows: how many grid rows the sections take on a wide screen (style.css). */}
          <div className="detail_body" style={{ "--rows": sections.length }}>
            {sections.map((s) => (
              <Section key={s.id} id={s.id} title={s.title} group={s.group} empty={s.empty}>{s.body}</Section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Structure;
