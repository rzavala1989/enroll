'use client';

import { ColumnDef } from '@tanstack/react-table';
import type { CourseListItem, Hold } from '@enroll/shared';

import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';

interface CatalogTableProps {
  courses: CourseListItem[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  enrolledCredits?: number;
  holds?: Hold[];
}

export function CatalogTable({
  courses,
  selectedId,
  onSelect,
  enrolledCredits,
  holds,
}: CatalogTableProps) {
  const columns: ColumnDef<CourseListItem, unknown>[] = [
    {
      id: 'course',
      header: 'Course',
      meta: { className: 'min-w-[200px]' },
      cell: ({ row }) => {
        const c = row.original;
        return (
          <div className="flex flex-col">
            <span className="font-mono text-sm font-semibold text-pine">{c.code}</span>
            <span className="text-sm font-medium text-ink">{c.title}</span>
          </div>
        );
      },
    },
    {
      id: 'requirement',
      header: 'Requirement',
      meta: { className: 'w-32' },
      cell: ({ row }) => {
        const c = row.original;
        // Mock requirement based on department prefix
        const isCore = c.code.includes('1');
        return (
          <div className="flex flex-col">
            <span className="text-xs font-medium text-ink">
              {isCore ? 'Major core' : 'Major elective'}
            </span>
            <span className="text-[10px] text-ink-soft">{c.credits} credits</span>
          </div>
        );
      },
    },
    {
      id: 'fit',
      header: 'Fit',
      meta: { className: 'w-32' },
      cell: ({ row }) => {
        const c = row.original;
        const open = Math.max(c.totalCapacity - c.totalEnrolled, 0);

        if (holds && holds.length > 0) return <Badge tone="full">Hold</Badge>;
        if (enrolledCredits && enrolledCredits + c.credits > 18)
          return <Badge tone="amber">Credit cap risk</Badge>;
        if (open === 0) return <Badge tone="wait">Waitlist open</Badge>;

        return <Badge tone="pine">View details</Badge>;
      },
    },
    {
      id: 'seats',
      header: 'Seats',
      meta: {
        align: 'right',
        className: 'w-24 font-mono text-xs tabular-nums text-ink-soft',
      },
      cell: ({ row }) => {
        const c = row.original;
        const open = Math.max(c.totalCapacity - c.totalEnrolled, 0);
        return `${open} / ${c.totalCapacity}`;
      },
    },
    {
      id: 'best_section',
      header: 'Best section',
      meta: { align: 'right', className: 'w-32 text-xs text-ink-soft' },
      cell: () => 'MWF 9:00-9:50',
    },
    {
      id: 'action',
      header: 'Action',
      meta: { align: 'right', className: 'w-32' },
      cell: () => (
        <span className="group inline-flex h-8 items-center justify-center gap-1.5 rounded-sm border border-pine/20 bg-transparent px-4 text-xs font-medium text-pine transition-colors group-hover:bg-pine-soft">
          Compare
        </span>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={courses}
      onRowClick={onSelect ? (c) => onSelect(c.id) : undefined}
      rowClassName={
        selectedId ? (c) => (c.id === selectedId ? 'bg-pine-soft' : '') : undefined
      }
    />
  );
}
