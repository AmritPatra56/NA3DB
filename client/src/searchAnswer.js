// What the search page shows of its answers (app.js paint_chips, paint_count,
// paint_box_count), worked out from them on every draw. Nothing here is kept
// in state: each answer says when it came (useApi's at), so "the last one to
// answer" is a comparison.

import { filtersOfPath } from "./searchQuery.js";

export const NOTHING = { results: [], total: 0, page: 1, page_size: 0, pages: null };

// The page of results: while the next one loads, the last answer stays (the
// list only hidden), as the old page leaves it until the new one comes; an
// error clears it.
export const resultsOf = (reply, error) => (error ? NOTHING : reply.data ?? reply.stale ?? NOTHING);

// The filters of the last search answered (paint_chips): kept while the next
// one loads, and when it fails.
export const paintedOf = (reply, registry) => (reply.good && registry ? filtersOfPath(reply.good.path, registry) : {});

// value: the number the Search button shows, from whichever answered last, a
// search or a count. A failed count says plain Search; a failed search leaves it.
// box: the count under the top box, from the same count, while the box holds
// a search (boxed) and it was not cleared since (cleared: when it last was).
// A search answered clears it.
export function totalOf(reply, count, boxed, cleared) {
  const searched = reply.good?.at ?? 0;
  const counted = count.last.at;
  if (counted <= searched) return { value: reply.good?.data.total ?? null, box: null };
  const data = count.last.data;
  return { value: data?.total ?? null, box: boxed && counted > cleared ? data : null };
}
