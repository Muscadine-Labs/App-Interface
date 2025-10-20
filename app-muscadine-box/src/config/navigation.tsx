/**
 * Navigation Configuration
 * 
 * This file contains the main navigation items for the application.
 * To add a new navigation item, simply add a new object to the navigationItems array.
 * 
 * NavItem Properties:
 * - id: Unique identifier for the navigation item
 * - label: Display text for the navigation item
 * - href: The route/URL to navigate to
 * - icon: React component or JSX for the icon
 * - matchPattern: How to determine if this route is active
 *   - 'exact': Only matches the exact path (e.g., '/' matches only '/')
 *   - 'startsWith': Matches if current path starts with href (e.g., '/vaults' matches '/vaults/123')
 * 
 * Example:
 * {
 *   id: 'analytics',
 *   label: 'Analytics',
 *   href: '/analytics',
 *   matchPattern: 'startsWith',
 *   icon: <AnalyticsIcon />
 * }
 */

import React from 'react';

export interface NavItem {
    id: string;
    label: string;
    href: string;
    icon: React.ReactNode;
    matchPattern?: 'exact' | 'startsWith';
}

export const navigationItems: NavItem[] = [
    {
        id: 'home',
        label: 'Home',
        href: '/',
        matchPattern: 'exact',
        icon: (
            <svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 24 24" 
                className="w-4 h-4"
                fill="currentColor"
            >
                <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
            </svg>
        )
    },
    {
        id: 'vaults',
        label: 'Vaults',
        href: '/vaults',
        matchPattern: 'startsWith',
        icon: (
            <svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 24 24" 
                className="w-4 h-4" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
            >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <rect x="7" y="8" width="10" height="8" rx="1" ry="1"/>
                <path d="M12 8v8"/>
                <path d="M8 12h8"/>
            </svg>
        )
    },
    {
        id: 'learn',
        label: 'Learn',
        href: '/learn',
        matchPattern: 'startsWith',
        icon: (
            <svg 
                xmlns="http://www.w3.org/2000/svg" 
                viewBox="0 0 24 24" 
                className="w-4 h-4" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
            >
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
        )
    }
];

