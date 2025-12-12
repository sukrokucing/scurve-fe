import type { components } from "@/types/api";
import type { Role, Permission } from "@/api/rbac";

// Re-using the User type from components
export type User = components["schemas"]["User"];

// Mock data until backend implements GET /users
const MOCK_USERS: User[] = [
    {
        id: "00000000-0000-0000-0000-000000000001",
        name: "Admin User",
        email: "admin@example.com",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: "00000000-0000-0000-0000-000000000002",
        name: "Alice Engineer",
        email: "alice@example.com",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    },
    {
        id: "00000000-0000-0000-0000-000000000003",
        name: "Bob Manager",
        email: "bob@example.com",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    }
];

// Mock roles for these users
const MOCK_USER_ROLES: Record<string, Role[]> = {
    "00000000-0000-0000-0000-000000000001": [
        { id: "role-1", name: "Admin", description: "Full access to everything", created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    ],
    "00000000-0000-0000-0000-000000000002": [
        { id: "role-2", name: "Editor", description: "Can edit content", created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    ],
    "00000000-0000-0000-0000-000000000003": [
        { id: "role-3", name: "Viewer", description: "Read-only access", created_at: new Date().toISOString(), updated_at: new Date().toISOString() }
    ]
};

const MOCK_ROLE_PERMS: Record<string, Permission[]> = {
    "role-1": [
        { id: "p1", name: "project.create", description: "Create projects", created_at: "", updated_at: "" },
        { id: "p2", name: "project.delete", description: "Delete projects", created_at: "", updated_at: "" },
        { id: "p3", name: "user.manage", description: "Manage users", created_at: "", updated_at: "" },
    ],
    "role-2": [
        { id: "p1", name: "project.create", description: "Create projects", created_at: "", updated_at: "" },
        { id: "p4", name: "task.create", description: "Create tasks", created_at: "", updated_at: "" },
    ],
    "role-3": [
        { id: "p5", name: "project.view", description: "View projects", created_at: "", updated_at: "" },
    ]
};

export const usersApi = {
    async listUsers(): Promise<User[]> {
        // Simulating API call
        return new Promise((resolve) => {
            setTimeout(() => resolve(MOCK_USERS), 500);
        });
    },

    // Mock implementation for user roles (since we are using mock users who don't exist on backend)
    async getMockUserRoles(userId: string): Promise<Role[]> {
        return new Promise((resolve) => {
            setTimeout(() => resolve(MOCK_USER_ROLES[userId] || []), 300);
        });
    },

    async getMockRolePermissions(roleId: string): Promise<Permission[]> {
        return new Promise((resolve) => {
            setTimeout(() => resolve(MOCK_ROLE_PERMS[roleId] || []), 300);
        });
    }
};
