# Changelog

## 0.1.0 (2026-10-26)

- Initial release.
- CLI: `fxrates currencies|latest|convert|historical|range|convert-on|greet`
  and `fxrates mcp`.
- MCP server (`fxrates mcp`, stdio) with six tools:
  `get_supported_currencies`, `get_latest_exchange_rates`,
  `convert_currency_latest`, `get_historical_exchange_rates`,
  `convert_currency_specific_date`, and `greet`.
- Calls go to the Frankfurter API under the base URL from
  `FRANKFURTER_API_URL`, defaulting to
  `https://api.frankfurter.dev/v1`; the service is keyless.
- Conversions are computed locally from the fetched rate and
  trimmed to at most six decimal places.
- HTTP failures surface the status plus the upstream `message` or
  `error` when present.
- All HTTP goes through an injectable fetch function, so the test
  suite runs entirely on hand-written fixtures with no network access.
