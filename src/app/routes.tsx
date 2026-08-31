import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { AppRole } from '@/types';

export type RouteAccess = 'public' | 'authenticated' | 'roles';

export interface AppRouteDefinition {
  path: string;
  pageKey: string;
  name: string;
  access: RouteAccess;
  allowedRoles?: AppRole[];
  showInNavigation: boolean;
  component: LazyExoticComponent<ComponentType>;
}

const Index = lazy(() => import('@/pages/Index'));
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const MapPage = lazy(() => import('@/pages/MapPage'));
const ChatPage = lazy(() => import('@/pages/ChatPage'));
const BookingPage = lazy(() => import('@/pages/BookingPage'));
const JoinHikeGuestPage = lazy(() => import('@/pages/JoinHikeGuestPage'));
const OpsAIPage = lazy(() => import('@/pages/OpsAIPage'));
const AdminDashboard = lazy(() => import('@/pages/AdminDashboard'));
const CentralDashboard = lazy(() => import('@/pages/CentralDashboard'));
const RangerDashboard = lazy(() => import('@/pages/RangerDashboard'));
const HikerDashboard = lazy(() => import('@/pages/HikerDashboard'));
const GuideDashboard = lazy(() => import('@/pages/GuideDashboard'));
const GuideProfilePage = lazy(() => import('@/pages/GuideProfilePage'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));
const DashboardRedirect = lazy(() => import('@/pages/DashboardRedirect'));
const NotificationsPage = lazy(() => import('@/pages/NotificationsPage'));
const Onboarding = lazy(() => import('@/pages/Onboarding'));
const MonitoringPage = lazy(() => import('@/pages/MonitoringPage'));
const MDRRMODashboard = lazy(() => import('@/pages/MDRRMODashboard'));

const ALL_ROLES: AppRole[] = ['admin', 'super_admin', 'ranger', 'guide', 'hiker', 'mdrrmo'];

export const APP_ROUTES: AppRouteDefinition[] = [
  { path: '/', pageKey: 'landing', name: 'Landing Page', access: 'public', showInNavigation: true, component: Index },
  { path: '/login', pageKey: 'login', name: 'Login Page', access: 'public', showInNavigation: false, component: Login },
  { path: '/register', pageKey: 'register', name: 'Register Page', access: 'public', showInNavigation: false, component: Register },
  { path: '/map', pageKey: 'map', name: 'Interactive Trail Map', access: 'public', showInNavigation: true, component: MapPage },
  { path: '/chat', pageKey: 'chat', name: 'AI Trail Assistant', access: 'public', showInNavigation: false, component: ChatPage },
  { path: '/booking', pageKey: 'booking', name: 'Book a Hike', access: 'public', showInNavigation: true, component: BookingPage },
  { path: '/join-hike', pageKey: 'join-hike', name: 'Group Companion QR Join', access: 'public', showInNavigation: false, component: JoinHikeGuestPage },
  { path: '/join', pageKey: 'join', name: 'Quick Join Shortcut', access: 'public', showInNavigation: false, component: JoinHikeGuestPage },
  { path: '/ops-ai', pageKey: 'ops-ai', name: 'Ops AI Analytics', access: 'roles', allowedRoles: ['admin', 'super_admin', 'ranger', 'guide'], showInNavigation: false, component: OpsAIPage },
  { path: '/admin', pageKey: 'admin', name: 'Admin Dashboard', access: 'roles', allowedRoles: ['admin', 'super_admin'], showInNavigation: true, component: AdminDashboard },
  { path: '/central', pageKey: 'central', name: 'Super Admin Central Dashboard', access: 'roles', allowedRoles: ['super_admin'], showInNavigation: true, component: CentralDashboard },
  { path: '/ranger', pageKey: 'ranger', name: 'Ranger Checkpoint Monitor', access: 'roles', allowedRoles: ['ranger', 'admin', 'super_admin'], showInNavigation: true, component: RangerDashboard },
  { path: '/hiker', pageKey: 'hiker', name: 'Hiker Permit Dashboard', access: 'roles', allowedRoles: ['hiker'], showInNavigation: true, component: HikerDashboard },
  { path: '/guide', pageKey: 'guide', name: 'Guide Duty Dashboard', access: 'roles', allowedRoles: ['guide', 'admin', 'super_admin'], showInNavigation: true, component: GuideDashboard },
  { path: '/guide/:guideId', pageKey: 'guide-profile', name: 'Guide Profile', access: 'public', showInNavigation: false, component: GuideProfilePage },
  { path: '/profile', pageKey: 'profile', name: 'User Profile Settings', access: 'roles', allowedRoles: ALL_ROLES, showInNavigation: false, component: ProfilePage },
  { path: '/dashboard', pageKey: 'dashboard-redirect', name: 'Dashboard Redirect', access: 'public', showInNavigation: false, component: DashboardRedirect },
  { path: '/notifications', pageKey: 'notifications', name: 'Notifications Center', access: 'roles', allowedRoles: ALL_ROLES, showInNavigation: false, component: NotificationsPage },
  { path: '/onboarding', pageKey: 'onboarding', name: 'Hiker Onboarding Flow', access: 'roles', allowedRoles: ALL_ROLES, showInNavigation: false, component: Onboarding },
  { path: '/monitoring', pageKey: 'monitoring', name: 'System Monitoring', access: 'roles', allowedRoles: ['admin', 'super_admin'], showInNavigation: false, component: MonitoringPage },
  { path: '/mdrrmo', pageKey: 'mdrrmo', name: 'MDRRMO Emergency View', access: 'roles', allowedRoles: ['mdrrmo'], showInNavigation: false, component: MDRRMODashboard },
];

export function findAppRoute(path: string) {
  return APP_ROUTES.find((route) => route.path === path);
}
