'use client';

import { useState } from 'react';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';

import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { cn } from '@/lib/cn';

interface CustomMeta {
  align?: 'left' | 'center' | 'right';
  className?: string;
  headerClassName?: string;
  cellClassName?: string;
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchKey?: string;
  searchPlaceholder?: string;
  onRowClick?: (row: TData) => void;
  rowClassName?: (row: TData) => string;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  searchKey,
  searchPlaceholder = 'Search...',
  onRowClick,
  rowClassName,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    state: {
      sorting,
      globalFilter,
    },
  });

  return (
    <div className="space-y-4">
      {searchKey && (
        <div className="flex items-center">
          <input
            placeholder={searchPlaceholder}
            value={
              (table.getColumn(searchKey)?.getFilterValue() as string) ??
              globalFilter ??
              ''
            }
            onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
              if (searchKey) {
                table.getColumn(searchKey)?.setFilterValue(event.target.value);
              } else {
                setGlobalFilter(event.target.value);
              }
            }}
            className="flex h-9 w-full max-w-sm rounded-sm border border-line bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-ink-soft/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-pine"
          />
        </div>
      )}
      <div className="rounded-sm border border-line bg-card overflow-hidden">
        <Table>
          <THead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr
                key={headerGroup.id}
                className="border-b border-line bg-paper text-xs uppercase tracking-wide text-ink-soft"
              >
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as CustomMeta | undefined;
                  const align = meta?.align ?? 'left';
                  const alignClass =
                    align === 'right'
                      ? 'justify-end'
                      : align === 'center'
                        ? 'justify-center'
                        : 'justify-start';
                  const headerClassName = meta?.headerClassName ?? meta?.className ?? '';

                  return (
                    <TH
                      key={header.id}
                      className={cn(
                        header.column.getCanSort()
                          ? 'cursor-pointer select-none hover:text-pine'
                          : '',
                        headerClassName,
                      )}
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      <div className={cn('flex items-center gap-1', alignClass)}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                        {{
                          asc: ' ↑',
                          desc: ' ↓',
                        }[header.column.getIsSorted() as string] ?? null}
                      </div>
                    </TH>
                  );
                })}
              </tr>
            ))}
          </THead>
          <TBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TR
                  key={row.id}
                  className={cn(
                    rowClassName?.(row.original) ?? '',
                    onRowClick ? 'cursor-pointer transition-colors hover:bg-black/5' : '',
                  )}
                  onClick={() => onRowClick?.(row.original)}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as CustomMeta | undefined;
                    const align = meta?.align ?? 'left';
                    const textClass =
                      align === 'right'
                        ? 'text-right'
                        : align === 'center'
                          ? 'text-center'
                          : 'text-left';
                    const cellClassName = meta?.cellClassName ?? meta?.className ?? '';

                    return (
                      <TD key={cell.id} className={cn(textClass, cellClassName)}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TD>
                    );
                  })}
                </TR>
              ))
            ) : (
              <TR>
                <TD colSpan={columns.length} className="h-24 text-center">
                  No results.
                </TD>
              </TR>
            )}
          </TBody>
        </Table>
      </div>
      {table.getPageCount() > 1 && (
        <div className="flex items-center justify-end space-x-2 py-4">
          <button
            className="inline-flex h-8 items-center justify-center rounded-sm bg-card px-3 text-xs font-medium text-ink transition-colors hover:bg-paper disabled:pointer-events-none disabled:opacity-50"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </button>
          <span className="text-xs text-ink-soft tabular-nums">
            Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
          </span>
          <button
            className="inline-flex h-8 items-center justify-center rounded-sm bg-card px-3 text-xs font-medium text-ink transition-colors hover:bg-paper disabled:pointer-events-none disabled:opacity-50"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
