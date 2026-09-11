import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight } from 'lucide-react';

export interface WorkspaceNavItem { id: string; label: string; icon: LucideIcon; count?: number; }

export function WorkspaceNavigation({ role, items, active, onSelect, footer }: {
  role: 'Host' | 'Admin'; items: WorkspaceNavItem[]; active: string;
  onSelect: (id: string) => void; footer?: React.ReactNode;
}) {
  return (
    <aside className="workspace-navigation">
      <div className="workspace-brand"><span className="workspace-monogram">e</span><div><strong>encho<span className="text-cyan-300">.</span></strong><span>{role} workspace</span></div></div>
      <nav aria-label={`${role} workspace`} className="workspace-links">
        {items.map(({ id, label, icon: Icon, count }) => (
          <button key={id} type="button" onClick={() => onSelect(id)} aria-current={active === id ? 'page' : undefined}>
            <Icon size={19} aria-hidden="true" /><span>{label}</span>
            {typeof count === 'number' && count > 0 && <span className="workspace-count">{count}</span>}
          </button>
        ))}
      </nav>
      {footer && <div className="workspace-footer">{footer}<ArrowUpRight size={16} aria-hidden="true" /></div>}
    </aside>
  );
}
