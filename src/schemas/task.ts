import { z } from "zod";

export const taskSchema = z.object({
  title: z.string().min(1, "Title is required"),
  due_date: z.string().optional(),
  // use domain status values (todo/in_progress/blocked/done) so form values align with app domain
  status: z.enum(["todo", "in_progress", "blocked", "done"]).optional(),
});

export type TaskFormValues = z.infer<typeof taskSchema>;
