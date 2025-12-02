import { z } from "zod";

export const taskSchema = z.object({
    title: z.string().min(1, "Title is required"),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    progress: z.number().min(0).max(100).optional(),
    // Legacy fields - keeping for backward compatibility but not used in streamlined edit
    due_date: z.string().optional(),
    status: z.enum(["todo", "in_progress", "blocked", "done"]).optional(),
    projectId: z.string().optional(),
});

export type TaskFormValues = z.infer<typeof taskSchema>;
