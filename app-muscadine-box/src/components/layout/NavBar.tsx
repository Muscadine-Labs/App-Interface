'use client';

import React, { useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { NavLink } from "./NavLink";
import { VaultsDropdown } from "./VaultsDropdown";
import { navigationItems, NavItem } from "@/config/navigation";
import { ConnectButton } from "../features/wallet";
import { useTab } from "@/contexts/TabContext";
import { Icon } from "../ui/Icon";

interface NavBarProps {
    isRightSidebarCollapsed?: boolean;
    onToggleSidebar?: () => void;
}

export function NavBar({ isRightSidebarCollapsed, onToggleSidebar }: NavBarProps) {
    const { activeTab, setActiveTab } = useTab();
    const router = useRouter();
    const pathname = usePathname();

    const isActive = useCallback((item: NavItem): boolean => {
        // Vaults dropdown is active if we're on a vault page
        if (item.id === 'vaults') {
            return pathname?.startsWith('/vaults/') || false;
        }
        // Dashboard is active if we're on the home page
        if (item.id === 'dashboard') {
            return pathname === '/';
        }
        // Learn is active if we're on the learn page (or use activeTab as fallback)
        if (item.id === 'learn') {
            return pathname?.startsWith('/learn') || item.id === activeTab;
        }
        // Fallback to activeTab for other items
        return item.id === activeTab;
    }, [activeTab, pathname]);

    const handleNavClick = useCallback((item: NavItem) => {
        // Skip handling for vaults dropdown (it handles its own navigation)
        if (item.id === 'vaults') {
            return;
        }
        // If clicking dashboard and we're on a vault detail page, navigate to home
        if (item.id === 'dashboard' && pathname?.startsWith('/vaults/')) {
            router.push('/');
        }
        // Set the active tab
        setActiveTab(item.id as 'dashboard' | 'learn');
    }, [setActiveTab, router, pathname]);

    return (
        <div 
            id="navbar" 
            className="flex flex-row fixed top-0 left-0 w-full bg-[var(--background-muted)] py-4 transition-all duration-300 border-b border-[var(--border)] h-[var(--navbar-height)] px-4"
        >
            {/* Header with ConnectButton */}
            <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-4">
                    {/* Logo/Brand with Link */}
                    <Link 
                        href="https://muscadine.io" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 "
                    >
                        <Image
                            src="/favicon.png"
                            alt="Muscadine Logo"
                            width={32}
                            height={32}
                            className="w-8 h-8 rounded-full"
                        />
                        <div className="text-xl text-[var(--foreground)] font-funnel">
                            Muscadine
                        </div>
                    </Link>
                    
                    {/* Navigation Items */}
                    <nav className="flex items-center gap-2" role="navigation" aria-label="Main navigation">
                        {navigationItems.map((item) => (
                            <div key={item.id} onClick={(e) => e.stopPropagation()}>
                                {item.id === 'vaults' ? (
                                    <VaultsDropdown isActive={isActive(item)} />
                                ) : (
                                    <NavLink 
                                        item={item}
                                        isActive={isActive(item)}
                                        onClick={() => handleNavClick(item)}
                                    />
                                )}
                            </div>
                        ))}
                    </nav>
                </div>

                {/* Right side: Connect Button and Sidebar Toggle */}
                <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                    <ConnectButton />
                    {onToggleSidebar && (
                        <button
                            onClick={onToggleSidebar}
                            className="w-12 h-8 hover:bg-[var(--surface-hover)] rounded transition-colors flex items-center justify-center group"
                            aria-label={isRightSidebarCollapsed ? 'Open sidebar' : 'Close sidebar'}
                        >
                            <Icon 
                                name="sidebar"
                                size="lg" 
                                color="secondary"
                                className="transition-all duration-200"
                            />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}