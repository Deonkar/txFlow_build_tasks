'use client';

import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ErrorBannerProps {
  error: string | null;
  onRetry?: () => void;
  isStale?: boolean;
  className?: string;
}

export function ErrorBanner({
  error,
  onRetry,
  isStale = false,
  className = '',
}: ErrorBannerProps) {
  if (!error) return null;

  return (
    <Alert variant="destructive" className={cn('mb-4', className)}>
      <AlertCircle className="h-4 w-4" />
      <AlertDescription className="flex items-center justify-between gap-4">
        <span>
          {error}
          {isStale && (
            <span className="ml-2 text-xs bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-100 px-2 py-1 rounded">
              Stale data
            </span>
          )}
        </span>
        {onRetry && (
          <Button
            size="sm"
            variant="outline"
            onClick={onRetry}
            className="whitespace-nowrap"
          >
            Retry
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
