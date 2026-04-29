'use client';

import { useState } from 'react';
import { DLQEvent } from '@/lib/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Zap } from 'lucide-react';
import { CONSUMER_GROUPS } from '@/lib/constants';
import { SearchInput } from '@/components/common/search-input';
import { FilterChips } from '@/components/common/filter-chips';
import { DataTable, Column } from '@/components/common/data-table';
import { ErrorBanner } from '@/components/common/error-banner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

interface DLQTableProps {
  data: DLQEvent[] | null;
  isLoading: boolean;
  error: string | null;
  onReplay: (eventId: string, originalPayload: any) => Promise<void>;
  onRetry?: () => void;
}

export function DLQTable({
  data,
  isLoading,
  error,
  onReplay,
  onRetry,
}: DLQTableProps) {
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [replayingId, setReplayingId] = useState<string | null>(null);
  const [confirmingEventId, setConfirmingEventId] = useState<string | null>(null);
  const [confirmingPayload, setConfirmingPayload] = useState<any>(null);

  // Filter data
  const filteredData = data?.filter((event) => {
    const matchesGroup = selectedGroups.length === 0 || selectedGroups.includes(event.consumer_group);
    const matchesSearch =
      !searchTerm ||
      String(event.event_id).toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(event.user_id).toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(event.error).toLowerCase().includes(searchTerm.toLowerCase());
    return matchesGroup && matchesSearch;
  }) ?? [];

  const handleReplayClick = (eventId: string, payload: any) => {
    setConfirmingEventId(eventId);
    setConfirmingPayload(payload);
  };

  const handleConfirmReplay = async () => {
    if (!confirmingEventId || !confirmingPayload) return;

    setReplayingId(confirmingEventId);
    try {
      await onReplay(confirmingEventId, confirmingPayload);
      toast.success('Event replayed successfully');
    } catch (error) {
      toast.error(`Replay failed: ${String(error)}`);
    } finally {
      setReplayingId(null);
      setConfirmingEventId(null);
      setConfirmingPayload(null);
    }
  };

  const formatTime = (date: Date | string) => {
    if (typeof date === 'string') {
      date = new Date(date);
    }
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const columns: Column<DLQEvent>[] = [
    {
      key: 'failed_at',
      label: 'Failed At',
      render: (value) => (
        <span title={new Date(value).toLocaleString()}>
          {formatTime(value)}
        </span>
      ),
    },
    {
      key: 'consumer_group',
      label: 'Group',
      render: (value) => (
        <Badge variant="outline" className="text-xs">
          {value}
        </Badge>
      ),
    },
    {
      key: 'event_id',
      label: 'Event ID',
      className: 'font-mono text-xs',
      render: (value) => (
        <div className="flex items-center gap-2 truncate">
          <span className="truncate">{value}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 flex-shrink-0"
            onClick={() => copyToClipboard(String(value))}
            title="Copy event ID"
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      ),
    },
    {
      key: 'user_id',
      label: 'User',
      className: 'text-sm',
    },
    {
      key: 'amount',
      label: 'Amount',
      className: 'font-mono text-sm',
      render: (value, row) => (
        <span>
          {row.amount} {row.currency}
        </span>
      ),
    },
    {
      key: 'error',
      label: 'Error',
      className: 'text-sm truncate max-w-xs',
      render: (value) => (
        <span title={String(value)} className="truncate block">
          {value}
        </span>
      ),
    },
    {
      key: 'event_id',
      label: 'Action',
      render: (_, row) => (
        <Button
          size="sm"
          variant="outline"
          className="gap-2"
          onClick={() => handleReplayClick(String(row.event_id), row.original_payload)}
          disabled={replayingId === row.event_id}
        >
          {replayingId === row.event_id ? (
            <>
              <div className="h-3 w-3 border-2 border-primary border-r-transparent rounded-full animate-spin" />
              <span className="hidden sm:inline">Replaying</span>
            </>
          ) : (
            <>
              <Zap className="h-3 w-3" />
              <span className="hidden sm:inline">Replay</span>
            </>
          )}
        </Button>
      ),
    },
  ];

  return (
    <>
      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b border-border bg-card">
          <h2 className="text-lg font-semibold mb-4">Dead Letter Queue</h2>
          <p className="text-xs text-muted-foreground mb-4">Latest 200 events</p>

          {/* Filters */}
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-foreground mb-2">Filter by Consumer Group</p>
              <FilterChips
                options={CONSUMER_GROUPS}
                selected={selectedGroups}
                onSelect={(group) => setSelectedGroups([...selectedGroups, group])}
                onDeselect={(group) =>
                  setSelectedGroups(selectedGroups.filter((g) => g !== group))
                }
              />
            </div>

            <SearchInput
              value={searchTerm}
              onChange={setSearchTerm}
              placeholder="Search by event ID, user ID, or error..."
              className="flex-1"
            />
          </div>
        </div>

        <div className="px-4 py-4">
          <ErrorBanner error={error} onRetry={onRetry} />
          <div className="overflow-x-auto">
            <DataTable<DLQEvent>
              columns={columns}
              data={filteredData}
              isLoading={isLoading}
              emptyMessage={
                selectedGroups.length > 0 || searchTerm
                  ? 'No events match your filters'
                  : 'No DLQ events'
              }
              skeletonRows={8}
            />
          </div>
        </div>
      </Card>

      {/* Replay Confirmation Dialog */}
      <AlertDialog
        open={confirmingEventId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmingEventId(null);
            setConfirmingPayload(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Replay Event?</AlertDialogTitle>
          <AlertDialogDescription>
            Replay this event to{' '}
            <span className="font-mono font-semibold text-foreground">
              payments.initiated
            </span>
            ? This action cannot be undone.
          </AlertDialogDescription>
          <div className="flex gap-3 justify-end">
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmReplay}>
              Replay
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
