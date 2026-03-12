import {
    flexRender,
    getCoreRowModel,
    useReactTable,
    type ColumnDef,
    type Row,
    type RowData,
    type TableOptions,
} from "@tanstack/react-table";
import type * as React from "react";

import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type DataTableRowProps = React.HTMLAttributes<HTMLTableRowElement> & {
    [key: `data-${string}`]: string | number | boolean | undefined;
};

export type AppDataTableProps<TData extends RowData> = {
    data: TData[];
    columns: ColumnDef<TData, unknown>[];
    getRowId?: TableOptions<TData>["getRowId"];
    isLoading?: boolean;
    loadingRow?: React.ReactNode;
    emptyRow?: React.ReactNode;
    className?: string;
    headerClassName?: string;
    bodyClassName?: string;
    rowClassName?: string | ((row: Row<TData>) => string);
    getRowProps?: (row: Row<TData>) => DataTableRowProps;
};

export function AppDataTable<TData extends RowData>({
    data,
    columns,
    getRowId,
    isLoading = false,
    loadingRow,
    emptyRow,
    className,
    headerClassName,
    bodyClassName,
    rowClassName,
    getRowProps,
}: AppDataTableProps<TData>) {
    const table = useReactTable({
        data,
        columns,
        getRowId,
        getCoreRowModel: getCoreRowModel(),
    });

    const headerGroups = table.getHeaderGroups();
    const rows = table.getRowModel().rows;
    const leafColumnCount = table.getVisibleLeafColumns().length || 1;

    return (
        <Table className={className}>
            <TableHeader className={headerClassName}>
                {headerGroups.map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                        {headerGroup.headers.map((header) => (
                            <TableHead key={header.id}>
                                {header.isPlaceholder
                                    ? null
                                    : flexRender(header.column.columnDef.header, header.getContext())}
                            </TableHead>
                        ))}
                    </TableRow>
                ))}
            </TableHeader>
            <TableBody className={bodyClassName}>
                {isLoading
                    ? (
                        loadingRow ?? (
                            <TableRow>
                                <TableCell colSpan={leafColumnCount} className="h-24 text-center text-muted-foreground">
                                    Loading...
                                </TableCell>
                            </TableRow>
                        )
                    )
                    : null}
                {!isLoading && rows.length === 0
                    ? (
                        emptyRow ?? (
                            <TableRow>
                                <TableCell colSpan={leafColumnCount} className="h-24 text-center text-muted-foreground">
                                    No results.
                                </TableCell>
                            </TableRow>
                        )
                    )
                    : null}
                {!isLoading && rows.map((row) => {
                    const rowProps = getRowProps?.(row);
                    return (
                        <TableRow
                            key={row.id}
                            {...rowProps}
                            className={cn(
                                typeof rowClassName === "function" ? rowClassName(row) : rowClassName,
                                rowProps?.className,
                            )}
                        >
                            {row.getVisibleCells().map((cell) => (
                                <TableCell key={cell.id}>
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                </TableCell>
                            ))}
                        </TableRow>
                    );
                })}
            </TableBody>
        </Table>
    );
}
