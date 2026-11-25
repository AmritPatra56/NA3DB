// The Views' tiles and how they are picked (views.ejs, views.js), as plain data
// and functions. Each tile's drawing is ViewGlyph.
import { here, replaceAddress } from "./address.js";

export const TILES = [
  { key: "1d", name: "1D", what: "Sequence and base pairs" },
  { key: "2d", name: "2D", what: "Secondary structure" },
  { key: "3d", name: "3D", what: "Model in space" },
];
export const FIRST = TILES[0].key;

// ?view= in the address picks the open tile, as server.js asked_view does.
export function askedView() {
  const asked = new URLSearchParams(here().search).get("view");
  return TILES.some((t) => t.key === asked) ? asked : FIRST;
}

// The tile an arrow key moves to (views.js next_tile): arrows wrap, Home and End go to the ends.
export function nextTile(key, at) {
  switch (key) {
    case "ArrowRight": return (at + 1) % TILES.length;
    case "ArrowLeft": return (at - 1 + TILES.length) % TILES.length;
    case "Home": return 0;
    case "End": return TILES.length - 1;
    default: return null;
  }
}

// Keep the open view in the address, so a reload or a shared link opens it
// too. The first view is the default and leaves no ?view=.
export function keepView(view) {
  const { path, search, hash } = here();
  const params = new URLSearchParams(search);
  if (view === FIRST) params.delete("view");
  else params.set("view", view);
  const query = params.toString();
  replaceAddress(path + (query ? "?" + query : "") + hash);
}

// The view a section is about (views.js view_for_section): the 1D lines for
// Base pairs and the Sequence map, the model for Conformation, none otherwise.
export function viewForSection(id) {
  if (id === "base-pairs" || id === "sequence-map") return "1d";
  if (id === "conformation") return "3d";
  return null;
}
