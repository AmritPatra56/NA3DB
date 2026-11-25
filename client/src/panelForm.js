// The filter panel as one form object (Part 6), and the rules app.js applies
// to it: picking a pill, the field a pill reveals, the options a group shows.
// No component works these out itself.
//
// panel: { values, shown }
// values: { [text or range filter]: "as typed", [pill filter]: ["any" | value, ...] }
// shown: { [revealed range]: true | false }

// What an <input type="number"> keeps of a value: a valid number or nothing.
export const NUMBER = /^-?(\d+(\.\d+)?|\.\d+)([eE][-+]?\d+)?$/;

const byKey = (registry) => Object.fromEntries(registry.filters.map((f) => [f.key, f]));

// The ranges a pill group reveals, with their partners: [{ filter, keys }].
function revealedBy(registry, groupKey) {
  return registry.filters
    .filter((f) => f.revealed_by && (groupKey === null || f.revealed_by.key === groupKey))
    .map((f) => ({ filter: f, keys: [f.key, f.pair_with] }));
}

const picks = (values, filter) => values[filter.revealed_by.key].some((v) => filter.revealed_by.values.includes(v));

// sync_revealed: a revealed range shows while one of its pills is on (or, on
// loading a link, while it is filled); hidden, its boxes are emptied, so a
// filter nobody can see never narrows the search.
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

// The panel as a link sets it (params_to_form): each box as the link says (a
// range only if it is a number), each pill group to the link's values, Any
// when it names none.
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

// One box typed in: the [name] handler.
export const withValue = (panel, name, value) => ({ ...panel, values: { ...panel.values, [name]: value } });

// One pill clicked: Any clears the rest; anything else clears Any and turns
// itself on or off. Then the field this group reveals follows it.
export function withPill(panel, registry, key, value) {
  const now = panel.values[key];
  const next = value === "any" ? ["any"]
             : now.includes(value) ? now.filter((v) => v !== value && v !== "any")
             : [...now.filter((v) => v !== "any"), value];
  return syncRevealed(withValue(panel, key, next), registry, key, false);
}

// The pills one group draws, in order: its options (one no entry has is left
// out, unless the link picked it) and the resolution bands, shown only while on.
// asked: every value the page was opened with.
export function pillsOf(filter, counts, asked) {
  const n = counts?.[filter.key];
  const shown = filter.options.filter((o) => !o.band && !(n && !n[o.value] && !asked.includes(o.value)));
  return {
    options: shown.map((o, i) => ({ ...o, extra: i >= (filter.first ?? Infinity), count: n ? n[o.value] ?? 0 : null })),
    bands: filter.options.filter((o) => o.band),
  };
}

// The filters the panel asks for (read_filters): boxes trimmed, pill groups
// without Any, in the order their pills are drawn.
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

// The fields one category draws, in registry order: the prominent box has its
// own place above the panel, and a range draws its partner beside it.
export function fieldsOf(registry, group) {
  const mine = registry.filters.filter((f) => f.group === group.name && !f.prominent);
  const partners = new Set(mine.filter((f) => f.kind === "range" && f.pair_with).map((f) => f.pair_with));
  return mine.filter((f) => !partners.has(f.key)).map((f) => ({ ...f, partner: mine.find((x) => x.key === f.pair_with) }));
}
