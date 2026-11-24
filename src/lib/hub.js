// The AegisNEO hub (the main site) opens this site with a read-only "ticket" in the
// URL fragment: #aegis_ticket=<token>. The ticket says who the visitor is, so the API
// serves them by their role: the whole catalog for an account, 10 featured asteroids
// for a guest. It is kept for this tab only, removed from the address bar at once,
// and sent to this site's own server function, never to a third party.

const STORAGE_KEY = "aegis_ticket";
const FRAGMENT_KEY = "aegis_ticket";
const HUB_URL = "https://aegisneo-hub.vercel.app/hub";
const AUTH_URL = "https://aegisneo-hub.vercel.app/auth";

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

// One stylesheet for the badge. On a wide screen it is a pill at the bottom left. On a phone the
// bottom of the screen belongs to the app's own controls (tabs, the launch button), so it shrinks
// to a small status dot at the top; tapping the dot opens the details.
const PILL_CSS = `
.aegis-pill{position:fixed;left:10px;bottom:10px;z-index:30;display:flex;align-items:center;gap:8px;
padding:7px 12px;border-radius:999px;font:500 12px system-ui,sans-serif;color:#eef2f9;
background:rgba(10,14,24,.88);border:1px solid rgba(148,163,184,.3);backdrop-filter:blur(8px);
max-width:calc(100vw - 20px);pointer-events:auto}
.aegis-pill .aegis-dot{width:8px;height:8px;border-radius:50%;flex:none}
.aegis-pill .aegis-body{display:flex;align-items:center;gap:8px;min-width:0}
.aegis-pill .aegis-link{color:#3ee0e8;text-decoration:none;font-weight:600;margin-left:4px;white-space:nowrap}
.aegis-pill .aegis-toggle{display:none}
@media (max-width:700px){
.aegis-pill{left:auto;right:var(--aegis-pill-right,12px);top:calc(env(safe-area-inset-top,0px) + 10px);bottom:auto;padding:0;gap:0;
width:30px;height:30px;justify-content:center;border-radius:15px}
.aegis-pill .aegis-body{display:none}
.aegis-pill .aegis-toggle{display:flex;align-items:center;justify-content:center;width:30px;height:30px;padding:0;
background:none;border:0;border-radius:15px;cursor:pointer}
.aegis-pill[data-open="true"]{width:auto;height:auto;padding:8px 12px;border-radius:14px;right:10px;top:calc(env(safe-area-inset-top,0px) + 48px);
flex-direction:column;align-items:flex-start;gap:6px;max-width:min(300px,calc(100vw - 20px))}
.aegis-pill[data-open="true"] .aegis-body{display:flex;flex-wrap:wrap}
.aegis-pill[data-open="true"] .aegis-toggle{position:absolute;right:-1px;top:-40px}
}`;

function renderPill() {
  if (!pill) return;
  const { kind, text, link } = status();
  const color = kind === "user" ? "#4ade80" : "#f5a524";
  pill.replaceChildren();

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "aegis-toggle";
  toggle.setAttribute("aria-label", `AegisNEO account: ${text}`);
  toggle.setAttribute("aria-expanded", String(pill.dataset.open === "true"));
  const toggleDot = document.createElement("span");
  toggleDot.className = "aegis-dot";
  toggleDot.style.background = color;
  toggle.append(toggleDot);
  toggle.addEventListener("click", () => {
    const open = pill.dataset.open !== "true";
    pill.dataset.open = String(open);
    toggle.setAttribute("aria-expanded", String(open));
  });

  const body = document.createElement("div");
  body.className = "aegis-body";
  const dot = document.createElement("span");
  dot.className = "aegis-dot";
  dot.style.background = color;
  const label = document.createElement("span");
  label.textContent = text;
  const anchor = document.createElement("a");
  anchor.className = "aegis-link";
  anchor.textContent = link[0];
  anchor.href = link[1];
  body.append(dot, label, anchor);
  pill.append(toggle, body);
}

/** A small badge: who is signed in, and the way back to the hub. `narrowRight` keeps it clear of
 *  a control the app has in the top right corner of a phone screen. */
export function mountHubPill({ narrowRight = 12 } = {}) {
  if (pill || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.textContent = PILL_CSS;
  document.head.appendChild(style);
  pill = document.createElement("div");
  pill.className = "aegis-pill";
  pill.setAttribute("role", "status");
  pill.style.setProperty("--aegis-pill-right", `${narrowRight}px`);
  document.body.appendChild(pill);
  renderPill();
}

/** True when the visitor has no ticket from the hub: the API then serves only the featured asteroids. */
export function isGuest() {
  return !getTicket();
}

export { AUTH_URL };
