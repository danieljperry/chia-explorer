import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { networkSchema } from '../../schemas/common.js';
import {
  startMonitor,
  stopMonitor,
  getStatus,
  type AlertRecipient,
} from '../../monitor/reorg-monitor.js';
import { Network } from '../../network.js';
import { errorText, jsonText } from '../shared/response.js';

export function register(server: McpServer): void {
  server.tool(
    'start_reorg_monitor',
    'Start a background monitor that detects chain reorgs in real time. On each poll it fetches the last lookback_blocks heights and checks whether any previously-seen block hash has changed — a hash change is a confirmed reorg. Call get_reorg_monitor_status to read results; call stop_reorg_monitor when done. Optionally provide alert_recipients: up to 10 email addresses to notify, each with an optional min_blocks threshold (default 1) — an address only receives an alert when the reorg depth meets or exceeds its threshold; duplicate addresses are collapsed. Email alerts require the SMTP_HOST env var when alert_recipients is provided; optionally SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM. Set SMTP_SECURE=true to use TLS (recommended for production). Set SMTP_CA_CERT_PATH to the path of a PEM-encoded CA certificate to trust a self-signed SMTP server.',
    {
      poll_interval_seconds: z
        .number()
        .int()
        .min(5)
        .max(60)
        .default(5)
        .describe('Seconds between polls (5–60; default 5)'),
      lookback_blocks: z
        .number()
        .int()
        .min(1)
        .max(32)
        .default(5)
        .describe('How many recent heights to check each poll (1–32; default 5)'),
      alert_recipients: z
        .array(
          z.object({
            email: z.string().email().describe('Email address to notify'),
            min_blocks: z
              .number()
              .int()
              .min(1)
              .default(1)
              .describe('Only alert this address when reorg depth >= min_blocks (default 1)'),
          })
        )
        .max(10, 'A maximum of 10 alert_recipients is allowed')
        .optional()
        .describe('Email recipients (max 10); omit or leave empty for no alerts'),
      network: networkSchema,
    },
    async ({ poll_interval_seconds, lookback_blocks, alert_recipients, network }) => {
      try {
        const seen = new Set<string>();
        const recipients: AlertRecipient[] = [];
        for (const r of alert_recipients ?? []) {
          if (seen.has(r.email)) continue;
          seen.add(r.email);
          recipients.push({ email: r.email, min_blocks: r.min_blocks });
        }
        startMonitor({
          poll_interval_seconds,
          lookback_blocks,
          alert_recipients: recipients,
          network: network as Network,
        });
        return jsonText({
          started: true,
          poll_interval_seconds,
          lookback_blocks,
          alert_recipients: recipients,
          network,
        });
      } catch (err) {
        return errorText(err);
      }
    }
  );

  server.tool(
    'get_reorg_monitor_status',
    'Return the current status of the reorg monitor: whether it is active, how many polls have run, the current peak height, and all reorgs detected so far. Each reorg entry includes the affected height, old and new header hashes, and when it was detected. Configured email addresses are redacted in the response.',
    {},
    async () => jsonText(getStatus())
  );

  server.tool(
    'stop_reorg_monitor',
    'Stop the reorg monitor and return a final summary of all reorgs detected during the session.',
    {},
    async () => {
      const status = getStatus();
      stopMonitor();
      return jsonText({ ...status, active: false, stopped: true });
    }
  );
}
