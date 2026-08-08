'use client';

import Link from 'next/link';
import { ColumnDef } from '@tanstack/react-table';
import type { CourseListItem } from '@enroll/shared';

import { DataTable } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { SeatMeter } from '@/components/ui/seat-meter';
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
}

export function CatalogTable({ courses }: CatalogTableProps) {
  const columns: ColumnDef<CourseListItem, unknown>[] = [
    {
      accessorKey: 'code',
      header: 'Code',
      meta: {
        className: 'w-24 font-mono text-sm font-semibold text-pine whitespace-nowrap',
      },
    },
    {
      accessorKey: 'title',
      header: 'Course Title',
      meta: { className: 'min-w-[200px] text-sm font-medium' },
    },
    {
      accessorKey: 'credits',
      header: 'Credits',
      meta: {
        align: 'right',
        className: 'w-20 font-mono text-xs tabular-nums text-ink-soft whitespace-nowrap',
      },
      cell: ({ row }) => `${row.original.credits} cr`,
    },
    {
      accessorKey: 'sectionCount',
      header: 'Sections',
      meta: { align: 'right', className: 'w-24 text-xs text-ink-soft whitespace-nowrap' },
      cell: ({ row }) => {
        const count = row.original.sectionCount;
        return `${count} ${count === 1 ? 'sec' : 'secs'}`;
      },
    },
    {
      id: 'seats',
      header: 'Capacity',
      meta: { align: 'right', className: 'w-32' },
      cell: ({ row }) => {
        const c = row.original;
        return <SeatMeter enrolled={c.totalEnrolled} capacity={c.totalCapacity} />;
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
      meta: { align: 'right', className: 'w-24' },
      cell: ({ row }) => (
        <Link
          href={`/courses/${row.original.id}`}
          className="inline-flex h-8 items-center justify-center rounded-sm border border-pine bg-pine px-3 text-xs font-medium text-paper transition-colors hover:bg-pine-dark"
        >
          View
        </Link>
      ),
    },
  ];

  return <DataTable columns={columns} data={courses} />;
}
