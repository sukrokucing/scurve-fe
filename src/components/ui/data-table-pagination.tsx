import {
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
} from "lucide-react";
import type { Table as TanStackTable } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";

type DataTablePaginationBaseProps = {
    totalItems: number;
    pageSizeOptions?: number[];
    testIdPrefix?: string;
};

type DataTablePaginationStateProps = DataTablePaginationBaseProps & {
    currentPage: number;
    totalPages: number;
    pageSize: number;
    setPage: (page: number) => void;
    setPageSize: (pageSize: number) => void;
    table?: never;
};

type DataTablePaginationTableProps<TData> = DataTablePaginationBaseProps & {
    table: TanStackTable<TData>;
    currentPage?: never;
    totalPages?: never;
    pageSize?: never;
    setPage?: never;
    setPageSize?: never;
};

type DataTablePaginationProps<TData = unknown> =
    | DataTablePaginationStateProps
    | DataTablePaginationTableProps<TData>;

export function DataTablePagination<TData>(props: DataTablePaginationProps<TData>) {
    const pageSizeOptions = props.pageSizeOptions ?? [10, 20, 30, 40, 50];
    const sizeOptions = [
        ...pageSizeOptions.map((size) => ({ value: `${size}`, label: `${size}` })),
        ...(props.totalItems > 0 && !pageSizeOptions.includes(props.totalItems)
            ? [{ value: `${props.totalItems}`, label: "All" }]
            : []),
    ];
    const currentPage = props.table ? props.table.getState().pagination.pageIndex + 1 : props.currentPage;
    const pageSize = props.table ? props.table.getState().pagination.pageSize : props.pageSize;
    const totalPages = props.table ? props.table.getPageCount() : props.totalPages;

    const setPage = (page: number) => {
        if (props.table) {
            props.table.setPageIndex(Math.max(0, page - 1));
            return;
        }
        props.setPage(page);
    };

    const setPageSize = (nextPageSize: number) => {
        if (props.table) {
            props.table.setPageSize(nextPageSize);
            props.table.setPageIndex(0);
            return;
        }
        props.setPageSize(nextPageSize);
        props.setPage(1);
    };

    return (
        <div className="flex items-center justify-between px-2 py-4">
            <div className="flex-1 text-sm text-muted-foreground">
                {props.totalItems} total items
            </div>
            <div className="flex items-center space-x-6 lg:space-x-8">
                <div className="flex items-center space-x-2">
                    <p className="text-sm font-medium">Rows per page</p>
                    <Combobox
                        value={`${pageSize}`}
                        onChange={(value) => setPageSize(Number(value))}
                        className="h-11 min-h-11 w-[112px]"
                        placeholder={`${pageSize}`}
                        options={sizeOptions}
                        triggerTestId={props.testIdPrefix ? `${props.testIdPrefix}-page-size-combobox` : undefined}
                    />
                </div>
                <div
                    className="flex w-[100px] items-center justify-center text-sm font-medium"
                    data-testid={props.testIdPrefix ? `${props.testIdPrefix}-page-indicator` : undefined}
                >
                    Page {currentPage} of {totalPages}
                </div>
                <div className="flex items-center space-x-2">
                    <Button
                        variant="outline"
                        size="icon"
                        className="hidden lg:inline-flex"
                        onClick={() => setPage(1)}
                        disabled={currentPage === 1}
                        data-testid={props.testIdPrefix ? `${props.testIdPrefix}-first-button` : undefined}
                    >
                        <span className="sr-only">Go to first page</span>
                        <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        data-testid={props.testIdPrefix ? `${props.testIdPrefix}-prev-button` : undefined}
                    >
                        <span className="sr-only">Go to previous page</span>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setPage(currentPage + 1)}
                        disabled={currentPage === totalPages}
                        data-testid={props.testIdPrefix ? `${props.testIdPrefix}-next-button` : undefined}
                    >
                        <span className="sr-only">Go to next page</span>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        className="hidden lg:inline-flex"
                        onClick={() => setPage(totalPages)}
                        disabled={currentPage === totalPages}
                        data-testid={props.testIdPrefix ? `${props.testIdPrefix}-last-button` : undefined}
                    >
                        <span className="sr-only">Go to last page</span>
                        <ChevronsRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
