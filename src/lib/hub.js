// The AegisNEO hub (the main site) opens this site with a read-only "ticket" in the
// URL fragment: #aegis_ticket=<token>. The ticket says who the visitor is, so the API
// serves them by their role: the whole catalog for an account, 10 featured asteroids
// for a guest. It is kept for this tab only, removed from the address bar at once,
// and sent to this site's own server function, never to a third party.

const STORAGE_KEY = "aegis_ticket";
const FRAGMENT_KEY = "aegis_ticket";
const HUB_URL = "https://aegisneo-api.vercel.app/frontend/hub.html";
const AUTH_URL = "https://aegisneo-api.vercel.app/frontend/auth.html";

let expired = false;

export function readTicketFromHash(hash) {
  const params = new URLSearchParams(String(hash).replace(/^#/, ""));
  const ticket = params.get(FRAGMENT_KEY);
  // A JWT is three base64url parts; anything else is ignored.
  return ticket && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(ticket) && ticket.length < 2000 ? ticket : null;
}

export function ticketClaims(ticket) {
  try {
    const payload = JSON.parse(atob(ticket.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return payload && payload.exp ? payload : null;
  } catch {
    return null;
  }
}

function readStored() {
  try {
    return sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function store(value) {
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, value);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage blocked: the ticket lasts until the page is reloaded */
  }
}

/** Call once at start-up: keep a ticket from the URL and remove it from the address bar. */
export function captureTicket() {
  const ticket = readTicketFromHash(window.location.hash);
  if (!ticket) return;
  store(ticket);
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  params.delete(FRAGMENT_KEY);
  const rest = params.toString();
  window.history.replaceState(
    null,
    "",
    window.location.pathname + window.location.search + (rest ? `#${rest}` : ""),
  );
}

/** The ticket to send with API requests, or null (guest, or the ticket has run out). */
export function getTicket() {
  const ticket = readStored();
  if (!ticket) return null;
  const claims = ticketClaims(ticket);
  if (!claims || claims.exp * 1000 <= Date.now()) {
    store(null);
    expired = true;
    return null;
  }
  return ticket;
}

/** The API refused the ticket (401): drop it and serve the visitor as a guest. */
export function dropTicket() {
  store(null);
  expired = true;
  renderPill();
}

function status() {
  const ticket = getTicket();
  if (ticket) {
    const claims = ticketClaims(ticket);
    return {
      kind: "user",
      text: `@${claims.username || "user"} · ${claims.role === "admin" ? "Admin" : "Explorer"}`,
      link: ["Hub", HUB_URL],
    };
  }
  if (expired) return { kind: "ended", text: "Session ended", link: ["Sign in again", AUTH_URL] };
  return { kind: "guest", text: "Guest mode · limited catalog", link: ["Sign in for all", AUTH_URL] };
}

let pill = null;

function renderPill() {
  if (!pill) return;
  const { kind, text, link } = status();
  pill.replaceChildren();
  const dot = document.createElement("span");
  dot.style.cssText = `width:8px;height:8px;border-radius:50%;flex:none;background:${kind === "user" ? "#4ade80" : "#f5a524"}`;
  const label = document.createElement("span");
  label.textContent = text;
  const anchor = document.createElement("a");
  anchor.textContent = link[0];
  anchor.href = link[1];
  anchor.style.cssText = "color:#3ee0e8;text-decoration:none;font-weight:600;margin-left:4px";
  pill.append(dot, label, anchor);
}

/** A small badge at the bottom left: who is signed in, and the way back to the hub. */
export function mountHubPill() {
  if (pill || typeof document === "undefined") return;
  pill = document.createElement("div");
  pill.setAttribute("role", "status");
  pill.style.cssText =
    "position:fixed;left:10px;bottom:10px;z-index:30;display:flex;align-items:center;gap:8px;" +
    "padding:7px 12px;border-radius:999px;font:500 12px system-ui,sans-serif;color:#eef2f9;" +
    "background:rgba(10,14,24,.88);border:1px solid rgba(148,163,184,.3);backdrop-filter:blur(8px);" +
    "max-width:calc(100vw - 20px);pointer-events:auto";
  document.body.appendChild(pill);
  renderPill();
}
