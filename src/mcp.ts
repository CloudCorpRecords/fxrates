/**
 * fxrates MCP server. Tools: get_supported_currencies,
 * get_latest_exchange_rates, convert_currency_latest,
 * get_historical_exchange_rates, convert_currency_specific_date,
 * greet.
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys that
 * are not in this tool's public spec ("$schema" and
 * "additionalProperties"), which breaks exact tool-list/schema
 * parity with the spec. This file serves tools/list with the
 * spec's exact input schemas as explicit literals, while zod still
 * validates every tools/call argument set.
 *
 * Keyless. The API base URL is read from FRANKFURTER_API_URL at
 * call time and defaults to https://api.frankfurter.dev/v1.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
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

const NoArgs = z.object({});
const LatestArgs = z.object({
  base: z.string().optional(),
  symbols: z.string().optional(),
});
const ConvertLatestArgs = z.object({
  amount: z.number(),
  from: z.string(),
  to: z.string(),
});
const HistoricalArgs = z.object({
  date: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  base: z.string().optional(),
  symbols: z.string().optional(),
});
const ConvertDateArgs = z.object({
  date: z.string(),
  amount: z.number(),
  from: z.string(),
  to: z.string(),
});
const GreetArgs = z.object({ name: z.string().optional() });

const TOOLS = [
  {
    name: "get_supported_currencies",
    description: "List the currencies supported by the Frankfurter API.",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "get_latest_exchange_rates",
    description: "Get the latest exchange rates, optionally for a base currency and a comma-separated symbols list.",
    inputSchema: {
      type: "object" as const,
      properties: {
        base: { type: "string", description: "Base currency code." },
        symbols: { type: "string", description: "Comma-separated list of currency codes to return rates for." },
      },
    },
  },
  {
    name: "convert_currency_latest",
    description: "Convert an amount between currencies at the latest rate, computed locally from the fetched rate.",
    inputSchema: {
      type: "object" as const,
      properties: {
        amount: { type: "number", description: "Amount to convert." },
        from: { type: "string", description: "Source currency code." },
        to: { type: "string", description: "Target currency code." },
      },
      required: ["amount", "from", "to"],
    },
  },
  {
    name: "get_historical_exchange_rates",
    description: "Get historical exchange rates for a single date or a date range, optionally for a base currency and symbols list.",
    inputSchema: {
      type: "object" as const,
      properties: {
        date: { type: "string", description: "Single date to get rates for, in YYYY-MM-DD format." },
        start_date: { type: "string", description: "Start date of the range, in YYYY-MM-DD format." },
        end_date: { type: "string", description: "End date of the range, in YYYY-MM-DD format." },
        base: { type: "string", description: "Base currency code." },
        symbols: { type: "string", description: "Comma-separated list of currency codes to return rates for." },
      },
    },
  },
  {
    name: "convert_currency_specific_date",
    description: "Convert an amount between currencies at the rate for a specific date, computed locally from the fetched rate.",
    inputSchema: {
      type: "object" as const,
      properties: {
        date: { type: "string", description: "Date to use the exchange rate from, in YYYY-MM-DD format." },
        amount: { type: "number", description: "Amount to convert." },
        from: { type: "string", description: "Source currency code." },
        to: { type: "string", description: "Target currency code." },
      },
      required: ["date", "amount", "from", "to"],
    },
  },
  {
    name: "greet",
    description: "Return a greeting string. Present for internal testing.",
    inputSchema: {
      type: "object" as const,
      properties: { name: { type: "string", description: "Name to greet." } },
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "fxrates", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const fetchFn = globalThis.fetch as unknown as FetchFn;
  const baseUrl = resolveBaseUrl(process.env[BASE_URL_ENV]);
  try {
    let out: unknown;
    if (name === "get_supported_currencies") {
      NoArgs.parse(args ?? {});
      out = await getSupportedCurrencies(fetchFn, baseUrl);
    } else if (name === "get_latest_exchange_rates") {
      out = await getLatestExchangeRates(fetchFn, baseUrl, LatestArgs.parse(args ?? {}));
    } else if (name === "convert_currency_latest") {
      out = await convertCurrencyLatest(fetchFn, baseUrl, ConvertLatestArgs.parse(args ?? {}));
    } else if (name === "get_historical_exchange_rates") {
      out = await getHistoricalExchangeRates(fetchFn, baseUrl, HistoricalArgs.parse(args ?? {}));
    } else if (name === "convert_currency_specific_date") {
      out = await convertCurrencySpecificDate(fetchFn, baseUrl, ConvertDateArgs.parse(args ?? {}));
    } else if (name === "greet") {
      out = greet(GreetArgs.parse(args ?? {}));
    } else {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(formatPayload(out));
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
