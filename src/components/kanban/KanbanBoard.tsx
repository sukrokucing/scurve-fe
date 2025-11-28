import { useMemo, useState } from "react";
import {
    DndContext,
    DragOverlay,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragStartEvent,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task, TaskStatus } from "@/types/domain";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface KanbanBoardProps {
    tasks: Task[];
    onUpdateTask: (taskId: string, newStatus: TaskStatus) => void;
}

const COLUMNS: { id: TaskStatus; title: string; color: string }[] = [
    { id: "todo", title: "To Do", color: "bg-slate-500/10 border-slate-500/20" },
    { id: "in_progress", title: "In Progress", color: "bg-blue-500/10 border-blue-500/20" },
    { id: "blocked", title: "Blocked", color: "bg-red-500/10 border-red-500/20" },
    { id: "done", title: "Done", color: "bg-green-500/10 border-green-500/20" },
];

export function KanbanBoard({ tasks, onUpdateTask }: KanbanBoardProps) {
    const [activeId, setActiveId] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5, // Prevent accidental drags
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const tasksByStatus = useMemo(() => {
        const grouped: Record<TaskStatus, Task[]> = {
            todo: [],
            in_progress: [],
            blocked: [],
            done: [],
        };
        tasks.forEach((task) => {
            if (grouped[task.status]) {
                grouped[task.status].push(task);
            } else {
                // Fallback for unknown status
                grouped.todo.push(task);
            }
        });
        return grouped;
    }, [tasks]);

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveId(null);

        if (!over) return;

        const activeId = active.id as string;
        const overId = over.id as string;

        // Find the task
        const task = tasks.find((t) => t.id === activeId);
        if (!task) return;

        // Determine new status
        // If dropped on a container (column), use that column's id
        // If dropped on another item, use that item's status
        let newStatus: TaskStatus | undefined;

        if (COLUMNS.some((col) => col.id === overId)) {
            newStatus = overId as TaskStatus;
        } else {
            const overTask = tasks.find((t) => t.id === overId);
            if (overTask) {
                newStatus = overTask.status;
            }
        }

        if (newStatus && newStatus !== task.status) {
            onUpdateTask(task.id, newStatus);
        }
    };

    return (
        <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
        >
            <div className="flex h-full gap-4 overflow-x-auto pb-4">
                {COLUMNS.map((col) => (
                    <KanbanColumn
                        key={col.id}
                        id={col.id}
                        title={col.title}
                        tasks={tasksByStatus[col.id]}
                        color={col.color}
                    />
                ))}
            </div>
            <DragOverlay>
                {activeId ? (
                    <KanbanCard task={tasks.find((t) => t.id === activeId)!} isOverlay />
                ) : null}
            </DragOverlay>
        </DndContext>
    );
}

function KanbanColumn({ id, title, tasks, color }: { id: string; title: string; tasks: Task[], color: string }) {
    const { setNodeRef } = useSortable({
        id: id,
        data: {
            type: "Column",
        },
        disabled: true, // Columns themselves are not draggable
    });

    return (
        <div ref={setNodeRef} className={cn("flex h-full w-[300px] min-w-[300px] flex-col rounded-xl border bg-card/50 backdrop-blur-sm", color)}>
            <div className="p-4 font-semibold flex items-center justify-between">
                {title}
                <Badge variant="secondary" className="ml-2">
                    {tasks.length}
                </Badge>
            </div>
            <ScrollArea className="flex-1 px-3 pb-3">
                <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                    <div className="flex flex-col gap-3">
                        {tasks.map((task) => (
                            <SortableTask key={task.id} task={task} />
                        ))}
                    </div>
                </SortableContext>
            </ScrollArea>
        </div>
    );
}

function SortableTask({ task }: { task: Task }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: task.id, data: { type: "Task", task } });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    if (isDragging) {
        return (
            <div
                ref={setNodeRef}
                style={style}
                className="opacity-50"
            >
                <KanbanCard task={task} />
            </div>
        );
    }

    return (
        <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
            <KanbanCard task={task} />
        </div>
    );
}

function KanbanCard({ task, isOverlay }: { task: Task; isOverlay?: boolean }) {
    return (
        <Card className={cn("cursor-grab active:cursor-grabbing hover:shadow-md transition-all", isOverlay ? "shadow-xl rotate-2 scale-105 cursor-grabbing" : "")}>
            <CardContent className="p-3 space-y-2">
                <div className="font-medium text-sm leading-tight">{task.name}</div>
                {task.description && (
                    <div className="text-xs text-muted-foreground line-clamp-2">{task.description}</div>
                )}
                <div className="flex items-center justify-between pt-2">
                    {task.assigneeId && (
                        <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] text-primary font-bold">
                            U
                        </div>
                    )}
                    {task.dueDate && (
                        <div className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {new Date(task.dueDate).toLocaleDateString()}
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
