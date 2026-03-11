export type AppIconName =
  | "compass"
  | "spark"
  | "shield"
  | "grid"
  | "user"
  | "flask"
  | "play"
  | "server"
  | "key"
  | "users"
  | "github"
  | "google"
  | "check"
  | "arrow-right"
  | "panel-left"
  | "panel-right";

export function AppIcon({ name }: { name: AppIconName }) {
  switch (name) {
    case "compass":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="8" />
          <path d="M10 14l2-4 4-2-2 4-4 2z" />
        </svg>
      );
    case "spark":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 3l1.8 4.7L19 9.5l-4.2 2.4L13 17l-1.8-5.1L7 9.5l5.2-1.8L12 3z" />
        </svg>
      );
    case "shield":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 3l7 3v5c0 4.2-2.7 7.4-7 10-4.3-2.6-7-5.8-7-10V6l7-3z" />
        </svg>
      );
    case "grid":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <rect x="4" y="4" width="6" height="6" rx="1" />
          <rect x="14" y="4" width="6" height="6" rx="1" />
          <rect x="4" y="14" width="6" height="6" rx="1" />
          <rect x="14" y="14" width="6" height="6" rx="1" />
        </svg>
      );
    case "user":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <circle cx="12" cy="8" r="4" />
          <path d="M5 20c1.8-3.4 4.2-5 7-5s5.2 1.6 7 5" />
        </svg>
      );
    case "flask":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M10 3h4" />
          <path d="M11 3v5l-5 8a3 3 0 0 0 2.6 4.5h6.8A3 3 0 0 0 18 16l-5-8V3" />
          <path d="M9 14h6" />
        </svg>
      );
    case "play":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M8 6l10 6-10 6V6z" />
        </svg>
      );
    case "server":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <rect x="4" y="5" width="16" height="5" rx="1.5" />
          <rect x="4" y="14" width="16" height="5" rx="1.5" />
          <path d="M8 7.5h.01M8 16.5h.01" />
        </svg>
      );
    case "key":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <circle cx="8" cy="12" r="4" />
          <path d="M12 12h8M17 12v3M20 12v2" />
        </svg>
      );
    case "users":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <circle cx="9" cy="9" r="3" />
          <circle cx="17" cy="10" r="2.5" />
          <path d="M4.5 19c1.3-2.7 3.2-4 5.7-4s4.4 1.3 5.7 4" />
          <path d="M15.2 18c.6-1.3 1.7-2 3.2-2 1.2 0 2.3.5 3.1 1.6" />
        </svg>
      );
    case "github":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 3a8.8 8.8 0 0 0-2.8 17.2c.4.1.6-.2.6-.5v-1.8c-2.4.5-3-.6-3.2-1.2-.1-.4-.6-1.2-1-1.5-.3-.2-.7-.8 0-.8.7 0 1.2.6 1.4.9.8 1.3 2 1 2.5.8.1-.6.3-1 .6-1.3-2.1-.2-4.4-1-4.4-4.7 0-1 .4-1.9 1-2.5-.1-.2-.5-1.2.1-2.5 0 0 .8-.3 2.7 1a9.4 9.4 0 0 1 4.9 0c1.9-1.3 2.7-1 2.7-1 .6 1.3.2 2.3.1 2.5.6.6 1 1.4 1 2.5 0 3.7-2.3 4.5-4.4 4.7.3.3.7.8.7 1.7v2.5c0 .3.2.6.6.5A8.8 8.8 0 0 0 12 3z" />
        </svg>
      );
    case "google":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M20 12.2c0-.6-.1-1.1-.2-1.7H12v3.2h4.5a3.9 3.9 0 0 1-1.7 2.5v2.1h2.8c1.7-1.6 2.4-3.8 2.4-6.1z" />
          <path d="M12 20.2c2.2 0 4.1-.7 5.4-2l-2.8-2.1c-.8.5-1.7.8-2.6.8-2 0-3.8-1.4-4.4-3.3H4.7V16A8.2 8.2 0 0 0 12 20.2z" />
          <path d="M7.6 13.6a5 5 0 0 1 0-3.2V8H4.7a8.2 8.2 0 0 0 0 8l2.9-2.4z" />
          <path d="M12 7.2c1.2 0 2.3.4 3.1 1.2l2.3-2.3A8.1 8.1 0 0 0 4.7 8l2.9 2.4c.6-1.9 2.4-3.2 4.4-3.2z" />
        </svg>
      );
    case "check":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M5 13l4 4L19 7" />
        </svg>
      );
    case "arrow-right":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M5 12h14" />
          <path d="M13 7l6 5-6 5" />
        </svg>
      );
    case "panel-left":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M10 4v16" />
          <path d="M15 12l-3-3" />
          <path d="M15 12l-3 3" />
        </svg>
      );
    case "panel-right":
      return (
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M14 4v16" />
          <path d="M9 12l3-3" />
          <path d="M9 12l3 3" />
        </svg>
      );
  }
}
