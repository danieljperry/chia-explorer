#!/usr/bin/env node
// Sends a representative reorg alert email to the address passed as the first argument.
// Usage: node scripts/send-test-email.mjs <to-address>
// Requires: SMTP_HOST env var (and usually SMTP_USER, SMTP_PASS, SMTP_FROM).

import { sendReorgAlert } from '../dist/monitor/email-alert.js';

const to = process.argv[2];
if (!to) {
  console.error('Usage: node scripts/send-test-email.mjs <to-address>');
  process.exit(1);
}

// Basic RFC-5321-ish check that also rejects whitespace / CRLF header-injection attempts.
const EMAIL_RE = /^[^\s@<>"',;:\\]+@[^\s@<>"',;:\\]+\.[^\s@<>"',;:\\]+$/;
if (!EMAIL_RE.test(to)) {
  console.error(`Invalid recipient address: ${JSON.stringify(to)}`);
  process.exit(1);
}

if (!process.env.SMTP_HOST) {
  console.error(
    'SMTP_HOST is not set. Configure SMTP_HOST (and optionally SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM) before running.'
  );
  process.exit(1);
}

const now = Math.floor(Date.now() / 1000);

const reorgs = [
  {
    height: 8_750_097,
    old_header_hash: 'a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890',
    new_header_hash: 'f6e5d4c3b2a10987f6e5d4c3b2a10987f6e5d4c3b2a10987f6e5d4c3b2a10987',
    detected_at: new Date().toISOString(),
    blocks_from_peak: 3,
    old_block_record: {
      height: 8_750_097,
      header_hash: '0xa1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890',
      prev_hash: '0xc0af9706ab28e408a14d3df0a1bb9429eea9d8268e0f561c8a3cfc4475da04fd',
      timestamp: now - 54,
      fees: 50_000_000_000,
      farmer_puzzle_hash: '0x4bc6435b409bcbabe53870dae0f03755f6aabb4594c5915ec983acf12a5d1fba',
      pool_puzzle_hash: '0x4bc6435b409bcbabe53870dae0f03755f6aabb4594c5915ec983acf12a5d1fba',
      weight: 54_697_200_000,
      deficit: 0,
      overflow: false,
      signage_point_index: 12,
      reward_claims_incorporated: [
        { amount: 875_000_000_000, puzzle_hash: '0x4bc6435b...' },
        { amount: 125_050_000_000, puzzle_hash: '0x4bc6435b...' },
      ],
    },
  },
  {
    height: 8_750_096,
    old_header_hash: '1122334455667788112233445566778811223344556677881122334455667788',
    new_header_hash: '8877665544332211887766554433221188776655443322118877665544332211',
    detected_at: new Date().toISOString(),
    blocks_from_peak: 4,
    old_block_record: {
      height: 8_750_096,
      header_hash: '0x1122334455667788112233445566778811223344556677881122334455667788',
      prev_hash: '0xa7cc65264ee1774c2074de7e7e752b2ccfc1423c671e851d0b5a701b00116047',
      timestamp: null,
      fees: null,
      farmer_puzzle_hash: '0x9fbde16e03f55c85ecf94cb226083fcfe2737d4e629a981e5db3ea0eb9907af4',
      pool_puzzle_hash: '0x9fbde16e03f55c85ecf94cb226083fcfe2737d4e629a981e5db3ea0eb9907af4',
      weight: 54_697_196_800,
      deficit: 2,
      overflow: false,
      signage_point_index: 7,
      reward_claims_incorporated: null,
    },
  },
];

console.log(`Sending test re-org alert to ${to}...`);

try {
  await sendReorgAlert(to, 'mainnet', reorgs, 8_750_100);
  console.log('Done.');
} catch (err) {
  console.error('Failed to send:', err.message);
  process.exit(1);
}
