import { Dashboard } from '@/components/dashboard/dashboard';

export const metadata = {
  title: 'TxFlow Dashboard',
  description: 'Real-time monitoring dashboard for Kafka/Redpanda consumer lag, DLQ events, and analytics',
};

export default function Home() {
  return <Dashboard />;
}
