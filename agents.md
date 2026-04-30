# Agents Manifest

Declarative reference for any LLM bootstrapping as Legion. The
chromosome (legion.md) cites this file by name; this file describes
what Legion can reach without prescribing what Legion does.

## Hosts (LLM providers Legion may run on)

| key | provider | model | sovereignty | jurisdiction | reasoning |
|---|---|---|---|---|---|
| telus-gpt-oss | TELUS Sovereign AI | gpt-oss:120b | yes | CA | yes |
| telus-gemma | TELUS Sovereign AI | google/gemma-4-31b-it | yes | CA | no |
| telus-qwen | TELUS Sovereign AI | Qwen/Qwen3.6-35B-A3B | yes | CA | yes |
| anthropic | Anthropic | claude-sonnet-4 | no | US | yes |
| openai | OpenAI | gpt-5 | no | US | yes |
| google | Google | gemini-2.5-pro | no | US | yes |

TELUS endpoints are the default. Frontier providers are fallback for
tasks that cannot be served by sovereign models.

## Stores (where Legion's knowledge lives)

| key | store | port | protocol | tissue |
|---|---|---|---|---|
| personal-koi | PostgreSQL personal_koi | 8351 | KOI HTTP | koi |
| falkordb | FalkorDB | 6380 | Cypher | hippo, graphiti |
| letta | Letta agent server | 8283 | REST | knowledge |
| legion-messages | SQLite | n/a | MCP stdio | messages |
| claude-knowledge | RRF stack | n/a | MCP stdio | knowledge |
| claude-recordings | SQLite + audio | n/a | MCP stdio | recordings |
| claude-transcripts | SQLite + JSONL | n/a | MCP stdio | transcripts |
| claude-prompts | SQLite | n/a | MCP stdio | prompts |
| claude-calendar | filesystem | n/a | MCP stdio | calendar |
| claude-schedule | filesystem | n/a | MCP stdio | schedule |
| claude-roadmaps | filesystem | n/a | MCP stdio | roadmaps |
| claude-matrix | filesystem | n/a | MCP stdio | matrix |
| claude-outbox | filesystem | n/a | MCP stdio | outbox |
| claude-discourse | REST | n/a | MCP stdio | discourse |
| claude-dock | filesystem | n/a | MCP stdio | dock |
| claude-factory | filesystem | n/a | MCP stdio | factory |
| journal | filesystem | n/a | atomic write | journal |
| scratchpad | filesystem | n/a | append-only JSONL | scratchpad |
| backlog | filesystem | n/a | atomic write | backlog |
| ventures | filesystem | n/a | read-only | ventures |
| inventory | filesystem | n/a | read-only | inventory |
| personas | filesystem | n/a | read-only | personas |
| voice | HTTP daemon | 7780 | REST | voice |

## Peers

Discovered at runtime via the matrix tissue. Peers addressed by
agent_id@host. Read-only by default; writes require operator approval.

Bootstrap peer list lives at ~/.claude/local/claudematrix/agents/.

## Schemas (data shapes Legion produces and consumes)

- KOI bundle: ~/.claude/local/koi/schema/v0.0.1.md
- Journal entry: YAML frontmatter + markdown body, atomic write
- Backlog item: id-prefixed slug under ~/.claude/local/backlog/<id>-<slug>.md
- Matrix message: <channel> envelope with sender, sender_display, event_id
- Scratchpad entry: JSONL with {id, timestamp, content, tags}
- Outbox draft: markdown + frontmatter at ~/.claude/local/outbox/drafts/<channel>/

## Secrets

TELUS API keys live in ~/.claude/local/secrets/telus-api.env. The
legion-secrets pi extension auto-loads this file at session_start.

Per-model env vars (no shared key):
- TELUS_GPT_OSS_URL + TELUS_GPT_OSS_KEY
- TELUS_GEMMA_URL + TELUS_GEMMA_KEY
- TELUS_QWEN_URL + TELUS_QWEN_KEY
- TELUS_EMBED_URL + TELUS_EMBED_KEY
- TELUS_EMBED_LLAMA32_URL + TELUS_EMBED_LLAMA32_KEY (2048-dim alternative)

Frontier provider keys live in operator-local plasmids only — never
committed to legion-pi.
