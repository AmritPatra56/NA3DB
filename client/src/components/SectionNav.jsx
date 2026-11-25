import { useEffect } from "react";
import { PAGE_GROUPS } from "../structure.js";

// The sidebar: each group's sections, a group of one section being its own
// link. current: the section being read, marked with aria-current.
function SectionNav({ sections, current, inert }) {
  // Where the nav is a strip wider than the screen, the marked item is
  // scrolled to its middle: the nav's own scroll, outside React, so an effect.
  useEffect(() => {
    const nav = document.getElementById("section_nav");
    const item = nav?.querySelector('[aria-current="true"]');
    if (item && nav.scrollWidth > nav.clientWidth) {
      nav.scrollLeft = item.offsetLeft - nav.clientWidth / 2 + item.offsetWidth / 2;
    }
  }, [current]);

  return (
    <nav className="section_nav" id="section_nav" aria-label="Sections of this page" inert={inert}>
      {PAGE_GROUPS.map((group) => {
        const inGroup = sections.filter((s) => s.group === group.key);
        if (inGroup.length === 0) return null;
        return (
          <div className={`nav_group group_${group.key}`} key={group.key}>
            {inGroup[0].title !== group.label && <div className="nav_group_label">{group.label}</div>}
            {inGroup.map((s) => (
              <a href={`#${s.id}`} key={s.id} aria-current={s.id === current ? "true" : undefined}
                 className={`nav_item${s.title === group.label ? " nav_solo" : ""}${s.empty ? " empty" : ""}`}>{s.title}</a>
            ))}
          </div>
        );
      })}
    </nav>
  );
}

export default SectionNav;
