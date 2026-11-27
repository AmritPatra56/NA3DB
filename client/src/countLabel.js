import { number } from "./format.js";

export function countLabel(total) {
  if (total === null) return "Search";
  if (total === 0) return "No results";
  if (total === 1) return "Show 1 result";
  return `Show ${number(total)} results`;
}
