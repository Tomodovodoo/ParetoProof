import { useEffect, useSyncExternalStore } from "react";
import { resolveWebSurface, resolveWebSurfaceFromUrl, type WebSurface } from "./surface";

const navigationEventName = "paretoproof:navigation";

function readLocationKey() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function subscribeToLocation(onStoreChange: () => void) {
  window.addEventListener("popstate", onStoreChange);
  window.addEventListener(navigationEventName, onStoreChange);

  return () => {
    window.removeEventListener("popstate", onStoreChange);
    window.removeEventListener(navigationEventName, onStoreChange);
  };
}

type InterceptableNavigationInput = {
  currentHref: string;
  currentSurface: WebSurface;
  nextHref: string;
};

export function isInterceptablePublicNavigation({
  currentHref,
  currentSurface,
  nextHref
}: InterceptableNavigationInput) {
  if (currentSurface !== "public") {
    return false;
  }

  const currentUrl = new URL(currentHref);
  const nextUrl = new URL(nextHref, currentUrl);

  if (currentUrl.origin !== nextUrl.origin) {
    return false;
  }

  if (resolveWebSurfaceFromUrl(nextUrl) !== "public") {
    return false;
  }

  if (currentUrl.pathname === nextUrl.pathname && currentUrl.search === nextUrl.search) {
    return false;
  }

  return true;
}

export function navigateWithinPublicSurface(nextHref: string) {
  const currentHref = window.location.href;

  if (
    !isInterceptablePublicNavigation({
      currentHref,
      currentSurface: resolveWebSurface(),
      nextHref
    })
  ) {
    return false;
  }

  const nextUrl = new URL(nextHref, currentHref);
  window.history.pushState({}, "", nextUrl);
  window.dispatchEvent(new Event(navigationEventName));

  if (nextUrl.hash) {
    requestAnimationFrame(() => {
      const target = document.querySelector(nextUrl.hash);

      if (target && "scrollIntoView" in target) {
        target.scrollIntoView();
      }
    });
  } else {
    window.scrollTo({ left: 0, top: 0 });
  }

  return true;
}

function isPrimaryNavigationClick(event: MouseEvent) {
  return (
    event.button === 0 &&
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

function findLinkTarget(event: MouseEvent) {
  const eventTarget = event.target;

  if (!(eventTarget instanceof Element)) {
    return null;
  }

  const link = eventTarget.closest("a");

  if (!(link instanceof HTMLAnchorElement)) {
    return null;
  }

  if (link.target && link.target !== "_self") {
    return null;
  }

  if (link.hasAttribute("download")) {
    return null;
  }

  return link;
}

export function useSurfaceNavigation(surface: WebSurface) {
  const locationKey = useSyncExternalStore(
    subscribeToLocation,
    readLocationKey,
    () => "/"
  );

  useEffect(() => {
    if (surface !== "public") {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      if (!isPrimaryNavigationClick(event)) {
        return;
      }

      const link = findLinkTarget(event);

      if (!link) {
        return;
      }

      if (navigateWithinPublicSurface(link.href)) {
        event.preventDefault();
      }
    };

    document.addEventListener("click", handleClick);

    return () => {
      document.removeEventListener("click", handleClick);
    };
  }, [surface]);

  return locationKey;
}
