import { useEffect, useRef, useState } from 'react';
import { Archive, Download, HardDrive, RefreshCw, RotateCcw, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  createOperationalBackup,
  downloadBackup,
  listOperationalBackups,
  downloadStoredBackup,
  restoreOperationalBackupById,
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

  const downloadSnapshot = async (snapshot: BackupSummary) => {
    try {
      await downloadStoredBackup(snapshot.id);
    } catch (error) {
      setStatus('error');
      setStatusMessage(error instanceof Error ? error.message : 'Backup download failed.');
    }
  };

  const restoreSnapshot = async (snapshot: BackupSummary) => {
    if (saving) return;
    setSaving(true);
    try {
      const payload = await restoreOperationalBackupById(snapshot.id);
      setLastBackup(payload);
      setStatus('restored');
      setStatusMessage(`Restored the ${new Date(payload.exportedAt).toLocaleString('en-PH')} version.`);
    } catch (error) {
      setStatus('error');
      setStatusMessage(error instanceof Error ? error.message : 'Backup restore failed.');
    } finally {
      setSaving(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={!snapshots.length}>
              <HardDrive className="mr-2 h-4 w-4" />Backup history ({snapshots.length})
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-80 w-72 overflow-y-auto">
              {snapshots.map((snapshot) => (
                <DropdownMenuSub key={snapshot.id}>
                  <DropdownMenuSubTrigger className="pr-2">
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium">
                        {new Date(snapshot.exported_at).toLocaleString('en-PH')}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        {formatSize(snapshot.payload_bytes)} · {snapshot.payload_encoding === 'gzip+base64' ? 'compressed' : 'JSON'}
                      </span>
                    </span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onSelect={() => void downloadSnapshot(snapshot)}>
                      <Download className="mr-2 h-4 w-4" />Download this version
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={saving} onSelect={() => void restoreSnapshot(snapshot)}>
                      <RotateCcw className="mr-2 h-4 w-4" />Restore this version
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
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
