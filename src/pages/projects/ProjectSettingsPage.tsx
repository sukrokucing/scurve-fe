import { useEffect, useMemo, useRef, useState } from "react";
import { isAxiosError } from "axios";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, CircleDollarSign, Loader2, Settings2, ShieldAlert, Users } from "lucide-react";

import { type ApiProjectMember, type ApiProjectResourceRoleRate } from "@/api/openapiClient";
import { useRolesWithPermissionsQuery } from "@/api/queries/rbac";
import { useUsersLookupQuery } from "@/api/queries/users";
import {
    useAddProjectMemberMutation,
    useDeleteProjectResourceRoleRateMutation,
    useMyProjectScopesQuery,
    useProjectById,
    useProjectMembersQuery,
    useProjectResourceRoleRatesQuery,
    useRemoveProjectMemberMutation,
    useResourceRolesQuery,
    useUpdateProjectMutation,
    useUpsertProjectResourceRoleRateMutation,
} from "@/api/queries/projects";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppDataTable } from "@/components/ui/app-data-table";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DEFAULT_PROJECT_THEME_COLOR, isValidProjectThemeColor, resolveProjectThemeColor } from "@/lib/projectTheme";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import type { components } from "@/types/api";
import { toast } from "sonner";

type AccessRoleWithPermissions = {
    id: string;
    name: string;
    permissions: string[];
};

type ProjectSettingsTab = "members" | "resource-rates" | "general";
type AutoHealStatus = {
    state: "idle" | "running" | "success" | "failed" | "blocked";
    message?: string;
};

const memberColumnHelper = createColumnHelper<ApiProjectMember>();
const resourceRateColumnHelper = createColumnHelper<ApiProjectResourceRoleRate>();

const PROJECT_SETTINGS_TABS: Array<{ value: ProjectSettingsTab; label: string }> = [
    { value: "members", label: "Members" },
    { value: "resource-rates", label: "Resource Rates" },
    { value: "general", label: "General" },
];

const NO_ACCESS_STATUSES = new Set([403, 404]);

function normalizeRoleName(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

function formatCurrencyAmount(value: number, currency = "USD") {
    try {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency,
            maximumFractionDigits: 2,
        }).format(value);
    } catch {
        return `${currency} ${value.toFixed(2)}`;
    }
}

function getCurrencySymbol(currency: string) {
    const normalized = (currency || "USD").toUpperCase();
    try {
        const currencyPart = new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: normalized,
            currencyDisplay: "narrowSymbol",
        })
            .formatToParts(0)
            .find((part) => part.type === "currency");
        return currencyPart?.value ?? normalized;
    } catch {
        return normalized;
    }
}

function extractErrorMessage(error: unknown, fallback: string) {
    if (!isAxiosError(error)) return fallback;
    const status = error.response?.status;
    const backendMessage = (error.response?.data as { message?: string } | undefined)?.message;
    return backendMessage ? `${fallback} (${status}): ${backendMessage}` : `${fallback} (${status ?? "unknown"})`;
}

function isProjectAdminScope(scope: components["schemas"]["MyProjectScopeSummary"] | null | undefined) {
    if (!scope) return false;
    const roleName = String(scope.access_role_name ?? "").toLowerCase();
    if (/(project[_\s-]?admin|project[_\s-]?owner|owner|admin)/.test(roleName)) return true;
    return (scope.permissions ?? []).some((permission) =>
        /project\.(manage|update|admin|owner)|member\.(manage|create|update|delete)|resource[_-]?role\.(manage|create|update|delete)|project[_-]?resource[_-]?role\.(manage|create|update|delete)/i.test(permission),
    );
}

function resolveTab(value: string | null): ProjectSettingsTab {
    if (value === "members" || value === "resource-rates" || value === "general") return value;
    return "members";
}

function getAutoHealAccessRoleId(roles: AccessRoleWithPermissions[]) {
    if (roles.length === 0) return null;
    const byNormalizedName = new Map(roles.map((role) => [normalizeRoleName(role.name), role.id]));
    const preferred = byNormalizedName.get("project_admin")
        ?? byNormalizedName.get("project_owner")
        ?? null;
    if (preferred) return preferred;

    const byPermissions = roles.find((role) =>
        role.permissions.some((permission) =>
            /project\.(manage|update|admin|owner)|member\.(manage|create|update|delete)/i.test(permission),
        ),
    );
    if (byPermissions) return byPermissions.id;
    return roles[0].id;
}

