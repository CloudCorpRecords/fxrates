#!/usr/bin/env node
/**
 * fxrates CLI.
 *
 *   fxrates currencies
 *   fxrates latest [--base EUR] [--symbols USD,GBP]
 *   fxrates convert <amount> <from> <to>
 *   fxrates historical <date> [--base EUR] [--symbols USD]
 *   fxrates range <start> <end> [--base EUR] [--symbols USD]
 *   fxrates convert-on <date> <amount> <from> <to>
 *   fxrates greet [name]
 *   fxrates mcp
 *
 * Keyless. Base URL from FRANKFURTER_API_URL, default
 * https://api.frankfurter.dev/v1.
 * Exit codes: 0 success, 1 API error, 2 usage error.
 */
import {
  BASE_URL_ENV,
  convertCurrencyLatest,
  convertCurrencySpecificDate,
  formatPayload,
  getHistoricalExchangeRates,
  getLatestExchangeRates,
  getSupportedCurrencies,
  greet,
  resolveBaseUrl,
  VERSION,
} from "./fxrates.js";
import type { FetchFn } from "./types.js";

function usage(): never {
  console.error(`Usage:
  fxrates currencies
  fxrates latest [--base EUR] [--symbols USD,GBP]
  fxrates convert <amount> <from> <to>
  fxrates historical <date> [--base EUR] [--symbols USD]
  fxrates range <start> <end> [--base EUR] [--symbols USD]
  fxrates convert-on <date> <amount> <from> <to>
  fxrates greet [name]
  fxrates mcp
  fxrates --version`);
  process.exit(2);
}

function flag(rest: string[], name: string): string | undefined {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === "--version" || cmd === "-v") {
    console.log(VERSION);
    return;
  }
  if (cmd === "mcp") {
    await import("./mcp.js");
    return;
  }
  if (!cmd) usage();
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  const baseUrl = resolveBaseUrl(process.env[BASE_URL_ENV]);
  const known = ["currencies", "latest", "convert", "historical", "range", "convert-on", "greet"];
  if (!known.includes(cmd)) usage();
  try {
    let out: unknown;
    if (cmd === "currencies") {
      out = await getSupportedCurrencies(fetchFn, baseUrl);
    } else if (cmd === "latest") {
      out = await getLatestExchangeRates(fetchFn, baseUrl, {
        base: flag(rest, "--base"),
        symbols: flag(rest, "--symbols"),
      });
    } else if (cmd === "convert") {
      if (!rest[0] || !rest[1] || !rest[2]) usage();
      const amount = Number(rest[0]);
      if (!Number.isFinite(amount)) usage();
      out = await convertCurrencyLatest(fetchFn, baseUrl, { amount, from: rest[1], to: rest[2] });
    } else if (cmd === "historical") {
      if (!rest[0]) usage();
      out = await getHistoricalExchangeRates(fetchFn, baseUrl, {
        date: rest[0],
        base: flag(rest, "--base"),
        symbols: flag(rest, "--symbols"),
      });
    } else if (cmd === "range") {
      if (!rest[0] || !rest[1]) usage();
      out = await getHistoricalExchangeRates(fetchFn, baseUrl, {
        start_date: rest[0],
        end_date: rest[1],
        base: flag(rest, "--base"),
        symbols: flag(rest, "--symbols"),
      });
    } else if (cmd === "convert-on") {
      if (!rest[0] || !rest[1] || !rest[2] || !rest[3]) usage();
      const amount = Number(rest[1]);
      if (!Number.isFinite(amount)) usage();
      out = await convertCurrencySpecificDate(fetchFn, baseUrl, {
        date: rest[0],
        amount,
        from: rest[2],
        to: rest[3],
      });
    } else {
      out = greet({ name: rest[0] });
    }
    console.log(formatPayload(out));
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

void main();
