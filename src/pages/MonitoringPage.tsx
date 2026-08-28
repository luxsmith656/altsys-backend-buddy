import SystemHealthMonitor from '@/components/admin/SystemHealthMonitor';

export default function MonitoringPage() {
  return (
    <main className="min-h-screen px-4 pb-12 pt-24">
      <div className="container mx-auto max-w-6xl">
        <SystemHealthMonitor />
      </div>
    </main>
  );
}
