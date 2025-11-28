# Backend Schema Update Summary

## ✅ All Requested Features Implemented!

Your backend developer has implemented **everything** we requested in BACKEND_REQUIREMENTS.md and even more!

## What's New

### 1. ✅ Task Schema Enhancements

**New Fields Added to `Task`:**
```typescript
{
  start_date: string | null,     // NEW: Actual task start date
  end_date: string | null,       // NEW: Actual task end date
  duration_days: number | null,  // NEW: Task duration in days
  parent_id: string | null,      // NEW: Parent task for subtasks
  assignee: string | null,       // BONUS: Task assignee
  progress: number,              // BONUS: Now included in Task itself
}
```

**What This Means:**
- No more using `created_at` as a workaround for start date!
- Can now set actual project timeline dates
- Support for task hierarchies (parent/child tasks)
- Direct progress tracking on tasks

### 2. ✅ Task Dependencies API

**New Endpoints:**
```
GET    /projects/{project_id}/dependencies
POST   /projects/{project_id}/dependencies
DELETE /projects/{project_id}/dependencies/{id}
```

**TaskDependency Schema:**
```typescript
{
  id: string,
  source_task_id: string,      // The task that depends on another
  target_task_id: string,      // The task that must be completed first
  type_: string,               // Dependency type (e.g., "finish_to_start")
  created_at: string
}
```

**Dependency Types Supported:**
- `finish_to_start` - Task B can't start until Task A finishes

### 3. ✅ Batch Update API

**New Endpoint:**
```
PUT /projects/{project_id}/tasks/batch
```

This allows updating multiple tasks in a single API call - perfect for drag-and-drop operations in the Gantt chart!

## Frontend Work Needed

### Immediate Tasks

1. **Update OpenAPI Types**
   ```bash
   npm run generate:api
   ```
   This will regenerate TypeScript types from the new schema.

2. **Update Domain Types**
   - Add `startDate`, `endDate`, `durationDays`, `parentId`, `assignee` to `Task` interface
   - Remove workaround using `createdAt` as start date

3. **Update Gantt Components**
   - Use real `start_date` and `end_date` instead of calculated values
   - Add dependency visualization (connecting lines between dependent tasks)
   - Implement batch update for drag-and-drop operations

4. **Add Dependency Management UI**
   - UI to create task dependencies
   - Visualize dependencies in Gantt chart
   - Validate circular dependencies

### Recommended Approach

**Phase 1: Use Real Dates (Quick Win)**
- Update `GanttView.tsx` to map `start_date` and `end_date` from API
- Remove the `createdAt` workaround
- Test with existing tasks (they may have null dates initially)

**Phase 2: Enable Date Editing**
- Update `TaskTable.tsx` to send `start_date` and `end_date` in updates
- Implement drag-and-drop timeline adjustments using batch update API

**Phase 3: Add Dependencies**
- Create new `DependenciesManager` component
- Add connecting lines in Gantt timeline
- Implement dependency CRUD operations

## Breaking Changes?

**None!** All new fields are optional (`nullable: true`), so existing frontend code will continue to work. You can adopt these features incrementally.

## Next Steps

1. Run `npm run generate:api` to update types
2. Review the updated `src/types/api.d.ts`
3. Update `src/types/domain.ts` to include new fields
4. Start using real dates in Gantt chart

## Questions for Backend Team

1. Can you confirm the dependency `type_` values supported? (We see "finish_to_start" in examples)
2. Is there validation for circular dependencies on the backend?
3. How should `duration_days` be calculated - manually set or auto-calculated from dates?

---

**Status:** Ready to integrate! 🎉
