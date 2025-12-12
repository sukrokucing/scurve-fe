import { createBrowserRouter, Navigate } from "react-router-dom";
import { Suspense, lazy } from "react";
import LoadingFallback from "@/components/ui/LoadingFallback";
import RootLayout from "@/components/layout/RootLayout";

import { ProtectedRoute } from "@/auth/ProtectedRoute";

const LoginForm = lazy(() => import("@/auth/LoginForm").then((m) => ({ default: m.LoginForm })));
const RegisterForm = lazy(() => import("@/auth/RegisterForm").then((m) => ({ default: m.RegisterForm })));
const AuthLayout = lazy(() => import("@/pages/auth/AuthLayout").then((m) => ({ default: m.AuthLayout })));
const DashboardPage = lazy(() => import("@/pages/dashboard/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const ProjectsPage = lazy(() => import("@/pages/projects/ProjectsPage").then((m) => ({ default: m.ProjectsPage })));
const TasksPage = lazy(() => import("@/pages/tasks/TasksPage").then((m) => ({ default: m.TasksPage })));
const AppLayout = lazy(() => import("@/components/layout/AppLayout").then((m) => ({ default: m.AppLayout })));

// Admin
const RolesPage = lazy(() => import("@/pages/admin/RolesPage").then((m) => ({ default: m.RolesPage })));
const UserAccessPage = lazy(() => import("@/pages/admin/UserAccessPage").then((m) => ({ default: m.UserAccessPage })));
const PolicyPage = lazy(() => import("@/pages/admin/PolicyPage").then((module) => ({ default: module.PolicyPage })));
const AccessFlowPage = lazy(() => import("@/pages/admin/AccessFlowPage").then((module) => ({ default: module.AccessFlowPage })));

export const router = createBrowserRouter([
    {
        element: (
            <Suspense fallback={<LoadingFallback />}>
                <RootLayout />
            </Suspense>
        ),
        children: [
            {
                path: "/login",
                element: (
                    <Suspense fallback={<LoadingFallback />}>
                        <AuthLayout
                            title="Welcome back"
                            description="Enter your credentials to access S-Curve."
                            form={<LoginForm />}
                            footer={{
                                prompt: "Don't have an account?",
                                linkLabel: "Create one",
                                linkTo: "/register",
                            }}
                        />
                    </Suspense>
                ),
            },
            {
                path: "/register",
                element: (
                    <Suspense fallback={<LoadingFallback />}>
                        <AuthLayout
                            title="Create your account"
                            description="Set up your workspace to start managing projects."
                            form={<RegisterForm />}
                            footer={{
                                prompt: "Already have an account?",
                                linkLabel: "Sign in",
                                linkTo: "/login",
                            }}
                        />
                    </Suspense>
                ),
            },
            {
                path: "/",
                element: <ProtectedRoute />,
                children: [
                    {
                        element: (
                            <Suspense fallback={<LoadingFallback className="py-12" />}>
                                <AppLayout />
                            </Suspense>
                        ),
                        children: [
                            {
                                index: true,
                                element: (
                                    <Suspense fallback={<LoadingFallback />}>
                                        <DashboardPage />
                                    </Suspense>
                                ),
                            },
                            {
                                path: "projects",
                                element: (
                                    <Suspense fallback={<LoadingFallback />}>
                                        <ProjectsPage />
                                    </Suspense>
                                ),
                            },
                            {
                                path: "tasks",
                                element: (
                                    <Suspense fallback={<LoadingFallback />}>
                                        <TasksPage />
                                    </Suspense>
                                ),
                            },
                            {
                                path: "admin",
                                children: [
                                    {
                                        path: "roles",
                                        element: (
                                            <Suspense fallback={<LoadingFallback />}>
                                                <RolesPage />
                                            </Suspense>
                                        ),
                                    },
                                    {
                                        path: "users/:userId",
                                        element: (
                                            <Suspense fallback={<LoadingFallback />}>
                                                <UserAccessPage />
                                            </Suspense>
                                        ),
                                    },
                                    {
                                        path: "policy",
                                        element: (
                                            <Suspense fallback={<LoadingFallback />}>
                                                <PolicyPage />
                                            </Suspense>
                                        ),
                                    },
                                    {
                                        path: "flow",
                                        element: (
                                            <Suspense fallback={<LoadingFallback />}>
                                                <AccessFlowPage />
                                            </Suspense>
                                        ),
                                    },
                                ],
                            },
                            {
                                path: "*",
                                element: <Navigate to="/" replace />,
                            },
                        ],
                    },
                ],
            },
        ],
    },
]);
