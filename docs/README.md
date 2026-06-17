# Documentation

| Doc | What it covers |
|---|---|
| [api-and-agents.md](./api-and-agents.md) | **Start here.** How REST/OpenAPI and MCP relate; auth, CORS, time units, live-vs-durable data, error format, quick start. |
| [rest-api.md](./rest-api.md) | Full REST/OpenAPI endpoint reference — every route, params, response shapes, examples. OpenAPI spec at `/api/openapi.json`, Swagger UI at `/api/docs`. |
| [mcp-server.md](./mcp-server.md) | MCP server (`apps/mcp`) reference — tool catalog, config, agent-host wiring, exposing mutating tools, troubleshooting. |
| [authentication.md](./authentication.md) | Full auth reference — human cookie login + agent API key, setup, endpoints, cookie details, rate limiting, web integration, security notes. |
| [agent-prompt.md](./agent-prompt.md) | Ready-to-paste agent system prompt (full + compact) and few-shot examples encoding tool selection, data-trust rules, and the read-only boundary. |
| [ict-concepts-pine-reference.md](./ict-concepts-pine-reference.md) | ICT concept reference from the original Pine Script indicator. |

## At a glance

- **REST / OpenAPI** — any HTTP or OpenAPI-aware client. Spec: `GET /api/openapi.json`.
- **MCP** — for agents (Hermes-Agent, OpenClau, Claude Desktop/Code). Package: `apps/mcp`.

Both expose the same data; the MCP server is a thin client over the REST API.
