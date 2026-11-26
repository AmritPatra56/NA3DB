// The report page's logic as plain data (public/report.js): which table the
// address opens, which fields start ticked, the request for a table's rows,
// and what the preview shows. Pure, so the components only draw it.
import { filtersToParams } from "./searchQuery.js";

// How many rows the preview draws; the file itself is never capped.
export const PREVIEW_ROWS = 200;

const NOT = "not_";

// The table ?table= names, the first when it names none (server.js asked_table).
export const tableOf = (tables, search) =>
  tables.find((t) => t.key === new URLSearchParams(search).get("table")) ?? tables[0];

// Whether a table's option (Include proteins, Include water) is on in the address.
export const optionOn = (table, search) => Boolean(table.option) && new URLSearchParams(search).get(table.option.key) === "1";

// Each table's first ticks: Entry ID, then its defaults.
export const firstTicks = (tables, idField) =>
  Object.fromEntries(tables.map((t) => [t.key, [idField, ...t.defaults.filter((k) => k !== idField)]]));

// A table's fields in groups, as they come.
export function fieldGroups(table) {
  const groups = [];
  for (const field of table.fields) {
    const last = groups.at(-1);
    if (last?.name === field.group) last.fields.push(field);
    else groups.push({ name: field.group, fields: [field] });
  }
  return groups;
}

// The ticked fields of a table, in table order.
export const chosenFields = (table, ticks) => table.fields.filter((f) => ticks.includes(f.key));

// The search in the address as the export routes take it (search_params):
// the filters, the match mode and the sort, and a table's option when on.
export function exportParams(search, registry, table) {
  const asked = new URLSearchParams(search);
  const filters = {};
  for (const key of registry.text_filters) filters[key] = asked.get(key) ?? "";
  for (const key of registry.pill_filters) filters[key] = asked.get(key)?.split(",") ?? [];
  for (const key of [...registry.text_filters, ...registry.pill_filters]) {
    const value = key === "q" ? null : asked.get(NOT + key);
    if (value) filters[NOT + key] = value;
  }
  const params = filtersToParams(filters);
  if (asked.get("match")) params.set("match", asked.get("match"));
  if (asked.get("sort")) params.set("sort", asked.get("sort"));
  if (table && optionOn(table, search)) params.set(table.option.key, "1");
  return params;
}

// Where each table's rows come from.
const SOURCES = { structures: "/api/export", molecules: "/api/export/molecules", ligands: "/api/export/ligands" };
export const rowsPath = (search, registry, table) => `${SOURCES[table.key]}?${exportParams(search, registry, table)}`;

// The address with one parameter set, or taken out when value is null.
export function withParam(search, key, value) {
  const params = new URLSearchParams(search);
  if (value === null) params.delete(key);
  else params.set(key, value);
  return "?" + params.toString();
}

// One value as the preview and the file write it: nothing for none.
export const cellText = (value) => (value === null || value === undefined ? "" : String(value));
