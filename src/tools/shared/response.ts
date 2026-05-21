import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { safeMessage } from '../../util/safe-message.js';

function bigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

export function jsonText(data: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, bigIntReplacer) }],
  };
}

export function errorText(err: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: safeMessage(err) }) }],
    isError: true,
  };
}
