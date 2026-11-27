import { filtersToParams } from "./searchQuery.js";

export const PREVIEW_ROWS = 200;

const NOT = "not_";

export const tableOf = (tables, search) =>
  tables.find((t) => t.key === new URLSearchParams(search).get("table")) ?? tables[0];

export const optionOn = (table, search) => Boolean(table.option) && new URLSearchParams(search).get(table.option.key) === "1";

export const firstTicks = (tables, idField) =>
  Object.fromEntries(tables.map((t) => [t.key, [idField, ...t.defaults.filter((k) => k !== idField)]]));

export function fieldGroups(table) {
  const groups = [];
  for (const field of table.fields) {
    const last = groups.at(-1);
    if (last?.name === field.group) last.fields.push(field);
    else groups.push({ name: field.group, fields: [field] });
  }
  return groups;
}

export const chosenFields = (table, ticks) => table.fields.filter((f) => ticks.includes(f.key));

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

const SOURCES = { structures: "/api/export", molecules: "/api/export/molecules", ligands: "/api/export/ligands" };
export const rowsPath = (search, registry, table) => `${SOURCES[table.key]}?${exportParams(search, registry, table)}`;

export function withParam(search, key, value) {
  const params = new URLSearchParams(search);
  if (value === null) params.delete(key);
  else params.set(key, value);
  return "?" + params.toString();
}

export const cellText = (value) => (value === null || value === undefined ? "" : String(value));
