'use client';

import { AnalyticsData, ConsumerLag } from '@/lib/types';
import { LAG_WARNING_THRESHOLD, LAG_CRITICAL_THRESHOLD } from '@/lib/constants';
import { StatCard } from '@/components/common/stat-card';

interface SummaryCardsProps {
  analytics: AnalyticsData | null;
  consumerLag: ConsumerLag[] | null;
  isLoading: boolean;
}

export function SummaryCards({
  analytics,
  consumerLag,
  isLoading,
}: SummaryCardsProps) {
  // Calculate total lag across all groups
  const totalLag = consumerLag?.reduce((sum, group) => sum + group.total_lag, 0) ?? 0;

  // Find worst group (highest lag)
  const worstGroup = consumerLag
    ?.reduce((worst, current) =>
      current.total_lag > (worst?.total_lag ?? 0) ? current : worst
    ) ?? null;

  // Determine if values are in warning/critical state
  const lagIsWarning = totalLag > LAG_WARNING_THRESHOLD;
  const lagIsCritical = totalLag > LAG_CRITICAL_THRESHOLD;
  const dlqIsCritical = (analytics?.dlq_count ?? 0) > 0;



  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5 px-4 sm:px-6 py-4">
      <StatCard
        label="Total Lag"
        value={totalLag}
        critical={lagIsCritical}
        warning={lagIsWarning}
        isLoading={isLoading}
      />
      <StatCard
        label="Worst Group"
        value={
          worstGroup ? `${worstGroup.group} (${worstGroup.total_lag})` : 'N/A'
        }
        critical={(worstGroup?.total_lag ?? 0) > LAG_CRITICAL_THRESHOLD}
        warning={(worstGroup?.total_lag ?? 0) > LAG_WARNING_THRESHOLD}
        isLoading={isLoading}
      />
      <StatCard
        label="DLQ Count"
        value={analytics?.dlq_count ?? 0}
        critical={dlqIsCritical}
        isLoading={isLoading}
      />
      <StatCard
        label="Total Payments"
        value={(analytics?.total_payments ?? 0).toLocaleString()}
        isLoading={isLoading}
      />
      <StatCard
        label="Total Volume"
        value={(analytics?.total_volume ?? 0).toLocaleString()}
        isLoading={isLoading}
      />
    </div>
  );
}
