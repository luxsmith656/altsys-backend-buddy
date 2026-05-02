import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/button';
import { Mountain, Map, MessageSquare, CalendarCheck, LayoutDashboard, LogOut, Menu, X, Moon, Sun, Bell, User } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import logo from '@/assets/logo.png';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { loadAnnouncements } from '@/lib/announcements';
import { loadRemovedNotificationIds, loadSeenNotificationIds } from '@/lib/notifications';
import { supabase } from '@/integrations/supabase/client';

export default function Navbar() {
  const { user, role, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifCount, setNotifCount] = useState(0);
  const [notifPreview, setNotifPreview] = useState<Array<{ id: string; title: string; createdAt: string }>>([]);

  const dashboardPath =
    role === 'super_admin' ? '/central' :
    role === 'admin' ? '/admin' :
    role === 'ranger' ? '/ranger' :
    role === 'guide' ? '/guide' :
    '/hiker';

  const navLinks = user
    ? [
        { to: dashboardPath, label: 'Dashboard', icon: LayoutDashboard },
        { to: '/booking', label: 'Book Hike', icon: CalendarCheck },
        { to: '/map', label: 'Map', icon: Map },
        { to: '/chat', label: 'AI Assistant', icon: MessageSquare },
      ]
    : [];

  const initials = useMemo(() => {
    const fullName = (user?.user_metadata?.full_name as string | undefined)?.trim();
    if (!fullName) return (user?.email?.[0] || 'U').toUpperCase();
    return fullName
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || '')
      .join('');
  }, [user]);

  useEffect(() => {
    if (!user) {
      setNotifCount(0);
      setNotifPreview([]);
      return;
    }
    const loadNotifData = async () => {
      const seen = new Set(loadSeenNotificationIds(user.id));
      const removed = new Set(loadRemovedNotificationIds(user.id));
      const anns = loadAnnouncements().map((a) => ({
        id: `ann:${a.id}`,
        title: a.title,
        createdAt: a.created_at,
      }));
      const { data } = await supabase
        .from('bookings')
        .select('id,status,created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      const bookingItems = (data || []).map((b) => ({
        id: `booking:${b.id}:${b.status}`,
        title: `Booking ${b.status}`,
        createdAt: b.created_at,
      }));
      const all = [...anns, ...bookingItems].filter((n) => !removed.has(n.id));
      const unseen = all.filter((n) => !seen.has(n.id)).length;
      setNotifCount(unseen);
      setNotifPreview(
        all
          .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
          .slice(0, 4),
      );
    };
    void loadNotifData();
  }, [user, location.pathname]);

  const isActive = (path: string) => location.pathname === path;

  const handleLogout = async () => {
    await signOut();
    setMobileOpen(false);
    navigate('/login');
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-[2000] glass-card-strong border-b border-border/30">
      <div className="container mx-auto flex items-center justify-between h-16 px-4">
        <Link to="/" className="flex items-center gap-2 group">
          <img
            src={logo}
            alt="Mt. Kalisungan logo"
            className="h-8 w-8 rounded-full object-cover bg-white/5 group-hover:scale-110 transition-transform"
            loading="eager"
          />
          <span className="text-lg font-bold text-gradient">Mt. Kalisungan</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1">
          {navLinks.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition-all ${
                isActive(l.to) ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              <l.icon className="h-4 w-4" />
              {l.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="mr-1"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          {user ? (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative"
                    aria-label="Notifications"
                  >
                    <Bell className="h-4 w-4" />
                    {notifCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-destructive text-white text-[10px] leading-4 text-center">
                        {notifCount > 9 ? '9+' : notifCount}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={8} className="w-72 z-[3100]">
                  <DropdownMenuLabel>Notifications</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {notifPreview.length === 0 ? (
                    <DropdownMenuItem disabled>No notifications yet</DropdownMenuItem>
                  ) : (
                    notifPreview.map((n) => (
                      <DropdownMenuItem key={n.id} onClick={() => navigate('/notifications')}>
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{n.title}</p>
                          <p className="text-[10px] text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</p>
                        </div>
                      </DropdownMenuItem>
                    ))
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/notifications')}>
                    See all notifications
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="h-9 w-9 rounded-full bg-primary/20 text-primary font-bold text-sm">
                    {initials}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={8} className="w-44 z-[3100]">
                  <DropdownMenuItem onClick={() => navigate('/profile')}>
                    <User className="h-4 w-4 mr-2" /> Profile
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="h-4 w-4 mr-2" /> Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => navigate('/login')}>Login</Button>
              <Button size="sm" onClick={() => navigate('/register')}>Sign Up</Button>
            </>
          )}
        </div>

        {/* Mobile toggle + theme */}
        <div className="md:hidden flex items-center gap-2">
          <button
            className="text-foreground"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <button className="text-foreground" onClick={() => setMobileOpen(!mobileOpen)}>
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden glass-card-strong border-t border-border/30 overflow-hidden"
          >
            <div className="flex flex-col gap-1 p-4">
              {navLinks.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                    isActive(l.to) ? 'bg-primary/20 text-primary' : 'text-muted-foreground'
                  }`}
                  onClick={() => setMobileOpen(false)}
                >
                  <l.icon className="h-4 w-4" />
                  {l.label}
                </Link>
              ))}
              <div className="border-t border-border/30 my-2" />
              {user ? (
                <>
                  <Button variant="ghost" size="sm" className="justify-start" onClick={() => { navigate('/profile'); setMobileOpen(false); }}>
                    <User className="h-4 w-4 mr-2" /> Profile
                  </Button>
                  <Button variant="ghost" size="sm" className="justify-start" onClick={() => { navigate('/notifications'); setMobileOpen(false); }}>
                    <Bell className="h-4 w-4 mr-2" /> Notifications {notifCount > 0 ? `(${notifCount})` : ''}
                  </Button>
                  <Button variant="ghost" size="sm" className="justify-start" onClick={handleLogout}>
                    <LogOut className="h-4 w-4 mr-2" /> Logout ({role})
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" size="sm" className="justify-start" onClick={() => { navigate('/login'); setMobileOpen(false); }}>Login</Button>
                  <Button size="sm" className="justify-start" onClick={() => { navigate('/register'); setMobileOpen(false); }}>Sign Up</Button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
