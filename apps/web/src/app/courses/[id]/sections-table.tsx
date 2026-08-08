'use client';

import Link from 'next/link';
import { ColumnDef } from '@tanstack/react-table';
import type { Section } from '@enroll/shared';

import { DataTable } from '@/components/ui/data-table';
import { SeatMeter } from '@/components/ui/seat-meter';
import { seatStatus } from '@/lib/seat-status';
import { EnrollButton } from './enroll-button';

interface SectionsTableProps {
  sections: Section[];
  courseCode: string;
  isStudent: boolean;
  isStaff: boolean;
}

export function SectionsTable({
  sections,
  courseCode,
  isStudent,
  isStaff,
}: SectionsTableProps) {
  const columns: ColumnDef<Section, unknown>[] = [
    {
      accessorKey: 'sectionNumber',
      header: 'Section',
      meta: { className: 'whitespace-nowrap font-mono font-semibold text-pine w-24' },
    },
    {
      accessorKey: 'instructorName',
      header: 'Instructor',
      meta: { className: 'whitespace-nowrap' },
    },
    {
      accessorKey: 'meetingPattern',
      header: 'Meets',
      meta: { className: 'whitespace-nowrap' },
    },
    {
      accessorKey: 'room',
      header: 'Room',
      meta: { className: 'whitespace-nowrap w-32' },
    },
    {
      id: 'seats',
      header: 'Seats',
      meta: { align: 'right', className: 'w-36' },
      cell: ({ row }) => {
        const s = row.original;
        return (
          <SeatMeter
            enrolled={s.capacity - s.seatsAvailable}
            capacity={s.capacity}
            waitlistCount={s.waitlistCount}
          />
        );
      },
    },
    {
      id: 'action',
      header: 'Action',
      meta: { align: 'right', className: 'w-36' },
      cell: ({ row }) => {
        const s = row.original;
        const status = seatStatus(s.seatsAvailable, s.capacity);
        return (
          <div className="flex items-center justify-end gap-3">
            {isStaff && (
              <Link
                href={`/sections/${s.id}/waitlist?course=${encodeURIComponent(
                  courseCode,
                )}&section=${encodeURIComponent(s.sectionNumber)}`}
                className="text-sm font-medium text-pine hover:underline"
              >
                Waitlist
              </Link>
            )}
            {isStudent && (
              <EnrollButton
                sectionId={s.id}
                full={status === 'full'}
                waitlistFull={
                  status === 'full' &&
                  s.waitlistCap != null &&
                  s.waitlistCount >= s.waitlistCap
                }
                viewerEnrollment={s.viewerEnrollment}
              />
            )}
          </div>
        );
      },
    },
  ];

  return <DataTable columns={columns} data={sections} />;
}
