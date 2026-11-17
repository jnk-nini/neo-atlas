import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import handler from "../api/neo.js";
import { readTicketFromHash, ticketClaims } from "../src/lib/hub.js";

const TICKET =
  `${btoa('{"alg":"HS256"}')}.${btoa(JSON.stringify({ username: "bob", role: "user", exp: 4102444800 }))}.sig_-x`.replace(
    /=/g,
    "",
  );

function mockRes() {
  const res = { statusCode: 200, headers: {}, body: undefined };
  res.status = (code) => ((res.statusCode = code), res);
  res.setHeader = (key, value) => ((res.headers[key] = value), res);
  res.json = (obj) => ((res.body = obj), res);
  res.send = (text) => ((res.body = text), res);
  return res;
}

describe("ticket from the AegisNEO hub", () => {
  it("is read from the URL fragment", () => {
    expect(readTicketFromHash(`#aegis_ticket=${TICKET}`)).toBe(TICKET);
    expect(readTicketFromHash(`#other=1&aegis_ticket=${TICKET}`)).toBe(TICKET);
  });

  it("is ignored when it is not a token", () => {
    expect(readTicketFromHash("#aegis_ticket=hello")).toBeNull();
    expect(readTicketFromHash("#aegis_ticket=a.b")).toBeNull();
    expect(readTicketFromHash("")).toBeNull();
    expect(readTicketFromHash(`#aegis_ticket=${"a".repeat(2000)}.b.c`)).toBeNull();
  });

  it("shows who it is for", () => {
    expect(ticketClaims(TICKET)).toMatchObject({ username: "bob", role: "user" });
    expect(ticketClaims("garbage")).toBeNull();
  });
});

describe("api/neo proxy with a ticket", () => {
  beforeEach(() => {
    process.env.AEGISNEO_API_KEY = "test-key";
    process.env.AEGISNEO_API_URL = "https://api.example.test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"ok":true}', { status: 200 })),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("passes a well-formed ticket on as a bearer token, next to the site key", async () => {
    await handler(
      { method: "GET", query: { path: "asteroids" }, headers: { "x-aegisneo-ticket": TICKET } },
      mockRes(),
    );
    const init = fetch.mock.calls[0][1];
    expect(init.headers.authorization).toBe(`Bearer ${TICKET}`);
    expect(init.headers["x-api-key"]).toBe("test-key");
  });

  it("sends only the key when there is no ticket (a guest)", async () => {
    await handler({ method: "GET", query: { path: "asteroids" }, headers: {} }, mockRes());
    expect(fetch.mock.calls[0][1].headers.authorization).toBeUndefined();
  });

  it("does not pass on something that is not a token", async () => {
    await handler(
      { method: "GET", query: { path: "asteroids" }, headers: { "x-aegisneo-ticket": "x\r\nHost: evil" } },
      mockRes(),
    );
    expect(fetch.mock.calls[0][1].headers.authorization).toBeUndefined();
  });
});
