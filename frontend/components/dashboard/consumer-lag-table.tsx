'use client';

import { ConsumerLag } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DataTable, Column } from '@/components/common/data-table';
import { ErrorBanner } from '@/components/common/error-banner';
import { LAG_WARNING_THRESHOLD, LAG_CRITICAL_THRESHOLD } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface ConsumerLagTableProps {
  data: ConsumerLag[] | null;
  isLoading: boolean;
  error: string | null;
  onRetry?: () => void;
}

export function ConsumerLagTable({
  data,
  isLoading,
  error,
  onRetry,
}: ConsumerLagTableProps) {
  // Sort by total lag descending
  const sortedData = data ? [...data].sort((a, b) => b.total_lag - a.total_lag) : [];

  const columns: Column<ConsumerLag>[] = [
    {
      key: 'group',
      label: 'Group',
    },
    {
      key: 'state',
      label: 'State',
      render: (value) => (
        <Badge variant="outline" className="capitalize">
          {value || 'Unknown'}
        </Badge>
      ),
    },
    {
      key: 'members',
      label: 'Members',
      className: 'text-center',
    },
    {
      key: 'total_lag',
      label: 'Total Lag',
      className: 'text-right font-mono',
      render: (value, row) => (
        <>
          {value}
          {value > LAG_CRITICAL_THRESHOLD && (
            <Badge className="ml-2 bg-red-600 hover:bg-red-700">High Lag</Badge>
          )}
        </>
      ),
    },
    {
      key: 'partitions',
      label: 'Partitions',
      className: 'text-center text-muted-foreground text-sm',
    },
  ];

  const getRowClassName = (row: ConsumerLag) => {
    if (row.total_lag > LAG_CRITICAL_THRESHOLD) {
      return 'bg-red-50/50 dark:bg-red-950/30';
    }
    if (row.total_lag > LAG_WARNING_THRESHOLD) {
      return 'bg-amber-50/50 dark:bg-amber-950/30';
    }
    return '';
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="p-4 border-b border-border bg-card">
        <h2 className="text-lg font-semibold">Consumer Lag</h2>
      </div>

      <div className="px-4 py-4">
        <ErrorBanner error={error} onRetry={onRetry} />
        <div className="overflow-x-auto">
          <DataTable<ConsumerLag>
            columns={columns}
            data={sortedData}
            isLoading={isLoading}
            rowClassName={getRowClassName}
            skeletonRows={5}
            emptyMessage="No consumer groups available"
          />
        </div>
      </div>
    </Card>
  );
}
