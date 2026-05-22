import { get_blockchain_state, get_block_records } from 'chia-agent/api/rpc/full_node/index.js';
import { getAgent } from '../coinset/agent.js';
import { stripHexPrefix } from '../chia/hex.js';
import { Network } from '../network.js';
import { log } from '../util/logger.js';
import { safeMessage } from '../util/safe-message.js';
import { sendReorgAlert } from './email-alert.js';

export type ReorgEvent = {
  height: number;
  old_header_hash: string;
  new_header_hash: string;
  detected_at: string;
  /** Number of consecutive heights rewritten in the same poll (true re-org depth). */
  depth: number;
  /** Distance from the peak height observed when this re-org was detected. Informational. */
  blocks_from_peak: number;
  old_block_record: unknown;
};

export type AlertRecipient = {
  email: string;
  min_blocks: number; // only alert if depth >= min_blocks
};

export type MonitorStatus = {
  active: boolean;
  network: Network;
  started_at: string | null;
  poll_interval_seconds: number;
  lookback_blocks: number;
  alert_recipients: AlertRecipient[];
  poll_count: number;
  peak_height: number | null;
  last_poll_at: string | null;
  last_error: string | null;
  reorgs: ReorgEvent[];
  observations_count: number;
};

const MAX_OBSERVATIONS = 1_000;

const state = {
  active: false,
  network: 'mainnet' as Network,
  started_at: null as string | null,
  poll_interval_seconds: 5,
  lookback_blocks: 5,
  alert_recipients: [] as AlertRecipient[],
  poll_count: 0,
  peak_height: null as number | null,
  last_poll_at: null as string | null,
  last_error: null as string | null,
  reorgs: [] as ReorgEvent[],
  observations: new Map<number, { hash: string; record: unknown }>(), // height → { hash, full block record }
  alertedReorgs: new Set<string>(), // `${height}:${new_hash}` pairs already alerted on this session
  timer: null as NodeJS.Timeout | null,
  generation: 0, // incremented on start/stop; in-flight polls bail if it changes mid-execution
};

function redactEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

/**
 * Returns true if `err` is the chia-agent / coinset rejection shape produced
 * when the upstream node has published a new peak via get_blockchain_state but
 * has not yet written the corresponding BlockRecord row that get_block_records
 * needs. The next poll resolves it, so we want to treat this as benign rather
 * than a hard error.
 */
export function _isBlockDoesNotExistRace(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { structuredError?: { code?: unknown } };
  return e.structuredError?.code === 'BLOCK_DOES_NOT_EXIST';
}

