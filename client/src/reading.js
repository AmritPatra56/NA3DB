export const NARROW = "(max-width: 1023px)";

// The last section whose band passed the reading line; at the bottom the last short ones never reach it, so the page end counts.
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

export const hasScrolled = () => scrollY + (document.querySelector(".results_area_body")?.scrollTop ?? 0) > 0;

export const SIDE = "(min-width: 1360px)";
