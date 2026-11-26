import { POLYMER_TYPE_ALIASES, DISPLAY_PARAMS, UNWRITTEN } from "./constants.js";

// Which page an address shows (routes.jsx): /structure/<id> that entry,
// /search the full search, /report the report, /cite, /help and /contact the
// footer's unwritten pages, anything else the landing page for now (8.9
// brings Page not found).
export function routeOf(pathname) {
  const id = pathname.match(/^\/structure\/([^/]+)\/?$/)?.[1];
  if (id) return { name: "structure", id: decodeURIComponent(id) };
  if (pathname === "/search") return { name: "search" };
  if (pathname === "/report") return { name: "report" };
  if (Object.hasOwn(UNWRITTEN, pathname.slice(1))) return { name: "unwritten" };
  return { name: "landing" };
}

// Whether the router draws this path in place; anything else (a FASTA
// download, a server page) is loaded in full.
export const isRouted = (pathname) => pathname === "/" || routeOf(pathname).name !== "landing";

// Where the server would send an address instead (server.js), or null:
// / with a search is an old bookmark for /search; an old polymer type is put
// into its current values (current_polymer_types); /report with no search is
// a wrong turn, sent to /search. Each is a 301 there, so a replace here.
export function redirectOf(pathname, search) {
  const params = new URLSearchParams(search);
  if (pathname === "/" && search.length > 1) return "/search" + search;
  if (pathname === "/search") {
    const values = params.getAll("polymer_type").flatMap((v) => v.split(","));
    if (!values.some((v) => POLYMER_TYPE_ALIASES[v])) return null;
    params.set("polymer_type", [...new Set(values.flatMap((v) => POLYMER_TYPE_ALIASES[v] ?? [v]))].join(","));
    return "/search?" + params.toString().replaceAll("+", "%20");
  }
  if (pathname === "/report" && [...params.keys()].every((k) => DISPLAY_PARAMS.includes(k))) return "/search";
  return null;
}

// The rail as rail.ejs draws it for a page: which section is lit (a structure
// page counts as the search, as the server renders it with page "search"),
// whether Report is offered (not before there is a search), and the query
// both links carry (sync_rail_links; rail_query on a structure page).
// An error page (route name "error", page "none" on the server) lights
// nothing and carries nothing.
// search: the address's query now, which the search page keeps up to date.
export function railOf(route, search) {
  // /report draws the landing page until 8.8, so it has the landing's rail.
  if (route.name === "landing" || route.name === "report") return { active: null, report: false, carry: "" };
  if (route.name === "error" || route.name === "unwritten") return { active: null, report: true, carry: "" };
  if (route.name === "structure") return { active: "search", report: true, carry: "?entry_id=" + encodeURIComponent(route.id) };
  return { active: "search", report: true, carry: search };
}
