/**
 * fxrates core: six tools against the Frankfurter API.
 *
 *   get_supported_currencies       GET /currencies
 *   get_latest_exchange_rates      GET /latest?base=&symbols=
 *   convert_currency_latest        GET /latest?base={from}&symbols={to},
 *                                  then amount * rate computed locally
 *   get_historical_exchange_rates  GET /{date} or GET /{start}..{end}
 *   convert_currency_specific_date GET /{date}?base={from}&symbols={to},
 *                                  then amount * rate computed locally
 *   greet                          no HTTP; returns a greeting string
 *
 * The service is keyless: no credential is required or sent. The
 * base URL comes from FRANKFURTER_API_URL and defaults to
 * https://api.frankfurter.dev/v1. All HTTP goes through an injected
 * FetchFn so everything is testable offline.
 *
 * Conversions use the exact numbers the API returns: the converted
 * value is amount * rate, trimmed to at most 6 decimal places by
 * rounding at the 6th place (Math.round(v * 1e6) / 1e6). No other
 * rounding, fees, or spreads are invented.
 */
import type {
  ConversionResult,
  ConvertLatestOptions,
  ConvertSpecificDateOptions,
  FetchFn,
  GreetOptions,
  HistoricalRatesOptions,
  LatestRatesOptions,
} from "./types.js";

export const VERSION = "0.1.0";

export const DEFAULT_BASE_URL = "https://api.frankfurter.dev/v1";

export const BASE_URL_ENV = "FRANKFURTER_API_URL";

/** Resolve the API base URL: env value when non-blank, else default. Trailing slashes are stripped. */
export function resolveBaseUrl(value?: string): string {
  const v = typeof value === "string" ? value.trim() : "";
  const base = v ? v : DEFAULT_BASE_URL;
  return base.replace(/\/+$/, "");
}

function requireNonEmpty(value: unknown, field: string): string {
  const v = typeof value === "string" ? value.trim() : "";
  if (!v) throw new Error(`${field} must be a non-empty string`);
  return v;
}

function requireAmount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error("amount must be a finite number");
  }
  return value;
}

function requireDate(value: unknown, field: string): string {
  const v = requireNonEmpty(value, field);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    throw new Error(`${field} must be a date in YYYY-MM-DD form`);
  }
  return v;
}

function optionalParam(value: unknown): string | undefined {
  const v = typeof value === "string" ? value.trim() : "";
  return v ? v : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Trim a computed conversion to at most 6 decimal places. */
export function trim6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

async function callApi(
  fetchFn: FetchFn,
  baseUrl: string,
  path: string,
  query?: Record<string, string>,
): Promise<unknown> {
  let url = `${resolveBaseUrl(baseUrl)}${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) params.set(k, v);
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }
  let response;
  try {
    response = await fetchFn(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    throw new Error(
      `Frankfurter API request failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!response.ok) {
    let detail = "";
    try {
      const payload: unknown = await response.json();
      if (isRecord(payload)) {
        if (typeof payload.message === "string" && payload.message) {
          detail = `: ${payload.message}`;
        } else if (typeof payload.error === "string" && payload.error) {
          detail = `: ${payload.error}`;
        }
      }
    } catch {
      // A non-JSON error body still reports its HTTP status below.
    }
    throw new Error(
      `Frankfurter API request failed: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ""}${detail}`,
    );
  }
  try {
    return await response.json();
  } catch {
    throw new Error("Frankfurter API returned a response that was not valid JSON");
  }
}

function ratesQuery(options: LatestRatesOptions): Record<string, string> | undefined {
  const query: Record<string, string> = {};
  const base = optionalParam(options.base);
  const symbols = optionalParam(options.symbols);
  if (base) query.base = base;
  if (symbols) query.symbols = symbols;
  return Object.keys(query).length ? query : undefined;
}

function extractRate(payload: unknown, to: string): { rate: number; date?: string } {
  if (!isRecord(payload) || !isRecord(payload.rates)) {
    throw new Error("Frankfurter API response did not include a rates object");
  }
  const rate = payload.rates[to];
  if (typeof rate !== "number" || !Number.isFinite(rate)) {
    throw new Error(`Frankfurter API response did not include a rate for ${to}`);
  }
  const date = typeof payload.date === "string" ? payload.date : undefined;
  return { rate, date };
}

