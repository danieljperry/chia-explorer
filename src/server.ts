import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { VERSION } from './version.js';

import { register as registerGetBlockchainState } from './tools/blockchain/get-blockchain-state.js';
import { register as registerGetNetspace } from './tools/blockchain/get-netspace.js';
import { register as registerGetPeakHeight } from './tools/blockchain/get-peak-height.js';
import { register as registerGetBlockByHeight } from './tools/blockchain/get-block-by-height.js';
import { register as registerGetBlockByHash } from './tools/blockchain/get-block-by-hash.js';
import { register as registerCountBlockTransactions } from './tools/blockchain/count-block-transactions.js';
import { register as registerGetBlockAdditionsAndRemovals } from './tools/blockchain/get-block-additions-and-removals.js';
import { register as registerCheckBlockCanonical } from './tools/blockchain/check-block-canonical.js';
import { register as registerScanChainConsistency } from './tools/blockchain/scan-chain-consistency.js';
import { register as registerReorgMonitor } from './tools/blockchain/reorg-monitor.js';

import { register as registerGetBalance } from './tools/coins/get-balance.js';
import { register as registerGetCoinRecordsByPuzzleHash } from './tools/coins/get-coin-records-by-puzzle-hash.js';
import { register as registerGetCoinRecordsByParentIds } from './tools/coins/get-coin-records-by-parent-ids.js';
import { register as registerGetCoinByName } from './tools/coins/get-coin-by-name.js';
import { register as registerCalculateCoinName } from './tools/coins/calculate-coin-name.js';
import { register as registerGetPuzzleAndSolution } from './tools/coins/get-puzzle-and-solution.js';

import { register as registerAddressToPuzzleHash } from './tools/addresses/address-to-puzzle-hash.js';
import { register as registerPuzzleHashToAddress } from './tools/addresses/puzzle-hash-to-address.js';

import { register as registerGetXchPrice } from './tools/price/get-xch-price.js';
import { register as registerConvertXchToFiat } from './tools/price/convert-xch-to-fiat.js';

import { register as registerGetPrefarmStatus } from './tools/prefarm/get-prefarm-status.js';
import { register as registerGetPrefarmSpends } from './tools/prefarm/get-prefarm-spends.js';
import { register as registerListPrefarmAddresses } from './tools/prefarm/list-prefarm-addresses.js';

import { register as registerDecodeOffer } from './tools/offers/decode-offer.js';
import { register as registerDecodeSpendBundle } from './tools/offers/decode-spend-bundle.js';
import { register as registerDecompilePuzzle } from './tools/offers/decompile-puzzle.js';

import { register as registerGetMempool } from './tools/mempool/get-mempool.js';
import { register as registerIsInMempool } from './tools/mempool/is-in-mempool.js';
import { register as registerEstimateFee } from './tools/mempool/estimate-fee.js';

import { register as registerListChips } from './tools/chips/list-chips.js';
import { register as registerGetChip } from './tools/chips/get-chip.js';
import { register as registerListChipDrafts } from './tools/chips/list-chip-drafts.js';
import { register as registerSearchChips } from './tools/chips/search-chips.js';

import { register as registerNetworkStatusPrompt } from './prompts/network-status.js';
import { register as registerAddressSummaryPrompt } from './prompts/address-summary.js';
import { register as registerBlockSummaryPrompt } from './prompts/block-summary.js';
import { register as registerPrefarmSummaryPrompt } from './prompts/prefarm-summary.js';

export function createServer(): McpServer {
  const server = new McpServer(
    { name: 'chia-explorer', version: VERSION },
    {
      instructions:
        'chia-explorer answers questions about the Chia blockchain via the public coinset.org API, ' +
        'plus XCH spot price and fiat conversion via the public CoinGecko API, ' +
        'plus Chia Improvement Proposals (CHIPs) read directly from the Chia-Network/chips GitHub repo (merged on main and open PR drafts). ' +
        'Read-only: no signing, no key material, no push_tx. ' +
        "Blockchain tools accept an optional `network: 'mainnet' | 'testnet11'` argument; mainnet is the default. " +
        'When an address is provided, the network is auto-detected from the prefix (xch / txch). ' +
        'Price and CHIPs tools take no network argument. ' +
        'An optional GITHUB_TOKEN env var lifts the unauthenticated GitHub rate limit on CHIPs listings.',
    }
  );

  registerGetBlockchainState(server);
  registerGetNetspace(server);
  registerGetPeakHeight(server);
  registerGetBlockByHeight(server);
  registerGetBlockByHash(server);
  registerCountBlockTransactions(server);
  registerGetBlockAdditionsAndRemovals(server);
  registerCheckBlockCanonical(server);
  registerScanChainConsistency(server);
  registerReorgMonitor(server);

  registerGetBalance(server);
  registerGetCoinRecordsByPuzzleHash(server);
  registerGetCoinRecordsByParentIds(server);
  registerGetCoinByName(server);
  registerCalculateCoinName(server);
  registerGetPuzzleAndSolution(server);

  registerAddressToPuzzleHash(server);
  registerPuzzleHashToAddress(server);

  registerGetXchPrice(server);
  registerConvertXchToFiat(server);

  registerGetPrefarmStatus(server);
  registerGetPrefarmSpends(server);
  registerListPrefarmAddresses(server);

  registerDecodeOffer(server);
  registerDecodeSpendBundle(server);
  registerDecompilePuzzle(server);

  registerGetMempool(server);
  registerIsInMempool(server);
  registerEstimateFee(server);

  registerListChips(server);
  registerGetChip(server);
  registerListChipDrafts(server);
  registerSearchChips(server);

  registerNetworkStatusPrompt(server);
  registerAddressSummaryPrompt(server);
  registerBlockSummaryPrompt(server);
  registerPrefarmSummaryPrompt(server);

  return server;
}
