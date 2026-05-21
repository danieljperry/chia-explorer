# chia-explorer

MCP server that answers questions about the Chia blockchain. Read-only, no keys, no signing.

Backed by the public [coinset.org](https://www.coinset.org) full-node API for chain data and [CoinGecko](https://www.coingecko.com) for XCH price. Offer strings and CLVM puzzles are decoded locally via the [chia-wallet-sdk](https://github.com/xch-dev/chia-wallet-sdk) native module — no extra services. Supports mainnet (default) and testnet11. Auto-detects network from `xch` or `txch` address prefixes.

## What it can answer

- What is the current netspace? Peak height? Sync status?
- What is the header hash of block N? How many transactions in that block? What coins were created or destroyed?
- What is the balance of `xch1...` (or `txch1...`, or a raw puzzle hash)?
- Look up a coin by name. Calculate a coin name from its fields. Find the children produced by spending a coin.
- Fetch the CLVM puzzle reveal and solution for a spent coin, plus an automatic classification (xch / cat / nft / did) and parsed conditions.
- Decode a Chia `offer1...` string locally and tell you what's being traded. Same for any raw spend bundle.
- Decompile any puzzle reveal and identify its kind (CAT with asset_id, NFT with launcher_id, settlement-payments, plain p2, etc.).
- What's currently in the mempool? Is my specific transaction pending? What fee should I pay for inclusion in 1/5/15 minutes?
- Convert between addresses and puzzle hashes in either direction.
- What is XCH worth in USD (or EUR, GBP, BTC, ...) right now? What's this balance worth?
- How much XCH is left in the strategic reserve? Where has it been sent? Which destinations are known partners, market makers, or exchanges?

## Install

The server is a single npm package. No global install needed — every config below uses `npx` so it stays up to date.

```bash
npx chia-explorer
```

If you want it on your PATH:

```bash
npm install -g chia-explorer
```

Requires Node.js 20+.

## Use it with your AI client

### Claude Code

```bash
claude mcp add chia-explorer -- npx chia-explorer
```

### Claude Desktop

Edit `claude_desktop_config.json` (Settings → Developer → Edit Config):

```json
{
  "mcpServers": {
    "chia-explorer": {
      "command": "npx",
      "args": ["chia-explorer"]
    }
  }
}
```

Restart Claude Desktop.

### Cursor

Create or edit `~/.cursor/mcp.json` (global) or `.cursor/mcp.json` inside a project:

```json
{
  "mcpServers": {
    "chia-explorer": {
      "command": "npx",
      "args": ["chia-explorer"]
    }
  }
}
```

Restart Cursor and enable the server under Settings → MCP.

### Codex CLI

Edit `~/.codex/config.toml`:

```toml
[mcp_servers.chia-explorer]
command = "npx"
args = ["chia-explorer"]
```

### VS Code (native MCP)

Create `.vscode/mcp.json` in your workspace:

```json
{
  "servers": {
    "chia-explorer": {
      "command": "npx",
      "args": ["chia-explorer"]
    }
  }
}
```

### Windsurf

Edit `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "chia-explorer": {
      "command": "npx",
      "args": ["chia-explorer"]
    }
  }
}
```

### Anything else that speaks MCP

It's a standard stdio MCP server. The recipe is always the same: `command = npx`, `args = ["chia-explorer"]`. Set `COINGECKO_API_KEY` as an env var if you have one.

## Example prompts

Drop these into a chat once the server is wired up.

**Offers**

> Decode this offer and tell me what's being traded: `offer1qqr83wcuu2rykcmqvpsxgfgqmqys...`

> I just got sent this `offer1...` string in Discord. Is it safe to take? What do I give and what do I get?

**Smart-coin inspection**

> What kind of coin is `0xabc...123`? Pull its puzzle reveal at height 6500000 and tell me if it's a CAT, NFT, DID, or plain XCH.

> Walk the children of coin `0xabc...` for two hops. Classify each child.

**Mempool and fees**

> Is `0xdeadbeef...` (my tx) currently in the mempool?

> How many transactions are pending right now? What does the fee market look like for inclusion in the next minute?

> What fee should I attach to a take_offer spend to get included in the next 5 minutes?

**Balances and pricing**

> What's the XCH balance of `xch1yxqsmyuyjdlgxw4sqjg4vqlqv5ms2qzex00586nu643jqemmarwslh08yl`? How much is that in USD and EUR right now?

> Convert 1.5 XCH to GBP, EUR, BTC, and SAT.

**Chain state**

> What block was Chia at one hour ago — height, header hash, transaction count?

> Is the network synced? What's the current netspace in EiB?

**Strategic reserve**

> How much of the 21M XCH strategic reserve has been spent? Where did the most recent five outflows go — partners, market makers, or exchanges?

> Show me every spend from the Swiss cold wallet, with the destination labelled.

**Identifier glue**

> Convert this puzzle hash to a mainnet address: `4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7cce23c7785459a`.

> What's the coin name for parent `0xaaa...`, puzzle hash `0xbbb...`, amount 1000000000000?

## Pre-built workflows: chia-skills

[**chia-skills**](https://github.com/Spacetime-Technology/chia-skills) is a companion package of Claude Code skills built on top of this MCP. It turns the read-only tools below into finished workflows you can actually schedule and get notified about: deposit alerts, price triggers, offer safety checks, NFT provenance, invoice watching.

```bash
npx chia-skills install
```

What's in the box:

- `watch-address` — push notification when XCH, a CAT, or an NFT lands at (or leaves) an address
- `watch-tx-confirmation` — ping when a specific tx_id moves from mempool to confirmed
- `watch-xch-price` — alert when XCH crosses a threshold in any CoinGecko currency
- `watch-fee-market` — catch cheap fee windows to broadcast
- `watch-prefarm-spend` — flag new strategic-reserve outflows with destinations labelled
- `address-daily-digest` — daily summary of one or more addresses with USD values
- `offer-safety-check` — decode an `offer1...` and check both sides against market prices
- `coin-lineage` / `nft-provenance` — walk coin or NFT history N hops in either direction
- `invoice-watch` — generate an invoice, watch for the matching deposit, emit a paid receipt

Skills are read-only and idempotent, persist state between runs, and accept structured inputs so other skills or agents can chain them. If you want to see what's possible with chia-explorer beyond ad-hoc prompts, start there. If you want to write your own, the skills repo is the reference.

## Tools

| Tool | What it does |
| --- | --- |
| `get_blockchain_state` | Peak height, netspace (EiB), difficulty, sync status |
| `get_netspace` | Just the netspace in bytes, EiB, and PiB |
| `get_peak_height` | Just the peak height |
| `get_block_by_height` | Block record + header hash for a height |
| `get_block_by_hash` | Block record for a header hash |
| `count_block_transactions` | Coin spends, additions, removals counts for a block |
| `get_block_additions_and_removals` | Every coin created and destroyed in a block (full lists, not just counts) |
| `get_balance` | Balance of an address or puzzle hash (paginated, unspent coins) |
| `get_coin_records_by_puzzle_hash` | Raw coin records for a puzzle hash or address |
| `get_coin_records_by_parent_ids` | Children of one or more spent coins (the usual coin-lineage step) |
| `get_coin_by_name` | Coin record by coin name |
| `calculate_coin_name` | sha256(parent_coin_info \|\| puzzle_hash \|\| amount) — no RPC |
| `get_puzzle_and_solution` | CLVM puzzle reveal + solution for a spent coin, plus automatic puzzle classification and parsed conditions |
| `decode_offer` | Decode a `offer1...` string locally into offered / requested assets (XCH, CATs with asset_id, NFTs with launcher_id) |
| `decode_spend_bundle` | Same trade-summary shape as `decode_offer` but for any raw hex spend bundle (e.g. a mempool item) |
| `decompile_puzzle` | Classify any CLVM puzzle reveal (or fetch via coin_id+height) and optionally parse the conditions a spend emits |
| `get_mempool` | List tx_ids currently in the mempool (paginated, with optional full items) |
| `is_in_mempool` | Check whether a specific tx_id is sitting in the mempool right now |
| `estimate_fee` | Recommended mojo fee for inclusion in 1/5/15 minutes (configurable target_times + spend_type bias) |
| `address_to_puzzle_hash` | bech32m decode — no RPC |
| `puzzle_hash_to_address` | bech32m encode — no RPC |
| `check_block_canonical` | Re-fetch a height and compare against an expected header hash |
| `scan_chain_consistency` | Walk a height range and report any non-canonical blocks |
| `start_reorg_monitor` | Start a background poller that detects re-orgs in real time |
| `stop_reorg_monitor` | Stop the background re-org monitor |
| `get_reorg_monitor_status` | Current monitor status, peak height, and detected re-orgs |
| `get_xch_price` | Current XCH spot price in one or more currencies (CoinGecko) |
| `convert_xch_to_fiat` | Convert a mojo amount to fiat using the current XCH price |
| `get_prefarm_status` | Live per-wallet balances of the 21M XCH strategic reserve, plus total spent |
| `get_prefarm_spends` | Outflows from the reserve, with destinations labelled when known (partners / market makers / exchanges). Filter by wallet, height, or count |
| `list_prefarm_addresses` | The hardcoded registry: custody wallets and known destination addresses. No network call |
| `list_chips` | All Chia Improvement Proposals from the canonical README index in `Chia-Network/chips`, across every status (Living, Draft, Review, Final, Stagnant, Withdrawn, Obsolete, Grandfathered). Draft and Review entries link to open PRs; Final entries link to merged files. Status comes from the README; front matter is enriched in. Filter by status or category |
| `get_chip` | One CHIP by number. Returns the merged version (if any), any open PR drafts proposing the same number, and optionally the full markdown |
| `list_chip_drafts` | Open PRs against `Chia-Network/chips` that add or modify a CHIP, with parsed front matter and PR context (author, reviewers, draft flag) |
| `search_chips` | Keyword search across merged CHIPs and open PR drafts (title, description, abstract, authors) |

Blockchain tools take an optional `network: "mainnet" | "testnet11"` (default `mainnet`). The price and CHIPs tools take no network arg. The prefarm tools are mainnet only.

## Re-org monitor

The re-org monitor is a background poller that watches the tip of the chain and detects re-orgs in real time. On each poll it fetches the last `lookback_blocks` heights and compares header hashes against what it saw previously — any hash change at a given height is a confirmed re-org.

Start it with `start_reorg_monitor`, read results with `get_reorg_monitor_status`, and stop it with `stop_reorg_monitor`. Only one monitor runs at a time per server.

See [`docs/reorg_monitor/readme.md`](docs/reorg_monitor/readme.md) for the standalone CLI, system-service install, configuration options, email alerts, and examples.

## Optional config

- `COINGECKO_API_KEY` — if set, sent as `x-cg-demo-api-key` to lift the free-tier rate limit. The price tools work without it.
- `GITHUB_TOKEN` — if set, sent as `Authorization: Bearer …` to the GitHub API. Lifts the unauthenticated 60/hr limit to 5000/hr for CHIPs listings. Raw file fetches don't need it. The CHIPs tools work without it.

## Prompts

- `network_status` — quick snapshot of current chain state
- `address_summary` — balance and recent activity for an address
- `block_summary` — block details plus transaction counts
- `prefarm_summary` — strategic reserve balances, recent outflows, and known destinations

## What it isn't

- A wallet. No private keys, no signing, no `push_tx`.
- A full node. Talks to public coinset.org RPC.
- A mempool watcher. Snapshot data only.

## License

MIT
