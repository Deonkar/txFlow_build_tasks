'use client';

import { AnalyticsData } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { StatCard } from '@/components/common/stat-card';
import { DataTable, Column } from '@/components/common/data-table';

interface AnalyticsPanelProps {
  data: AnalyticsData | null;
  isLoading: boolean;
}

interface CurrencyData {
  currency: string;
  count: number;
}

export function AnalyticsPanel({
  data,
  isLoading,
}: AnalyticsPanelProps) {
  // Sort currencies by count descending
  const currencyData: CurrencyData[] = data?.by_currency
    ? Object.entries(data.by_currency)
        .map(([currency, count]) => ({ currency, count }))
        .sort((a, b) => b.count - a.count)
    : [];

  const currencyColumns: Column<CurrencyData>[] = [
    {
      key: 'currency',
      label: 'Currency',
      className: 'font-semibold',
    },
    {
      key: 'count',
      label: 'Count',
      className: 'text-right font-mono',
    },
  ];

  return (
    <Card className="p-0 overflow-hidden">
      <div className="p-4 border-b border-border bg-card">
        <h2 className="text-lg font-semibold">Analytics</h2>
      </div>

      <div className="px-4 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <StatCard
            label="Total Payments"
            value={(data?.total_payments ?? 0).toLocaleString()}
            isLoading={isLoading}
          />
          <StatCard
            label="Total Volume"
            value={(data?.total_volume ?? 0).toLocaleString()}
            isLoading={isLoading}
          />
          <StatCard
            label="DLQ Count"
            value={data?.dlq_count ?? 0}
            critical={(data?.dlq_count ?? 0) > 0}
            isLoading={isLoading}
          />
        </div>

        <div>
          <h3 className="text-sm font-semibold mb-4 text-foreground">By Currency</h3>
          <div className="overflow-x-auto">
            <DataTable<CurrencyData>
              columns={currencyColumns}
              data={currencyData}
              isLoading={isLoading}
              emptyMessage="No currency data available"
              skeletonRows={4}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
