import { filtersOfPath } from "./searchQuery.js";

export const NOTHING = { results: [], total: 0, page: 1, page_size: 0, pages: null };

export const resultsOf = (reply, error) => (error ? NOTHING : reply.data ?? reply.stale ?? NOTHING);

export const paintedOf = (reply, registry) => (reply.good && registry ? filtersOfPath(reply.good.path, registry) : {});

export function totalOf(reply, count, boxed, cleared) {
  const searched = reply.good?.at ?? 0;
  const counted = count.last.at;
  if (counted <= searched) return { value: reply.good?.data.total ?? null, box: null };
  const data = count.last.data;
  return { value: data?.total ?? null, box: boxed && counted > cleared ? data : null };
}
