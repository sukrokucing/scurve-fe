import { useMemo, useState } from "react";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { Loader2, User, History } from "lucide-react";

import {
    Dialog,
    DialogTrigger,
} from "@/components/ui/dialog";
import { AppDialogContent } from "@/components/ui/app-dialog-content";
import {
    TableCell,
    TableRow,
} from "@/components/ui/table";
import { AppDataTable } from "@/components/ui/app-data-table";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuditLogsQuery } from "@/api/queries/rbac";
import { rbacApi } from "@/api/rbac";
import { useUsersLookupQuery } from "@/api/queries/users";

type AuditLogRow = Awaited<ReturnType<typeof rbacApi.listAuditLogs>>["items"][number];
const auditLogColumnHelper = createColumnHelper<AuditLogRow>();

export function AuditLogDialog() {
    const [open, setOpen] = useState(false);
    const [page, setPage] = useState(1);
    const [actionFilter, setActionFilter] = useState<string>("all");
    const [actorUserId, setActorUserId] = useState<string>("all");
    const [targetUserId, setTargetUserId] = useState<string>("all");
    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const { data: usersLookup, isLoading: loadingUsersLookup } = useUsersLookupQuery({ enabled: open });

    const { data, isLoading } = useAuditLogsQuery({
        page,
        actionFilter,
        actorUserId,
        targetUserId,
        fromDate,
        toDate,
    }, { enabled: open });

    const logs = data?.items || [];
    const totalPages = data ? Math.ceil(data.total / data.per_page) : 1;
    const userOptions = useMemo(
        () => [
            { value: "all", label: "All users" },
            ...((usersLookup?.users ?? []).map((user) => ({
                value: user.id,
                label: `${user.name} (${user.email})`,
            }))),
        ],
        [usersLookup?.users],
    );
    const userLabelById = useMemo(() => {
        const map = new Map<string, string>();
        (usersLookup?.users ?? []).forEach((user) => {
            map.set(user.id, user.name);
        });
        return map;
    }, [usersLookup?.users]);
    const activeFilters = useMemo(() => {
        const filters: string[] = [];
        if (actionFilter !== "all") {
            filters.push(`Action: ${actionFilter}`);
        }
        if (actorUserId !== "all") {
            filters.push(`Actor: ${userLabelById.get(actorUserId) ?? actorUserId}`);
        }
        if (targetUserId !== "all") {
            filters.push(`Target: ${userLabelById.get(targetUserId) ?? targetUserId}`);
        }
        if (fromDate) {
            filters.push(`From: ${format(new Date(`${fromDate}T00:00:00`), "MMM d, yyyy")}`);
        }
        if (toDate) {
            filters.push(`To: ${format(new Date(`${toDate}T00:00:00`), "MMM d, yyyy")}`);
        }
        return filters;
    }, [actionFilter, actorUserId, fromDate, targetUserId, toDate, userLabelById]);
    const hasActiveFilters = activeFilters.length > 0;

    const resetFilters = () => {
        setActionFilter("all");
        setActorUserId("all");
        setTargetUserId("all");
        setFromDate("");
        setToDate("");
        setPage(1);
    };

    const actionColors: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
        "role.create": "default",
        "role.delete": "destructive",
        "role.assign": "secondary",
        "role.revoke": "destructive",
        "permission.grant": "secondary",
        "permission.revoke": "destructive",
    };
    const columns = useState<ColumnDef<AuditLogRow, unknown>[]>(() => ([
        auditLogColumnHelper.accessor("created_at", {
            header: () => <div className="w-[180px]">Timestamp</div>,
            cell: (info) => (
                <span className="text-xs font-mono text-muted-foreground">
                    {format(new Date(info.getValue()), "MMM d, HH:mm:ss")}
                </span>
            ),
        }),
        auditLogColumnHelper.accessor("actor_name", {
            header: () => <div className="w-[150px]">Actor</div>,
            cell: (info) => (
                <div className="flex items-center gap-2">
                    <User className="h-3 w-3 text-muted-foreground" />
                    <span className="text-sm font-medium">{info.getValue()}</span>
                </div>
            ),
        }),
        auditLogColumnHelper.accessor("action", {
            header: () => <div className="w-[150px]">Action</div>,
            cell: (info) => (
                <Badge variant={actionColors[info.getValue()] || "outline"}>
                    {info.getValue()}
                </Badge>
            ),
        }),
        auditLogColumnHelper.accessor("target_user_name", {
            header: "Target",
            cell: (info) => <span className="text-sm">{info.getValue() || "-"}</span>,
        }),
        auditLogColumnHelper.accessor("details", {
            header: "Details",
            cell: (info) => {
                const details = JSON.stringify(info.getValue());
                return (
                    <span className="text-xs font-mono text-muted-foreground max-w-[200px] truncate" title={JSON.stringify(info.getValue(), null, 2)}>
                        {details}
                    </span>
                );
            },
        }),
    ]))[0];

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" data-testid="policy-audit-log-button">
                    <History className="mr-2 h-4 w-4" />
                    Audit Log
                </Button>
            </DialogTrigger>
            <AppDialogContent
                className="max-w-4xl max-h-[80vh] flex flex-col"
                title="System Audit Log"
                description="View the history of security and access control changes."
            >
                <div className="space-y-4 py-4">
                    <Card className="border-border/70 shadow-sm" data-testid="policy-audit-log-intro-card">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Review change history with scope first</CardTitle>
                            <CardDescription>
                                Narrow the log by action, actor, target user, or date before scanning details. Pagination stays server-driven so the history remains consistent.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="flex flex-wrap items-center gap-2 pt-0 text-xs text-muted-foreground">
                            <Badge variant="outline">Page {page} of {totalPages}</Badge>
                            <Badge variant="outline">{logs.length} row{logs.length === 1 ? "" : "s"} loaded</Badge>
                            {hasActiveFilters ? <Badge variant="secondary">Filters active</Badge> : <Badge variant="outline">No filters applied</Badge>}
                        </CardContent>
                    </Card>

                    <Card className="border-border/70 shadow-sm" data-testid="policy-audit-log-filters-card">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Filters</CardTitle>
                            <CardDescription>
                                Keep the result set narrow enough to review quickly, then reset when you are ready to widen the audit scope again.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3 pt-0">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center">
                                <Combobox
                                    value={actionFilter}
                                    onChange={(v) => { setActionFilter(v); setPage(1); }}
                                    className="w-full md:w-[200px]"
                                    placeholder="Filter by action"
                                    options={[
                                        { value: "all", label: "All Actions" },
                                        { value: "role.assign", label: "Role Assigned" },
                                        { value: "role.revoke", label: "Role Revoked" },
                                        { value: "permission.grant", label: "Permission Granted" },
                                        { value: "permission.revoke", label: "Permission Revoked" },
                                        { value: "role.create", label: "Role Created" },
                                        { value: "role.delete", label: "Role Deleted" },
                                        { value: "user.create", label: "User Created" },
                                        { value: "user.delete", label: "User Deleted" },
                                    ]}
                                    triggerTestId="policy-audit-log-action-filter-combobox"
                                />
                                <Combobox
                                    value={actorUserId}
                                    onChange={(value) => { setActorUserId(value || "all"); setPage(1); }}
                                    className="w-full md:w-[240px]"
                                    placeholder="Filter by actor"
                                    searchPlaceholder="Search actors..."
                                    options={userOptions}
                                    isLoading={loadingUsersLookup}
                                    triggerTestId="policy-audit-log-actor-filter-combobox"
                                    triggerAriaLabel="Filter audit log by actor"
                                />
                                <Combobox
                                    value={targetUserId}
                                    onChange={(value) => { setTargetUserId(value || "all"); setPage(1); }}
                                    className="w-full md:w-[240px]"
                                    placeholder="Filter by target user"
                                    searchPlaceholder="Search target users..."
                                    options={userOptions}
                                    isLoading={loadingUsersLookup}
                                    triggerTestId="policy-audit-log-target-filter-combobox"
                                    triggerAriaLabel="Filter audit log by target user"
                                />
                                <div className="grid w-full gap-3 sm:grid-cols-2 md:max-w-[360px]">
                                    <Input
                                        type="date"
                                        value={fromDate}
                                        onChange={(event) => {
                                            setFromDate(event.target.value);
                                            setPage(1);
                                        }}
                                        data-testid="policy-audit-log-from-input"
                                        aria-label="Filter audit log from date"
                                    />
                                    <Input
                                        type="date"
                                        value={toDate}
                                        onChange={(event) => {
                                            setToDate(event.target.value);
                                            setPage(1);
                                        }}
                                        data-testid="policy-audit-log-to-input"
                                        aria-label="Filter audit log to date"
                                    />
                                </div>
                            </div>
                            <div
                                className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                                data-testid="policy-audit-log-filter-summary"
                            >
                                {hasActiveFilters ? (
                                    <>
                                        {activeFilters.map((filter) => (
                                            <Badge key={filter} variant="outline">
                                                {filter}
                                            </Badge>
                                        ))}
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 px-2"
                                            onClick={resetFilters}
                                            data-testid="policy-audit-log-reset-filters-button"
                                        >
                                            Reset filters
                                        </Button>
                                    </>
                                ) : (
                                    <span>Filter audit history by action, actor, target user, or date range.</span>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border-border/70 shadow-sm" data-testid="policy-audit-log-results-section">
                        <CardHeader className="pb-3">
                            <CardTitle className="text-base">Results</CardTitle>
                            <CardDescription>
                                Review the timestamp, actor, target, and details together before moving to the next page.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-0">
                            <ScrollArea className="flex-1 rounded-md border">
                                <AppDataTable
                                    data={logs}
                                    columns={columns}
                                    getRowId={(row) => row.id}
                                    isLoading={isLoading}
                                    loadingRow={(
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-24 text-center">
                                                <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                                            </TableCell>
                                        </TableRow>
                                    )}
                                    emptyRow={(
                                        <TableRow>
                                            <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                                No audit logs found.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                />
                            </ScrollArea>

                            <div className="flex items-center justify-between border-t pt-4">
                                <div className="text-sm text-muted-foreground">
                                    Page {page} of {totalPages}
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setPage(p => Math.max(1, p - 1))}
                                        disabled={page === 1 || isLoading}
                                        data-testid="policy-audit-log-prev-button"
                                    >
                                        Previous
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                        disabled={page === totalPages || isLoading}
                                        data-testid="policy-audit-log-next-button"
                                    >
                                        Next
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </AppDialogContent>
        </Dialog>
    );
}
