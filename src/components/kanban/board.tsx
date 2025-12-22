"use client";

import {
    type Announcements,
    type DndContextProps,
    type DragEndEvent,
    type DragOverEvent,
    type DragStartEvent,
    closestCenter,
    DndContext,
    DragOverlay,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useDroppable,
    useSensor,
    useSensors,
} from "@dnd-kit/core";
import {
    useSortable,
    SortableContext,
    verticalListSortingStrategy,
    sortableKeyboardCoordinates,
    arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
    createContext,
    type HTMLAttributes,
    type ReactNode,
    useContext,
    useState,
    useMemo,
    useRef,
} from "react";
import { createPortal } from "react-dom";
import tunnel from "tunnel-rat";
import { Card } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const t = tunnel();

// --- Types ---

export type KanbanItemProps = {
    id: string;
    column: string;
} & Record<string, unknown>;

export type KanbanColumnProps = {
    id: string;
    title: string;
} & Record<string, unknown>;

type KanbanContextProps<
    T extends KanbanItemProps = KanbanItemProps,
    C extends KanbanColumnProps = KanbanColumnProps
> = {
    columns: C[];
    data: T[];
    activeItemId: string | null;
};

// --- Context ---

const KanbanContext = createContext<KanbanContextProps>({
    columns: [],
    data: [],
    activeItemId: null,
});

// --- Components ---

export type KanbanBoardProps = {
    id: string;
    children: ReactNode;
    className?: string;
};

export const KanbanBoard = ({ id, children, className }: KanbanBoardProps) => {
    const { setNodeRef, isOver } = useDroppable({
        id,
        data: { type: "Column" }, // Mark as column for dnd logic
    });

    return (
        <div
            ref={setNodeRef}
            className={cn(
                "flex h-full w-[300px] min-w-[300px] flex-col rounded-xl border bg-secondary/50 backdrop-blur-sm transition-colors",
                isOver ? "bg-secondary/80" : "",
                className
            )}
        >
            {children}
        </div>
    );
};

export type KanbanHeaderProps = HTMLAttributes<HTMLDivElement>;

export const KanbanHeader = ({ className, ...props }: KanbanHeaderProps) => (
    <div
        className={cn("flex items-center justify-between p-4 font-semibold", className)}
        {...props}
    />
);

export type KanbanCardsProps<T extends KanbanItemProps = KanbanItemProps> = Omit<
    HTMLAttributes<HTMLDivElement>,
    "children" | "id"
> & {
    children: (item: T) => ReactNode;
    id: string; // Column ID
};

export const KanbanCards = <T extends KanbanItemProps = KanbanItemProps>({
    children,
    className,
    id,
    ...props
}: KanbanCardsProps<T>) => {
    const { data } = useContext(KanbanContext) as KanbanContextProps<T>;

    const columnItems = useMemo(() => {
        return data.filter((item) => item.column === id);
    }, [data, id]);

    const itemIds = useMemo(() => columnItems.map((item) => item.id), [columnItems]);

    const viewportRef = useRef<HTMLDivElement>(null as any);

    const rowVirtualizer = useVirtualizer({
        count: columnItems.length,
        getScrollElement: () => viewportRef.current,
        estimateSize: () => 100, // Approximate height of a card + margin
        overscan: 5,
    });

    return (
        <ScrollArea className="flex-1 px-3 pb-3" viewportRef={viewportRef}>
            <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
                <div className={cn("flex flex-col", className)} {...props}>
                    {rowVirtualizer.getVirtualItems().length > 0 && (
                        <div style={{ height: `${rowVirtualizer.getVirtualItems()[0].start}px` }} />
                    )}

                    {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                        const item = columnItems[virtualItem.index];
                        return (
                            <div
                                key={item.id}
                                data-index={virtualItem.index}
                                ref={rowVirtualizer.measureElement}
                                className="mb-3"
                            >
                                {children(item)}
                            </div>
                        );
                    })}

                    {rowVirtualizer.getVirtualItems().length > 0 && (
                        <div style={{ height: `${rowVirtualizer.getTotalSize() - rowVirtualizer.getVirtualItems()[rowVirtualizer.getVirtualItems().length - 1].end}px` }} />
                    )}
                </div>
            </SortableContext>
            <ScrollBar orientation="vertical" />
        </ScrollArea>
    );
};

export type KanbanCardProps<T extends KanbanItemProps = KanbanItemProps> = {
    item: T;
    children?: ReactNode;
    className?: string;
    onDoubleClick?: (item: T) => void;
};

export const KanbanCard = <T extends KanbanItemProps = KanbanItemProps>({
    item,
    children,
    className,
    onDoubleClick,
}: KanbanCardProps<T>) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        id: item.id,
        data: { type: "Task", item },
    });

    const { activeItemId } = useContext(KanbanContext) as KanbanContextProps;

    const style = {
        transition,
        transform: CSS.Transform.toString(transform),
    };

    return (
        <>
            <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
                <Card
                    onDoubleClick={(e) => {
                        e.stopPropagation();
                        onDoubleClick?.(item);
                    }}
                    className={cn(
                        "cursor-grab gap-4 rounded-md p-3 shadow-sm transition-all hover:shadow-md",
                        isDragging && "pointer-events-none cursor-grabbing opacity-30",
                        className
                    )}
                >
                    {children}
                </Card>
            </div>
            {activeItemId === item.id && (
                <t.In>
                    <Card
                        className={cn(
                            "cursor-grab gap-4 rounded-md p-3 shadow-sm ring-2 ring-primary",
                            isDragging && "cursor-grabbing",
                            className
                        )}
                    >
                        {children}
                    </Card>
                </t.In>
            )}
        </>
    );
};

