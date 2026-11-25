import { number } from "./format.js";

// What the panel's Search button says (app.js paint_count): how many entries
// the panel would show, so nobody applies filters that leave nothing. No
// number yet, or the count failed: plain Search, and the button still searches.
export function countLabel(total) {
  if (total === null) return "Search";
  if (total === 0) return "No results";
  if (total === 1) return "Show 1 result";
  return `Show ${number(total)} results`;
}
