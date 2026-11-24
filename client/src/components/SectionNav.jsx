import { PAGE_GROUPS } from "../structure.js";

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

export default SectionNav;
