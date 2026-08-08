'use client';

import Link from 'next/link';
import { ColumnDef } from '@tanstack/react-table';
import { EnrollmentStatus, type MyEnrollment } from '@enroll/shared';

import { DataTable } from '@/components/ui/data-table';
import { Badge, type BadgeTone } from '@/components/ui/badge';

const statusTone: Record<EnrollmentStatus, BadgeTone> = {
  [EnrollmentStatus.ENROLLED]: 'open',
  [EnrollmentStatus.WAITLISTED]: 'wait',
  [EnrollmentStatus.DROPPED]: 'neutral',
  [EnrollmentStatus.COMPLETED]: 'pine',
};

interface ScheduleTableProps {
  enrollments: MyEnrollment[];
}

export function CurrentScheduleTable({ enrollments }: ScheduleTableProps) {
  const columns: ColumnDef<MyEnrollment, unknown>[] = [
    {
      id: 'status',
      header: 'Status',
      meta: { className: 'w-32 whitespace-nowrap' },
      cell: ({ row }) => {
        const e = row.original;
        return (
          <div className="flex items-center">
            <Badge tone={statusTone[e.status]}>{e.status}</Badge>
            {e.status === EnrollmentStatus.WAITLISTED && e.waitlistPosition != null && (
              <span className="ml-2 text-xs font-semibold text-wait">
                #{e.waitlistPosition}
              </span>
            )}
          </div>
        );
      },
    },
    {
      id: 'course',
      header: 'Course',
      meta: { className: 'min-w-[200px]' },
      cell: ({ row }) => {
        const e = row.original;
        return (
          <Link href={`/courses/${e.course.id}`} className="hover:underline">
            <span className="font-mono font-semibold text-pine">{e.course.code}</span>{' '}
            <span className="text-ink">{e.course.title}</span>
          </Link>
        );
      },
    },
    {
      accessorKey: 'course.credits',
      header: 'Credits',
      meta: {
        align: 'right',
        className: 'w-24 font-mono text-ink-soft whitespace-nowrap',
      },
    },
    {
      accessorKey: 'section.meetingPattern',
      header: 'Schedule',
      meta: { className: 'whitespace-nowrap' },
    },
    {
      accessorKey: 'section.room',
      header: 'Room',
      meta: { className: 'whitespace-nowrap text-ink-soft' },
    },
    {
      accessorKey: 'section.instructorName',
      header: 'Instructor',
      meta: { className: 'whitespace-nowrap' },
    },
  ];

  return <DataTable columns={columns} data={enrollments} />;
}

export function CompletedCoursesTable({ enrollments }: ScheduleTableProps) {
  const columns: ColumnDef<MyEnrollment, unknown>[] = [
    {
      id: 'course',
      header: 'Course',
      meta: { className: 'min-w-[200px]' },
      cell: ({ row }) => {
        const e = row.original;
        return (
          <>
            <span className="font-mono font-semibold text-pine">{e.course.code}</span>{' '}
            <span className="text-ink">{e.course.title}</span>
          </>
        );
      },
    },
    {
      accessorKey: 'course.credits',
      header: 'Credits',
      meta: {
        align: 'right',
        className: 'w-24 font-mono text-ink-soft whitespace-nowrap',
      },
    },
    {
      accessorKey: 'section.sectionNumber',
      header: 'Section',
      meta: { className: 'w-24 font-mono text-ink-soft whitespace-nowrap' },
    },
    {
      accessorKey: 'section.instructorName',
      header: 'Instructor',
      meta: { className: 'whitespace-nowrap text-ink-soft' },
    },
  ];

  return <DataTable columns={columns} data={enrollments} />;
}
