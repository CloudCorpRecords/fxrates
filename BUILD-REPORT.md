# fxrates — Build Report

MCP Rebuild 100, Tranche Batch 3. Clean-room rebuild of
anirbanbasu/frankfurtermcp (rank 117, 6 stars), built from the
public README spec captured in
`harness/fixtures/frankfurtermcp-tools-original.json`. That fixture
is docs-derived: the 6 tools are the full documented set and the
argument schemas are documented reconstructions from the
Frankfurter API contract — no original server was probed. Parity
proves the rebuild matches this program's defined spec, labelled
docs-derived. Local build only — nothing pushed or published.

Identity: repo `fxrates`, npm `@reneturcios/fxrates`,
MCP name `io.github.CloudCorpRecords/fxrates`, version `0.1.0`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json` — bin `fxrates: dist/cli.js`, `mcpName` set,
  scripts build=`tsc` / dev=`tsx src/cli.ts` / test=`tsx --test test/*.test.ts`
- `server.json` — description "Frankfurter FX rates: currencies,
  latest and historical rates, and conversions, keyless." = **88 chars**
  (≤100 ✓); npm entry carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/fxrates:0.1.0` carries **no**
  `version` field (verified programmatically)
- `Dockerfile` — node:20-alpine two-stage, ENTRYPOINT
  `node /app/dist/cli.js`, CMD `mcp`, label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/fxrates"`
- `tsconfig.json` (identical to the fleet template), `.gitignore`,
  `LICENSE` (MIT, Copyright (c) 2026 Rene Turcios), `README.md`
  (fresh text), `CHANGELOG.md` (single 0.1.0 entry, 2026-10-26)
- `src/index.ts`, `src/cli.ts` (`currencies`, `latest`, `convert`,
  `historical`, `range`, `convert-on`, `greet`, `mcp`, `--version`;
  exit 2 usage / 1 API error), `src/mcp.ts`, `src/types.ts`,
  `src/fxrates.ts` (core logic, `VERSION = "0.1.0"`)
- `test/fxrates.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (from the fleet template; image name and smoke-test server name
  changed to fxrates)

## Tools implemented (6)

`get_supported_currencies`, `get_latest_exchange_rates`,
`convert_currency_latest`, `get_historical_exchange_rates`,
`convert_currency_specific_date`, `greet` — the full documented
set, as recorded in the fixture `_source`.

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with explicit
  inputSchema literals, per the standing fleet rule: `McpServer`'s
  zod-to-JSON-Schema conversion injects `$schema` /
  `additionalProperties` keys that are absent from the defined spec
  and break exact schema parity. Zod still validates every
  `tools/call`.
- Endpoints under the base URL (env `FRANKFURTER_API_URL`, default
  `https://api.frankfurter.dev/v1`, trailing slashes stripped):
  `GET /currencies`; `GET /latest?base=&symbols=` (params only when
  supplied); `GET /{date}` for a single historical date and
  `GET /{start}..{end}` (or `/{start}..` when only a start is given)
  for ranges, with the same optional base/symbols params.
  Historical calls with no date/start, or an end without a start,
  fail validation before any request. Dates must be `YYYY-MM-DD`.
- Keyless by design: no credential is required, read, or sent.
- Conversions are computed locally from the fetched rate, never
  delegated to an upstream convert endpoint: latest conversion
  fetches `GET /latest?base={from}&symbols={to}`, specific-date
  conversion fetches `GET /{date}?base={from}&symbols={to}`, then
  `converted = amount * rate`. **Rounding choice:** the converted
  value is trimmed to at most 6 decimal places by rounding at the
  6th place (`Math.round(v * 1e6) / 1e6`); the `rate` field itself
  is returned exactly as the API supplied it, and no fee, spread,
  or other rounding is invented. Same-currency conversions return
  rate 1. Results carry `amount`, `from`, `to`, `rate`,
  `converted`, and `date` when available. A missing rate in the
  upstream payload is an error, not a zero.
- `greet` performs no HTTP: it returns `Hello, {name}!`, or
  `Hello, World!` when no (non-blank) name is given — per the
  public spec it exists for internal testing.
- HTTP failures surface the status plus the upstream `message` or
  `error` string when present.
- All HTTP flows through an injectable `FetchFn` (types.ts). The
  test suite uses a fake fetch returning hand-written
  Frankfurter-shaped JSON fixtures; no live call is made in tests.

## Verification (foreground, exact outputs)

### 1. Build
```
$ ./node_modules/.bin/tsc ; echo exit=$?
tsc exit=0
```
`dist/` produced, including `dist/cli.js`.

### 2. Tests
```
$ ./node_modules/.bin/tsx --test test/*.test.ts
ℹ tests 19
ℹ pass 19
ℹ fail 0
```
Covers: base-URL default/custom/trailing-slash handling;
currencies path; latest with no query, with base+symbols, and on a
custom base; latest conversion arithmetic (10 × 1.0834567 →
10.834567) and 6dp trimming boundary; same-currency rate 1;
missing-rate error; non-finite amount rejected; specific-date
conversion path and date; malformed date rejected before any
request; historical single date, range, and start-only range
paths; no-date and end-only errors; greet by name and fallback;
HTTP 404 surfacing the upstream message; network failure wrapping.

### 3. CLI / MCP smoke
`--version` → `0.1.0` (exit 0); unknown command exits 2 with
Usage; `greet Ada` → `Hello, Ada!` (exit 0). MCP `initialize` over
stdio → `serverInfo: {"name":"fxrates","version":"0.1.0"}`; a
stdio `tools/call` for `greet` with `{name:"Ada"}` returned the
text `Hello, Ada!`. No live Frankfurter call was made in smoke —
the greet path needs no network, and no live result is claimed.

### 4. Parity (harness, from ~/workspace/mcp-rebuild-100/harness/)
```
$ python3 parity.py --original fixtures/frankfurtermcp-tools-original.json \
    --rebuild "stdio:node .../builds/fxrates/dist/cli.js mcp" \
    --out .../builds/fxrates/parity-out
verdict=PASS parity_pct=100.0 original_tools=6 rebuild_tools=6 missing=[] extra=[] schema_diffs=[]
(exit 0)
```
(parity.json: identical_tools 6/6.) Original side is tools-file
mode, so `fixture_results` records `SKIPPED-TOOLS-FILE-MODE` —
expected harness semantics, not an error.

## Lockfile status

`package-lock.json` was generated clean via Route 3: a temp copy
holding only `package.json` (no `node_modules`), offline
`npm install --package-lock-only --ignore-scripts`, verified after
generation — parses as JSON, top-level `name` is
`@reneturcios/fxrates`, version `0.1.0`, `lockfileVersion` 3, 128
package entries — then only the lockfile was copied back. Local
`node_modules` is a sibling copy (cryptoprice) used only for the
local build/test; it is not part of the lockfile generation.

## Gaps / honest notes

- Docs-derived spec: the argument schemas are documented
  reconstructions from the Frankfurter API contract, per the task
  spec — no original frankfurtermcp server was probed, so parity
  proves the rebuild matches this program's defined spec, not a
  hand-probed original. The original's exact conversion result
  shape (field names/layout) is not in the public spec; this
  rebuild's `{amount, from, to, rate, converted, date}` shape is a
  documented local choice.
- No live call was made: every endpoint is fake-fetch tested only,
  so live payload/response-shape drift against
  api.frankfurter.dev is unverified until the publish wave.
- Historical semantics for a start date with no end date
  (`/{start}..`) follow the Frankfurter range contract as
  documented; that branch is unit-tested for URL shape only.
- Container build not exercised locally; the publish-container
  workflow smoke-tests the image at publish time.