export async function _pollOnce(): Promise<void> {
  const generation = state.generation;
  try {
    const agent = getAgent(state.network);
    const result = await get_blockchain_state(agent);
    if (generation !== state.generation) return;
    const { blockchain_state } = result;
    const peak = blockchain_state.peak?.height;
    if (peak === undefined) return;
    const prevPeak = state.peak_height; // captured before update; used for the
    // "depth is a lower bound" warning when skipped polls leave a gap in observations.
    state.peak_height = peak;
    state.poll_count++;
    state.last_poll_at = new Date().toISOString();
    state.last_error = null;

    let lowestFetched = Math.max(0, peak - state.lookback_blocks + 1);
    const initial = await get_block_records(agent, { start: lowestFetched, end: peak + 1 });
    if (generation !== state.generation) return;
    let allRecords = initial.block_records ?? [];

    // Walk-back: if the deepest fetched height shows a hash change, the re-org
    // may extend below the lookback window. Keep fetching earlier chunks until
    // we find a height that's still canonical, hit genesis, or run out of
    // prior observations to compare against. Without this, a re-org deeper
    // than lookback_blocks is silently under-reported.
    while (lowestFetched > 0) {
      const lowestRec = allRecords.find((r) => r.height === lowestFetched);
      if (lowestRec === undefined) break;
      const prev = state.observations.get(lowestFetched);
      if (prev === undefined) break;
      const currentHash = stripHexPrefix(lowestRec.header_hash).toLowerCase();
      if (prev.hash === currentHash) break;

      const newLowest = Math.max(0, lowestFetched - state.lookback_blocks);
      if (newLowest === lowestFetched) break;
      const more = await get_block_records(agent, { start: newLowest, end: lowestFetched });
      if (generation !== state.generation) return;
      const moreRecords = more.block_records ?? [];
      if (moreRecords.length === 0) break;
      allRecords = [...moreRecords, ...allRecords];
      lowestFetched = newLowest;
    }

    // First pass: collect all changed heights in this poll. We don't push the
    // ReorgEvents to state yet because each one's depth depends on how many of
    // its consecutive neighbors also changed.
    type RawReorg = Omit<ReorgEvent, 'depth'>;
    const rawReorgs: RawReorg[] = [];
    for (const block of allRecords) {
      const currentHash = stripHexPrefix(block.header_hash).toLowerCase();
      const prev = state.observations.get(block.height);
      if (prev !== undefined && prev.hash !== currentHash) {
        rawReorgs.push({
          height: block.height,
          old_header_hash: prev.hash,
          new_header_hash: currentHash,
          detected_at: new Date().toISOString(),
          blocks_from_peak: peak - block.height,
          old_block_record: prev.record,
        });
      }
      state.observations.set(block.height, { hash: currentHash, record: block });
    }

    // Group consecutive heights into clusters; each cluster is one logical
    // re-org event and its size is the true depth. A poll could legitimately
    // observe two disjoint re-orgs (rare), so we cluster by gaps.
    rawReorgs.sort((a, b) => a.height - b.height);
    const reorgsThisPoll: ReorgEvent[] = [];
    let clusterStart = 0;
    for (let i = 1; i <= rawReorgs.length; i++) {
      const breakHere =
        i === rawReorgs.length || rawReorgs[i]!.height !== rawReorgs[i - 1]!.height + 1;
      if (breakHere) {
        const depth = i - clusterStart;
        for (let j = clusterStart; j < i; j++) {
          const event: ReorgEvent = { ...rawReorgs[j]!, depth };
          state.reorgs.push(event);
          reorgsThisPoll.push(event);
          log('warn', 'Re-org detected', {
            network: state.network,
            height: event.height,
            depth: event.depth,
            blocks_from_peak: event.blocks_from_peak,
            old_header_hash: event.old_header_hash,
            new_header_hash: event.new_header_hash,
            peak_height: peak,
          });
        }
        clusterStart = i;
      }
    }

    // If we detected a re-org whose top reaches our previous peak AND the
    // chain advanced beyond it, the actual cascade may have extended into
    // heights we never observed (and have no baseline for). The reported
    // depth is then a lower bound, not authoritative. Flag it.
    if (
      reorgsThisPoll.length > 0 &&
      prevPeak !== null &&
      peak > prevPeak &&
      reorgsThisPoll.some((r) => r.height === prevPeak)
    ) {
      log('warn', 'Re-org depth may be a lower bound (chain advanced into unobserved territory)', {
        network: state.network,
        unobserved_range: `${prevPeak + 1}..${peak}`,
        unobserved_blocks: peak - prevPeak,
        observed_depths: reorgsThisPoll.map((r) => r.depth),
      });
    }

    // Debounce: only alert on (height, new_hash) pairs we haven't already seen this session.
    // The chain can thrash between two hashes at the same height; this keeps email volume bounded.
    const newReorgsForAlert = reorgsThisPoll.filter((r) => {
      const key = `${r.height}:${r.new_header_hash}`;
      if (state.alertedReorgs.has(key)) return false;
      state.alertedReorgs.add(key);
      return true;
    });

    // Send one batched email per recipient containing all eligible reorgs from this poll.
    // Filter on depth (true re-org cascade size), NOT blocks_from_peak.
    for (const recipient of state.alert_recipients) {
      const eligible = newReorgsForAlert.filter((r) => r.depth >= recipient.min_blocks);
      if (eligible.length > 0) {
        log('info', 'Dispatching re-org alert', {
          to: recipient.email,
          min_blocks: recipient.min_blocks,
          eligible_count: eligible.length,
          eligible_heights: eligible.map((r) => r.height),
        });
        sendReorgAlert(recipient.email, state.network, eligible, peak).catch((err: unknown) => {
          state.last_error = `Email alert failed: ${safeMessage(err)}`;
        });
      } else if (newReorgsForAlert.length > 0) {
        log('info', 'Skipping recipient (threshold not met)', {
          to: recipient.email,
          min_blocks: recipient.min_blocks,
          available_depths: newReorgsForAlert.map((r) => r.depth),
        });
      }
    }

    // Keep memory bounded: drop the oldest observations once the window grows too large.
    if (state.observations.size > MAX_OBSERVATIONS) {
      const sorted = [...state.observations.keys()].sort((a, b) => a - b);
      for (const h of sorted.slice(0, state.observations.size - MAX_OBSERVATIONS)) {
        state.observations.delete(h);
      }
    }
  } catch (err) {
    if (generation === state.generation) {
      if (_isBlockDoesNotExistRace(err)) {
        // Transient race: the node announced a new peak but the BlockRecord for
        // that height is not yet readable. The next poll will succeed. Don't
        // pollute last_error with this expected condition.
        log('info', 'Poll skipped (block not yet readable at tip)', {
          network: state.network,
        });
      } else {
        const msg = safeMessage(err);
        state.last_error = msg;
        log('error', 'Poll failed', { network: state.network, error: msg });
      }
    }
  }
}

