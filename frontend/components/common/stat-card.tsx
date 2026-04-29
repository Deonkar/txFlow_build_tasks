'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  isLoading?: boolean;
  warning?: boolean;
  critical?: boolean;
  icon?: React.ReactNode;
}

export function StatCard({
  label,
  value,
  subtext,
  isLoading = false,
  warning = false,
  critical = false,
  icon,
}: StatCardProps) {
  return (
    <Card
      className={cn(
        'flex flex-col justify-between transition-colors',
        critical && 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800',
        warning && !critical && 'bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800',
        !warning && !critical && 'hover:bg-muted/50'
      )}
    >
      <CardContent className="pt-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            {isLoading ? (
              <Skeleton className="h-8 w-24 mt-2" />
            ) : (
              <p className={cn(
                'text-3xl font-bold mt-2',
                critical && 'text-red-600 dark:text-red-400',
                warning && !critical && 'text-amber-600 dark:text-amber-400',
                !warning && !critical && 'text-foreground'
              )}>
                {value}
              </p>
            )}
            {subtext && (
              <p className="text-xs text-muted-foreground mt-1">{subtext}</p>
            )}
          </div>
          {icon && (
            <div className="text-muted-foreground">
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
