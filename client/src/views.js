import { here, replaceAddress } from "./address.js";

export const TILES = [
  { key: "1d", name: "1D", what: "Sequence and base pairs" },
  { key: "2d", name: "2D", what: "Secondary structure" },
  { key: "3d", name: "3D", what: "Model in space" },
];
export const FIRST = TILES[0].key;

export function askedView() {
  const asked = new URLSearchParams(here().search).get("view");
  return TILES.some((t) => t.key === asked) ? asked : FIRST;
}

export function nextTile(key, at) {
  switch (key) {
    case "ArrowRight": return (at + 1) % TILES.length;
    case "ArrowLeft": return (at - 1 + TILES.length) % TILES.length;
    case "Home": return 0;
    case "End": return TILES.length - 1;
    default: return null;
  }
}

export function keepView(view) {
  const { path, search, hash } = here();
  const params = new URLSearchParams(search);
  if (view === FIRST) params.delete("view");
  else params.set("view", view);
  const query = params.toString();
  replaceAddress(path + (query ? "?" + query : "") + hash);
}

export function viewForSection(id) {
  if (id === "base-pairs" || id === "sequence-map") return "1d";
  if (id === "conformation") return "3d";
  return null;
}
