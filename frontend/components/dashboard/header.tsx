'use client';

import { HealthStatus } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { RotateCw, Check, X } from 'lucide-react';
import { ThemeToggle } from '@/components/common/theme-toggle';

interface HeaderProps {
  healthStatus: HealthStatus | null;
  lastRefresh: Date | null;
  isLoading: boolean;
  onRefresh: () => void;
}

export function Header({
  healthStatus,
  lastRefresh,
  isLoading,
  onRefresh,
}: HeaderProps) {
  const formatTime = (date: Date | null) => {
    if (!date) return 'Never';
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-4 sm:px-6 py-4">
        <h1 className="text-2xl font-bold text-foreground">TxFlow Dashboard</h1>

        <div className="flex flex-wrap items-center gap-2 sm:gap-6 w-full sm:w-auto">
          {/* Status Pills */}
          <div className="flex items-center gap-2 flex-wrap">
            <StatusPill
              label="Producer"
              status={healthStatus?.producer ?? false}
            />
            <StatusPill
              label="DLQ Handler"
              status={healthStatus?.dlqHandler ?? false}
            />
            <StatusPill
              label="Redpanda"
              status={healthStatus?.redpandaAdmin ?? false}
            />
          </div>

          {/* Last Refresh Timestamp */}
          <div className="text-sm text-muted-foreground hidden md:block whitespace-nowrap">
            Updated {formatTime(lastRefresh)}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 ml-auto">
            <Button
              onClick={onRefresh}
              disabled={isLoading}
              size="sm"
              variant="outline"
              className="gap-2"
              title="Refresh data"
            >
              <RotateCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </div>
  );
}

interface StatusPillProps {
  label: string;
  status: boolean;
}

function StatusPill({ label, status }: StatusPillProps) {
  return (
    <div className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5">
      {status ? (
        <Check className="h-4 w-4 text-green-600" />
      ) : (
        <X className="h-4 w-4 text-red-600" />
      )}
      <span className="text-xs font-medium text-secondary-foreground">
        {label}
      </span>
    </div>
  );
}
