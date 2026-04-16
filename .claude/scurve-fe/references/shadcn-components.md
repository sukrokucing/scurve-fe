# shadcn/ui Component Reference

Docs: https://ui.shadcn.com/docs/components

## Layout
| Component | Use |
|---|---|
| `Card` | Group related content in bordered container |
| `Separator` | Visual divider |
| `Scroll Area` | Styled scrollable container |
| `Resizable` | User-resizable panels |
| `Sidebar` | App navigation sidebar |

## Navigation
| Component | Use |
|---|---|
| `Breadcrumb` | Multi-level location |
| `Navigation Menu` | Top-level nav bar |
| `Tabs` | Switch views on same page |
| `Pagination` | Multi-page data nav |

## Data Display
| Component | Use |
|---|---|
| `Table` | Structured rows (with TanStack Table) |
| `Data Table` | Full sorting/filtering table |
| `Badge` | Status labels, tags, counts |
| `Avatar` | Profile images with fallback |
| `Progress` | Completion bars |
| `Chart` | Data viz (wraps Recharts) |
| `Calendar` | Date display/selection |

## Overlay
| Component | Use |
|---|---|
| `Dialog` | Create/edit forms, confirmations |
| `Alert Dialog` | Destructive action confirms (delete, reset) |
| `Sheet` | Side panel flows, filters, details |
| `Drawer` | Mobile bottom sheet |
| `Popover` | Inline contextual content |
| `Hover Card` | Preview on hover |
| `Tooltip` | Short label hints |

## Forms
| Component | Use |
|---|---|
| `Form` | React Hook Form context wrapper |
| `Input` / `Textarea` | Text entry |
| `Select` | Dropdown single-choice |
| `Combobox` | Searchable dropdown (Command + Popover) |
| `Checkbox` | Boolean/multi-select |
| `Radio Group` | Single-choice from visible list |
| `Switch` | Toggle on/off |
| `Slider` | Range/value drag |
| `Date Picker` | Calendar date input |
| `Label` | Accessible field label |

## Feedback
| Component | Use |
|---|---|
| `Alert` | Inline status messages |
| `Sonner` | Toast notifications (prefer over Toast) |
| `Skeleton` | Loading placeholder matching content shape |
| `Empty` | Empty state with message/action |

## Actions
| Component | Use |
|---|---|
| `Button` | Primary trigger (default, outline, ghost, destructive) |
| `Dropdown Menu` | Action list from button |
| `Context Menu` | Right-click actions |
| `Command` | Command palette / search |
| `Toggle` / `Toggle Group` | Binary state buttons |
| `Collapsible` / `Accordion` | Expand/collapse sections |

## Quick Patterns

### Delete Confirmation
```tsx
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">Delete</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
      <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### Toast
```tsx
import { toast } from 'sonner'
toast.success('Project created')
toast.error('Something went wrong')
```

### Skeleton Loading
```tsx
{isLoading ? (
  <div className="space-y-2">
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-10 w-full" />
    <Skeleton className="h-10 w-3/4" />
  </div>
) : (
  <ProjectTable data={data} />
)}
```
