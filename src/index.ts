#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './server.js';

const [, , subcommand, ...rest] = process.argv;

if (subcommand === 'reorg_monitor') {
  const { runReorgMonitorCli } = await import('./cli/reorg-monitor.js');
  const code = await runReorgMonitorCli(rest);
  process.exit(code);
}

const server = createServer();
const transport = new StdioServerTransport();

await server.connect(transport);

const shutdown = (): void => {
  void server.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
