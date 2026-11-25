// The filters in use as chips above the results (app.js paint_chips), so a
// phone shows what narrowed the list without opening the panel. Built from
// the registry: nothing here names a filter. The prominent box gives none; it
// is on screen already.

import { withValue, withPills } from "./panelForm.js";

const NOT = "not_";

const byKey = (registry) => Object.fromEntries(registry.filters.map((f) => [f.key, f]));

// chip_text: "Method: X-ray", "Resolution ≥ 2", "Author: Smith".
function chipText(f, value, tops) {
  if (f.kind === "pills") return `${f.label}: ${f.options.find((o) => o.value === value)?.label ?? value}`;
  if (f.kind === "range") return `${f.label} ${tops.has(f.key) ? "≤" : "≥"} ${value}`;
  return `${f.label}: ${value}`;
}

// One chip per value: { key, value, text }. A turned-round filter gives one
// per value it lists, read "Source organism: not Bacteria".
export function chipsOf(filters, registry) {
  const filter = byKey(registry);
  const tops = new Set(registry.filters.map((f) => f.pair_with).filter(Boolean));
  return Object.entries(filters).flatMap(([key, value]) => {
    if (key.startsWith(NOT)) {
      return value.split(",").map((v) => {
        const text = chipText(filter[key.slice(NOT.length)], v, tops);
        return { key, value: v, text: text.includes(": ") ? text.replace(": ", ": not ") : "Not " + text };
      });
    }
    const f = filter[key];
    if (!f || f.prominent) return [];
    const values = Array.isArray(value) ? value : value === "" ? [] : [value];
    return values.map((v) => ({ key, value: v, text: chipText(f, v, tops) }));
  });
}

// The form and the turned-round filters once one chip is removed: its value
// leaves a pill group (Any when none is left), a box is emptied, a not_
// filter loses that value (and goes when it has none).
export function withoutChip(panel, excluded, registry, chip) {
  const { key, value } = chip;
  if (key.startsWith(NOT)) {
    const left = Object.entries(excluded)
      .map(([k, v]) => [k, k === key ? v.split(",").filter((x) => x !== value).join(",") : v])
      .filter(([, v]) => v !== "");
    return { form: panel, excluded: Object.fromEntries(left) };
  }
  if (registry.pill_filters.includes(key)) {
    const left = panel.values[key].filter((v) => v !== value);
    return { form: withPills(panel, registry, key, left.length ? left : ["any"]), excluded };
  }
  return { form: withValue(panel, key, ""), excluded };
}
