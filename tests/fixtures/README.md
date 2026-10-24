# Terac contract snapshot

`terac-tools.json` contains the six required MCP input schemas returned by `https://terac.com/api/mcp` on October 24, 2026. Descriptions were removed; validation constraints, enums and required fields are unchanged. No credentials, account data or provider writes are included.

The same read-only session confirmed `multi_select--country` supports `$in` with `US`, `multi_select--language` supports `$in` with `en-US` (English), and `integer--age` supports `$gte` with a minimum of 18. Sales tests assert this explicit audience and validate the generated assignment against the captured create schema. `npm run doctor` validates it against the live schema without creating a draft or starting recruitment.
