// Which page an address shows, until React Router (8.1): /structure/<id> that
// entry, /search the full search, anything else the landing page.
export function routeOf(pathname) {
  const id = pathname.match(/^\/structure\/([^/]+)/)?.[1];
  if (id) return { name: "structure", id: decodeURIComponent(id) };
  if (pathname === "/search") return { name: "search" };
  return { name: "landing" };
}

// The rail as rail.ejs draws it for a page: which section is lit (a structure
// page counts as the search, as the server renders it with page "search"),
// whether Report is offered (not before there is a search), and the query
// both links carry (sync_rail_links; rail_query on a structure page).
// An error page (route name "error", page "none" on the server) lights
// nothing and carries nothing.
// search: the search page's address as it last wrote it.
export function railOf(route, search) {
  if (route.name === "landing") return { active: null, report: false, carry: "" };
  if (route.name === "error") return { active: null, report: true, carry: "" };
  if (route.name === "structure") return { active: "search", report: true, carry: "?entry_id=" + encodeURIComponent(route.id) };
  return { active: "search", report: true, carry: search };
}
