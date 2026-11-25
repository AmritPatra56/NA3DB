// Where the reader is on the structure page (structure.ejs follow), read from
// the page as it is drawn. No state: Structure asks on each scroll.

export const NARROW = "(max-width: 1023px)";

// The section being read: the last one whose band has passed the reading
// line, 80px into the reading area, or under the nav where it is a strip at
// the top. At the very bottom the last short sections can never reach the
// line, so the end of the page counts as the last section.
export function sectionBeingRead() {
  const sections = [...document.querySelectorAll(".page_section")];
  const nav = document.querySelector(".section_nav");
  const scroller = document.querySelector(".results_area_body");
  if (sections.length === 0 || !nav || !scroller) return null;

  const line = matchMedia(NARROW).matches ? nav.getBoundingClientRect().bottom + 24
                                          : scroller.getBoundingClientRect().top + 80;
  let here = sections.filter((s) => s.getBoundingClientRect().top <= line).at(-1) ?? sections[0];

  const end = scroller.scrollHeight > scroller.clientHeight
    ? scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2
    : innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
  if (end && hasScrolled()) here = sections.at(-1);
  return here.id;
}

// Whether the page has moved at all: at the top the address keeps no #section.
export const hasScrolled = () => scrollY + (document.querySelector(".results_area_body")?.scrollTop ?? 0) > 0;
