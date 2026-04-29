'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  fetchHealth,
  fetchAnalytics,
  fetchConsumerLag,
  fetchDLQEvents,
  replayDLQEvent,
} from '@/lib/api';
import { POLL_INTERVAL_MS } from '@/lib/constants';
import { HealthStatus, AnalyticsData, ConsumerLag, DLQEvent } from '@/lib/types';
import { Header } from './header';
import { SummaryCards } from './summary-cards';
import { ConsumerLagTable } from './consumer-lag-table';
import { DLQTable } from './dlq-table';
import { AnalyticsPanel } from './analytics-panel';
import { toast } from 'sonner';

export function Dashboard() {
  // Health status state
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);

  // Analytics state
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

  // Consumer lag state
  const [consumerLag, setConsumerLag] = useState<ConsumerLag[] | null>(null);
  const [consumerLagError, setConsumerLagError] = useState<string | null>(null);
  const [consumerLagLoading, setConsumerLagLoading] = useState(true);

  // DLQ state
  const [dlqEvents, setDlqEvents] = useState<DLQEvent[] | null>(null);
  const [dlqError, setDlqError] = useState<string | null>(null);
  const [dlqLoading, setDlqLoading] = useState(true);

  // Overall loading state
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch all data
  const fetchAllData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setAnalyticsLoading(true);
      setConsumerLagLoading(true);
      setDlqLoading(true);
    }

    try {
      // Fetch all data in parallel
      const [health, analytics, lag, dlq] = await Promise.all([
        fetchHealth(),
        fetchAnalytics(),
        fetchConsumerLag(),
        fetchDLQEvents(),
      ]);

      // Update health status
      setHealthStatus(health.data);

      // Update analytics
      if (analytics.error) {
        setAnalyticsError(analytics.error);
      } else {
        setAnalyticsData(analytics.data);
        setAnalyticsError(null);
      }

      // Update consumer lag
      if (lag.error) {
        setConsumerLagError(lag.error);
      } else {
        setConsumerLag(lag.data);
        setConsumerLagError(null);
      }

      // Update DLQ events
      if (dlq.error) {
        setDlqError(dlq.error);
      } else {
        setDlqEvents(dlq.data);
        setDlqError(null);
      }

      setLastRefresh(new Date());
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setAnalyticsLoading(false);
      setConsumerLagLoading(false);
      setDlqLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Set up polling interval
  useEffect(() => {
    const interval = setInterval(() => {
      fetchAllData();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [fetchAllData]);

  // Handle replay
  const handleReplay = useCallback(
    async (eventId: string, originalPayload: any) => {
      try {
        const response = await replayDLQEvent(eventId, originalPayload);
        if (response.error) {
          throw new Error(response.error);
        }
        // Refresh DLQ and analytics after replay
        const [dlq, analytics] = await Promise.all([
          fetchDLQEvents(),
          fetchAnalytics(),
        ]);
        
        if (!dlq.error) setDlqEvents(dlq.data);
        if (!analytics.error) setAnalyticsData(analytics.data);
      } catch (error) {
        throw error;
      }
    },
    []
  );

  // Handle manual refresh
  const handleRefresh = useCallback(() => {
    fetchAllData(true);
  }, [fetchAllData]);

  return (
    <div className="min-h-screen bg-background">
      <Header
        healthStatus={healthStatus}
        lastRefresh={lastRefresh}
        isLoading={isRefreshing}
        onRefresh={() => fetchAllData(true)}
      />
      <div className="flex flex-col gap-6 p-4 sm:p-6 max-w-7xl mx-auto">
        <SummaryCards
          analytics={analyticsData}
          consumerLag={consumerLag}
          isLoading={analyticsLoading || consumerLagLoading}
        />
        <ConsumerLagTable
          data={consumerLag}
          isLoading={consumerLagLoading}
          error={consumerLagError}
          onRetry={() => fetchAllData(true)}
        />
        <DLQTable
          data={dlqEvents}
          isLoading={dlqLoading}
          error={dlqError}
          onReplay={handleReplay}
          onRetry={() => fetchAllData(true)}
        />
        <AnalyticsPanel
          data={analyticsData}
          isLoading={analyticsLoading}
        />
      </div>
    </div>
  );
}
