import { z } from "zod";

export const roleSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    description: z.string().optional(),
});

export type RoleFormValues = z.infer<typeof roleSchema>;

export const assignPermSchema = z.object({
    permissionId: z.string().min(1, "Select a permission"),
});

export type AssignPermValues = z.infer<typeof assignPermSchema>;
