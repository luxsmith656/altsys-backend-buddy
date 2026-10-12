import { useEffect, useRef, useState } from 'react';
import { Archive, Download, RefreshCw, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  createOperationalBackup,
  downloadBackup,
  listOperationalBackups,
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

  const saveBackup = async (downloadAfter = false, quiet = false) => {
    if (saving) return;
    setSaving(true);
    try {
      const result = await createOperationalBackup(role, locationIds);
      setLastBackup(result.payload);
      await refreshSnapshots();
      if (downloadAfter) downloadBackup(result.payload);
      if (!quiet) toast.success('Operational backup saved.', { description: 'Repeated uploads are deduplicated by content fingerprint.' });
    } catch (error) {
      if (!quiet) toast.error('Backup could not be saved.', { description: error instanceof Error ? error.message : 'Apply the backup migration and try again.' });
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    void refreshSnapshots();
    const interval = canBackup ? window.setInterval(() => void saveBackup(false, true), 15 * 60 * 1000) : undefined;
    return () => window.clearInterval(interval);
    // The interval is intentionally created once per verified scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canBackup, role, locationIds.join(',')]);

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text()) as BackupPayload;
      await saveUploadedBackup(payload, role, locationIds);
      await refreshSnapshots();
      toast.success('Backup uploaded and deduplicated.', { description: 'It is now available as a recovery snapshot for this account.' });
    } catch (error) {
      toast.error('Backup upload failed.', { description: error instanceof Error ? error.message : 'Choose a valid backup JSON file.' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <Card className="border-border/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Archive className="h-4 w-4 text-primary" />Operational backups</CardTitle>
        <CardDescription>Auto-saves every 15 minutes. Local admins receive only their assigned trailhead data; multi-trailhead accounts receive a combined operational snapshot.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={() => void saveBackup()} disabled={saving || !canBackup} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${saving ? 'animate-spin' : ''}`} />{saving ? 'Saving…' : 'Backup now'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => lastBackup && downloadBackup(lastBackup)} disabled={!lastBackup} className="gap-1.5">
          <Download className="h-3.5 w-3.5" />Download latest
        </Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(event) => void onUpload(event.target.files?.[0])} />
        <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()} className="gap-1.5">
          <Upload className="h-3.5 w-3.5" />Upload backup
        </Button>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {snapshots.length ? `${snapshots.length} recovery snapshot${snapshots.length === 1 ? '' : 's'} saved` : 'No snapshot saved yet'}
        </span>
      </CardContent>
    </Card>
  );
}
