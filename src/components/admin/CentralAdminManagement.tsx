import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  Plus,
} from 'lucide-react';
import { useLocations } from '@/hooks/useLocations';
import {
  fetchAdminsList,
  resetAdminPassword,
  updateAdminInfo,
  createAdminAccount,
  type AdminAccount,
} from '@/lib/adminManagementService';

export default function CentralAdminManagement() {
  const { locations } = useLocations();
  const [admins, setAdmins] = useState<AdminAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Add admin dialog state
  const [addAdminOpen, setAddAdminOpen] = useState(false);
  const [addFullName, setAddFullName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addLocationId, setAddLocationId] = useState<string>('unassigned');
  const [addPassword, setAddPassword] = useState('');
  const [creatingAdmin, setCreatingAdmin] = useState(false);

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
  const [editStatus, setEditStatus] = useState<'active' | 'deactivated'>('active');
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
    setEditStatus(admin.status === 'deactivated' ? 'deactivated' : 'active');
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
        status: editStatus,
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

  const handleExecuteAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addFullName.trim()) {
      toast.error('Admin name is required');
      return;
    }
    if (!addEmail.trim() || !addEmail.includes('@')) {
      toast.error('Valid email address is required');
      return;
    }
    if (addPassword && addPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setCreatingAdmin(true);
    try {
      const selectedLoc = locations.find((l) => l.id === addLocationId);
      const res = await createAdminAccount({
        fullName: addFullName.trim(),
        email: addEmail.trim(),
        phone: addPhone.trim(),
        locationId: addLocationId === 'unassigned' ? null : addLocationId,
        locationName: selectedLoc ? selectedLoc.name : 'Unassigned',
        password: addPassword || undefined,
      });
      toast.success(res.message);
      setAddAdminOpen(false);
      setAddFullName('');
      setAddEmail('');
      setAddPhone('');
      setAddLocationId('unassigned');
      setAddPassword('');
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create admin');
    } finally {
      setCreatingAdmin(false);
    }
  };

  const jumpOffStations = useMemo(() => {
    return locations.filter(
      (loc) => !loc.name.toLowerCase().includes('mount kalisungan') && loc.slug !== 'mt-kalisungan'
    );
  }, [locations]);

  const filteredAdmins = admins.filter((a) => {
    const loc = (a.locationName || '').toLowerCase();
    const name = (a.fullName || '').toLowerCase();
    const email = (a.email || '').toLowerCase();
    if (
      loc.includes('mount kalisungan') ||
      name.includes('mount kalisungan') ||
      email.includes('mtkalisungan') ||
      email === 'kalisungan@kalisungan.ph' ||
      a.locationId === '3082d38d-6f8e-491e-8a4d-6497b88f973a'
    ) {
      return false;
    }

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
          <Button size="sm" onClick={() => setAddAdminOpen(true)} className="gap-1.5 text-xs glow-primary">
            <Plus className="h-3.5 w-3.5" /> Add Admin
          </Button>
        </div>
      </div>

      {/* Roster Table List */}
      <Card className="glass-card overflow-hidden border-border/30">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-secondary/30 text-muted-foreground border-b border-border/20 font-semibold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-3">Administrator</th>
                  <th className="px-4 py-3">Jurisdiction</th>
                  <th className="px-4 py-3">Phone</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/10">
                {filteredAdmins.map((admin) => (
                  <tr key={admin.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-foreground">{admin.fullName}</div>
                      <div className="text-[10px] text-muted-foreground font-mono">{admin.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 font-medium">
                        <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span>{admin.locationName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {admin.phone || '—'}
                    </td>
                    <td className="px-4 py-3">
                      {admin.status === 'deactivated' ? (
                        <Badge variant="destructive" className="text-[10px]">
                          Deactivated
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                          Active
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">
                      {admin.createdAt ? format(new Date(admin.createdAt), 'MMM d, yyyy') : '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1 hover:text-primary"
                          onClick={() => handleOpenEdit(admin)}
                        >
                          <Edit className="h-3.5 w-3.5" /> Edit Info
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                          onClick={() => handleOpenReset(admin)}
                        >
                          <KeyRound className="h-3.5 w-3.5" /> Reset Pass
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredAdmins.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      No administrator accounts match your query.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

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
                    {jumpOffStations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="editAdminStatus" className="text-xs font-semibold">
                  Account Access Status
                </Label>
                <Select value={editStatus} onValueChange={(v) => setEditStatus(v as 'active' | 'deactivated')}>
                  <SelectTrigger id="editAdminStatus">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active (Permitted to sign in & manage)</SelectItem>
                    <SelectItem value="deactivated">Deactivated (Blocked from accessing system)</SelectItem>
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

      {/* ── Add Administrator Dialog ── */}
      <Dialog open={addAdminOpen} onOpenChange={setAddAdminOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleExecuteAddAdmin}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Plus className="h-4 w-4 text-primary" />
                Add New Administrator
              </DialogTitle>
              <DialogDescription>
                Create a trailhead station administrator or central system admin account.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4 text-xs">
              <div className="space-y-1.5">
                <Label htmlFor="addAdminName" className="text-xs font-semibold">
                  Full Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="addAdminName"
                  placeholder="e.g. Maria Santos"
                  value={addFullName}
                  onChange={(e) => setAddFullName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="addAdminEmail" className="text-xs font-semibold">
                  Official Email Address <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="addAdminEmail"
                  type="email"
                  placeholder="e.g. msantos@kalisungan.ph"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="addAdminPhone" className="text-xs font-semibold">
                  Contact Phone Number
                </Label>
                <Input
                  id="addAdminPhone"
                  placeholder="+63 9XX XXX XXXX"
                  value={addPhone}
                  onChange={(e) => setAddPhone(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="addAdminStation" className="text-xs font-semibold">
                  Assigned Trailhead Station
                </Label>
                <Select value={addLocationId} onValueChange={setAddLocationId}>
                  <SelectTrigger id="addAdminStation">
                    <SelectValue placeholder="Select Trailhead" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned / General</SelectItem>
                    {jumpOffStations.map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="addAdminPassword" className="text-xs font-semibold">
                  Temporary Initial Password
                </Label>
                <Input
                  id="addAdminPassword"
                  type="password"
                  placeholder="Defaults to kalisungan2026 (min 6 chars)"
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                />
                <span className="text-[11px] text-muted-foreground">
                  The new administrator can reset their password upon initial login.
                </span>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="ghost" onClick={() => setAddAdminOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creatingAdmin} className="glow-primary">
                {creatingAdmin ? 'Creating...' : 'Create Administrator'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
