import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
  Megaphone,
  Send,
  Trash2,
  Sparkles,
  Clock,
} from 'lucide-react';
import {
  addAnnouncement,
  loadAnnouncements,
  removeAnnouncement,
  type AdminAnnouncement,
  type AnnouncementTarget,
  type AnnouncementType,
} from '@/lib/announcements';
import { usePricing } from '@/hooks/usePricing';
import { formatPeso } from '@/lib/payments';

export default function CentralAnnouncements() {
  const { pricing } = usePricing();
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [filterTarget, setFilterTarget] = useState<string>('all_filter');

  // Form state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [source, setSource] = useState('Calauan Municipal Tourism Office');
  const [target, setTarget] = useState<AnnouncementTarget>('all');
  const [type, setType] = useState<AnnouncementType>('info');
  const [isImportant, setIsImportant] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);

  const refreshAnnouncements = useCallback(() => {
    setAnnouncements(loadAnnouncements());
  }, []);

  useEffect(() => {
    refreshAnnouncements();
  }, [refreshAnnouncements]);

  const handleFillFareNotice = () => {
    setTitle('Official Mt. Kalisungan Tariff & Safety Notice');
    setTarget('all');
    setType('info');
    setIsImportant(true);
    const maxRatio = pricing.maxPaxPerGuide || 5;
    const msg = `Official Mt. Kalisungan tourism tariff schedule: Registration Entry Fee: ${formatPeso(pricing.entryFee)}/head, Environmental/DSPA: ${formatPeso(pricing.envFee)}/head. Mandatory Mountain Guide ratio: 1 licensed guide per 1–${maxRatio} hikers (${formatPeso(pricing.guideFeeMorning)} Day / ${formatPeso(pricing.guideFeeNight)} Night / ${formatPeso(pricing.guideFeeOvernight)} Overnight). Peak Summit Extension: ${formatPeso(pricing.peakExtensionFeePerHour)}/hr. Horse porter & emergency rescue: ${formatPeso(pricing.horseEmergencyFee)} (lower stations) to ${formatPeso(pricing.horseHighStationFee)} (upper stations). Effective across Lamot 2, Lamot 1, and Sto. Tomas stations.`;
    setBody(msg);
    toast.success('Clean fare notice template generated!');
  };

  const handlePublish = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Please enter an announcement title.');
      return;
    }
    if (!body.trim()) {
      toast.error('Please enter the announcement message content.');
      return;
    }

    setBroadcasting(true);
    try {
      const newAnn: AdminAnnouncement = {
        id: Date.now().toString(),
        title: title.trim(),
        body: body.trim(),
        source: source.trim() || 'Calauan Municipal Tourism Office',
        type,
        target,
        created_at: new Date().toISOString(),
        isImportant,
      };
      addAnnouncement(newAnn);
      toast.success('Announcement broadcasted successfully!');
      setTitle('');
      setBody('');
      setIsImportant(false);
      refreshAnnouncements();
    } catch (err: any) {
      toast.error('Failed to broadcast: ' + err.message);
    } finally {
      setBroadcasting(false);
    }
  };

  const handleDelete = (id: string) => {
    removeAnnouncement(id);
    toast.success('Announcement removed.');
    refreshAnnouncements();
  };

  const filteredAnnouncements = announcements.filter((a) => {
    if (filterTarget === 'all_filter') return true;
    return a.target === filterTarget;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border/20">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-wider bg-primary/10 text-primary border-primary/20">
              Cross-Trailhead Communications
            </Badge>
            <span className="text-xs text-muted-foreground">Central Municipal Dispatch</span>
          </div>
          <h2 className="text-xl lg:text-2xl font-bold flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-primary" />
            Central Announcements &amp; Advisory Console
          </h2>
          <p className="text-xs lg:text-sm text-muted-foreground mt-0.5">
            Broadcast official tariff updates, trail condition alerts, and administrative directives to Station Admins, Guides, and Hikers.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Dispatcher Form */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="glass-card border-border/30 overflow-hidden">
            <CardHeader className="pb-3 border-b border-border/20 bg-secondary/10">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Send className="h-4 w-4 text-primary" /> Create Broadcast
                </CardTitle>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleFillFareNotice}
                  className="text-[11px] h-7 px-2 text-primary hover:text-primary gap-1"
                >
                  <Sparkles className="h-3 w-3" /> Quick Fare Notice
                </Button>
              </div>
              <CardDescription className="text-xs">
                Select target recipient group and priority.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-4">
              <form onSubmit={handlePublish} className="space-y-3.5">
                <div className="space-y-1">
                  <Label htmlFor="announcement-source" className="text-xs font-semibold">Source / Issuer</Label>
                  <Input
                    id="announcement-source"
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    placeholder="e.g. Calauan Municipal Tourism Office"
                    className="text-xs h-8 bg-background/80"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Title</Label>
                  <Input
                    placeholder="e.g. Weather Advisory / Updated Tariff"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="text-xs h-8 bg-background/80"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Audience</Label>
                    <Select value={target} onValueChange={(val: AnnouncementTarget) => setTarget(val)}>
                      <SelectTrigger className="h-8 text-xs bg-background/80">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">🌐 All Users &amp; Staff</SelectItem>
                        <SelectItem value="admins">🛡️ Station Admins Only</SelectItem>
                        <SelectItem value="guides">🧭 Mountain Guides Only</SelectItem>
                        <SelectItem value="hikers">🥾 Hikers Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Alert Level</Label>
                    <Select value={type} onValueChange={(val: AnnouncementType) => setType(val)}>
                      <SelectTrigger className="h-8 text-xs bg-background/80">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="info">ℹ️ General Information</SelectItem>
                        <SelectItem value="warning">⚠️ Caution / Warning</SelectItem>
                        <SelectItem value="closure">🚨 Trail Closure / Emergency</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Announcement Message</Label>
                  <Textarea
                    placeholder="Provide concise, accurate notification details..."
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={6}
                    className="text-xs bg-background/80 resize-none"
                  />
                </div>

                <div className="flex items-center space-x-2 pt-1">
                  <Checkbox
                    id="isImportant"
                    checked={isImportant}
                    onCheckedChange={(c) => setIsImportant(!!c)}
                  />
                  <Label htmlFor="isImportant" className="text-xs font-medium cursor-pointer">
                    Pin as high priority banner across dashboards
                  </Label>
                </div>

                <Button
                  type="submit"
                  disabled={broadcasting}
                  className="w-full text-xs font-semibold h-9 glow-primary gap-1.5"
                >
                  <Send className="h-3.5 w-3.5" />
                  {broadcasting ? 'Broadcasting...' : 'Broadcast Announcement'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Broadcasts Feed & Ledger */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="glass-card border-border/30 overflow-hidden">
            <CardHeader className="pb-3 border-b border-border/20 bg-secondary/10">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Megaphone className="h-4 w-4 text-primary" /> Active Broadcast Log
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Showing {filteredAnnouncements.length} published municipal announcements.
                  </CardDescription>
                </div>

                {/* Filter by Target */}
                <div className="flex items-center gap-1.5 bg-background/80 p-0.5 rounded-lg border border-border/30 text-xs">
                  <button
                    type="button"
                    onClick={() => setFilterTarget('all_filter')}
                    className={`px-2 py-1 rounded text-[11px] font-semibold transition-all ${
                      filterTarget === 'all_filter' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    All ({announcements.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterTarget('admins')}
                    className={`px-2 py-1 rounded text-[11px] font-semibold transition-all ${
                      filterTarget === 'admins' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Admins ({announcements.filter((a) => a.target === 'admins').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterTarget('guides')}
                    className={`px-2 py-1 rounded text-[11px] font-semibold transition-all ${
                      filterTarget === 'guides' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Guides ({announcements.filter((a) => a.target === 'guides').length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterTarget('hikers')}
                    className={`px-2 py-1 rounded text-[11px] font-semibold transition-all ${
                      filterTarget === 'hikers' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    Hikers ({announcements.filter((a) => a.target === 'hikers').length})
                  </button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-4 space-y-3">
              {filteredAnnouncements.map((ann) => (
                <div
                  key={ann.id}
                  className={`p-3.5 rounded-xl border transition-all ${
                    ann.type === 'closure'
                      ? 'bg-destructive/10 border-destructive/30'
                      : ann.type === 'warning'
                      ? 'bg-amber-500/10 border-amber-500/30'
                      : 'bg-secondary/20 border-border/30'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-foreground">{ann.title}</span>

                        {(!ann.target || ann.target === 'all') && (
                          <Badge variant="outline" className="text-[10px] bg-secondary/50">
                            🌐 All Recipients
                          </Badge>
                        )}
                        {ann.target === 'admins' && (
                          <Badge variant="outline" className="text-[10px] bg-purple-500/15 text-purple-600 border-purple-500/30">
                            🛡️ Station Admins
                          </Badge>
                        )}
                        {ann.target === 'guides' && (
                          <Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-600 border-emerald-500/30">
                            🧭 Mountain Guides
                          </Badge>
                        )}
                        {ann.target === 'hikers' && (
                          <Badge variant="outline" className="text-[10px] bg-sky-500/15 text-sky-600 border-sky-500/30">
                            🥾 Hikers
                          </Badge>
                        )}

                        {ann.isImportant && (
                          <Badge className="text-[10px] bg-primary text-primary-foreground">
                            Pinned
                          </Badge>
                        )}
                      </div>

                      <p className="text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed mt-1">
                        {ann.body}
                      </p>

                      {ann.source && (
                        <p className="text-[10px] font-semibold text-primary pt-1">Source: {ann.source}</p>
                      )}

                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground pt-1">
                        <Clock className="h-3 w-3" />
                        <span>
                          {ann.created_at ? format(new Date(ann.created_at), 'MMM d, yyyy · h:mm a') : 'Recent'}
                        </span>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(ann.id)}
                      className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10 shrink-0"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}

              {filteredAnnouncements.length === 0 && (
                <div className="p-8 text-center text-muted-foreground text-xs">
                  No published announcements for this category.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
