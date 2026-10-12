import { useEffect, useRef, useState } from 'react';
import { Archive, Download, RefreshCw, RotateCcw, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  createOperationalBackup,
  downloadBackup,
  listOperationalBackups,
  restoreLatestOperationalBackup,
  restoreOperationalBackup,
  saveUploadedBackup,
  type BackupPayload,
  type BackupRole,
  type BackupSummary,
} from '@/lib/backupSnapshots';

export default function BackupControls({ role, locationIds }: { role: BackupRole; locationIds: string[] }) {
  const [saving, setSaving] = useState(false);
  const [lastBackup, setLastBackup] = useState<BackupPayload | null>(null);
  const [snapshots, setSnapshots] = useState<BackupSummary[]>([]);
  const [status, setStatus] = useState<'checking' | 'saved' | 'restored' | 'error'>('checking');
  const [statusMessage, setStatusMessage] = useState('Checking the Central backup store...');
  const fileRef = useRef<HTMLInputElement>(null);
  const canBackup = role === 'super_admin';

  const refreshSnapshots = async () => {
    try {
      const nextSnapshots = await listOperationalBackups();
      setSnapshots(nextSnapshots);
      if (nextSnapshots.length && status === 'checking') {
        setStatus('saved');
        setStatusMessage('Database backup is available.');
      }
      return nextSnapshots;
    } catch (error) {
      setStatus('error');
      setStatusMessage(error instanceof Error ? error.message : 'Backup store is unavailable.');
      return [];
    }
  };

  const saveBackup = async (downloadAfter = false) => {
    if (saving) return;
    setSaving(true);
    try {
      const result = await createOperationalBackup(role, locationIds);
      setLastBackup(result.payload);
      await refreshSnapshots();
      setStatus('saved');
      setStatusMessage(`Saved to Central database at ${new Date(result.payload.exportedAt).toLocaleString('en-PH')}.`);
      if (downloadAfter) downloadBackup(result.payload);
    } catch (error) {
      setStatus('error');
      setStatusMessage(error instanceof Error ? error.message : 'Backup could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    void refreshSnapshots();
    if (canBackup) void saveBackup();
    const interval = canBackup ? window.setInterval(() => void saveBackup(), 15 * 60 * 1000) : undefined;
    return () => window.clearInterval(interval);
    // The interval is intentionally created once per verified scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canBackup, role, locationIds.join(',')]);

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text()) as BackupPayload;
      await saveUploadedBackup(payload, role, locationIds);
      await restoreOperationalBackup(payload);
      setLastBackup(payload);
      await refreshSnapshots();
      setStatus('restored');
      setStatusMessage(`Restored Central database data from ${new Date(payload.exportedAt).toLocaleString('en-PH')}.`);
    } catch (error) {
      setStatus('error');
      setStatusMessage(error instanceof Error ? error.message : 'Backup restore failed.');
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const restoreLatest = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const payload = await restoreLatestOperationalBackup();
      setLastBackup(payload);
      await refreshSnapshots();
      setStatus('restored');
      setStatusMessage(`Restored Central database data from ${new Date(payload.exportedAt).toLocaleString('en-PH')}.`);
    } catch (error) {
      setStatus('error');
      setStatusMessage(error instanceof Error ? error.message : 'Backup restore failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed bottom-20 right-4 z-[1200] sm:bottom-4">
      <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => void onUpload(event.target.files?.[0])} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5" aria-label="Operational backups">
            <Archive className="h-3.5 w-3.5" />Backup
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>Operational backup</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!canBackup || saving} onSelect={() => void saveBackup()}>
            <RefreshCw className={`mr-2 h-4 w-4 ${saving ? 'animate-spin' : ''}`} />
            {saving ? 'Saving...' : 'Backup now'}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!lastBackup} onSelect={() => lastBackup && downloadBackup(lastBackup)}>
            <Download className="mr-2 h-4 w-4" />Download latest
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={(event) => { event.preventDefault(); fileRef.current?.click(); }}>
            <Upload className="mr-2 h-4 w-4" />Upload and restore
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!snapshots.length || saving} onSelect={() => void restoreLatest()}>
            <RotateCcw className="mr-2 h-4 w-4" />Restore latest
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <div className="px-2 py-1.5 text-xs text-muted-foreground" aria-live="polite">
            <div className={`mb-1 flex items-center gap-1.5 font-medium ${status === 'error' ? 'text-destructive' : 'text-foreground'}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${status === 'error' ? 'bg-destructive' : status === 'checking' ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
              {status === 'checking' ? 'Checking database...' : status === 'error' ? 'Backup needs attention' : status === 'restored' ? 'Restore completed' : 'Backup saved to database'}
            </div>
            <div>{statusMessage}</div>
            <div className="mt-1">
              {snapshots.length ? `${snapshots.length} compressed snapshot${snapshots.length === 1 ? '' : 's'} available` : 'No snapshot saved yet'}
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
