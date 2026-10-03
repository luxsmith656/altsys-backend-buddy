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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  Users,
  Search,
  RefreshCw,
  Edit,
  KeyRound,
  Trash2,
  Phone,
  Mail,
  Shield,
  HeartPulse,
  Compass,
  Lock,
  UserX,
} from 'lucide-react';
import {
  fetchUsersList,
  changeUserPassword,
  editUserInfo,
  deleteUserAccount,
  type UserAccount,
} from '@/lib/adminManagementService';

interface AdminUserManagementProps {
  locationId?: string | null;
  locationName?: string;
}

export default function AdminUserManagement({
  locationId,
  locationName = 'Current Trailhead',
}: AdminUserManagementProps) {
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'guide' | 'hiker'>('all');

  // Change password modal
  const [passwordTarget, setPasswordTarget] = useState<UserAccount | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submittingPassword, setSubmittingPassword] = useState(false);

  // Edit info modal
  const [editTarget, setEditTarget] = useState<UserAccount | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmergency, setEditEmergency] = useState('');
  const [editSpecialty, setEditSpecialty] = useState('');
  const [editStatus, setEditStatus] = useState('available');
  const [editAccountStatus, setEditAccountStatus] = useState<'active' | 'deactivated'>('active');
  const [submittingEdit, setSubmittingEdit] = useState(false);

  // Delete modal
  const [deleteTarget, setDeleteTarget] = useState<UserAccount | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchUsersList(locationId);
      setUsers(data);
    } catch (err: any) {
      toast.error('Failed to load users: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Handlers
  const handleOpenPassword = (u: UserAccount) => {
    setPasswordTarget(u);
    setNewPassword('');
    setConfirmPassword('');
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordTarget) return;

    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setSubmittingPassword(true);
    try {
      const res = await changeUserPassword(passwordTarget.userId, passwordTarget.email, newPassword);
      toast.success(res.message);
      setPasswordTarget(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update password');
    } finally {
      setSubmittingPassword(false);
    }
  };

  const handleOpenEdit = (u: UserAccount) => {
    setEditTarget(u);
    setEditFullName(u.fullName);
    setEditPhone(u.phone);
    setEditEmergency(u.emergencyContact || '');
    setEditSpecialty(u.specialty || '');
    setEditStatus(u.status || 'available');
    setEditAccountStatus(u.accountStatus === 'deactivated' || u.status === 'deactivated' ? 'deactivated' : 'active');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;

    setSubmittingEdit(true);
    try {
      const res = await editUserInfo(editTarget.userId, {
        fullName: editFullName,
        phone: editPhone,
        emergencyContact: editEmergency,
        specialty: editSpecialty,
        status: editAccountStatus === 'deactivated' ? 'deactivated' : editStatus,
        accountStatus: editAccountStatus,
        locationId: editTarget.locationId,
      });
      toast.success(res.message);
      setEditTarget(null);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update user');
    } finally {
      setSubmittingEdit(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      const res = await deleteUserAccount(deleteTarget.userId, deleteTarget.role);
      toast.success(res.message);
      setDeleteTarget(null);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete user account');
    } finally {
      setDeleting(false);
    }
  };

  const filtered = users.filter((u) => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    const q = search.toLowerCase();
    return (
      u.fullName.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.phone.toLowerCase().includes(q) ||
      (u.specialty && u.specialty.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            User Management: Guides & Hikers
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Oversee, edit information, change passwords, and manage registered guides and hikers for {locationName}.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-xl bg-secondary/40 p-1 border border-border/30 text-xs">
            <button
              type="button"
              onClick={() => setRoleFilter('all')}
              className={`px-3 py-1 rounded-lg font-medium transition-all ${
                roleFilter === 'all' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              All ({users.length})
            </button>
            <button
              type="button"
              onClick={() => setRoleFilter('guide')}
              className={`px-3 py-1 rounded-lg font-medium transition-all ${
                roleFilter === 'guide' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Guides ({users.filter((u) => u.role === 'guide').length})
            </button>
            <button
              type="button"
              onClick={() => setRoleFilter('hiker')}
              className={`px-3 py-1 rounded-lg font-medium transition-all ${
                roleFilter === 'hiker' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Hikers ({users.filter((u) => u.role === 'hiker').length})
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-xs h-9 w-56"
            />
          </div>

          <Button variant="outline" size="sm" onClick={loadData} disabled={loading} className="gap-1.5 text-xs">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {/* User Roster Table List */}
      <Card className="glass-card overflow-hidden border-border/30">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-secondary/30 text-muted-foreground border-b border-border/20 font-semibold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-3">User &amp; Contact</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Specialty / Emergency</th>
                  <th className="px-4 py-3">Registered</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/10">
                {filtered.map((user) => {
                  const isGuide = user.role === 'guide';
                  return (
                    <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-foreground">{user.fullName}</div>
                        <div className="text-[10px] text-muted-foreground font-mono">{user.email}</div>
                        {user.phone && <div className="text-[10px] text-muted-foreground">{user.phone}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={`text-[10px] py-0 font-bold ${
                            isGuide
                              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30'
                              : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                          }`}
                        >
                          {isGuide ? 'MOUNTAIN GUIDE' : 'HIKER'}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {user.accountStatus === 'deactivated' || user.status === 'deactivated' ? (
                          <Badge variant="destructive" className="text-[10px] py-0">
                            Deactivated
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] py-0 bg-emerald-500/10 text-emerald-600 border-emerald-500/30">
                            Active
                          </Badge>
                        )}
                        {isGuide && user.status && user.status !== 'deactivated' && (
                          <span
                            className={`ml-1.5 text-[10px] px-1.5 py-0.2 rounded-full font-semibold ${
                              user.status === 'available'
                                ? 'bg-emerald-500/15 text-emerald-600'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {user.status}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {isGuide ? (
                          user.specialty ? (
                            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                              <Compass className="h-3 w-3 shrink-0" /> {user.specialty}
                            </span>
                          ) : (
                            '—'
                          )
                        ) : user.emergencyContact ? (
                          <span className="flex items-center gap-1 text-rose-500">
                            <HeartPulse className="h-3 w-3 shrink-0" /> {user.emergencyContact}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">
                        {user.createdAt ? format(new Date(user.createdAt), 'MMM d, yyyy') : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1 hover:text-primary px-2"
                            onClick={() => handleOpenEdit(user)}
                          >
                            <Edit className="h-3 w-3" /> Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 px-2"
                            onClick={() => handleOpenPassword(user)}
                          >
                            <KeyRound className="h-3 w-3" /> Pass
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1 text-destructive hover:bg-destructive/10 px-2"
                            onClick={() => setDeleteTarget(user)}
                          >
                            <Trash2 className="h-3 w-3" /> Remove
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      No users found matching your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ── Change Password Modal ── */}
      <Dialog open={!!passwordTarget} onOpenChange={(open) => !open && setPasswordTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSavePassword}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Lock className="h-4 w-4 text-amber-500" />
                Change Password: {passwordTarget?.fullName}
              </DialogTitle>
              <DialogDescription>
                Set a new password for account <strong>{passwordTarget?.email}</strong>.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4 text-xs">
              <div className="space-y-1.5">
                <Label htmlFor="newUserPass" className="text-xs font-semibold">
                  New Password (min 6 characters)
                </Label>
                <Input
                  id="newUserPass"
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmUserPass" className="text-xs font-semibold">
                  Confirm Password
                </Label>
                <Input
                  id="confirmUserPass"
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
              <Button type="button" variant="ghost" onClick={() => setPasswordTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submittingPassword} className="bg-amber-600 hover:bg-amber-700 text-white">
                {submittingPassword ? 'Updating...' : 'Update Password'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit User Info Modal ── */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSaveEdit}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Edit className="h-4 w-4 text-primary" />
                Edit {editTarget?.role === 'guide' ? 'Guide' : 'Hiker'} Information
              </DialogTitle>
              <DialogDescription>Update details for {editTarget?.email}.</DialogDescription>
            </DialogHeader>

            <div className="space-y-3.5 py-4 text-xs">
              <div className="space-y-1.5">
                <Label htmlFor="editFullName" className="text-xs font-semibold">
                  Full Name
                </Label>
                <Input
                  id="editFullName"
                  value={editFullName}
                  onChange={(e) => setEditFullName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="editPhone" className="text-xs font-semibold">
                  Phone Number
                </Label>
                <Input
                  id="editPhone"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="+63 9XX XXX XXXX"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="editAccountStatus" className="text-xs font-semibold">
                  Account Access Status
                </Label>
                <Select value={editAccountStatus} onValueChange={(v) => setEditAccountStatus(v as 'active' | 'deactivated')}>
                  <SelectTrigger id="editAccountStatus">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active (Permitted to use account)</SelectItem>
                    <SelectItem value="deactivated">Deactivated (Blocked from accessing system)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {editTarget?.role === 'guide' ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="editSpecialty" className="text-xs font-semibold">
                      Trail Specialty
                    </Label>
                    <Input
                      id="editSpecialty"
                      value={editSpecialty}
                      onChange={(e) => setEditSpecialty(e.target.value)}
                      placeholder="e.g. Summit Trail, First Aid"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="editStatus" className="text-xs font-semibold">
                      Availability Status
                    </Label>
                    <Select value={editStatus} onValueChange={setEditStatus}>
                      <SelectTrigger id="editStatus">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="available">Available</SelectItem>
                        <SelectItem value="on-duty">On Duty</SelectItem>
                        <SelectItem value="off-duty">Off Duty</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="editEmergency" className="text-xs font-semibold">
                    Emergency Contact Name & Phone
                  </Label>
                  <Input
                    id="editEmergency"
                    value={editEmergency}
                    onChange={(e) => setEditEmergency(e.target.value)}
                    placeholder="e.g. Maria Santos (+63 917 123 4567)"
                  />
                </div>
              )}
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="ghost" onClick={() => setEditTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={submittingEdit}>
                {submittingEdit ? 'Saving...' : 'Save Info'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Remove Account Confirmation Dialog ── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <UserX className="h-5 w-5" />
              Permanently Remove Account?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove <strong>{deleteTarget?.fullName}</strong> ({deleteTarget?.email})? This action
              will remove their {deleteTarget?.role} profile and account access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              {deleting ? 'Removing...' : 'Confirm Remove Account'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
