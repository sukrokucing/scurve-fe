import { useState } from "react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuditLogsQuery } from "@/api/queries/rbac";
import { rbacApi } from "@/api/rbac";

type AuditLogRow = Awaited<ReturnType<typeof rbacApi.listAuditLogs>>["items"][number];
const auditLogColumnHelper = createColumnHelper<AuditLogRow>();

export function AuditLogDialog() {
    const [open, setOpen] = useState(false);
    const [page, setPage] = useState(1);
    const [actionFilter, setActionFilter] = useState<string>("all");

    const { data, isLoading } = useAuditLogsQuery({ page, actionFilter }, { enabled: open });

    const logs = data?.items || [];
    const totalPages = data ? Math.ceil(data.total / data.per_page) : 1;

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

                <div className="flex items-center gap-4 py-4">
                    <Combobox
                        value={actionFilter}
                        onChange={(v) => { setActionFilter(v); setPage(1); }}
                        className="w-[200px]"
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
                    />
                </div>

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

                <div className="flex items-center justify-between pt-4 border-t">
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
            </AppDialogContent>
        </Dialog>
    );
}
