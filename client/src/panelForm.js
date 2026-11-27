export const NUMBER = /^-?(\d+(\.\d+)?|\.\d+)([eE][-+]?\d+)?$/;

const byKey = (registry) => Object.fromEntries(registry.filters.map((f) => [f.key, f]));

function revealedBy(registry, groupKey) {
  return registry.filters
    .filter((f) => f.revealed_by && (groupKey === null || f.revealed_by.key === groupKey))
    .map((f) => ({ filter: f, keys: [f.key, f.pair_with] }));
}

const picks = (values, filter) => values[filter.revealed_by.key].some((v) => filter.revealed_by.values.includes(v));

function syncRevealed(panel, registry, groupKey, keepFilled) {
  const values = { ...panel.values };
  const shown = { ...panel.shown };
  for (const { filter, keys } of revealedBy(registry, groupKey)) {
    const filled = keys.some((k) => values[k].trim() !== "");
    shown[filter.key] = picks(values, filter) || (keepFilled && filled);
    if (!shown[filter.key]) for (const k of keys) values[k] = "";
  }
  return { values, shown };
}

export function panelFromParams(params, registry) {
  const filters = byKey(registry);
  const values = {};
  for (const key of registry.text_filters) {
    const value = params.get(key) ?? "";
    values[key] = filters[key].kind === "range" && !NUMBER.test(value) ? "" : value;
  }
  for (const key of registry.pill_filters) {
    const asked = params.get(key)?.split(",") ?? ["any"];
    const offered = [...(filters[key].any ? ["any"] : []), ...filters[key].options.map((o) => o.value)];
    values[key] = offered.filter((v) => asked.includes(v));
  }
  return syncRevealed({ values, shown: {} }, registry, null, true);
}

export const withValue = (panel, name, value) => ({ ...panel, values: { ...panel.values, [name]: value } });

export function withPill(panel, registry, key, value) {
  const now = panel.values[key];
  const next = value === "any" ? ["any"]
             : now.includes(value) ? now.filter((v) => v !== value && v !== "any")
             : [...now.filter((v) => v !== "any"), value];
  return withPills(panel, registry, key, next);
}

export const withPills = (panel, registry, key, values) => syncRevealed(withValue(panel, key, values), registry, key, false);

export function pillsOf(filter, counts, asked) {
  const n = counts?.[filter.key];
  const shown = filter.options.filter((o) => !o.band && !(n && !n[o.value] && !asked.includes(o.value)));
  return {
    options: shown.map((o, i) => ({ ...o, extra: i >= (filter.first ?? Infinity), count: n ? n[o.value] ?? 0 : null })),
    bands: filter.options.filter((o) => o.band),
  };
}

export function filtersOfPanel(panel, registry) {
  const filters = byKey(registry);
  const out = {};
  for (const key of registry.text_filters) out[key] = panel.values[key].trim();
  for (const key of registry.pill_filters) {
    const drawn = [...filters[key].options.filter((o) => !o.band), ...filters[key].options.filter((o) => o.band)];
    out[key] = drawn.map((o) => o.value).filter((v) => panel.values[key].includes(v));
  }
  return out;
}

export function fieldsOf(registry, group) {
  const mine = registry.filters.filter((f) => f.group === group.name && !f.prominent);
  const partners = new Set(mine.filter((f) => f.kind === "range" && f.pair_with).map((f) => f.pair_with));
  return mine.filter((f) => !partners.has(f.key)).map((f) => ({ ...f, partner: mine.find((x) => x.key === f.pair_with) }));
}
