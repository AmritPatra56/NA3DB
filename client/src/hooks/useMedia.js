import { useEffect, useState } from "react";

// Whether a media query matches now, kept up to date as the window is
// resized (the browser's own change event, removed in cleanup).
export function useMedia(query) {
  const [matches, setMatches] = useState(() => matchMedia(query).matches);

  useEffect(() => {
    const media = matchMedia(query);
    const update = () => setMatches(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return matches;
}
