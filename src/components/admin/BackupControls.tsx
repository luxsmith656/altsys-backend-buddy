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
  const fileRef = useRef<HTMLInputElement>(null);
  const canBackup = role === 'super_admin' || locationIds.length > 0;

  const refreshSnapshots = async () => {
    try {
      setSnapshots(await listOperationalBackups());
    } catch {
      // The UI remains useful before the backup migration has been applied.
    }
  };

  const saveBackup = async (downloadAfter = false) => {
    if (saving) return;
    setSaving(true);
    try {
      const result = await createOperationalBackup(role, locationIds);
      setLastBackup(result.payload);
      await refreshSnapshots();
      if (downloadAfter) downloadBackup(result.payload);
    } catch {
      // Automatic and manual backup failures stay out of the dashboard UI.
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    void refreshSnapshots();
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
    } catch {
      // Invalid or unavailable backups remain silent and do not interrupt operations.
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
    } catch {
      // Restore failures stay silent and never create a dashboard toast.
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
            {snapshots.length ? `${snapshots.length} compressed snapshot${snapshots.length === 1 ? '' : 's'}` : 'No snapshot saved yet'}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
