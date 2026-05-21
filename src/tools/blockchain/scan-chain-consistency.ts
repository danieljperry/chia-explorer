import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { get_block_records } from 'chia-agent/api/rpc/full_node/index.js';
import { getAgent } from '../../coinset/agent.js';
import { heightSchema, networkSchema } from '../../schemas/common.js';
import { stripHexPrefix } from '../../chia/hex.js';
import { Network } from '../../network.js';
import { errorText, jsonText } from '../shared/response.js';

// Keep requests manageable; ~10 days of blocks at 18 s/block.
const MAX_RANGE = 50_000;
const BATCH_SIZE = 1_000;

type Anomaly = {
  type: 'chain_break' | 'weight_regression' | 'timestamp_regression';
  height: number;
  timestamp: string | null;
  detail: string;
};

export function register(server: McpServer): void {
  server.tool(
    'scan_chain_consistency',
    'Scan a range of blocks for reorg indicators: broken prev_hash linkage (chain_break), decreasing weight (weight_regression), and decreasing timestamps between transaction blocks (timestamp_regression). ' +
      'A chain_break or weight_regression is definitive evidence of a reorg at that height. ' +
      'Note: shallow reorgs (1–3 blocks) replace orphaned blocks invisibly on the canonical chain; only deeper reorgs leave traces here. ' +
      `Max range: ${MAX_RANGE.toLocaleString()} blocks.`,
    {
      start_height: heightSchema.describe('First block height to scan (inclusive)'),
      end_height: heightSchema.describe('Last block height to scan (inclusive)'),
      network: networkSchema,
    },
    async ({ start_height, end_height, network }) => {
      try {
        if (end_height < start_height) {
          throw new Error('end_height must be >= start_height');
        }
        const range = end_height - start_height + 1;
        if (range > MAX_RANGE) {
          throw new Error(
            `Range of ${range.toLocaleString()} blocks exceeds the maximum of ${MAX_RANGE.toLocaleString()}`
          );
        }

        const agent = getAgent(network as Network);

        // Fetch all block records in batches.
        const blocks: Array<{
          height: number;
          header_hash: string;
          prev_hash: string;
          weight: number | bigint;
          timestamp: number | null;
        }> = [];

        for (let h = start_height; h <= end_height; h += BATCH_SIZE) {
          const batchEnd = Math.min(h + BATCH_SIZE, end_height + 1);
          const res = await get_block_records(agent, { start: h, end: batchEnd });
          if (res.block_records) blocks.push(...(res.block_records as typeof blocks));
        }

        blocks.sort((a, b) => a.height - b.height);

        const anomalies: Anomaly[] = [];

        const fmt = (ts: number | null) => (ts != null ? new Date(ts * 1000).toISOString() : null);

        // Check consecutive pairs.
        let prevTxHeight: number | null = null;
        let prevTxTimestamp: number | null = null;

        for (let i = 0; i < blocks.length; i++) {
          const curr = blocks[i]!;
          const prev = blocks[i - 1];

          if (prev !== undefined && curr.height === prev.height + 1) {
            // 1. Chain break: prev_hash linkage.
            const currPrev = stripHexPrefix(curr.prev_hash).toLowerCase();
            const prevHash = stripHexPrefix(prev.header_hash).toLowerCase();
            if (currPrev !== prevHash) {
              anomalies.push({
                type: 'chain_break',
                height: curr.height,
                timestamp: fmt(curr.timestamp),
                detail: `Block ${curr.height}.prev_hash (${currPrev.slice(0, 12)}…) does not match block ${prev.height}.header_hash (${prevHash.slice(0, 12)}…)`,
              });
            }

            // 2. Weight regression.
            const currW = BigInt(curr.weight);
            const prevW = BigInt(prev.weight);
            if (currW < prevW) {
              anomalies.push({
                type: 'weight_regression',
                height: curr.height,
                timestamp: fmt(curr.timestamp),
                detail: `Weight decreased from ${prev.weight} at height ${prev.height} to ${curr.weight} at height ${curr.height}`,
              });
            }
          }

          // 3. Timestamp regression across transaction blocks.
          if (curr.timestamp != null) {
            if (prevTxTimestamp != null && curr.timestamp < prevTxTimestamp) {
              anomalies.push({
                type: 'timestamp_regression',
                height: curr.height,
                timestamp: fmt(curr.timestamp),
                detail: `Timestamp went backwards: block ${prevTxHeight} (${fmt(prevTxTimestamp)}) → block ${curr.height} (${fmt(curr.timestamp)})`,
              });
            }
            prevTxHeight = curr.height;
            prevTxTimestamp = curr.timestamp;
          }
        }

        // Count transaction blocks for context.
        const txBlockCount = blocks.filter((b) => b.timestamp != null).length;

        return jsonText({
          network,
          start_height,
          end_height,
          blocks_scanned: blocks.length,
          transaction_blocks_scanned: txBlockCount,
          anomalies_found: anomalies.length,
          anomalies,
          consistent: anomalies.length === 0,
        });
      } catch (err) {
        return errorText(err);
      }
    }
  );
}
