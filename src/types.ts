/**
 * fxrates types.
 *
 * Shapes follow the public Frankfurter API: rates are quoted from a
 * base currency, optionally narrowed to a comma-separated symbols
 * list, and historical data is addressed by a single date or a
 * date range. HTTP access is described by a minimal response
 * surface so tests can inject a fake fetch and never touch the
 * network.
 */

export interface LatestRatesOptions {
  base?: string;
  symbols?: string;
}

export interface HistoricalRatesOptions {
  date?: string;
  start_date?: string;
  end_date?: string;
  base?: string;
  symbols?: string;
}

export interface ConvertLatestOptions {
  amount: number;
  from: string;
  to: string;
}

export interface ConvertSpecificDateOptions {
  date: string;
  amount: number;
  from: string;
  to: string;
}

export interface GreetOptions {
  name?: string;
}

/** Result of a locally computed conversion. */
export interface ConversionResult {
  amount: number;
  from: string;
  to: string;
  rate: number;
  converted: number;
  date?: string;
}

/** Minimal HTTP response surface so tests can inject fixtures. */
export interface HttpResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export type FetchFn = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    redirect?: string;
  },
) => Promise<HttpResponse>;
