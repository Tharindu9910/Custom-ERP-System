import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table';
import { cn } from '@/shared/lib/utils';

// Simplified column spec used by all list views in this app.
// TanStack Table's ColumnDef is not used directly because it requires
// an explicit `id` when the header is empty or accessor is a function.
export interface TableColumn<TData> {
  header: string;
  id?: string;
  accessor: (row: TData) => React.ReactNode;
}

interface DataTableProps<TData> {
  columns: TableColumn<TData>[];
  data: TData[];
  loading?: boolean;
  emptyMessage?: string;
  className?: string;
  onRowClick?: (row: TData) => void;
}

export function DataTable<TData>({
  columns,
  data,
  loading,
  emptyMessage = 'No results.',
  className,
  onRowClick,
}: DataTableProps<TData>) {
  // Convert simplified column spec to valid TanStack ColumnDefs each render.
  // Columns are always defined inline in callers, so memoizing by identity
  // would never hit anyway. TanStack Table handles new column refs each render.
  const colDefs: ColumnDef<TData, unknown>[] = columns.map((col, idx) => ({
    id: col.id ?? (col.header || `col-${idx}`),
    header: col.header,
    cell: ({ row }) => col.accessor(row.original),
  }));

  const table = useReactTable({
    data,
    columns: colDefs,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className={cn('overflow-hidden rounded-lg border border-gray-200', className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {loading ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-12 text-center text-gray-400"
                >
                  Loading…
                </td>
              </tr>
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-12 text-center text-gray-400"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(
                    'hover:bg-gray-50',
                    onRowClick && 'cursor-pointer',
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 text-gray-900">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}