import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { get_block_record_by_height } from 'chia-agent/api/rpc/full_node/index.js';
import { getAgent } from '../../coinset/agent.js';
import { heightSchema, hex32Schema, networkSchema } from '../../schemas/common.js';
import { stripHexPrefix } from '../../chia/hex.js';
import { Network } from '../../network.js';
import { errorText, jsonText } from '../shared/response.js';

export function register(server: McpServer): void {
  server.tool(
    'check_block_canonical',
    'Check whether a specific block is still on the canonical chain. Pass the height and the expected header hash; returns canonical=true if the current block at that height matches, or canonical=false if the block was reorged out (along with what is currently at that height).',
    {
      height: heightSchema,
      expected_header_hash: hex32Schema.describe(
        'Header hash of the block you expect to be canonical at this height'
      ),
      network: networkSchema,
    },
    async ({ height, expected_header_hash, network }) => {
      try {
        const agent = getAgent(network as Network);
        const res = await get_block_record_by_height(agent, { height });
        const currentHash = res.block_record?.header_hash ?? null;
        const expected = stripHexPrefix(expected_header_hash).toLowerCase();
        const current = currentHash ? stripHexPrefix(currentHash).toLowerCase() : null;
        return jsonText({
          network,
          height,
          canonical: current === expected,
          expected_header_hash: expected,
          current_header_hash: current,
          current_block_record: res.block_record ?? null,
        });
      } catch (err) {
        return errorText(err);
      }
    }
  );
}