function buildConversion(
  amount: number,
  from: string,
  to: string,
  payload: unknown,
  fallbackDate?: string,
): ConversionResult {
  if (from === to) {
    const date =
      isRecord(payload) && typeof payload.date === "string" ? payload.date : fallbackDate;
    const out: ConversionResult = { amount, from, to, rate: 1, converted: trim6(amount) };
    if (date) out.date = date;
    return out;
  }
  const { rate, date } = extractRate(payload, to);
  const out: ConversionResult = {
    amount,
    from,
    to,
    rate,
    converted: trim6(amount * rate),
  };
  const d = date ?? fallbackDate;
  if (d) out.date = d;
  return out;
}

/** List the currencies the API supports. */
export async function getSupportedCurrencies(
  fetchFn: FetchFn,
  baseUrl?: string,
): Promise<unknown> {
  return callApi(fetchFn, resolveBaseUrl(baseUrl), "/currencies");
}

/** Get the latest exchange rates, optionally for a base and symbols. */
export async function getLatestExchangeRates(
  fetchFn: FetchFn,
  baseUrl: string | undefined,
  options: LatestRatesOptions = {},
): Promise<unknown> {
  return callApi(fetchFn, resolveBaseUrl(baseUrl), "/latest", ratesQuery(options));
}

/** Convert an amount at the latest rate, computed locally. */
export async function convertCurrencyLatest(
  fetchFn: FetchFn,
  baseUrl: string | undefined,
  options: ConvertLatestOptions,
): Promise<ConversionResult> {
  const amount = requireAmount(options.amount);
  const from = requireNonEmpty(options.from, "from");
  const to = requireNonEmpty(options.to, "to");
  if (from === to) {
    const payload = await callApi(fetchFn, resolveBaseUrl(baseUrl), "/latest", {
      base: from,
      symbols: to,
    });
    return buildConversion(amount, from, to, payload);
  }
  const payload = await callApi(fetchFn, resolveBaseUrl(baseUrl), "/latest", {
    base: from,
    symbols: to,
  });
  return buildConversion(amount, from, to, payload);
}

/** Get historical rates for one date or a date range. */
export async function getHistoricalExchangeRates(
  fetchFn: FetchFn,
  baseUrl: string | undefined,
  options: HistoricalRatesOptions = {},
): Promise<unknown> {
  const query = ratesQuery(options);
  const date = optionalParam(options.date);
  const start = optionalParam(options.start_date);
  const end = optionalParam(options.end_date);
  if (date) {
    return callApi(fetchFn, resolveBaseUrl(baseUrl), `/${requireDate(date, "date")}`, query);
  }
  if (start) {
    const s = requireDate(start, "start_date");
    if (end) {
      const e = requireDate(end, "end_date");
      return callApi(fetchFn, resolveBaseUrl(baseUrl), `/${s}..${e}`, query);
    }
    return callApi(fetchFn, resolveBaseUrl(baseUrl), `/${s}..`, query);
  }
  if (end) throw new Error("end_date requires start_date");
  throw new Error("date or start_date is required");
}

/** Convert an amount at the rate for one specific date, computed locally. */
export async function convertCurrencySpecificDate(
  fetchFn: FetchFn,
  baseUrl: string | undefined,
  options: ConvertSpecificDateOptions,
): Promise<ConversionResult> {
  const date = requireDate(options.date, "date");
  const amount = requireAmount(options.amount);
  const from = requireNonEmpty(options.from, "from");
  const to = requireNonEmpty(options.to, "to");
  const payload = await callApi(fetchFn, resolveBaseUrl(baseUrl), `/${date}`, {
    base: from,
    symbols: to,
  });
  return buildConversion(amount, from, to, payload, date);
}

/** Return a greeting string. Present for internal testing per the public spec. */
export function greet(options: GreetOptions = {}): string {
  const name = optionalParam(options.name);
  return name ? `Hello, ${name}!` : "Hello, World!";
}

/** Render a payload as the JSON text block MCP clients show. */
export function formatPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}
