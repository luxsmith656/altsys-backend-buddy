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
  ShieldCheck,
  Compass,
  UserCheck,
  Plus,
  Building2,
  MapPin,
  Lock,
  Phone,
  Mail,
  Loader2,
  Filter,
  Eye,
  Info,
} from 'lucide-react';
import { useLocations } from '@/hooks/useLocations';
import {
  fetchAdminsList,
  fetchUsersList,
  resetAdminPassword,
  updateAdminInfo,
  createAdminAccount,
  changeUserPassword,
  editUserInfo,
  deleteUserAccount,
  type AdminAccount,
  type UserAccount,
} from '@/lib/adminManagementService';
import { supabase } from '@/integrations/supabase/client';

export interface UnifiedAccount {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  phone: string;
  role: 'admin' | 'guide' | 'hiker';
  locationId?: string | null;
  locationName?: string;
  status?: string;
  accountStatus?: 'active' | 'deactivated';
  specialty?: string;
  emergencyContact?: string;
  createdAt: string;
}

export default function CentralAccountManagement() {
  const { locations } = useLocations();

  // Strict jump-offs: Lamot 2, Lamot 1, Sto. Tomas
  const jumpOffStations = useMemo(() => {
    return locations
      .filter((loc) => !loc.name.toLowerCase().includes('mount kalisungan') && loc.slug !== 'mt-kalisungan')
      .sort((a, b) => {
        const aText = `${a.slug} ${a.name}`.toLowerCase();
        const bText = `${b.slug} ${b.name}`.toLowerCase();
        const score = (t: string) => (t.includes('lamot') && t.includes('2') ? 1 : t.includes('lamot') && t.includes('1') ? 2 : 3);
        return score(aText) - score(bText);
      });
  }, [locations]);

  const [accounts, setAccounts] = useState<UnifiedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'guide' | 'hiker'>('all');
  const [stationFilter, setStationFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'deactivated'>('all');

  // Add Account Dialog
  const [addOpen, setAddOpen] = useState(false);
  const [addRole, setAddRole] = useState<'admin' | 'guide' | 'hiker'>('admin');
  const [addFullName, setAddFullName] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addLocationId, setAddLocationId] = useState<string>('unassigned');
  const [addPassword, setAddPassword] = useState('');
  const [creatingAccount, setCreatingAccount] = useState(false);

  // Edit Account Dialog
  const [editTarget, setEditTarget] = useState<UnifiedAccount | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editLocationId, setEditLocationId] = useState<string>('unassigned');
  const [editSpecialty, setEditSpecialty] = useState('');
  const [editEmergency, setEditEmergency] = useState('');
  const [editAccountStatus, setEditAccountStatus] = useState<'active' | 'deactivated'>('active');
  const [savingEdit, setSavingEdit] = useState(false);

  // Password Reset Dialog
  const [passwordTarget, setPasswordTarget] = useState<UnifiedAccount | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);

  // Delete Dialog
  const [deleteTarget, setDeleteTarget] = useState<UnifiedAccount | null>(null);
  const [deleting, setDeleting] = useState(false);

  // View Details Dialog (Read-only for Guide and Hiker)
  const [viewTarget, setViewTarget] = useState<UnifiedAccount | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [adminsData, usersData] = await Promise.all([
        fetchAdminsList(),
        fetchUsersList(null),
      ]);

      // Normalize admins, excluding generic Mount Kalisungan
      const normalizedAdmins: UnifiedAccount[] = adminsData
        .filter((a) => {
          const loc = (a.locationName || '').toLowerCase();
          const name = (a.fullName || '').toLowerCase();
          const email = (a.email || '').toLowerCase();
          return (
            !loc.includes('mount kalisungan') &&
            !name.includes('mount kalisungan') &&
            !email.includes('mtkalisungan') &&
            email !== 'kalisungan@kalisungan.ph'
          );
        })
        .map((a) => ({
          id: a.id,
          userId: a.userId,
          fullName: a.fullName,
          email: a.email,
          phone: a.phone,
          role: 'admin',
          locationId: a.locationId,
          locationName: a.locationName || 'Trailhead Admin',
          accountStatus: 'active',
          status: 'active',
          createdAt: a.createdAt,
        }));

      // Normalize guides & hikers
      const normalizedUsers: UnifiedAccount[] = usersData.map((u) => ({
        id: u.id,
        userId: u.userId,
        fullName: u.fullName,
        email: u.email,
        phone: u.phone,
        role: u.role,
        locationId: u.locationId,
        locationName: u.locationName,
        status: u.status,
        accountStatus: u.accountStatus || (u.status === 'deactivated' ? 'deactivated' : 'active'),
        specialty: u.specialty,
        emergencyContact: u.emergencyContact,
        createdAt: u.createdAt,
      }));

      // Combine and sort by creation
      const combined = [...normalizedAdmins, ...normalizedUsers].sort(
        (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      );

      setAccounts(combined);
    } catch (err: any) {
      toast.error('Failed to load accounts: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Handlers
  const handleOpenAdd = () => {
    setAddRole('admin');
    setAddFullName('');
    setAddEmail('');
    setAddPhone('');
    setAddLocationId(jumpOffStations[0]?.id || 'unassigned');
    setAddPassword('');
    setAddOpen(true);
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addFullName.trim() || !addEmail.trim()) {
      toast.error('Full name and email are required');
      return;
    }

    setCreatingAccount(true);
    try {
      const selectedLoc = jumpOffStations.find((l) => l.id === addLocationId);
      const locName = selectedLoc ? selectedLoc.name : 'Unassigned';

      const res = await createAdminAccount({
        fullName: addFullName.trim(),
        email: addEmail.trim(),
        phone: addPhone.trim(),
        locationId: addLocationId === 'unassigned' ? null : addLocationId,
        locationName: locName,
        password: addPassword || undefined,
      });
      toast.success(res.message);

      setAddOpen(false);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create account');
    } finally {
      setCreatingAccount(false);
    }
  };

  const handleOpenEdit = (acc: UnifiedAccount) => {
    setEditTarget(acc);
    setEditFullName(acc.fullName);
    setEditPhone(acc.phone || '');
    setEditLocationId(acc.locationId || 'unassigned');
    setEditSpecialty(acc.specialty || '');
    setEditEmergency(acc.emergencyContact || '');
    setEditAccountStatus(acc.accountStatus === 'deactivated' || acc.status === 'deactivated' ? 'deactivated' : 'active');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;

    setSavingEdit(true);
    try {
      const selectedLoc = jumpOffStations.find((l) => l.id === editLocationId);
      const locName = selectedLoc ? selectedLoc.name : 'Unassigned';

      if (editTarget.role === 'admin') {
        const res = await updateAdminInfo(editTarget.userId, {
          fullName: editFullName.trim(),
          phone: editPhone.trim(),
          locationId: editLocationId === 'unassigned' ? null : editLocationId,
          locationName: locName,
          status: editAccountStatus,
        });
        toast.success(res.message);
      } else {
        const res = await editUserInfo(editTarget.userId, {
          fullName: editFullName.trim(),
          phone: editPhone.trim(),
          emergencyContact: editEmergency.trim(),
          specialty: editSpecialty.trim(),
          status: editAccountStatus === 'deactivated' ? 'deactivated' : 'available',
          accountStatus: editAccountStatus,
          locationId: editLocationId === 'unassigned' ? null : editLocationId,
        });
        toast.success(res.message);
      }

      setEditTarget(null);
      await loadData();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update user');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleOpenPassword = (acc: UnifiedAccount) => {
    setPasswordTarget(acc);
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

    setResettingPassword(true);
    try {
      if (passwordTarget.role === 'admin') {
        const res = await resetAdminPassword(passwordTarget.userId, passwordTarget.email, newPassword);
        toast.success(res.message);
      } else {
        const res = await changeUserPassword(passwordTarget.userId, passwordTarget.email, newPassword);
        toast.success(res.message);
      }
      setPasswordTarget(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to reset password');
    } finally {
      setResettingPassword(false);
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
      toast.error(err.message || 'Failed to delete account');
    } finally {
      setDeleting(false);
    }
  };

  // Filtered Roster
  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      if (roleFilter !== 'all' && acc.role !== roleFilter) return false;
      if (stationFilter !== 'all' && acc.locationId !== stationFilter) return false;
      if (statusFilter !== 'all' && acc.accountStatus !== statusFilter) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = acc.fullName.toLowerCase().includes(q);
        const matchesEmail = acc.email.toLowerCase().includes(q);
        const matchesPhone = (acc.phone || '').toLowerCase().includes(q);
        const matchesStation = (acc.locationName || '').toLowerCase().includes(q);
        if (!matchesName && !matchesEmail && !matchesPhone && !matchesStation) return false;
      }
      return true;
    });
  }, [accounts, roleFilter, stationFilter, statusFilter, search]);

  const counts = useMemo(() => {
    return {
      all: accounts.length,
      admin: accounts.filter((a) => a.role === 'admin').length,
      guide: accounts.filter((a) => a.role === 'guide').length,
      hiker: accounts.filter((a) => a.role === 'hiker').length,
    };
  }, [accounts]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/20">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider bg-primary/10 text-primary border-primary/20">
              Unified Identity Directory
            </Badge>
            <span className="text-xs text-muted-foreground">Local Admins, Guides &amp; Hikers</span>
          </div>
          <h2 className="text-xl lg:text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Account Management Roster
          </h2>
          <p className="text-xs lg:text-sm text-muted-foreground mt-0.5">
            Single roster ledger for managing local trailhead administrators, certified guides, and registered hikers with easy search, filter, and credentials control.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadData}
            disabled={loading}
            className="gap-1.5 text-xs h-9 font-semibold"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh Roster
          </Button>
          <Button
            size="sm"
            onClick={handleOpenAdd}
            className="gap-1.5 text-xs h-9 glow-primary font-semibold"
          >
            <Plus className="h-3.5 w-3.5" /> Add New Account
          </Button>
        </div>
      </div>

      {/* Roster Controls: Role Dropdown, Station Filter, Status, Search */}
      <div className="p-3 rounded-2xl border border-border/30 bg-secondary/15 backdrop-blur-sm">
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-2.5">
          {/* Role Dropdown */}
          <Select value={roleFilter} onValueChange={(val: any) => setRoleFilter(val)}>
            <SelectTrigger className="h-9 text-xs font-semibold w-full md:w-52 bg-background/80">
              <SelectValue placeholder="All Roles" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Accounts ({counts.all})</SelectItem>
              <SelectItem value="admin">Local Admins ({counts.admin})</SelectItem>
              <SelectItem value="guide">Tour Guides ({counts.guide})</SelectItem>
              <SelectItem value="hiker">Hikers ({counts.hiker})</SelectItem>
            </SelectContent>
          </Select>

          {/* Station Selector */}
          <Select value={stationFilter} onValueChange={setStationFilter}>
            <SelectTrigger className="h-9 text-xs font-medium w-full md:w-44 bg-background/80">
              <SelectValue placeholder="All Stations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stations</SelectItem>
              {jumpOffStations.map((loc) => (
                <SelectItem key={loc.id} value={loc.id}>
                  {loc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status Selector */}
          <Select value={statusFilter} onValueChange={(val: any) => setStatusFilter(val)}>
            <SelectTrigger className="h-9 text-xs font-medium w-full md:w-36 bg-background/80">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Status: All</SelectItem>
              <SelectItem value="active">Active Only</SelectItem>
              <SelectItem value="deactivated">Deactivated</SelectItem>
            </SelectContent>
          </Select>

          {/* Search Box - Flex aligned */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, email, phone, station..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-xs h-9 w-full bg-background/80"
            />
          </div>
        </div>
      </div>

      {/* ──────────────── ROSTER TABLE (LIST NOT CARDS) ──────────────── */}
      <Card className="glass-card overflow-hidden border-border/30">
        <CardHeader className="pb-3 border-b border-border/20 bg-secondary/10">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Roster Table Directory ({filteredAccounts.length} entries)
            </CardTitle>
            <span className="text-xs text-muted-foreground">
              Showing active accounts filtered by role and scope
            </span>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-secondary/30 text-muted-foreground border-b border-border/20 font-semibold uppercase text-[10px] tracking-wider">
                <tr>
                  <th className="px-4 py-3">User &amp; Contact</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Assigned Station</th>
                  <th className="px-4 py-3">Account Status</th>
                  <th className="px-4 py-3">Registered</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-border/10">
                {filteredAccounts.map((acc) => {
                  const isAdmin = acc.role === 'admin';
                  const isGuide = acc.role === 'guide';
                  const isHiker = acc.role === 'hiker';

                  const locName = acc.locationName || (acc.locationId ? jumpOffStations.find((l) => l.id === acc.locationId)?.name : 'All Stations');

                  return (
                    <tr key={acc.id} className="hover:bg-muted/30 transition-colors">
                      {/* User & Contact */}
                      <td className="px-4 py-3">
                        <div className="font-bold text-foreground text-xs flex items-center gap-2">
                          <div className={`h-7 w-7 rounded-full flex items-center justify-center font-bold text-[10px] shrink-0 ${
                            isAdmin ? 'bg-purple-500/20 text-purple-600' : isGuide ? 'bg-emerald-500/20 text-emerald-600' : 'bg-sky-500/20 text-sky-600'
                          }`}>
                            {acc.fullName.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-foreground truncate max-w-[180px]">{acc.fullName}</div>
                            <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">{acc.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td className="px-4 py-3">
                        {isAdmin && (
                          <Badge variant="outline" className="text-[10px] bg-purple-500/15 text-purple-600 border-purple-500/30 font-bold gap-1">
                            <ShieldCheck className="h-3 w-3" /> Local Admin
                          </Badge>
                        )}
                        {isGuide && (
                          <Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-600 border-emerald-500/30 font-bold gap-1">
                            <Compass className="h-3 w-3" /> Tour Guide
                          </Badge>
                        )}
                        {isHiker && (
                          <Badge variant="outline" className="text-[10px] bg-sky-500/15 text-sky-600 border-sky-500/30 font-bold gap-1">
                            <UserCheck className="h-3 w-3" /> Hiker
                          </Badge>
                        )}
                      </td>

                      {/* Assigned Station */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-foreground font-medium">
                          <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="truncate max-w-[150px]">{locName || 'All Stations'}</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        {acc.accountStatus === 'deactivated' || acc.status === 'deactivated' ? (
                          <Badge variant="outline" className="text-[10px] bg-destructive/15 text-destructive border-destructive/30">
                            Deactivated
                          </Badge>
                        ) : acc.status === 'on_trail' ? (
                          <Badge variant="outline" className="text-[10px] bg-sky-500/15 text-sky-600 border-sky-500/30">
                            On Trail
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-600 border-emerald-500/30">
                            Active
                          </Badge>
                        )}
                      </td>

                      {/* Registered Date */}
                      <td className="px-4 py-3 text-muted-foreground text-[11px] font-mono">
                        {acc.createdAt ? format(new Date(acc.createdAt), 'MMM d, yyyy') : '—'}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right">
                        {isAdmin ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenEdit(acc)}
                              className="h-7 px-2 text-[11px] gap-1"
                            >
                              <Edit className="h-3 w-3" /> Edit Info
                            </Button>

                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleOpenPassword(acc)}
                              className="h-7 px-2 text-[11px] gap-1"
                            >
                              <KeyRound className="h-3 w-3" /> Reset Pass
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteTarget(acc)}
                              className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setViewTarget(acc)}
                              className="h-7 px-2.5 text-[11px] gap-1.5 bg-secondary/30 hover:bg-secondary/60 text-foreground"
                            >
                              <Eye className="h-3 w-3 text-primary" /> View Details
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {filteredAccounts.length === 0 && !loading && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                      No matching accounts found for the selected criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ──────────────── MODAL 1: ADD LOCAL ADMIN ACCOUNT ──────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4 text-primary" /> Register Local Administrator
            </DialogTitle>
            <DialogDescription className="text-xs">
              Provision a new Trailhead Local Administrator for station operations (Lamot 2, Lamot 1, or Sto. Tomas).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateAccount} className="space-y-3.5 text-xs">

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Full Legal Name *</Label>
              <Input
                placeholder="Juan dela Cruz"
                value={addFullName}
                onChange={(e) => setAddFullName(e.target.value)}
                className="h-8 text-xs"
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Email Address *</Label>
              <Input
                type="email"
                placeholder="juan@kalisungan.ph"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                className="h-8 text-xs"
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Contact Phone Number</Label>
              <Input
                placeholder="09171234567"
                value={addPhone}
                onChange={(e) => setAddPhone(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Assigned Jump-Off Station</Label>
              <Select value={addLocationId} onValueChange={setAddLocationId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">All Stations / Unassigned</SelectItem>
                  {jumpOffStations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Initial Password</Label>
              <Input
                type="password"
                placeholder="Minimum 6 characters (default: Trail@2026)"
                value={addPassword}
                onChange={(e) => setAddPassword(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(false)} className="text-xs">
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={creatingAccount} className="text-xs glow-primary">
                {creatingAccount ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirm Create Account'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ──────────────── MODAL 2: EDIT ACCOUNT ──────────────── */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Edit className="h-4 w-4 text-primary" /> Edit Account Details
            </DialogTitle>
            <DialogDescription className="text-xs">
              Updating information for <strong className="text-foreground">{editTarget?.fullName}</strong> ({editTarget?.role}).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveEdit} className="space-y-3.5 text-xs">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Full Name</Label>
              <Input
                value={editFullName}
                onChange={(e) => setEditFullName(e.target.value)}
                className="h-8 text-xs"
                required
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Phone Number</Label>
              <Input
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Station Assignment</Label>
              <Select value={editLocationId} onValueChange={setEditLocationId}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="unassigned">All Stations / Unassigned</SelectItem>
                  {jumpOffStations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {editTarget?.role === 'guide' && (
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Guide Specialty / Certification</Label>
                <Input
                  value={editSpecialty}
                  onChange={(e) => setEditSpecialty(e.target.value)}
                  placeholder="e.g. Flora expert, First Aid certified"
                  className="h-8 text-xs"
                />
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Account Status</Label>
              <Select value={editAccountStatus} onValueChange={(val: any) => setEditAccountStatus(val)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active (Access Allowed)</SelectItem>
                  <SelectItem value="deactivated">Deactivated (Access Revoked)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setEditTarget(null)} className="text-xs">
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={savingEdit} className="text-xs glow-primary">
                {savingEdit ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ──────────────── MODAL 3: RESET PASSWORD ──────────────── */}
      <Dialog open={!!passwordTarget} onOpenChange={(open) => !open && setPasswordTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4 text-primary" /> Reset Credentials
            </DialogTitle>
            <DialogDescription className="text-xs">
              Assign a new password for <strong className="text-foreground">{passwordTarget?.fullName}</strong> ({passwordTarget?.email}).
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSavePassword} className="space-y-3.5 text-xs">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">New Password</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-8 text-xs"
                required
                minLength={6}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">Confirm Password</Label>
              <Input
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-8 text-xs"
                required
                minLength={6}
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setPasswordTarget(null)} className="text-xs">
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={resettingPassword} className="text-xs glow-primary">
                {resettingPassword ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Confirm Password Change'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ──────────────── MODAL 4: DELETE CONFIRMATION ──────────────── */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base">Permanently Remove Account?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Are you sure you want to remove <strong className="text-foreground">{deleteTarget?.fullName}</strong> ({deleteTarget?.email})? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmConfirmDelete => handleConfirmDelete()}
              disabled={deleting}
              className="text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Removing...' : 'Confirm Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ──────────────── MODAL 5: VIEW DETAILS (READ-ONLY FOR GUIDES & HIKERS) ──────────────── */}
      <Dialog open={!!viewTarget} onOpenChange={(open) => !open && setViewTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Eye className="h-4 w-4 text-primary" /> Account Details &amp; Profile
            </DialogTitle>
            <DialogDescription className="text-xs">
              Unified cross-station overview for <strong className="text-foreground">{viewTarget?.fullName}</strong>.
            </DialogDescription>
          </DialogHeader>

          {viewTarget && (
            <div className="space-y-4 py-1 text-xs">
              {/* Header profile chip */}
              <div className="p-3 rounded-xl border border-border/30 bg-secondary/15 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-foreground">{viewTarget.fullName}</h4>
                  <p className="text-[11px] text-muted-foreground font-mono">{viewTarget.email}</p>
                </div>
                <div>
                  {viewTarget.role === 'guide' ? (
                    <Badge variant="outline" className="text-[11px] bg-emerald-500/15 text-emerald-600 border-emerald-500/30 font-bold gap-1">
                      <Compass className="h-3 w-3" /> Tour Guide
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[11px] bg-sky-500/15 text-sky-600 border-sky-500/30 font-bold gap-1">
                      <UserCheck className="h-3 w-3" /> Hiker
                    </Badge>
                  )}
                </div>
              </div>

              {/* Detail fields grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-2.5 rounded-lg border border-border/20 bg-background/50 space-y-0.5">
                  <div className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1">
                    <Phone className="h-3 w-3 text-primary" /> Contact Phone
                  </div>
                  <div className="font-medium text-foreground">{viewTarget.phone || 'None provided'}</div>
                </div>

                <div className="p-2.5 rounded-lg border border-border/20 bg-background/50 space-y-0.5">
                  <div className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1">
                    <MapPin className="h-3 w-3 text-primary" /> Assigned Trailhead
                  </div>
                  <div className="font-medium text-foreground">
                    {viewTarget.locationName || (viewTarget.locationId ? jumpOffStations.find((l) => l.id === viewTarget.locationId)?.name : 'All Stations / Roaming')}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg border border-border/20 bg-background/50 space-y-0.5">
                  <div className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3 text-primary" /> Status
                  </div>
                  <div>
                    {viewTarget.accountStatus === 'deactivated' || viewTarget.status === 'deactivated' ? (
                      <Badge variant="outline" className="text-[10px] bg-destructive/15 text-destructive border-destructive/30">
                        Deactivated
                      </Badge>
                    ) : viewTarget.status === 'on_trail' ? (
                      <Badge variant="outline" className="text-[10px] bg-sky-500/15 text-sky-600 border-sky-500/30">
                        On Trail
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-600 border-emerald-500/30">
                        Active
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="p-2.5 rounded-lg border border-border/20 bg-background/50 space-y-0.5">
                  <div className="text-[10px] text-muted-foreground font-semibold">Registered Date</div>
                  <div className="font-mono text-foreground">
                    {viewTarget.createdAt ? format(new Date(viewTarget.createdAt), 'MMM d, yyyy') : '—'}
                  </div>
                </div>
              </div>

              {/* Tour Guide Specialty if available */}
              {viewTarget.role === 'guide' && viewTarget.specialty && (
                <div className="p-2.5 rounded-lg border border-border/20 bg-background/50 space-y-0.5">
                  <div className="text-[10px] text-muted-foreground font-semibold">Guide Specialty &amp; Certification</div>
                  <div className="font-medium text-foreground">{viewTarget.specialty}</div>
                </div>
              )}

              {/* Emergency Contact if available */}
              {viewTarget.emergencyContact && (
                <div className="p-2.5 rounded-lg border border-border/20 bg-background/50 space-y-0.5">
                  <div className="text-[10px] text-muted-foreground font-semibold">Emergency Contact</div>
                  <div className="font-medium text-foreground">{viewTarget.emergencyContact}</div>
                </div>
              )}

              {/* Informational callout explaining roles & permissions */}
              <div className="p-3 rounded-xl border border-primary/20 bg-primary/5 flex items-start gap-2.5">
                <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  <strong className="text-foreground">Trailhead Local Governance:</strong> Tour Guide and Hiker credentials, passwords, and assignments are managed locally by their assigned Trailhead Admin. Central Admin has unified, read-only operational visibility.
                </p>
              </div>

              <DialogFooter className="pt-2">
                <Button variant="outline" size="sm" onClick={() => setViewTarget(null)} className="text-xs w-full">
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