function scheduleNext(): void {
  state.timer = setTimeout(() => {
    void _pollOnce().finally(() => {
      if (state.active) scheduleNext();
    });
  }, state.poll_interval_seconds * 1000);
  state.timer.unref();
}

export function startMonitor(opts: {
  poll_interval_seconds: number;
  lookback_blocks: number;
  network: Network;
  alert_recipients?: AlertRecipient[];
}): void {
  state.generation++;
  if (state.timer !== null) clearTimeout(state.timer);
  state.active = true;
  state.network = opts.network;
  state.poll_interval_seconds = opts.poll_interval_seconds;
  state.lookback_blocks = opts.lookback_blocks;
  state.alert_recipients = opts.alert_recipients ?? [];
  state.started_at = new Date().toISOString();
  state.poll_count = 0;
  state.peak_height = null;
  state.last_poll_at = null;
  state.last_error = null;
  state.reorgs = [];
  state.observations.clear();
  state.alertedReorgs.clear();
  log('info', 'Monitor started', {
    network: state.network,
    poll_interval_seconds: state.poll_interval_seconds,
    lookback_blocks: state.lookback_blocks,
    recipient_count: state.alert_recipients.length,
  });
  void _pollOnce().finally(() => {
    if (state.active) scheduleNext();
  });
}

export function stopMonitor(): void {
  const wasActive = state.active;
  state.generation++;
  if (state.timer !== null) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  state.active = false;
  if (wasActive) {
    log('info', 'Monitor stopped', {
      poll_count: state.poll_count,
      reorgs_detected: state.reorgs.length,
    });
  }
}

export function getStatus(): MonitorStatus {
  return {
    active: state.active,
    network: state.network,
    started_at: state.started_at,
    poll_interval_seconds: state.poll_interval_seconds,
    lookback_blocks: state.lookback_blocks,
    // Email addresses are redacted so callers of get_reorg_monitor_status cannot enumerate
    // the operator's recipient list (the start tool's response echoes them back unredacted).
    alert_recipients: state.alert_recipients.map((r) => ({
      email: redactEmail(r.email),
      min_blocks: r.min_blocks,
    })),
    poll_count: state.poll_count,
    peak_height: state.peak_height,
    last_poll_at: state.last_poll_at,
    last_error: state.last_error,
    reorgs: state.reorgs.map((r) => ({ ...r })),
    observations_count: state.observations.size,
  };
}
