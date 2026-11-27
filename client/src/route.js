import { POLYMER_TYPE_ALIASES, DISPLAY_PARAMS, UNWRITTEN } from "./constants.js";

// As Express matches: any case, trailing slash optional.
const pageOf = (pathname) => pathname.toLowerCase().replace(/(.)\/$/, "$1");

export function routeOf(pathname) {
  const id = pathname.match(/^\/structure\/([^/]+)\/?$/i)?.[1];
  if (id) return { name: "structure", id: decodeURIComponent(id) };
  const page = pageOf(pathname);
  if (page === "/") return { name: "landing" };
  if (page === "/search") return { name: "search" };
  if (page === "/report") return { name: "report" };
  if (Object.hasOwn(UNWRITTEN, page.slice(1))) return { name: "unwritten" };
  return { name: "missing" };
}

export const isRouted = (pathname) => routeOf(pathname).name !== "missing";

// The server's 301s, done here as a replace.
export function redirectOf(pathname, search) {
  const params = new URLSearchParams(search);
  const page = pageOf(pathname);
  if (page === "/" && search.length > 1) return "/search" + search;
  if (page === "/search") {
    const values = params.getAll("polymer_type").flatMap((v) => v.split(","));
    if (!values.some((v) => POLYMER_TYPE_ALIASES[v])) return null;
    params.set("polymer_type", [...new Set(values.flatMap((v) => POLYMER_TYPE_ALIASES[v] ?? [v]))].join(","));
    return "/search?" + params.toString().replaceAll("+", "%20");
  }
  if (page === "/report" && [...params.keys()].every((k) => DISPLAY_PARAMS.includes(k))) return "/search";
  return null;
}

export function railOf(route, search) {
  if (route.name === "landing") return { active: null, report: false, carry: "" };
  if (route.name === "report") return { active: "report", report: true, carry: search };
  if (route.name === "error" || route.name === "missing" || route.name === "unwritten") return { active: null, report: true, carry: "" };
  if (route.name === "structure") return { active: "search", report: true, carry: "?entry_id=" + encodeURIComponent(route.id.toUpperCase()) };
  return { active: "search", report: true, carry: search };
}
