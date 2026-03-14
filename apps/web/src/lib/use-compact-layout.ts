import { useEffect, useState } from "react";

function getMatchMedia() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return null;
  }

  return window.matchMedia.bind(window);
}

export function useCompactLayout(maxWidthPx = 900) {
  const query = `(max-width: ${maxWidthPx}px)`;
  const [matches, setMatches] = useState(() => {
    const matchMedia = getMatchMedia();
    return matchMedia ? matchMedia(query).matches : false;
  });

  useEffect(() => {
    const matchMedia = getMatchMedia();
    if (!matchMedia) {
      setMatches(false);
      return;
    }

    const mediaQuery = matchMedia(query);

    function handleChange(event: MediaQueryListEvent) {
      setMatches(event.matches);
    }

    setMatches(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, [query]);

  return matches;
}
