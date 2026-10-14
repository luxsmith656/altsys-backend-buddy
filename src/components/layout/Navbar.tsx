import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/button';
import { Mountain, Map, CalendarCheck, LayoutDashboard, LogOut, Menu, X, Moon, Sun, Bell, User } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import logo from '@/assets/logo.png';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAppNotifications } from '@/hooks/useAppNotifications';
import { getRoleHomePath } from '@/lib/authRoles';
import ProfileAvatar from '@/components/common/ProfileAvatar';

export default function Navbar() {
  const { user, role, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { items: notifications, unreadCount: notifCount, markRead } = useAppNotifications();
  const notifPreview = notifications.slice(0, 4);

  const dashboardPath = role ? getRoleHomePath(role) : '/dashboard';

  const markPreviewRead = (id: string) => void markRead(id).catch(() => null);

  const navLinks = user
    ? [
        { to: dashboardPath, label: 'Dashboard', icon: LayoutDashboard },
        ...(role === 'guide' || role === 'super_admin' ? [] : [{ to: '/booking', label: 'Book Hike', icon: CalendarCheck }]),
        { to: '/map', label: 'Map', icon: Map },
      ]
    : [
        { to: '/map', label: 'Map', icon: Map },
        { to: '/booking', label: 'Book Hike', icon: CalendarCheck },
      ];

  const isActive = (path: string) => location.pathname === path;

  const handleLogout = async () => {
    await signOut();
    setMobileOpen(false);
    navigate('/login');
  };

  return (
    <nav className="app-navbar fixed top-0 left-0 right-0 z-[2000] glass-card-strong border-b border-border/30">
      <div className="container mx-auto flex items-center justify-between h-16 px-4">
        <Link to="/" className="flex min-w-0 items-center gap-2 group">
          <img
            src={logo}
            alt="Mt. Kalisungan logo"
            className="h-8 w-8 rounded-full object-cover bg-white/5 group-hover:scale-110 transition-transform"
            loading="eager"
          />
          <span className="truncate text-base font-bold text-gradient sm:text-lg">Mt. Kalisungan</span>
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
                    className={`relative ${notifCount > 0 ? 'text-primary ring-2 ring-primary/40 shadow-[0_0_16px_hsl(var(--primary)/0.45)] animate-pulse' : ''}`}
                    aria-label="Notifications"
                  >
                    <Bell className="h-4 w-4" />
                    {notifCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-destructive text-white text-[10px] leading-4 text-center">
                        {notifCount > 99 ? '99+' : notifCount}
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
                      <DropdownMenuItem key={n.id} onClick={() => { markPreviewRead(n.id); navigate(n.link || '/notifications'); }}>
                        <div className="min-w-0">
                          <p className={`truncate text-xs ${n.read ? 'font-medium' : 'font-bold'}`}>{n.title}</p>
                          <p className="truncate text-[10px] text-muted-foreground">{n.body}</p>
                          <p className="text-[10px] text-muted-foreground">{new Date(n.createdAt).toLocaleString()}</p>
                        </div>
                        {!n.read && <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-destructive" aria-label="Unread" />}
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
                  <button aria-label="Profile menu" className="h-9 w-9 rounded-full bg-primary/20 text-primary font-bold text-sm">
                    <ProfileAvatar />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={8} className="w-44 z-[3100]">
                  <DropdownMenuItem onClick={() => navigate('/profile')}>
                    <ProfileAvatar className="h-5 w-5 mr-2 text-[10px]" /> Profile
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
        <div className="ml-2 flex shrink-0 items-center gap-1 md:hidden">
          {user && (
            <button
              className={`relative inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${notifCount > 0 ? 'text-primary ring-2 ring-primary/40 shadow-[0_0_14px_hsl(var(--primary)/0.4)] animate-pulse' : ''}`}
              aria-label={`Notifications${notifCount > 0 ? ` (${notifCount} unread)` : ''}`}
              onClick={() => navigate('/notifications')}
            >
              <Bell className="h-5 w-5" />
              {notifCount > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-destructive px-1 text-[10px] leading-4 text-white">{notifCount > 99 ? '99+' : notifCount}</span>}
            </button>
          )}
          <button
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <button
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(!mobileOpen)}
          >
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
                  className={`flex min-h-11 items-center gap-2 px-3 py-2 rounded-lg text-sm ${
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
                  <Button variant="ghost" size="sm" className="min-h-11 justify-start" onClick={() => { navigate('/profile'); setMobileOpen(false); }}>
                    <ProfileAvatar className="h-5 w-5 mr-2 text-[10px]" /> Profile
                  </Button>
                  <Button variant="ghost" size="sm" className="min-h-11 justify-start" onClick={() => { navigate('/notifications'); setMobileOpen(false); }}>
                    <Bell className="h-4 w-4 mr-2" /> Notifications {notifCount > 0 ? `(${notifCount})` : ''}
                  </Button>
                  <Button variant="ghost" size="sm" className="min-h-11 justify-start" onClick={handleLogout}>
                    <LogOut className="h-4 w-4 mr-2" /> Logout ({role})
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="ghost" size="sm" className="min-h-11 justify-start" onClick={() => { navigate('/login'); setMobileOpen(false); }}>Login</Button>
                  <Button size="sm" className="min-h-11 justify-start" onClick={() => { navigate('/register'); setMobileOpen(false); }}>Sign Up</Button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
