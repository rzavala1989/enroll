'use client';

import { ColumnDef } from '@tanstack/react-table';
import type { CourseListItem } from '@enroll/shared';

import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { seatStatus } from '@/lib/seat-status';

const statusLabel = {
  open: 'Open',
  'nearly-full': 'Filling',
  full: 'Full',
} as const;

const statusTone = {
  open: 'open',
  'nearly-full': 'amber',
  full: 'full',
} as const;

interface CatalogTableProps {
  courses: CourseListItem[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}

export function CatalogTable({ courses, selectedId, onSelect }: CatalogTableProps) {
  const columns: ColumnDef<CourseListItem, unknown>[] = [
    {
      id: 'course',
      header: 'Course',
      meta: { className: 'min-w-[300px]' },
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
      accessorKey: 'credits',
      header: 'Credits',
      meta: {
        align: 'right',
        className: 'w-24 font-mono text-xs tabular-nums text-ink-soft',
      },
      cell: ({ row }) => `${row.original.credits} cr`,
    },
    {
      id: 'availability',
      header: 'Availability',
      meta: { align: 'right', className: 'w-48' },
      cell: ({ row }) => {
        const c = row.original;
        const open = Math.max(c.totalCapacity - c.totalEnrolled, 0);
        return (
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs font-medium text-ink">
              {open > 0 ? `${open} seats open` : 'Full / Waitlisting'}
            </span>
            <span className="text-[10px] text-ink-soft">
              across {c.sectionCount} section{c.sectionCount === 1 ? '' : 's'}
            </span>
          </div>
        );
      },
    },
    {
      id: 'status',
      header: 'Status',
      meta: { align: 'right', className: 'w-28' },
      cell: ({ row }) => {
        const c = row.original;
        const open = Math.max(c.totalCapacity - c.totalEnrolled, 0);
        const status = seatStatus(open, c.totalCapacity);
        return <Badge tone={statusTone[status]}>{statusLabel[status]}</Badge>;
      },
    },
    {
      id: 'action',
      header: '',
      meta: { align: 'right', className: 'w-32' },
      cell: () => (
        <span className="group inline-flex h-8 items-center justify-center gap-1.5 rounded-sm border border-pine/20 bg-transparent px-4 text-xs font-medium text-pine transition-colors group-hover:bg-pine-soft">
          Select
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
