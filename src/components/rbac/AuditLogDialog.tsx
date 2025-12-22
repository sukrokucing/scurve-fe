import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Loader2, User, History } from "lucide-react";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { rbacApi } from "@/api/rbac";

export function AuditLogDialog() {
    const [open, setOpen] = useState(false);
    const [page, setPage] = useState(1);
    const [actionFilter, setActionFilter] = useState<string>("all");

    const { data, isLoading } = useQuery({
        queryKey: ["audit-logs", page, actionFilter],
        queryFn: () => rbacApi.listAuditLogs({
            page,
            per_page: 20,
            action: actionFilter === "all" ? undefined : actionFilter,
        }),
        enabled: open,
    });

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

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <History className="mr-2 h-4 w-4" />
                    Audit Log
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>System Audit Log</DialogTitle>
                    <DialogDescription>
                        View the history of security and access control changes.
                    </DialogDescription>
                </DialogHeader>

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
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[180px]">Timestamp</TableHead>
                                <TableHead className="w-[150px]">Actor</TableHead>
                                <TableHead className="w-[150px]">Action</TableHead>
                                <TableHead>Target</TableHead>
                                <TableHead>Details</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center">
                                        <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                                    </TableCell>
                                </TableRow>
                            ) : logs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                                        No audit logs found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                logs.map((log) => (
                                    <TableRow key={log.id}>
                                        <TableCell className="text-xs font-mono text-muted-foreground">
                                            {format(new Date(log.created_at), "MMM d, HH:mm:ss")}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <User className="h-3 w-3 text-muted-foreground" />
                                                <span className="text-sm font-medium">{log.actor_name}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={actionColors[log.action] || "outline"}>
                                                {log.action}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <span className="text-sm">{log.target_user_name || "-"}</span>
                                        </TableCell>
                                        <TableCell className="text-xs font-mono text-muted-foreground max-w-[200px] truncate" title={JSON.stringify(log.details, null, 2)}>
                                            {JSON.stringify(log.details)}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
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
                        >
                            Previous
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages || isLoading}
                        >
                            Next
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
