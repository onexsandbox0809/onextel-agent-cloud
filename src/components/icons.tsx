'use client';
import type { SVGProps } from 'react';

const Icon = ({ children, ...p }: SVGProps<SVGSVGElement>) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
       strokeLinecap="round" strokeLinejoin="round" {...p}>{children}</svg>
);
export const IconGrid = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></Icon>;
export const IconBot = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 3v4M9 13h.01M15 13h.01M9 16.5c1 .7 5 .7 6 0"/></Icon>;
export const IconPhone = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M6.5 3h3l2 5-2.5 1.5a12 12 0 005.5 5.5L16 12.5l5 2v3a2 2 0 01-2.2 2A17 17 0 013.8 5.2 2 2 0 016.5 3z"/></Icon>;
export const IconInbox = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M3 12h5l1.5 3h5L16 12h5"/><path d="M5 4h14l2 8v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6l2-8z"/></Icon>;
export const IconChart = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></Icon>;
export const IconUsers = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><circle cx="9" cy="8" r="3.2"/><path d="M2.5 20a6.5 6.5 0 0113 0M17 5.2a3.2 3.2 0 010 6M18 14.2a6 6 0 013.5 5.8"/></Icon>;
export const IconSettings = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2v.2a2 2 0 11-4 0v-.2A1.7 1.7 0 006.9 19l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 004 13.4H3.8a2 2 0 110-4H4a1.7 1.7 0 001.2-2.9L5 6.4a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 0011 3.9V3.8a2 2 0 114 0v.1A1.7 1.7 0 0018 5l.1-.1a2 2 0 112.8 2.8l-.1.1A1.7 1.7 0 0020 11h.2a2 2 0 110 4H20a1.7 1.7 0 00-1.6 1z"/></Icon>;
export const IconShield = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z"/><path d="M9.5 12l1.8 1.8 3.5-3.5"/></Icon>;
export const IconPlus = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M12 5v14M5 12h14"/></Icon>;
export const IconSearch = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><circle cx="11" cy="11" r="7"/><path d="M16.5 16.5L21 21"/></Icon>;
export const IconBell = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M18 8a6 6 0 10-12 0c0 6-3 7-3 7h18s-3-1-3-7M10.5 21a2 2 0 003 0"/></Icon>;
export const IconChevron = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M9 6l6 6-6 6"/></Icon>;
export const IconCheck = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M5 12.5l4.5 4.5L19 7"/></Icon>;
export const IconX = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M6 6l12 12M18 6L6 18"/></Icon>;
export const IconBolt = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M13 2L4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5z"/></Icon>;
export const IconPlug = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M9 3v6M15 3v6M7 9h10v3a5 5 0 01-10 0V9zM12 17v4"/></Icon>;
export const IconBook = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M4 5a2 2 0 012-2h13v18H6a2 2 0 01-2-2V5z"/><path d="M8 7h7M8 11h7"/></Icon>;
export const IconFlask = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M9 3h6M10 3v6l-5.5 9A2 2 0 006.2 21h11.6a2 2 0 001.7-3L14 9V3"/><path d="M7.5 15h9"/></Icon>;
export const IconRocket = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M5 15l-2 6 6-2M9 19c-1.5-.5-3-2-4-4 0-6 5-11 15-12-1 10-6 15-11 16z"/><circle cx="14.5" cy="9.5" r="1.6"/></Icon>;
export const IconLayers = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5"/></Icon>;
export const IconBuilding = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M10 21v-3h4v3"/></Icon>;
export const IconKey = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><circle cx="8" cy="8" r="4.2"/><path d="M11 11l9 9M17 17l2-2M14 14l2-2"/></Icon>;
export const IconRefresh = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M21 12a9 9 0 11-3-6.7M21 3v5h-5"/></Icon>;
export const IconSend = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M4 12l17-8-8 17-2-7-7-2z"/></Icon>;
export const IconLogout = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></Icon>;
export const IconDot = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none"/></Icon>;
export const IconHome = IconGrid;
export const IconTrash = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></Icon>;

export const IconSun = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></Icon>;
export const IconMoon = (p: SVGProps<SVGSVGElement>) => <Icon {...p}><path d="M20 14.5A8.5 8.5 0 019.5 4 8.5 8.5 0 1020 14.5z"/></Icon>;
