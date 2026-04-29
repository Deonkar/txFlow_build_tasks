import { NextResponse } from 'next/server';

const PAYMENTS_TOPIC = process.env.PAYMENTS_TOPIC ?? 'payments.initiated';
const REDPANDA_ADMIN_URL = process.env.REDPANDA_ADMIN_URL ?? 'http://localhost:9644';

type GroupLagRow = {
  group: string;
  state: 'Unknown';
  members: number;
  total_lag: number;
  partitions: number;
};

function parseLabels(raw: string): Record<string, string> {
  const labels: Record<string, string> = {};
  // raw: key="value",key2="value2"
  const parts = raw.split(',');
  for (const p of parts) {
    const idx = p.indexOf('=');
    if (idx === -1) continue;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim().replace(/^"|"$/g, '');
    labels[k] = v;
  }
  return labels;
}

function parsePublicMetrics(text: string) {
  const committed: Record<string, Record<string, number>> = {};
  const maxOffsets: Record<string, number> = {};
  const members: Record<string, number> = {};

  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;

    // committed offsets
    if (line.startsWith('redpanda_kafka_consumer_group_committed_offset{')) {
      const m = line.match(/^redpanda_kafka_consumer_group_committed_offset\{(.+)\}\s+([0-9.]+)/);
      if (!m) continue;
      const labels = parseLabels(m[1]);
      if (labels.redpanda_topic !== PAYMENTS_TOPIC) continue;
      const group = labels.redpanda_group;
      const partition = labels.redpanda_partition;
      if (!group || partition === undefined) continue;
      committed[group] ??= {};
      committed[group][partition] = Number(m[2]);
      continue;
    }

    // group members
    if (line.startsWith('redpanda_kafka_consumer_group_consumers{')) {
      const m = line.match(/^redpanda_kafka_consumer_group_consumers\{(.+)\}\s+([0-9.]+)/);
      if (!m) continue;
      const labels = parseLabels(m[1]);
      const group = labels.redpanda_group;
      if (!group) continue;
      members[group] = Number(m[2]);
      continue;
    }

    // max offsets (log end)
    if (line.startsWith('redpanda_kafka_max_offset{')) {
      const m = line.match(/^redpanda_kafka_max_offset\{(.+)\}\s+([0-9.]+)/);
      if (!m) continue;
      const labels = parseLabels(m[1]);
      if (labels.redpanda_topic !== PAYMENTS_TOPIC) continue;
      const partition = labels.redpanda_partition;
      if (partition === undefined) continue;
      maxOffsets[partition] = Number(m[2]);
      continue;
    }
  }

  return { committed, maxOffsets, members };
}

export async function GET() {
  try {
    const resp = await fetch(`${REDPANDA_ADMIN_URL}/public_metrics`, {
      method: 'GET',
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
    });
    if (!resp.ok) return NextResponse.json([], { status: 200 });

    const text = await resp.text();
    const { committed, maxOffsets, members } = parsePublicMetrics(text);

    const partitions = Object.keys(maxOffsets);

    const rows: GroupLagRow[] = [];
    for (const [group, byPartition] of Object.entries(committed)) {
      let totalLag = 0;
      for (const p of partitions) {
        const end = maxOffsets[p] ?? 0;
        const committedOffset = byPartition[p] ?? end; // if missing, treat as caught up
        totalLag += Math.max(0, end - committedOffset);
      }
      rows.push({
        group,
        state: 'Unknown',
        members: Math.trunc(members[group] ?? 0),
        total_lag: totalLag,
        partitions: partitions.length,
      });
    }

    // deterministic sort: highest lag first, then group name
    rows.sort((a, b) => (b.total_lag - a.total_lag) || a.group.localeCompare(b.group));

    return NextResponse.json(rows);
  } catch (error) {
    return NextResponse.json([], { status: 200 });
  }
}
