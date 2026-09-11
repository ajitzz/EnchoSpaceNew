import React from 'react';
import { BarChart3 } from 'lucide-react';

export function PerformanceEmptyState({ title, description }: { title: string; description?: string }) {
  return <section className="workspace-panel p-6" aria-label={title}>
    <h3 className="text-base font-semibold flex gap-2 items-center"><BarChart3 size={19} aria-hidden="true" />{title}</h3>
    <p className="text-sm text-slate-600 mt-3 leading-relaxed">{description || 'No measured breakdown is available yet. This section will show network-reported observations when they are collected.'}</p>
  </section>;
}
