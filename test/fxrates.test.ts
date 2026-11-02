import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  convertCurrencyLatest,
  convertCurrencySpecificDate,
  getHistoricalExchangeRates,
  getLatestExchangeRates,
  getSupportedCurrencies,
  greet,
  resolveBaseUrl,
  trim6,
} from "../src/fxrates.js";
import type { FetchFn, HttpResponse } from "../src/types.js";

function jsonResponse(body: unknown, status = 200, statusText = "OK"): HttpResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: { get: () => "application/json" },
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}

interface Captured {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
}

function fakeFetch(captured: Captured, body: unknown = {}): FetchFn {
  return async (url: string, init?: { method?: string; headers?: Record<string, string> }) => {
    captured.url = url;
    captured.method = init?.method;
    captured.headers = init?.headers;
    return jsonResponse(body);
  };
}

const BASE = "https://api.frankfurter.dev/v1";

describe("base URL resolution", () => {
  it("defaults and strips trailing slashes", () => {
    assert.equal(resolveBaseUrl(undefined), BASE);
    assert.equal(resolveBaseUrl("  "), BASE);
    assert.equal(resolveBaseUrl("https://example.test/v1/"), "https://example.test/v1");
  });
});

describe("currencies and latest", () => {
  it("currencies hits /currencies on the default base", async () => {
    const c: Captured = {};
    const out = (await getSupportedCurrencies(fakeFetch(c, { EUR: "Euro", USD: "United States Dollar" }), undefined)) as Record<string, string>;
    assert.equal(out.EUR, "Euro");
    assert.equal(c.url, `${BASE}/currencies`);
    assert.equal(c.method, "GET");
  });

  it("latest without options has no query string", async () => {
    const c: Captured = {};
    await getLatestExchangeRates(fakeFetch(c, { base: "EUR", rates: {} }), BASE, {});
    assert.equal(c.url, `${BASE}/latest`);
  });

  it("latest composes base and symbols params", async () => {
    const c: Captured = {};
    await getLatestExchangeRates(fakeFetch(c, {}), BASE, { base: "USD", symbols: "EUR,GBP" });
    const url = new URL(c.url ?? "");
    assert.equal(url.pathname, "/v1/latest");
    assert.equal(url.searchParams.get("base"), "USD");
    assert.equal(url.searchParams.get("symbols"), "EUR,GBP");
  });

  it("honours a custom base URL from the caller", async () => {
    const c: Captured = {};
    await getLatestExchangeRates(fakeFetch(c, {}), "https://example.test/v1/", {});
    assert.equal(c.url, "https://example.test/v1/latest");
  });
});

