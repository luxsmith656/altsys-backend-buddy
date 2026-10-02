import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  ShieldCheck,
  KeyRound,
  Edit,
  UserCheck,
  Building2,
  RefreshCw,
  Search,
  Mail,
  Phone,
  Calendar,
  Lock,
} from 'lucide-react';
import { useLocations } from '@/hooks/useLocations';
import {
  fetchAdminsList,
  resetAdminPassword,
  updateAdminInfo,
  type AdminAccount,
} from '@/lib/adminManagementService';

export default function CentralAdminManagement() {
  const { locations } = useLocations();
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Password reset dialog state
  const [resetTarget, setResetTarget] = useState<AdminAccount | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  // Edit admin dialog state
  const [editTarget, setEditTarget] = useState<AdminAccount | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editLocationId, setEditLocationId] = useState<string>('');
  const [savingEdit, setSavingEdit] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminsList();
      setAdmins(data);
    } catch (err: any) {
      toast.error('Failed to load admin accounts: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleOpenReset = (admin: AdminAccount) => {
    setResetTarget(admin);
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleExecuteReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;

    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setResetting(true);
    try {
      const res = await resetAdminPassword(resetTarget.userId, resetTarget.email, newPassword);
      toast.success(res.message);
      setResetTarget(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to reset password');
    } finally {
      setResetting(false);
    }
  };

  const handleOpenEdit = (admin: AdminAccount) => {
    setEditTarget(admin);
    setEditName(admin.fullName);
    setEditPhone(admin.phone);
    setEditLocationId(admin.locationId || 'unassigned');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;

    setSavingEdit(true);
    try {
      const selectedLoc = locations.find((l) => l.id === editLocationId);
      const res = await updateAdminInfo(editTarget.userId, {
        fullName: editName,
        phone: editPhone,
        locationId: editLocationId === 'unassigned' ? null : editLocationId,
        locationName: selectedLoc ? selectedLoc.name : 'Unassigned',
      });
      toast.success(res.message);
      setEditTarget(null);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save admin info');
    } finally {
      setSavingEdit(false);
    }
  };

  const filteredAdmins = admins.filter((a) => {
    const q = search.toLowerCase();
    return (
      a.fullName.toLowerCase().includes(q) ||
      a.email.toLowerCase().includes(q) ||
      (a.locationName && a.locationName.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Trailhead Administrators
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Cross-jurisdiction administration of station managers across Lamot 1, Lamot 2, Sto. Tomas, and all stations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search admins by name, email, or station..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-xs h-9 w-64"
            />
          </div>
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-1.5 text-xs">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredAdmins.map((admin) => (
          <Card key={admin.id} className="glass-card hover:border-primary/40 transition-all flex flex-col justify-between">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-primary/10 border border-primary/20 text-primary grid place-items-center font-bold text-sm">
                    {admin.fullName.charAt(0) || 'A'}
                  </div>
                  <div>
                    <CardTitle className="text-sm font-bold flex items-center gap-1.5">
                      {admin.fullName}
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px] mt-0.5 bg-primary/5 text-primary border-primary/20">
                      {admin.role.toUpperCase()}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-2.5 text-xs pb-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Mail className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="font-mono truncate">{admin.email}</span>
              </div>

              <div className="flex items-center gap-2 text-muted-foreground">
                <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="font-semibold text-foreground">{admin.locationName}</span>
              </div>

              {admin.phone && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span>{admin.phone}</span>
                </div>
              )}

              <div className="flex items-center gap-2 text-[11px] text-muted-foreground/80 pt-1 border-t border-border/20">
                <Calendar className="h-3 w-3" />
                <span>Added: {format(new Date(admin.createdAt), 'MMM d, yyyy')}</span>
              </div>
            </CardContent>

            <div className="p-3 pt-0 border-t border-border/20 mt-2 flex items-center justify-end gap-2 bg-secondary/10 rounded-b-xl">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs gap-1.5 hover:text-primary"
                onClick={() => handleOpenEdit(admin)}
              >
                <Edit className="h-3.5 w-3.5" /> Edit Info
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs gap-1.5 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                onClick={() => handleOpenReset(admin)}
              >
                <KeyRound className="h-3.5 w-3.5" /> Reset Pass
              </Button>
            </div>
          </Card>
        ))}

        {filteredAdmins.length === 0 && !loading && (
          <div className="col-span-full py-12 text-center text-muted-foreground">
            No administrator accounts match your query.
          </div>
        )}
      </div>

      {/* ── Reset Password Dialog ── */}
      <Dialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleExecuteReset}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Lock className="h-4 w-4 text-amber-500" />
                Reset Password for {resetTarget?.fullName}
              </DialogTitle>
              <DialogDescription>
                Assign a secure new password for <strong>{resetTarget?.email}</strong>.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4 text-xs">
              <div className="space-y-1.5">
                <Label htmlFor="newAdminPass" className="text-xs font-semibold">
                  New Password (min 6 characters)
                </Label>
                <Input
                  id="newAdminPass"
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmAdminPass" className="text-xs font-semibold">
                  Confirm New Password
                </Label>
                <Input
                  id="confirmAdminPass"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="ghost" onClick={() => setResetTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={resetting} className="bg-amber-600 hover:bg-amber-700 text-white">
                {resetting ? 'Resetting...' : 'Confirm Reset Password'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit Admin Info Dialog ── */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSaveEdit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <UserCheck className="h-4 w-4 text-primary" />
                Edit Administrator Details
              </DialogTitle>
              <DialogDescription>
                Update official name, contact number, and assigned jump-off station for {editTarget?.email}.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4 text-xs">
              <div className="space-y-1.5">
                <Label htmlFor="editAdminName" className="text-xs font-semibold">
                  Full Name
                </Label>
                <Input
                  id="editAdminName"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="editAdminPhone" className="text-xs font-semibold">
                  Contact Phone Number
                </Label>
                <Input
                  id="editAdminPhone"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="+63 9XX XXX XXXX"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="editAdminStation" className="text-xs font-semibold">
                  Assigned Trailhead Station
                </Label>
                <Select value={editLocationId} onValueChange={setEditLocationId}>
                  <SelectTrigger id="editAdminStation">
                    <SelectValue placeholder="Select Trailhead" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned / General</SelectItem>
                    {locations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="ghost" onClick={() => setEditTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingEdit}>
                {savingEdit ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
