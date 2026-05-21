import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createChiaAgentMocks } from './helpers/chia-agent-mocks.js';

const mocks = createChiaAgentMocks();

vi.mock('chia-agent/api/rpc/full_node/index.js', () => mocks);

const { createTestClient, parseToolText } = await import('./helpers/create-test-client.js');

const SAMPLE_BLOCKCHAIN_STATE = {
  blockchain_state: {
    peak: {
      height: 6_500_000,
      header_hash: '0xabc',
      timestamp: 1_700_000_000,
    },
    genesis_challenge_initialized: true,
    sync: { sync_mode: false, synced: true, sync_tip_height: 0, sync_progress_height: 0 },
    difficulty: 9000,
    sub_slot_iters: 580_000_000,
    space: 30n * 2n ** 60n,
    average_block_time: 18,
    mempool_size: 5,
    mempool_cost: 1,
    mempool_fees: 0,
    mempool_min_fees: { cost_5000000: 0 },
    mempool_max_total_cost: 0,
    block_max_cost: 0,
    node_id: 'node',
  },
};

describe('blockchain tools (mocked RPC)', () => {
  let client: Client;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    ({ client, cleanup } = await createTestClient());
  });

  afterAll(async () => {
    await cleanup();
  });

  beforeEach(() => {
    for (const fn of Object.values(mocks)) fn.mockReset();
  });

  it('get_blockchain_state formats space and surfaces peak info', async () => {
    mocks.get_blockchain_state.mockResolvedValue(SAMPLE_BLOCKCHAIN_STATE);
    const res = await client.callTool({
      name: 'get_blockchain_state',
      arguments: { network: 'mainnet' },
    });
    const body = parseToolText(res) as {
      network: string;
      peak_height: number;
      space_eib: string;
      space_human: string;
      sync: { synced: boolean };
    };
    expect(body.network).toBe('mainnet');
    expect(body.peak_height).toBe(6_500_000);
    expect(body.space_eib).toBe('30');
    expect(body.space_human).toMatch(/EiB$/);
    expect(body.sync.synced).toBe(true);
  });

  it('get_netspace returns bytes/eib/pib/tib', async () => {
    mocks.get_blockchain_state.mockResolvedValue(SAMPLE_BLOCKCHAIN_STATE);
    const res = await client.callTool({ name: 'get_netspace', arguments: {} });
    const body = parseToolText(res) as { eib: string; bytes: string; pib: string; tib: string };
    expect(body.eib).toBe('30');
    expect(BigInt(body.bytes)).toBe(30n * 2n ** 60n);
  });

  it('get_peak_height returns peak.height', async () => {
    mocks.get_blockchain_state.mockResolvedValue(SAMPLE_BLOCKCHAIN_STATE);
    const res = await client.callTool({ name: 'get_peak_height', arguments: {} });
    const body = parseToolText(res) as { peak_height: number };
    expect(body.peak_height).toBe(6_500_000);
  });

  it('get_block_by_height passes through the block record', async () => {
    mocks.get_block_record_by_height.mockResolvedValue({
      block_record: { height: 123, header_hash: 'deadbeef', timestamp: 1_700_000_000 },
    });
    const res = await client.callTool({
      name: 'get_block_by_height',
      arguments: { height: 123 },
    });
    const body = parseToolText(res) as { header_hash: string; height: number };
    expect(body.header_hash).toBe('deadbeef');
    expect(body.height).toBe(123);
    expect(mocks.get_block_record_by_height).toHaveBeenCalledWith(expect.anything(), {
      height: 123,
    });
  });

  it('get_block_by_hash normalises the header hash and returns the record', async () => {
    mocks.get_block_record.mockResolvedValue({
      block_record: { height: 999, header_hash: 'cafe' },
    });
    const res = await client.callTool({
      name: 'get_block_by_hash',
      arguments: { header_hash: '0x' + 'a'.repeat(64) },
    });
    const body = parseToolText(res) as { height: number; header_hash: string };
    expect(body.height).toBe(999);
    expect(body.header_hash).toBe('a'.repeat(64));
    expect(mocks.get_block_record).toHaveBeenCalledWith(expect.anything(), {
      header_hash: 'a'.repeat(64),
    });
  });

  it('count_block_transactions resolves a height, then aggregates counts', async () => {
    mocks.get_block_record_by_height.mockResolvedValue({
      block_record: { height: 200, header_hash: 'b'.repeat(64), timestamp: 1 },
    });
    mocks.get_block_spends.mockResolvedValue({ block_spends: [{}, {}, {}] });
    mocks.get_additions_and_removals.mockResolvedValue({
      additions: new Array(5).fill({}),
      removals: new Array(3).fill({}),
    });

    const res = await client.callTool({
      name: 'count_block_transactions',
      arguments: { height: 200 },
    });
    const body = parseToolText(res) as {
      coin_spends_count: number;
      additions_count: number;
      removals_count: number;
      is_transaction_block: boolean;
      header_hash: string;
    };
    expect(body.coin_spends_count).toBe(3);
    expect(body.additions_count).toBe(5);
    expect(body.removals_count).toBe(3);
    expect(body.is_transaction_block).toBe(true);
    expect(body.header_hash).toBe('b'.repeat(64));
  });

  it('count_block_transactions reports is_transaction_block=false when timestamp is null', async () => {
    mocks.get_block_record_by_height.mockResolvedValue({
      block_record: { height: 201, header_hash: 'c'.repeat(64), timestamp: null },
    });
    mocks.get_block_spends.mockResolvedValue({ block_spends: [] });
    mocks.get_additions_and_removals.mockResolvedValue({ additions: [], removals: [] });

    const res = await client.callTool({
      name: 'count_block_transactions',
      arguments: { height: 201 },
    });
    const body = parseToolText(res) as { is_transaction_block: boolean };
    expect(body.is_transaction_block).toBe(false);
  });

  it('count_block_transactions requires either height or header_hash', async () => {
    const res = (await client.callTool({
      name: 'count_block_transactions',
      arguments: {},
    })) as { isError?: boolean };
    expect(res.isError).toBe(true);
  });

  it('get_block_additions_and_removals resolves height to header_hash then returns coin lists', async () => {
    mocks.get_block_record_by_height.mockResolvedValue({
      block_record: { height: 500, header_hash: 'd'.repeat(64), timestamp: 1 },
    });
    mocks.get_additions_and_removals.mockResolvedValue({
      additions: [{ coin: { amount: 1n } }, { coin: { amount: 2n } }],
      removals: [{ coin: { amount: 3n } }],
    });
    const res = await client.callTool({
      name: 'get_block_additions_and_removals',
      arguments: { height: 500 },
    });
    const body = parseToolText(res) as {
      height: number | null;
      header_hash: string;
      additions_count: number;
      removals_count: number;
      additions: unknown[];
      removals: unknown[];
    };
    expect(body.height).toBe(500);
    expect(body.header_hash).toBe('d'.repeat(64));
    expect(body.additions_count).toBe(2);
    expect(body.removals_count).toBe(1);
    expect(body.additions).toHaveLength(2);
    expect(body.removals).toHaveLength(1);
    expect(mocks.get_additions_and_removals).toHaveBeenCalledWith(expect.anything(), {
      header_hash: 'd'.repeat(64),
    });
  });

  it('get_block_additions_and_removals accepts header_hash directly without resolving height', async () => {
    mocks.get_additions_and_removals.mockResolvedValue({ additions: [], removals: [] });
    await client.callTool({
      name: 'get_block_additions_and_removals',
      arguments: { header_hash: '0x' + 'e'.repeat(64) },
    });
    expect(mocks.get_block_record_by_height).not.toHaveBeenCalled();
    expect(mocks.get_additions_and_removals).toHaveBeenCalledWith(expect.anything(), {
      header_hash: 'e'.repeat(64),
    });
  });

  it('get_block_additions_and_removals rejects when neither height nor header_hash supplied', async () => {
    const res = (await client.callTool({
      name: 'get_block_additions_and_removals',
      arguments: {},
    })) as { isError?: boolean };
    expect(res.isError).toBe(true);
  });

  it('get_block_additions_and_removals rejects when both height and header_hash are supplied', async () => {
    const res = (await client.callTool({
      name: 'get_block_additions_and_removals',
      arguments: { height: 1, header_hash: 'f'.repeat(64) },
    })) as { isError?: boolean };
    expect(res.isError).toBe(true);
  });

  // check_block_canonical

  it('check_block_canonical returns canonical=true when hash matches', async () => {
    const hash = 'a'.repeat(64);
    mocks.get_block_record_by_height.mockResolvedValue({
      block_record: { height: 500, header_hash: '0x' + hash },
    });
    const res = await client.callTool({
      name: 'check_block_canonical',
      arguments: { height: 500, expected_header_hash: hash },
    });
    const body = parseToolText(res) as { canonical: boolean; current_header_hash: string };
    expect(body.canonical).toBe(true);
    expect(body.current_header_hash).toBe(hash);
  });

  it('check_block_canonical returns canonical=false when hash differs', async () => {
    const expected = 'a'.repeat(64);
    const current = 'b'.repeat(64);
    mocks.get_block_record_by_height.mockResolvedValue({
      block_record: { height: 500, header_hash: current },
    });
    const res = await client.callTool({
      name: 'check_block_canonical',
      arguments: { height: 500, expected_header_hash: expected },
    });
    const body = parseToolText(res) as {
      canonical: boolean;
      expected_header_hash: string;
      current_header_hash: string;
    };
    expect(body.canonical).toBe(false);
    expect(body.expected_header_hash).toBe(expected);
    expect(body.current_header_hash).toBe(current);
  });

  it('check_block_canonical normalises 0x-prefixed expected hash', async () => {
    const hash = 'c'.repeat(64);
    mocks.get_block_record_by_height.mockResolvedValue({
      block_record: { height: 600, header_hash: hash },
    });
    const res = await client.callTool({
      name: 'check_block_canonical',
      arguments: { height: 600, expected_header_hash: '0x' + hash },
    });
    const body = parseToolText(res) as { canonical: boolean };
    expect(body.canonical).toBe(true);
  });

  // scan_chain_consistency

  function makeBlock(
    height: number,
    headerHash: string,
    prevHash: string,
    weight: number,
    timestamp: number | null = null
  ) {
    return {
      height,
      header_hash: headerHash,
      prev_hash: prevHash,
      weight,
      timestamp,
      sub_epoch_summary_included: null,
    };
  }

  it('scan_chain_consistency reports consistent=true for a clean range', async () => {
    mocks.get_block_records.mockResolvedValue({
      block_records: [
        makeBlock(100, 'aaa', '000', 1000, 1700000000),
        makeBlock(101, 'bbb', 'aaa', 2000, 1700000020),
        makeBlock(102, 'ccc', 'bbb', 3000, null),
        makeBlock(103, 'ddd', 'ccc', 4000, 1700000040),
      ],
    });
    const res = await client.callTool({
      name: 'scan_chain_consistency',
      arguments: { start_height: 100, end_height: 103 },
    });
    const body = parseToolText(res) as {
      consistent: boolean;
      anomalies_found: number;
      blocks_scanned: number;
    };
    expect(body.consistent).toBe(true);
    expect(body.anomalies_found).toBe(0);
    expect(body.blocks_scanned).toBe(4);
  });

  it('scan_chain_consistency detects a chain_break', async () => {
    mocks.get_block_records.mockResolvedValue({
      block_records: [
        makeBlock(200, 'aaa', '000', 1000),
        makeBlock(201, 'bbb', 'WRONG', 2000), // prev_hash should be 'aaa'
        makeBlock(202, 'ccc', 'bbb', 3000),
      ],
    });
    const res = await client.callTool({
      name: 'scan_chain_consistency',
      arguments: { start_height: 200, end_height: 202 },
    });
    const body = parseToolText(res) as {
      consistent: boolean;
      anomalies: Array<{ type: string; height: number }>;
    };
    expect(body.consistent).toBe(false);
    expect(body.anomalies).toHaveLength(1);
    expect(body.anomalies[0]!.type).toBe('chain_break');
    expect(body.anomalies[0]!.height).toBe(201);
  });

  it('scan_chain_consistency detects a weight_regression', async () => {
    mocks.get_block_records.mockResolvedValue({
      block_records: [
        makeBlock(300, 'aaa', '000', 5000),
        makeBlock(301, 'bbb', 'aaa', 4000), // weight went down
        makeBlock(302, 'ccc', 'bbb', 6000),
      ],
    });
    const res = await client.callTool({
      name: 'scan_chain_consistency',
      arguments: { start_height: 300, end_height: 302 },
    });
    const body = parseToolText(res) as { anomalies: Array<{ type: string; height: number }> };
    expect(body.anomalies.some((a) => a.type === 'weight_regression' && a.height === 301)).toBe(
      true
    );
  });

  it('scan_chain_consistency detects a timestamp_regression', async () => {
    mocks.get_block_records.mockResolvedValue({
      block_records: [
        makeBlock(400, 'aaa', '000', 1000, 1700000100),
        makeBlock(401, 'bbb', 'aaa', 2000, 1700000050), // timestamp went back
        makeBlock(402, 'ccc', 'bbb', 3000, 1700000200),
      ],
    });
    const res = await client.callTool({
      name: 'scan_chain_consistency',
      arguments: { start_height: 400, end_height: 402 },
    });
    const body = parseToolText(res) as { anomalies: Array<{ type: string; height: number }> };
    expect(body.anomalies.some((a) => a.type === 'timestamp_regression' && a.height === 401)).toBe(
      true
    );
  });

  it('scan_chain_consistency rejects end_height < start_height', async () => {
    const res = (await client.callTool({
      name: 'scan_chain_consistency',
      arguments: { start_height: 500, end_height: 400 },
    })) as { isError?: boolean };
    expect(res.isError).toBe(true);
  });

  it('scan_chain_consistency rejects ranges exceeding the max', async () => {
    const res = (await client.callTool({
      name: 'scan_chain_consistency',
      arguments: { start_height: 0, end_height: 100_000 },
    })) as { isError?: boolean };
    expect(res.isError).toBe(true);
  });

  it('scan_chain_consistency handles a single-block range', async () => {
    mocks.get_block_records.mockResolvedValue({
      block_records: [makeBlock(100, 'aaa', '000', 1000, 1700000000)],
    });
    const res = await client.callTool({
      name: 'scan_chain_consistency',
      arguments: { start_height: 100, end_height: 100 },
    });
    const body = parseToolText(res) as {
      blocks_scanned: number;
      consistent: boolean;
      anomalies_found: number;
    };
    expect(body.blocks_scanned).toBe(1);
    expect(body.consistent).toBe(true);
    expect(body.anomalies_found).toBe(0);
  });

  it('scan_chain_consistency handles null block_records in the RPC response', async () => {
    mocks.get_block_records.mockResolvedValue({ block_records: null });
    const res = await client.callTool({
      name: 'scan_chain_consistency',
      arguments: { start_height: 100, end_height: 102 },
    });
    const body = parseToolText(res) as { blocks_scanned: number; consistent: boolean };
    expect(body.blocks_scanned).toBe(0);
    expect(body.consistent).toBe(true);
  });

  it('scan_chain_consistency fetches multiple batches for large ranges', async () => {
    mocks.get_block_records
      .mockResolvedValueOnce({ block_records: [makeBlock(0, 'aaa', '000', 1000)] })
      .mockResolvedValueOnce({
        block_records: [makeBlock(1000, 'bbb', 'aaa', 2000), makeBlock(1001, 'ccc', 'bbb', 3000)],
      });
    const res = await client.callTool({
      name: 'scan_chain_consistency',
      arguments: { start_height: 0, end_height: 1001 },
    });
    const body = parseToolText(res) as { blocks_scanned: number };
    expect(body.blocks_scanned).toBe(3);
    expect(mocks.get_block_records).toHaveBeenCalledTimes(2);
    expect(mocks.get_block_records).toHaveBeenNthCalledWith(1, expect.anything(), {
      start: 0,
      end: 1000,
    });
    expect(mocks.get_block_records).toHaveBeenNthCalledWith(2, expect.anything(), {
      start: 1000,
      end: 1002,
    });
  });

  it('scan_chain_consistency returns isError when the RPC throws', async () => {
    mocks.get_block_records.mockRejectedValue(new Error('node unavailable'));
    const res = (await client.callTool({
      name: 'scan_chain_consistency',
      arguments: { start_height: 100, end_height: 102 },
    })) as { isError?: boolean };
    expect(res.isError).toBe(true);
  });

  it('scan_chain_consistency skips prev-block checks across a height gap', async () => {
    // Height 101 is missing; the prev_hash on 102 deliberately does NOT link to 100.
    // The scanner should only run the chain_break / weight_regression comparisons between
    // consecutive heights, so this must NOT be reported as an anomaly.
    mocks.get_block_records.mockResolvedValue({
      block_records: [
        makeBlock(100, 'aaa', '000', 1000),
        makeBlock(102, 'ccc', 'WRONG', 500), // gap from 100; bogus prev_hash and lower weight
      ],
    });
    const res = await client.callTool({
      name: 'scan_chain_consistency',
      arguments: { start_height: 100, end_height: 102 },
    });
    const body = parseToolText(res) as {
      blocks_scanned: number;
      consistent: boolean;
      anomalies: unknown[];
    };
    expect(body.blocks_scanned).toBe(2);
    expect(body.consistent).toBe(true);
    expect(body.anomalies).toHaveLength(0);
  });

  it('scan_chain_consistency handles bigint weight values', async () => {
    // chia-agent can return weight as bigint for very large weights; the scan should
    // coerce both sides with BigInt() and still detect a regression.
    mocks.get_block_records.mockResolvedValue({
      block_records: [
        {
          height: 100,
          header_hash: 'aaa',
          prev_hash: '000',
          weight: 10_000n,
          timestamp: null,
          sub_epoch_summary_included: null,
        },
        {
          height: 101,
          header_hash: 'bbb',
          prev_hash: 'aaa',
          weight: 5_000n,
          timestamp: null,
          sub_epoch_summary_included: null,
        },
      ],
    });
    const res = await client.callTool({
      name: 'scan_chain_consistency',
      arguments: { start_height: 100, end_height: 101 },
    });
    const body = parseToolText(res) as { anomalies: Array<{ type: string; height: number }> };
    expect(body.anomalies.some((a) => a.type === 'weight_regression' && a.height === 101)).toBe(
      true
    );
  });

  it('check_block_canonical returns canonical=false and null hash when block record is absent', async () => {
    mocks.get_block_record_by_height.mockResolvedValue({ block_record: undefined });
    const res = await client.callTool({
      name: 'check_block_canonical',
      arguments: { height: 999, expected_header_hash: 'a'.repeat(64) },
    });
    const body = parseToolText(res) as { canonical: boolean; current_header_hash: null };
    expect(body.canonical).toBe(false);
    expect(body.current_header_hash).toBeNull();
  });

  it('check_block_canonical returns isError when the RPC throws', async () => {
    mocks.get_block_record_by_height.mockRejectedValue(new Error('RPC down'));
    const res = (await client.callTool({
      name: 'check_block_canonical',
      arguments: { height: 100, expected_header_hash: 'a'.repeat(64) },
    })) as { isError?: boolean };
    expect(res.isError).toBe(true);
  });
});
