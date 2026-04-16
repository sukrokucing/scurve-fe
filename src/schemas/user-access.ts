import { z } from "zod";

export const assignRoleSchema = z.object({
    roleId: z.string().min(1, "Please select a role"),
});

export type AssignRoleValues = z.infer<typeof assignRoleSchema>;