// --- Provider ---

export type KanbanProviderProps<
    T extends KanbanItemProps = KanbanItemProps,
    C extends KanbanColumnProps = KanbanColumnProps
> = Omit<DndContextProps, "children"> & {
    children: (column: C) => ReactNode;
    className?: string;
    columns: C[];
    data: T[];
    onDataChange?: (data: T[]) => void;
    onColumnChange?: (itemId: string, newColumnId: string) => void;
};

export const KanbanProvider = <
    T extends KanbanItemProps = KanbanItemProps,
    C extends KanbanColumnProps = KanbanColumnProps
>({
    children,
    onDragStart,
    onDragEnd,
    onDragOver,
    className,
    columns,
    data,
    onDataChange,
    onColumnChange,
    ...props
}: KanbanProviderProps<T, C>) => {
    const [activeItemId, setActiveItemId] = useState<string | null>(null);
    const [optimisticData, setOptimisticData] = useState<T[]>(data);

    useMemo(() => {
        setOptimisticData(data);
    }, [data]);

    const sensors = useSensors(
        useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const announcements: Announcements = {
        onDragStart({ active }) {
            return `Picked up task ${active.id}.`;
        },
        onDragOver({ active, over }) {
            if (over) {
                return `Task ${active.id} was moved over ${over.id}.`;
            }
            return `Task ${active.id} is no longer over a droppable area.`;
        },
        onDragEnd({ active, over }) {
            if (over) {
                return `Task ${active.id} was dropped over ${over.id}.`;
            }
            return `Task ${active.id} was dropped.`;
        },
        onDragCancel({ active }) {
            return `Dragging was cancelled. Task ${active.id} was dropped.`;
        },
    };

    const handleDragStart = (event: DragStartEvent) => {
        setActiveItemId(event.active.id as string);
        onDragStart?.(event);
    };

    const handleDragOver = (event: DragOverEvent) => {
        const { active, over } = event;
        if (!over) return;

        const activeId = active.id as string;
        const overId = over.id as string;

        // Find the active item
        const activeItem = optimisticData.find((item) => item.id === activeId);
        if (!activeItem) return;

        // Find over item or column
        const overItem = optimisticData.find((item) => item.id === overId);
        const overColumn = columns.find((col) => col.id === overId);

        const activeColumn = activeItem.column;
        let newColumn: string | null = null;

        if (overItem) {
            newColumn = overItem.column;
        } else if (overColumn) {
            newColumn = overColumn.id;
        }

        if (newColumn && activeColumn !== newColumn) {
            // Cross-column move
            setOptimisticData((prev) => {
                const activeIndex = prev.findIndex((item) => item.id === activeId);
                const overIndex = overItem
                    ? prev.findIndex((item) => item.id === overId)
                    : prev.filter((item) => item.column === newColumn).length;

                let newData = [...prev];
                newData[activeIndex] = { ...newData[activeIndex], column: newColumn };
                newData = arrayMove(newData, activeIndex, overIndex);
                return newData;
            });
        } else if (activeColumn === newColumn && overItem) {
            // Within-column reorder
            setOptimisticData((prev) => {
                const oldIndex = prev.findIndex((item) => item.id === activeId);
                const newIndex = prev.findIndex((item) => item.id === overId);
                return arrayMove(prev, oldIndex, newIndex);
            });
        }

        onDragOver?.(event);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveItemId(null);

        if (!over) {
            onDragEnd?.(event);
            return;
        }

        const activeId = active.id as string;
        const overId = over.id as string;

        const activeItem = data.find((item) => item.id === activeId);
        if (!activeItem) {
            onDragEnd?.(event);
            return;
        }

        let newColumn = activeItem.column;

        // If over a column
        const overColumn = columns.find((col) => col.id === overId);
        if (overColumn) {
            newColumn = overColumn.id;
        } else {
            // If over another item
            const overItem = data.find((item) => item.id === overId);
            if (overItem) {
                newColumn = overItem.column;
            }
        }

        if (newColumn !== activeItem.column) {
            onColumnChange?.(activeId, newColumn);
        }

        // Also call onDataChange if reordering occurred
        if (onDataChange) {
            onDataChange(optimisticData);
        }

        onDragEnd?.(event);
    };

    return (
        <KanbanContext.Provider value={{ columns, data: optimisticData, activeItemId }}>
            <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                accessibility={{ announcements }}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                {...props}
            >
                <div className={cn("flex h-full gap-4 overflow-x-auto pb-4", className)}>
                    {columns.map((column) => children(column))}
                </div>
                {typeof window !== "undefined" &&
                    createPortal(
                        <DragOverlay>
                            <t.Out />
                        </DragOverlay>,
                        document.body
                    )}
            </DndContext>
        </KanbanContext.Provider>
    );
};
