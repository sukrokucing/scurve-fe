# shadcn/ui Component Reference

Full docs: https://ui.shadcn.com/docs/components

## Layout & Structure

| Component | Use when |
|---|---|
| `Card` | Grouping related content in a bordered container |
| `Separator` | Visual divider between sections |
| `Scroll Area` | Scrollable container with styled scrollbars |
| `Resizable` | Panels that users can resize by dragging |
| `Aspect Ratio` | Fixed ratio containers (images, videos) |
| `Sidebar` | App-level navigation sidebar |

## Navigation

| Component | Use when |
|---|---|
| `Breadcrumb` | Showing location in multi-level navigation |
| `Navigation Menu` | Top-level app navigation bar |
| `Tabs` | Switching between views/sections on same page |
| `Menubar` | App-style menu bar (File, Edit, View…) |
| `Pagination` | Navigating multi-page data sets |

## Data Display

| Component | Use when |
|---|---|
| `Table` | Structured data rows (use with TanStack Table) |
| `Data Table` | Full-featured table with sorting/filtering |
| `Badge` | Status labels, category tags, counts |
| `Avatar` | User/entity profile images with fallback |
| `Progress` | Upload, task completion, loading bars |
| `Chart` | Data visualization (wraps Recharts) |
| `Carousel` | Horizontally scrollable item sets |
| `Calendar` | Date display and selection |
| `Typography` | Consistent heading/body text styles |

## Overlay & Modal

| Component | Use when |
|---|---|
| `Dialog` | Focused tasks: create/edit forms, confirmations |
| `Alert Dialog` | Destructive action confirmation (delete, reset) |
| `Sheet` | Side panel flows, filters, detail views |
| `Drawer` | Mobile-friendly bottom sheet |
| `Popover` | Inline contextual content anchored to an element |
| `Hover Card` | Preview card on hover (links, user profiles) |
| `Tooltip` | Short label hints on hover |

## Forms & Input

| Component | Use when |
|---|---|
| `Form` | Wrapper with React Hook Form context |
| `Input` | Single-line text entry |
| `Textarea` | Multi-line text entry |
| `Select` | Dropdown single-choice selection |
| `Native Select` | Browser-native `<select>` (for performance) |
| `Combobox` | Searchable dropdown (Command + Popover) |
| `Checkbox` | Boolean or multi-select options |
| `Radio Group` | Single-choice from a visible list |
| `Switch` | Toggle on/off settings |
| `Slider` | Range/value selection via drag |
| `Date Picker` | Calendar-based date input |
| `Input OTP` | One-time password / verification code entry |
| `Label` | Accessible field label |
| `Field` | Label + input + error grouped together |
| `Input Group` | Input with prefix/suffix adornments |

## Feedback & Status

| Component | Use when |
|---|---|
| `Alert` | Inline status messages (info, warning, error) |
| `Sonner` | Toast notifications (via `sonner` library) |
| `Toast` | Legacy toast (prefer Sonner for new code) |
| `Skeleton` | Loading placeholder that mirrors content shape |
| `Spinner` | Generic loading indicator |
| `Empty` | Empty state with message/action |
| `Progress` | Determinate loading or completion % |

## Actions & Controls

| Component | Use when |
|---|---|
| `Button` | Primary action trigger (variants: default, outline, ghost, destructive) |
| `Button Group` | Related actions side by side |
| `Dropdown Menu` | Context menu / action list from a button |
| `Context Menu` | Right-click contextual actions |
| `Command` | Command palette / search interface |
| `Toggle` | Single binary state button |
| `Toggle Group` | Grouped toggle options (single or multi) |
| `Collapsible` | Expand/collapse a section |
| `Accordion` | Multiple collapsible sections |

## Utility

| Component | Use when |
|---|---|
| `Kbd` | Displaying keyboard shortcut keys |
| `Item` | Generic list item container |
| `Direction` | RTL/LTR direction provider |

---

## Quick Patterns

### Confirmation Dialog (Delete)
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

### Toast (Sonner)
```tsx
import { toast } from 'sonner'
toast.success('Project created')
toast.error('Something went wrong')
```

### Badge Status
```tsx
<Badge variant="outline">Active</Badge>
<Badge variant="destructive">Rejected</Badge>
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
