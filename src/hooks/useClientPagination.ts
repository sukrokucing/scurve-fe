import { useEffect, useMemo, useState } from "react";

type UseClientPaginationOptions = {
    initialPageSize?: number;
};

export function useClientPagination<T>(
    items: T[],
    options?: UseClientPaginationOptions,
) {
    const initialPageSize = options?.initialPageSize ?? 10;
    const [page, setPage] = useState(1);
    const [pageSize, setPageSizeState] = useState(initialPageSize);

    useEffect(() => {
        setPage(1);
    }, [pageSize]);

    const totalItems = items.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    useEffect(() => {
        setPage((currentPage) => Math.min(currentPage, totalPages));
    }, [totalPages]);

    const pageItems = useMemo(() => {
        const start = (page - 1) * pageSize;
        return items.slice(start, start + pageSize);
    }, [items, page, pageSize]);

    const setPageSize = (nextPageSize: number) => {
        setPageSizeState(nextPageSize);
    };

    return {
        page,
        setPage,
        pageSize,
        setPageSize,
        totalItems,
        totalPages,
        pageItems,
    };
}