function getAutoHealResourceRoleId(resourceRoles: components["schemas"]["ResourceRole"][]) {
    if (resourceRoles.length === 0) return null;
    const preferred = resourceRoles.find((role) => normalizeRoleName(role.name) === "unclassified");
    return preferred?.id ?? resourceRoles[0].id;
}

export function ProjectSettingsPage() {
    const { id: routeProjectId } = useParams<{ id: string }>();
    const projectId = routeProjectId ?? "";
    const navigate = useNavigate();
    const currentUser = useAuthStore((state) => state.user);
    const currentUserId = currentUser?.id ?? null;
    const [searchParams, setSearchParams] = useSearchParams();

    const activeTab = resolveTab(searchParams.get("tab"));
    const showOnboarding = searchParams.get("onboard") === "1";

    const [memberUserId, setMemberUserId] = useState("");
    const [memberAccessRoleId, setMemberAccessRoleId] = useState("");
    const [memberResourceRoleIds, setMemberResourceRoleIds] = useState<string[]>([]);

    const [rateResourceRoleId, setRateResourceRoleId] = useState("");
    const [rateHourly, setRateHourly] = useState("");
    const [rateCurrency, setRateCurrency] = useState("USD");
    const rateFormSeededRoleRef = useRef<string | null>(null);

    const [generalName, setGeneralName] = useState("");
    const [generalDescription, setGeneralDescription] = useState("");
    const [generalThemeColor, setGeneralThemeColor] = useState(DEFAULT_PROJECT_THEME_COLOR);

    const [autoHealStatus, setAutoHealStatus] = useState<AutoHealStatus>({ state: "idle" });
    const [autoHealAttempted, setAutoHealAttempted] = useState(false);

    const {
        data: project,
        isLoading: isProjectLoading,
        error: projectError,
    } = useProjectById(projectId, { enabled: Boolean(projectId) });
    const {
        data: myScopes,
        isLoading: isScopesLoading,
    } = useMyProjectScopesQuery({ enabled: Boolean(projectId) });
    const {
        data: projectMembers = [],
        isLoading: isMembersLoading,
    } = useProjectMembersQuery(projectId, { enabled: Boolean(projectId) });
    const {
        data: projectResourceRoleRates = [],
        isLoading: isRatesLoading,
    } = useProjectResourceRoleRatesQuery(projectId, { enabled: Boolean(projectId) });

    const { data: usersLookup, isLoading: isUsersLoading } = useUsersLookupQuery({
        enabled: Boolean(projectId),
    });

    const { data: globalResourceRoles = [], isLoading: isResourceRolesLoading } = useResourceRolesQuery({
        enabled: Boolean(projectId),
    });

    const { data: rolesWithPermissions = [], isLoading: isAccessRolesLoading } = useRolesWithPermissionsQuery({
        enabled: Boolean(projectId),
    });

    const accessRoles = useMemo<AccessRoleWithPermissions[]>(
        () => rolesWithPermissions.map(({ role, permissions }) => ({
            id: role.id,
            name: role.name,
            permissions: permissions.map((permission) => permission.name),
        })),
        [rolesWithPermissions],
    );

    const selectedScope = useMemo(
        () => (myScopes ?? []).find((scope) => scope.project_id === projectId) ?? null,
        [myScopes, projectId],
    );
    const canManageSettings = isProjectAdminScope(selectedScope);

    const userOptions = useMemo(
        () => (usersLookup?.users ?? []).map((user) => ({
            value: user.id,
            label: `${user.name} (${user.email})`,
        })),
        [usersLookup?.users],
    );

    const accessRoleOptions = useMemo(
        () => accessRoles.map((role) => ({ value: role.id, label: role.name })),
        [accessRoles],
    );

    const resourceRoleOptions = useMemo(
        () => globalResourceRoles.map((role) => ({
            value: role.id,
            label: `${role.name} (${formatCurrencyAmount(role.default_hourly_rate, role.currency)}/hr)`,
        })),
        [globalResourceRoles],
    );

    const rateRoleOptions = useMemo(
        () => projectResourceRoleRates.map((role) => ({
            value: role.resource_role_id,
            label: `${role.resource_role_name} (${formatCurrencyAmount(role.hourly_rate, role.currency)}/hr)`,
        })),
        [projectResourceRoleRates],
    );

    const rateCurrencyOptions = useMemo(() => {
        const currencies = new Set<string>();
        currencies.add("USD");
        currencies.add("IDR");

        projectResourceRoleRates.forEach((role) => {
            if (role.currency) currencies.add(role.currency.toUpperCase());
        });

        globalResourceRoles.forEach((role) => {
            if (role.currency) currencies.add(role.currency.toUpperCase());
        });

        if (rateCurrency) currencies.add(rateCurrency.toUpperCase());
        if (currencies.size === 0) currencies.add("USD");

        return Array.from(currencies)
            .sort((a, b) => a.localeCompare(b))
            .map((currency) => ({ value: currency, label: currency }));
    }, [globalResourceRoles, projectResourceRoleRates, rateCurrency]);

    const addMemberMutation = useAddProjectMemberMutation(projectId);
    const removeMemberMutation = useRemoveProjectMemberMutation(projectId);
    const upsertRateMutation = useUpsertProjectResourceRoleRateMutation(projectId);
    const clearRateMutation = useDeleteProjectResourceRoleRateMutation(projectId);
    const updateProjectMutation = useUpdateProjectMutation(projectId);

    useEffect(() => {
        if (!project) return;
        setGeneralName(project.name);
        setGeneralDescription(project.description ?? "");
        setGeneralThemeColor(resolveProjectThemeColor(project.theme_color));
    }, [project]);

    useEffect(() => {
        if (memberAccessRoleId) return;
        if (accessRoleOptions.length === 0) return;
        setMemberAccessRoleId(accessRoleOptions[0].value);
    }, [accessRoleOptions, memberAccessRoleId]);

    useEffect(() => {
        if (memberResourceRoleIds.length > 0) return;
        if (resourceRoleOptions.length === 0) return;
        setMemberResourceRoleIds([resourceRoleOptions[0].value]);
    }, [resourceRoleOptions, memberResourceRoleIds.length]);

    useEffect(() => {
        if (rateResourceRoleId) return;
        if (projectResourceRoleRates.length === 0) return;
        const first = projectResourceRoleRates[0];
        setRateResourceRoleId(first.resource_role_id);
        setRateHourly(String(first.hourly_rate));
        setRateCurrency((first.currency || "USD").toUpperCase());
        rateFormSeededRoleRef.current = first.resource_role_id;
    }, [projectResourceRoleRates, rateResourceRoleId]);

    useEffect(() => {
        if (!rateResourceRoleId) return;
        if (rateFormSeededRoleRef.current === rateResourceRoleId) return;
        const selectedRate = projectResourceRoleRates.find((role) => role.resource_role_id === rateResourceRoleId);
        if (!selectedRate) return;
        rateFormSeededRoleRef.current = rateResourceRoleId;
        setRateCurrency((selectedRate.currency || "USD").toUpperCase());
        setRateHourly(String(selectedRate.hourly_rate));
    }, [projectResourceRoleRates, rateResourceRoleId]);

    useEffect(() => {
        if (!projectId || !currentUserId || autoHealAttempted) return;
        if (isMembersLoading || isAccessRolesLoading || isResourceRolesLoading) return;

        setAutoHealAttempted(true);
        const hasCurrentUserMembership = projectMembers.some((member) => member.user_id === currentUserId);
        if (hasCurrentUserMembership) return;

        const accessRoleId = getAutoHealAccessRoleId(accessRoles);
        const resourceRoleId = getAutoHealResourceRoleId(globalResourceRoles);
        if (!accessRoleId || !resourceRoleId) {
            setAutoHealStatus({
                state: "blocked",
                message: "Unable to auto-heal creator membership. Ensure at least one access role and resource role exist.",
            });
            return;
        }

        setAutoHealStatus({ state: "running", message: "Restoring creator project membership..." });
        addMemberMutation.mutate(
            {
                user_id: currentUserId,
                access_role_id: accessRoleId,
                resource_role_ids: [resourceRoleId],
            },
            {
                onSuccess: () => {
                    setAutoHealStatus({
                        state: "success",
                        message: "Creator membership restored. Project settings are ready.",
                    });
                },
                onError: (error) => {
                    setAutoHealStatus({
                        state: "failed",
                        message: extractErrorMessage(error, "Creator membership auto-heal failed"),
                    });
                },
            },
        );
    }, [
        accessRoles,
        addMemberMutation,
        autoHealAttempted,
        currentUserId,
        globalResourceRoles,
        isAccessRolesLoading,
        isMembersLoading,
        isResourceRolesLoading,
        projectId,
        projectMembers,
    ]);

    const projectErrorStatus = isAxiosError(projectError) ? projectError.response?.status : null;
    const isProjectNoAccess = typeof projectErrorStatus === "number" && NO_ACCESS_STATUSES.has(projectErrorStatus);

    const selectTab = (tab: ProjectSettingsTab) => {
        const next = new URLSearchParams(searchParams);
        next.set("tab", tab);
        setSearchParams(next, { replace: true });
    };

    const clearOnboarding = () => {
        const next = new URLSearchParams(searchParams);
        next.delete("onboard");
        setSearchParams(next, { replace: true });
    };

    const onAddMember = () => {
        if (!canManageSettings) {
            toast.error("You do not have permission to modify project members.");
            return;
        }
        if (!memberUserId || !memberAccessRoleId || memberResourceRoleIds.length === 0) {
            toast.error("Select user, access role, and at least one resource role.");
            return;
        }

        addMemberMutation.mutate({
            user_id: memberUserId,
            access_role_id: memberAccessRoleId,
            resource_role_ids: memberResourceRoleIds,
        }, {
            onSuccess: () => {
                toast.success("Project member saved.");
            },
            onError: (error) => {
                toast.error(extractErrorMessage(error, "Failed to save project member"));
            },
        });
        setMemberUserId("");
    };

    const onRemoveMember = (userId: string) => {
        removeMemberMutation.mutate(userId, {
            onSuccess: () => {
                toast.success("Project member removed.");
            },
            onError: (error) => {
                toast.error(extractErrorMessage(error, "Failed to remove project member"));
            },
        });
    };

    const onSaveRate = () => {
        if (!canManageSettings) {
            toast.error("You do not have permission to update project resource rates.");
            return;
        }
        const parsedRate = Number.parseFloat(rateHourly);
        if (!rateResourceRoleId || !Number.isFinite(parsedRate) || parsedRate < 0) {
            toast.error("Select a role and provide a valid hourly rate.");
            return;
        }
        upsertRateMutation.mutate({
            resourceRoleId: rateResourceRoleId,
            data: {
                hourly_rate: parsedRate,
                currency: (rateCurrency || "USD").toUpperCase(),
            },
        }, {
            onSuccess: () => {
                toast.success("Resource rate override saved.");
            },
            onError: (error) => {
                toast.error(extractErrorMessage(error, "Failed to save resource rate override"));
            },
        });
    };

    const onResetRate = (resourceRoleId: string) => {
        clearRateMutation.mutate(resourceRoleId, {
            onSuccess: () => {
                toast.success("Resource rate override removed.");
            },
            onError: (error) => {
                toast.error(extractErrorMessage(error, "Failed to remove resource rate override"));
            },
        });
    };

    const onSaveGeneral = () => {
        if (!canManageSettings) {
            toast.error("You do not have permission to update project settings.");
            return;
        }
        const name = generalName.trim();
        if (!name) {
            toast.error("Project name is required.");
            return;
        }
        const themeColor = generalThemeColor.trim();
        if (themeColor && !isValidProjectThemeColor(themeColor)) {
            toast.error(`Theme color must be a valid hex value (e.g. ${DEFAULT_PROJECT_THEME_COLOR}).`);
            return;
        }
        updateProjectMutation.mutate({
            name,
            description: generalDescription.trim() || undefined,
            theme_color: themeColor || undefined,
        }, {
            onSuccess: () => {
                toast.success("Project details updated.");
            },
            onError: (error) => {
                toast.error(extractErrorMessage(error, "Failed to update project"));
            },
        });
    };

    if (isProjectLoading) {
        return (
            <div className="space-y-4">
                <Skeleton className="h-10 w-64" />
                <Skeleton className="h-28 w-full" />
                <Skeleton className="h-72 w-full" />
            </div>
        );
    }

    if (projectError || !project) {
        return (
            <Card className="border-destructive/40">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-destructive">
                        <ShieldAlert className="h-5 w-5" />
                        {isProjectNoAccess ? "Project access unavailable" : "Unable to load project settings"}
                    </CardTitle>
                    <CardDescription>
                        {isProjectNoAccess
                            ? "You do not have access to this project settings page."
                            : "The project could not be loaded. Retry from Projects menu."}
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex gap-2">
                    <Button variant="outline" onClick={() => navigate("/projects")}>
                        Back to Projects
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6" data-testid="project-settings-page">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                    <div className="flex items-center gap-2 text-muted-foreground">
                        <Settings2 className="h-4 w-4" />
                        <span className="text-sm">Project Settings</span>
                    </div>
                    <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
                    <p className="text-sm text-muted-foreground">
                        Manage members, project resource rates, and general metadata in one place.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" asChild>
                        <Link to="/projects">
                            <ArrowLeft className="h-4 w-4" />
                            Projects
                        </Link>
                    </Button>
                    <Button variant="secondary" asChild data-testid="project-settings-dashboard-link">
                        <Link to={`/projects/${project.id}/dashboard`}>Dashboard</Link>
                    </Button>
                </div>
            </div>

            {showOnboarding ? (
                <Card className="border-primary/35">
                    <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                        <p className="text-sm">
                            Next step: add members and configure project resource rates so dashboard hours/cost metrics stay accurate.
                        </p>
                        <Button size="sm" variant="outline" onClick={clearOnboarding}>
                            Dismiss
                        </Button>
                    </CardContent>
                </Card>
            ) : null}

            {autoHealStatus.state !== "idle" ? (
                <Card className={cn(
                    autoHealStatus.state === "success" ? "border-emerald-400/45" : "",
                    autoHealStatus.state === "failed" || autoHealStatus.state === "blocked" ? "border-destructive/35" : "",
                )}>
                    <CardContent className="py-4">
                        <p className="text-sm">{autoHealStatus.message}</p>
                    </CardContent>
                </Card>
            ) : null}

            <Card>
                <CardHeader className="gap-3 pb-2">
                    <CardDescription>
                        {canManageSettings
                            ? "You can manage this project configuration."
                            : "Read-only mode: you can review settings but cannot modify them."}
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 pt-4">
                    <Tabs value={activeTab} onValueChange={(value) => selectTab(resolveTab(value))}>
                        <TabsList className="w-full justify-start overflow-x-auto">
                            {PROJECT_SETTINGS_TABS.map((tab) => (
                                <TabsTrigger
                                    key={tab.value}
                                    value={tab.value}
                                    data-testid={`project-settings-tab-${tab.value}`}
                                >
                                    {tab.label}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                        <TabsContent value="members">
                            <MembersTab
                                canManageSettings={canManageSettings}
                                projectMembers={projectMembers}
                                isMembersLoading={isMembersLoading}
                                userOptions={userOptions}
                                isUsersLoading={isUsersLoading}
                                accessRoleOptions={accessRoleOptions}
                                isAccessRolesLoading={isAccessRolesLoading}
                                resourceRoleOptions={resourceRoleOptions}
                                memberUserId={memberUserId}
                                setMemberUserId={setMemberUserId}
                                memberAccessRoleId={memberAccessRoleId}
                                setMemberAccessRoleId={setMemberAccessRoleId}
                                memberResourceRoleIds={memberResourceRoleIds}
                                setMemberResourceRoleIds={setMemberResourceRoleIds}
                                onAddMember={onAddMember}
                                addMemberPending={addMemberMutation.isPending}
                                onRemoveMember={onRemoveMember}
                                removeMemberPending={removeMemberMutation.isPending}
                            />
                        </TabsContent>

                        <TabsContent value="resource-rates">
                            <ResourceRatesTab
                                canManageSettings={canManageSettings}
                                isRatesLoading={isRatesLoading}
                                rateRoleOptions={rateRoleOptions}
                                projectResourceRoleRates={projectResourceRoleRates}
                                rateResourceRoleId={rateResourceRoleId}
                                setRateResourceRoleId={setRateResourceRoleId}
                                rateHourly={rateHourly}
                                setRateHourly={setRateHourly}
                                rateCurrency={rateCurrency}
                                setRateCurrency={setRateCurrency}
                                rateCurrencyOptions={rateCurrencyOptions}
                                onSaveRate={onSaveRate}
                                upsertRatePending={upsertRateMutation.isPending}
                                onResetRate={onResetRate}
                                clearRatePending={clearRateMutation.isPending}
                            />
                        </TabsContent>

                        <TabsContent value="general">
                            <GeneralTab
                                canManageSettings={canManageSettings}
                                generalName={generalName}
                                setGeneralName={setGeneralName}
                                generalDescription={generalDescription}
                                setGeneralDescription={setGeneralDescription}
                                generalThemeColor={generalThemeColor}
                                setGeneralThemeColor={setGeneralThemeColor}
                                onSaveGeneral={onSaveGeneral}
                                updateProjectPending={updateProjectMutation.isPending}
                            />
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

            {!canManageSettings && !isScopesLoading ? (
                <Card className="border-border/80">
                    <CardContent className="py-4">
                        <p className="text-sm text-muted-foreground">
                            You can view this page, but settings mutations are disabled for your current project-scoped role.
                        </p>
                    </CardContent>
                </Card>
            ) : null}
        </div>
    );
}

type MembersTabProps = {
    canManageSettings: boolean;
    projectMembers: ApiProjectMember[];
    isMembersLoading: boolean;
    userOptions: Array<{ value: string; label: string }>;
    isUsersLoading: boolean;
    accessRoleOptions: Array<{ value: string; label: string }>;
    isAccessRolesLoading: boolean;
    resourceRoleOptions: Array<{ value: string; label: string }>;
    memberUserId: string;
    setMemberUserId: (value: string) => void;
    memberAccessRoleId: string;
    setMemberAccessRoleId: (value: string) => void;
    memberResourceRoleIds: string[];
    setMemberResourceRoleIds: (value: string[] | ((previous: string[]) => string[])) => void;
    onAddMember: () => void;
    addMemberPending: boolean;
    onRemoveMember: (userId: string) => void;
    removeMemberPending: boolean;
};

function MembersTab({
    canManageSettings,
    projectMembers,
    isMembersLoading,
    userOptions,
    isUsersLoading,
    accessRoleOptions,
    isAccessRolesLoading,
    resourceRoleOptions,
    memberUserId,
    setMemberUserId,
    memberAccessRoleId,
    setMemberAccessRoleId,
    memberResourceRoleIds,
    setMemberResourceRoleIds,
    onAddMember,
    addMemberPending,
    onRemoveMember,
    removeMemberPending,
}: MembersTabProps) {
    const memberColumns = useMemo<ColumnDef<ApiProjectMember, unknown>[]>(() => ([
        memberColumnHelper.display({
            id: "member",
            header: "Name",
            cell: (info) => (
                <div className="flex flex-col">
                    <span className="font-medium">{info.row.original.user_name}</span>
                    <span className="text-xs text-muted-foreground">{info.row.original.user_email}</span>
                </div>
            ),
        }),
        memberColumnHelper.accessor("access_role_name", {
            header: "Access Role",
        }),
        memberColumnHelper.accessor("resource_roles", {
            header: "Resource Roles",
            cell: (info) => (
                <div className="flex flex-wrap gap-1">
                    {info.getValue().map((role) => (
                        <Badge key={`${info.row.original.user_id}-${role.id}`} variant="secondary">
                            {role.name}
                        </Badge>
                    ))}
                </div>
            ),
        }),
        memberColumnHelper.display({
            id: "actions",
            header: () => <div className="text-right">Action</div>,
            cell: (info) => (
                <div className="text-right">
                    <Button
                        type="button"
                        size="sm"
                        variant="destructive-outline"
                        disabled={!canManageSettings || removeMemberPending}
                        onClick={() => onRemoveMember(info.row.original.user_id)}
                        data-testid="project-settings-member-remove-button"
                    >
                        Remove
                    </Button>
                </div>
            ),
        }),
    ]), [canManageSettings, onRemoveMember, removeMemberPending]);

    return (
        <section className="space-y-4" data-testid="project-settings-members-section">
            <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-lg font-medium">Members</h2>
            </div>

            <div className="rounded-lg border p-4">
                <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">User</label>
                        <Combobox
                            options={userOptions}
                            value={memberUserId}
                            onChange={setMemberUserId}
                            disabled={!canManageSettings}
                            placeholder="Select user"
                            searchPlaceholder="Search users..."
                            triggerTestId="project-settings-add-member-user-combobox"
                            isLoading={isUsersLoading}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Access role</label>
                        <Combobox
                            options={accessRoleOptions}
                            value={memberAccessRoleId}
                            onChange={setMemberAccessRoleId}
                            disabled={!canManageSettings}
                            placeholder="Select access role"
                            searchPlaceholder="Search access roles..."
                            triggerTestId="project-settings-add-member-access-role-combobox"
                            isLoading={isAccessRolesLoading}
                        />
                    </div>
                </div>
                <div className="mt-4 space-y-2">
                    <p className="text-sm font-medium">Resource roles</p>
                    <div className="flex flex-wrap gap-2">
                        {resourceRoleOptions.map((role) => {
                            const selected = memberResourceRoleIds.includes(role.value);
                            return (
                                <Button
                                    key={role.value}
                                    type="button"
                                    size="sm"
                                    variant={selected ? "default" : "outline"}
                                    onClick={() => {
                                        setMemberResourceRoleIds((previous) => {
                                            if (previous.includes(role.value)) {
                                                return previous.filter((item) => item !== role.value);
                                            }
                                            return [...previous, role.value];
                                        });
                                    }}
                                    data-testid="project-settings-add-member-resource-role-toggle"
                                >
                                    {role.label}
                                </Button>
                            );
                        })}
                    </div>
                </div>
                <div className="mt-4">
                    <Button
                        type="button"
                        onClick={onAddMember}
                        disabled={!canManageSettings || addMemberPending}
                        data-testid="project-settings-add-member-submit"
                    >
                        {addMemberPending ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            "Add Member"
                        )}
                    </Button>
                </div>
            </div>

            <div className="rounded-md border">
                <AppDataTable
                    data={projectMembers}
                    columns={memberColumns}
                    getRowId={(row) => row.user_id}
                    isLoading={isMembersLoading}
                    loadingRow={(
                        <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground">
                                Loading members...
                            </TableCell>
                        </TableRow>
                    )}
                    emptyRow={(
                        <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground">
                                No project members found.
                            </TableCell>
                        </TableRow>
                    )}
                    getRowProps={(row) => ({ "data-testid": row.original.user_id ? "project-settings-member-row" : undefined })}
                />
            </div>
        </section>
    );
}

type ResourceRatesTabProps = {
    canManageSettings: boolean;
    isRatesLoading: boolean;
    rateRoleOptions: Array<{ value: string; label: string }>;
    projectResourceRoleRates: ApiProjectResourceRoleRate[];
    rateResourceRoleId: string;
    setRateResourceRoleId: (value: string) => void;
    rateHourly: string;
    setRateHourly: (value: string) => void;
    rateCurrency: string;
    setRateCurrency: (value: string) => void;
    rateCurrencyOptions: Array<{ value: string; label: string }>;
    onSaveRate: () => void;
    upsertRatePending: boolean;
    onResetRate: (resourceRoleId: string) => void;
    clearRatePending: boolean;
};

function ResourceRatesTab({
    canManageSettings,
    isRatesLoading,
    rateRoleOptions,
    projectResourceRoleRates,
    rateResourceRoleId,
    setRateResourceRoleId,
    rateHourly,
    setRateHourly,
    rateCurrency,
    setRateCurrency,
    rateCurrencyOptions,
    onSaveRate,
    upsertRatePending,
    onResetRate,
    clearRatePending,
}: ResourceRatesTabProps) {
    const rateColumns = useMemo<ColumnDef<ApiProjectResourceRoleRate, unknown>[]>(() => ([
        resourceRateColumnHelper.accessor("resource_role_name", {
            header: "Resource Role",
        }),
        resourceRateColumnHelper.display({
            id: "hourly_rate",
            header: "Hourly Rate",
            cell: (info) => formatCurrencyAmount(info.row.original.hourly_rate, info.row.original.currency),
        }),
        resourceRateColumnHelper.accessor("is_override", {
            header: "Type",
            cell: (info) => (
                <Badge variant={info.getValue() ? "default" : "secondary"}>
                    {info.getValue() ? "Override" : "Default"}
                </Badge>
            ),
        }),
        resourceRateColumnHelper.display({
            id: "actions",
            header: () => <div className="text-right">Action</div>,
            cell: (info) => (
                <div className="text-right">
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!canManageSettings || !info.row.original.is_override || clearRatePending}
                        onClick={() => onResetRate(info.row.original.resource_role_id)}
                        data-testid="project-settings-rate-reset-button"
                    >
                        Reset
                    </Button>
                </div>
            ),
        }),
    ]), [canManageSettings, clearRatePending, onResetRate]);

    return (
        <section className="space-y-4" data-testid="project-settings-resource-rates-section">
            <div className="flex items-center gap-2">
                <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-lg font-medium">Project Resource Rates</h2>
            </div>
            <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-3">
                <div className="space-y-2">
                    <label className="text-sm font-medium">Resource role</label>
                    <Combobox
                        options={rateRoleOptions}
                        value={rateResourceRoleId}
                        onChange={setRateResourceRoleId}
                        disabled={!canManageSettings}
                        placeholder="Select resource role"
                        searchPlaceholder="Search resource roles..."
                        triggerTestId="project-settings-rate-role-combobox"
                        isLoading={isRatesLoading}
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium">Hourly rate</label>
                    <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                            {getCurrencySymbol(rateCurrency)}
                        </span>
                        <Input
                            type="number"
                            min={0}
                            step="0.01"
                            placeholder="0.00"
                            value={rateHourly}
                            disabled={!canManageSettings}
                            onChange={(event) => setRateHourly(event.target.value)}
                            inputMode="decimal"
                            className="pl-10"
                            data-testid="project-settings-rate-hourly-input"
                        />
                    </div>
                    <p className="text-xs text-muted-foreground">Enter amount in {rateCurrency || "USD"}.</p>
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium">Currency</label>
                    <Combobox
                        options={rateCurrencyOptions}
                        value={rateCurrency}
                        onChange={(nextValue) => setRateCurrency(nextValue.toUpperCase())}
                        disabled={!canManageSettings}
                        placeholder="Select currency"
                        searchPlaceholder="Search currencies..."
                        triggerTestId="project-settings-rate-currency-combobox"
                    />
                </div>
                <div className="md:col-span-3">
                    <Button
                        type="button"
                        onClick={onSaveRate}
                        disabled={!canManageSettings || upsertRatePending}
                        data-testid="project-settings-rate-save-button"
                    >
                        {upsertRatePending ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            "Save Override"
                        )}
                    </Button>
                </div>
            </div>

            <div className="rounded-md border">
                <AppDataTable
                    data={projectResourceRoleRates}
                    columns={rateColumns}
                    getRowId={(row) => row.resource_role_id}
                    isLoading={isRatesLoading}
                    loadingRow={(
                        <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground">
                                Loading project rates...
                            </TableCell>
                        </TableRow>
                    )}
                    emptyRow={(
                        <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground">
                                No project resource roles found.
                            </TableCell>
                        </TableRow>
                    )}
                    getRowProps={(row) => ({ "data-testid": row.original.resource_role_id ? "project-settings-rate-row" : undefined })}
                />
            </div>
        </section>
    );
}

type GeneralTabProps = {
    canManageSettings: boolean;
    generalName: string;
    setGeneralName: (value: string) => void;
    generalDescription: string;
    setGeneralDescription: (value: string) => void;
    generalThemeColor: string;
    setGeneralThemeColor: (value: string) => void;
    onSaveGeneral: () => void;
    updateProjectPending: boolean;
};

function GeneralTab({
    canManageSettings,
    generalName,
    setGeneralName,
    generalDescription,
    setGeneralDescription,
    generalThemeColor,
    setGeneralThemeColor,
    onSaveGeneral,
    updateProjectPending,
}: GeneralTabProps) {
    return (
        <section className="space-y-4" data-testid="project-settings-general-section">
            <h2 className="text-lg font-medium">General</h2>
            <div className="grid gap-4 rounded-lg border p-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium">Project name</label>
                    <Input
                        value={generalName}
                        disabled={!canManageSettings}
                        onChange={(event) => setGeneralName(event.target.value)}
                        data-testid="project-settings-general-name-input"
                    />
                </div>
                <div className="space-y-2 md:col-span-2">
                    <label className="text-sm font-medium">Description</label>
                    <Input
                        value={generalDescription}
                        disabled={!canManageSettings}
                        onChange={(event) => setGeneralDescription(event.target.value)}
                        data-testid="project-settings-general-description-input"
                    />
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium">Theme color</label>
                    <Input
                        value={generalThemeColor}
                        disabled={!canManageSettings}
                        onChange={(event) => setGeneralThemeColor(event.target.value)}
                        placeholder={DEFAULT_PROJECT_THEME_COLOR}
                        data-testid="project-settings-general-theme-input"
                    />
                </div>
                <div className="flex items-end">
                    <Button
                        type="button"
                        onClick={onSaveGeneral}
                        disabled={!canManageSettings || updateProjectPending}
                        data-testid="project-settings-general-save-button"
                    >
                        {updateProjectPending ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            "Save General"
                        )}
                    </Button>
                </div>
            </div>
        </section>
    );
}