describe("conversions", () => {
  it("convert latest computes amount * rate trimmed to 6dp", async () => {
    const c: Captured = {};
    const body = { amount: 1, base: "EUR", date: "2026-10-24", rates: { USD: 1.0834567 } };
    const out = await convertCurrencyLatest(fakeFetch(c, body), BASE, { amount: 10, from: "EUR", to: "USD" });
    assert.equal(new URL(c.url ?? "").searchParams.get("base"), "EUR");
    assert.equal(new URL(c.url ?? "").searchParams.get("symbols"), "USD");
    assert.equal(out.rate, 1.0834567);
    assert.equal(out.converted, 10.834567);
    assert.equal(out.date, "2026-10-24");
  });

  it("trim6 rounds at the 6th decimal place only", () => {
    assert.equal(trim6(1.1234564), 1.123456);
    assert.equal(trim6(1.1234565), 1.123457);
    assert.equal(trim6(2), 2);
  });

  it("same-currency conversion returns rate 1", async () => {
    const c: Captured = {};
    const body = { amount: 1, base: "EUR", date: "2026-10-24", rates: { EUR: 1 } };
    const out = await convertCurrencyLatest(fakeFetch(c, body), BASE, { amount: 42.5, from: "EUR", to: "EUR" });
    assert.equal(out.rate, 1);
    assert.equal(out.converted, 42.5);
  });

  it("missing rate in the response is an error", async () => {
    const failing: FetchFn = async () => jsonResponse({ base: "EUR", rates: {} });
    await assert.rejects(
      () => convertCurrencyLatest(failing, BASE, { amount: 1, from: "EUR", to: "XXX" }),
      /did not include a rate for XXX/,
    );
  });

  it("rejects a non-finite amount before converting", async () => {
    const c: Captured = {};
    await assert.rejects(
      () => convertCurrencyLatest(fakeFetch(c, {}), BASE, { amount: Number.NaN, from: "EUR", to: "USD" }),
      /amount/,
    );
  });

  it("convert on a specific date hits /{date} and keeps that date", async () => {
    const c: Captured = {};
    const body = { amount: 1, base: "USD", date: "2020-01-02", rates: { EUR: 0.89 } };
    const out = await convertCurrencySpecificDate(fakeFetch(c, body), BASE, {
      date: "2020-01-02",
      amount: 100,
      from: "USD",
      to: "EUR",
    });
    assert.equal(new URL(c.url ?? "").pathname, "/v1/2020-01-02");
    assert.equal(out.converted, 89);
    assert.equal(out.date, "2020-01-02");
  });

  it("rejects a malformed date before any request", async () => {
    let called = false;
    const spy: FetchFn = async () => { called = true; return jsonResponse({}); };
    await assert.rejects(
      () => convertCurrencySpecificDate(spy, BASE, { date: "2020/01/02", amount: 1, from: "USD", to: "EUR" }),
      /YYYY-MM-DD/,
    );
    assert.equal(called, false);
  });
});

describe("historical", () => {
  it("single date hits /{date} with base/symbols", async () => {
    const c: Captured = {};
    await getHistoricalExchangeRates(fakeFetch(c, {}), BASE, { date: "2024-05-01", base: "EUR", symbols: "USD" });
    const url = new URL(c.url ?? "");
    assert.equal(url.pathname, "/v1/2024-05-01");
    assert.equal(url.searchParams.get("base"), "EUR");
  });

  it("range hits /{start}..{end}", async () => {
    const c: Captured = {};
    await getHistoricalExchangeRates(fakeFetch(c, {}), BASE, { start_date: "2024-05-01", end_date: "2024-05-03" });
    assert.equal(new URL(c.url ?? "").pathname, "/v1/2024-05-01..2024-05-03");
  });

  it("start-only range hits /{start}..", async () => {
    const c: Captured = {};
    await getHistoricalExchangeRates(fakeFetch(c, {}), BASE, { start_date: "2024-05-01" });
    assert.equal(new URL(c.url ?? "").pathname, "/v1/2024-05-01..");
  });

  it("no date at all is an error; end alone is an error", async () => {
    const f = fakeFetch({}, {});
    await assert.rejects(() => getHistoricalExchangeRates(f, BASE, {}), /date or start_date/);
    await assert.rejects(() => getHistoricalExchangeRates(f, BASE, { end_date: "2024-05-03" }), /requires start_date/);
  });
});

describe("greet", () => {
  it("greets by name and falls back to World", () => {
    assert.equal(greet({ name: "Ada" }), "Hello, Ada!");
    assert.equal(greet({}), "Hello, World!");
    assert.equal(greet({ name: "  " }), "Hello, World!");
  });
});

describe("errors", () => {
  it("HTTP 404 surfaces status and upstream message", async () => {
    const failing: FetchFn = async () => jsonResponse({ message: "not found" }, 404, "Not Found");
    await assert.rejects(() => getSupportedCurrencies(failing, BASE), /HTTP 404.*not found/);
  });

  it("network failure is wrapped with context", async () => {
    const failing: FetchFn = async () => { throw new Error("socket hang up"); };
    await assert.rejects(() => getSupportedCurrencies(failing, BASE), /Frankfurter API request failed: socket hang up/);
  });
});
