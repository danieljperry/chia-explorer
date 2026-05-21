import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createTestClient } from './helpers/create-test-client.js';

const EXPECTED_TOOLS = [
  'get_blockchain_state',
  'get_netspace',
  'get_peak_height',
  'get_block_by_height',
  'get_block_by_hash',
  'count_block_transactions',
  'get_block_additions_and_removals',
  'get_balance',
  'get_coin_records_by_puzzle_hash',
  'get_coin_records_by_parent_ids',
  'get_coin_by_name',
  'calculate_coin_name',
  'get_puzzle_and_solution',
  'address_to_puzzle_hash',
  'puzzle_hash_to_address',
  'get_xch_price',
  'convert_xch_to_fiat',
  'get_prefarm_status',
  'get_prefarm_spends',
  'list_prefarm_addresses',
  'decode_offer',
  'decode_spend_bundle',
  'decompile_puzzle',
  'get_mempool',
  'is_in_mempool',
  'estimate_fee',
  'list_chips',
  'get_chip',
  'list_chip_drafts',
  'search_chips',
  'check_block_canonical',
  'scan_chain_consistency',
  'start_reorg_monitor',
  'get_reorg_monitor_status',
  'stop_reorg_monitor',
];

describe('tool registration', () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    ({ client, cleanup } = await createTestClient());
  });

  afterAll(async () => {
    await cleanup();
  });

  it('registers every expected tool', async () => {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual([...EXPECTED_TOOLS].sort());
  });

  it('every tool has a non-empty description', async () => {
    const { tools } = await client.listTools();
    for (const t of tools) {
      expect(t.description, `tool ${t.name} has empty description`).toBeTruthy();
    }
  });
});
