import { useDeferredValue, useMemo, useState } from "react";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { Link } from "react-router-dom";
import { Users, Search, ShieldCheck, Mail, Calendar, ArrowRight, Loader2 } from "lucide-react";
import { format } from "date-fns";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { TableCell, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppDataTable } from "@/components/ui/app-data-table";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

import { useUsersListQuery } from "@/api/queries/users";
import type { User } from "@/api/users";

type UserRow = User;
const userColumnHelper = createColumnHelper<UserRow>();

export const UsersPage = () => {
    const [searchInput, setSearchInput] = useState("");
    const debouncedSearchInput = useDebouncedValue(searchInput, 300);
    const deferredSearchInput = useDeferredValue(debouncedSearchInput);
    const searchQuery = useMemo(() => deferredSearchInput.trim(), [deferredSearchInput]);

    const { data, isLoading } = useUsersListQuery({ q: searchQuery || undefined });

    const users = data?.users ?? [];
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
        <div className="flex flex-col gap-6 p-6 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <Users className="h-6 w-6 text-primary" />
                        User Management
                    </h1>
                    <p className="text-muted-foreground">
                        View and manage system users and their access levels.
                    </p>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>All Users</CardTitle>
                    <CardDescription>
                        {data?.total ?? 0} users found in the system.
                    </CardDescription>
                    <div className="mt-4 relative max-w-sm">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by name or email..."
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            className="pl-8"
                            data-testid="users-search-input"
                        />
                    </div>
                </CardHeader>
                <CardContent>
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
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
