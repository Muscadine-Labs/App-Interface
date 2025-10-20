import Link from 'next/link';
import { NavItem } from '@/config/navigation';

interface NavLinkProps {
    item: NavItem;
    isActive: boolean;
    isCollapsed: boolean;
}

export function NavLink({ item, isActive, isCollapsed }: NavLinkProps) {
    return (
        <Link 
            href={item.href} 
            className={`flex items-center gap-2 w-full p-2 rounded transition-colors ${
                isCollapsed ? 'justify-center' : 'justify-start'
            } ${
                isActive
                    ? 'bg-[var(--surface-elevated)] text-[var(--foreground)] font-semibold' 
                    : 'hover:bg-[var(--surface-hover)]'
            }`}
        >
            {item.icon}
            {!isCollapsed && <p className="text-xs">{item.label}</p>}
        </Link>
    );
}

