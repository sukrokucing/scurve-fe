import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { Link } from "react-router-dom";
import { Users, Search, ShieldCheck, Mail, Calendar, ArrowRight, Loader2, UserRoundSearch, KeyRound } from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppDataTable } from "@/components/ui/app-data-table";
import { DataTablePagination } from "@/components/ui/data-table-pagination";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

import { useUsersListQuery } from "@/api/queries/users";
import { API_SEARCH_QUERY_MAX_LENGTH, normalizeApiSearchQuery } from "@/lib/apiSearch";
import type { User } from "@/api/users";

type UserRow = User;
const userColumnHelper = createColumnHelper<UserRow>();

export const UsersPage = () => {
    const [searchInput, setSearchInput] = useState("");
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const debouncedSearchInput = useDebouncedValue(searchInput, 300);
    const deferredSearchInput = useDeferredValue(debouncedSearchInput);
    const searchQuery = useMemo(() => normalizeApiSearchQuery(deferredSearchInput), [deferredSearchInput]);

    useEffect(() => {
        setPage(1);
    }, [searchQuery]);

    const { data, isLoading } = useUsersListQuery({
        q: searchQuery || undefined,
        page,
        per_page: pageSize,
    });

    const users = data?.users ?? [];
    const totalUsers = data?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize));
    const columns = useMemo<ColumnDef<UserRow, unknown>[]>(() => ([
        userColumnHelper.display({
            id: "user",
            header: "User",
            cell: (info) => {
                const user = info.row.original;
                return (
                    <div className="flex items-center gap-3">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold">
                            {user.name.substring(0, 2).toUpperCase()}
                        </div>
                        <span className="font-medium">{user.name}</span>
                    </div>
                );
            },
        }),
        userColumnHelper.accessor("email", {
            header: "Email",
            cell: (info) => (
                <div className="flex items-center gap-2 text-muted-foreground">
                    <Mail className="h-3 w-3" />
                    {info.getValue()}
                </div>
            ),
        }),
        userColumnHelper.accessor("provider", {
            header: "Provider",
            cell: (info) => (
                <Badge variant="outline" className="capitalize">
                    {info.getValue()}
                </Badge>
            ),
        }),
        userColumnHelper.accessor("created_at", {
            header: "Joined",
            cell: (info) => (
                <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Calendar className="h-3 w-3" />
                    {format(new Date(info.getValue()), "MMM d, yyyy")}
                </div>
            ),
        }),
        userColumnHelper.display({
            id: "actions",
            header: () => <div className="text-right">Actions</div>,
            cell: (info) => (
                <div className="text-right">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="hover:text-primary"
                        asChild
                        data-testid="users-row-manage-access-link"
                    >
                        <Link
                            to={`/settings/users/${info.row.original.id}`}
                            data-testid="users-row-manage-access-link"
                        >
                            <ShieldCheck className="mr-2 h-4 w-4" />
                            Manage Access
                            <ArrowRight className="ml-2 h-3 w-3" />
                        </Link>
                    </Button>
                </div>
            ),
        }),
    ]), []);

    return (
        <div className="space-y-8" data-testid="users-page">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div>
                    <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
                        <Users className="h-6 w-6 text-primary" />
                        User Management
                    </h1>
                    <p className="max-w-3xl text-muted-foreground">
                        Search people quickly, confirm identity at a glance, and move into access management only when you need to change permissions.
                    </p>
                </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
                <Card className="border-border/70 shadow-sm" data-testid="users-page-intro-card">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Start with the user, then manage access</CardTitle>
                        <CardDescription>
                            This page works best when support or admins need to identify the right person first, then branch into access details only when necessary.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-center gap-2 pt-0 text-xs text-muted-foreground">
                        <Badge variant="outline">
                            <UserRoundSearch className="mr-1 h-3 w-3" />
                            Search by name or email
                        </Badge>
                        <Badge variant="outline">
                            <KeyRound className="mr-1 h-3 w-3" />
                            Open access only when needed
                        </Badge>
                    </CardContent>
                </Card>

                <Card className="border-border/70 shadow-sm" data-testid="users-page-scope-card">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base">Current scope</CardTitle>
                        <CardDescription>
                            Keep the list narrow when you know who you are looking for. Leaving search blank keeps the full workspace roster visible.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-center gap-2 pt-0 text-xs text-muted-foreground">
                        <Badge variant="outline">{data?.total ?? 0} total user{(data?.total ?? 0) === 1 ? "" : "s"}</Badge>
                        {searchQuery ? <Badge variant="outline">Search active</Badge> : <Badge variant="outline">Full roster</Badge>}
                        {searchQuery ? (
                            <Badge variant="secondary">{users.length} shown</Badge>
                        ) : null}
                    </CardContent>
                </Card>
            </div>

            <Card className="border-border/70 shadow-sm" data-testid="users-page-table-card">
                <CardHeader>
                    <CardTitle>All Users</CardTitle>
                    <CardDescription>
                        Review the current roster first. The access action stays in the trailing area so identity information stays easier to scan.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-0">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                        <div className="space-y-2">
                            <div className="max-w-sm">
                                <label htmlFor="users-search-input" className="mb-1 block text-xs font-medium text-muted-foreground">
                                    Search users
                                </label>
                                <div className="relative">
                                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        id="users-search-input"
                                        placeholder="Search by name or email..."
                                        value={searchInput}
                                        onChange={(e) => setSearchInput(e.target.value)}
                                        maxLength={API_SEARCH_QUERY_MAX_LENGTH}
                                        className="pl-8"
                                        data-testid="users-search-input"
                                    />
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground" data-testid="users-filter-summary">
                                {searchQuery ? (
                                    <>
                                        <Badge variant="outline">Search: {searchQuery}</Badge>
                                        <Badge variant="outline">{users.length} match(es)</Badge>
                                        <span>Filtering user name and email.</span>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 px-2"
                                            onClick={() => setSearchInput("")}
                                            data-testid="users-clear-search-button"
                                        >
                                            Clear search
                                        </Button>
                                    </>
                                ) : (
                                    <span>Search filters users by name and email.</span>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline">{users.length} on this page</Badge>
                            <Badge variant="outline">{totalUsers} total</Badge>
                            <Badge variant="outline">Access actions stay on the right</Badge>
                        </div>
                    </div>
                    <div className="rounded-md border">
                        <AppDataTable
                            data={users}
                            columns={columns}
                            getRowId={(row) => row.id}
                            isLoading={isLoading}
                            loadingRow={(
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center">
                                        <div className="flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                                    </TableCell>
                                </TableRow>
                            )}
                            emptyRow={(
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                        No users found.
                                    </TableCell>
                                </TableRow>
                            )}
                        />
                        <DataTablePagination
                            currentPage={page}
                            totalPages={totalPages}
                            pageSize={pageSize}
                            setPage={setPage}
                            setPageSize={setPageSize}
                            totalItems={totalUsers}
                        />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
