# fxrates

fxrates reads foreign-exchange data from the Frankfurter API: which
currencies are supported, what the latest rates are, what the rates
were on a single past date or across a range, and conversions between
currencies worked out locally from the fetched rate. One binary
serves a command-line interface and a stdio MCP server.

No API key is needed. The service is keyless, so fxrates works with
nothing configured. The API base URL can be overridden with
`FRANKFURTER_API_URL`; when it is not set, calls go to
`https://api.frankfurter.dev/v1`.

## Install

```bash
npx @reneturcios/fxrates currencies
```

Or run the container image:

```bash
docker run -i ghcr.io/cloudcorprecords/fxrates
```

The container defaults to the MCP server (see below). Pass CLI
arguments to use it as a CLI instead.

## CLI

```bash
fxrates currencies
fxrates latest --base USD --symbols EUR,GBP
fxrates convert 25 EUR USD
fxrates historical 2024-05-01 --base EUR --symbols USD
fxrates range 2024-05-01 2024-05-03 --base EUR
fxrates convert-on 2020-01-02 100 USD EUR
fxrates greet Ada

fxrates --version
```

Rate commands print the upstream JSON payload. Conversions print a
JSON object with `amount`, `from`, `to`, `rate`, `converted`, and
`date` when the API supplies one. Exit codes: `0` on success, `1`
when a call fails (including an upstream API error), `2` for usage
errors.

Conversions are computed locally: the tool fetches the single rate
it needs and multiplies. The result is trimmed to at most six
decimal places by rounding at the sixth place; no fee, spread, or
extra rounding is applied.

## MCP server

One bin serves both faces. The `mcp` subcommand starts a stdio MCP
server:

```bash
npx -y @reneturcios/fxrates mcp
```

MCP client configuration:

```json
{
  "mcpServers": {
    "fxrates": {
      "command": "npx",
      "args": ["-y", "@reneturcios/fxrates", "mcp"]
    }
  }
}
```

To point the server at a different Frankfurter-compatible host, add
`FRANKFURTER_API_URL` to the client's `env` for this server.

### Tools

| Tool | Input | What it returns |
| --- | --- | --- |
| `get_supported_currencies` | (none) | The map of supported currency codes to names. |
| `get_latest_exchange_rates` | `base`, `symbols` (both optional) | The latest rates payload. |
| `convert_currency_latest` | `amount`, `from`, `to` (all required) | A conversion at the latest rate: amount, pair, rate, converted value, and date. |
| `get_historical_exchange_rates` | `date` or `start_date`/`end_date`, plus optional `base`, `symbols` | Rates for one date or a range. |
| `convert_currency_specific_date` | `date`, `amount`, `from`, `to` (all required) | A conversion at that date's rate. |
| `greet` | `name` (optional) | A greeting string. Present for internal testing. |

Dates use `YYYY-MM-DD`. `symbols` is a comma-separated list such as
`USD,GBP`. Currency arguments are codes such as `EUR` and `USD`.

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # node test runner over test/*.test.ts, no network (fake fetch fixtures)
npm run dev     # run the CLI from source via tsx
```

## License

MIT — see `LICENSE`.
