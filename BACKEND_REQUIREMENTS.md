# Backend Schema Requirements for Gantt Chart

## Current Situation

The frontend Gantt chart implementation is functional but limited by the current backend `Task` schema. We're currently using workarounds:
- **Start Date**: Using `created_at` as interim start date (not accurate for project planning)
- **Dependencies**: No support for task dependencies/predecessors

## Required Schema Changes

### 1. Add `start_date` field to Task

**Current Schema:**
```rust
pub struct Task {
    pub id: Uuid,
    pub project_id: Uuid,
    pub title: String,
    pub status: String,
    pub due_date: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    // ... other fields
}
```

**Proposed Addition:**
```rust
pub struct Task {
    pub id: Uuid,
    pub project_id: Uuid,
    pub title: String,
    pub status: String,
    pub start_date: Option<DateTime<Utc>>,  // NEW: When task actually starts
    pub due_date: Option<DateTime<Utc>>,     // End date
    pub created_at: DateTime<Utc>,
    // ... other fields
}
```

**API Changes Needed:**
- `POST /projects/{id}/tasks` - Accept optional `start_date` in request body
- `PUT /projects/{project_id}/tasks/{id}` - Accept optional `start_date` in request body
- `GET /projects/{id}/tasks` - Return `start_date` in response

**Database Migration:**
```sql
ALTER TABLE tasks ADD COLUMN start_date TIMESTAMP WITH TIME ZONE;
```

### 2. Add Task Dependencies Support

**New Table Required:**
```sql
CREATE TABLE task_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    depends_on_task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    dependency_type VARCHAR(50) DEFAULT 'finish-to-start',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(task_id, depends_on_task_id)
);

-- Prevent circular dependencies
CREATE INDEX idx_task_dependencies_task_id ON task_dependencies(task_id);
CREATE INDEX idx_task_dependencies_depends_on ON task_dependencies(depends_on_task_id);
```

**New Rust Struct:**
```rust
pub struct TaskDependency {
    pub id: Uuid,
    pub task_id: Uuid,
    pub depends_on_task_id: Uuid,
    pub dependency_type: String,  // "finish-to-start", "start-to-start", etc.
    pub created_at: DateTime<Utc>,
}
```

**New API Endpoints:**
```
POST   /projects/{project_id}/tasks/{task_id}/dependencies
GET    /projects/{project_id}/tasks/{task_id}/dependencies
DELETE /projects/{project_id}/tasks/{task_id}/dependencies/{dependency_id}
```

**Request/Response Examples:**

Create dependency:
```json
POST /projects/{project_id}/tasks/{task_id}/dependencies
{
  "depends_on_task_id": "uuid-here",
  "dependency_type": "finish-to-start"
}
```

### 3. Optional: Enhance Task with Duration

```rust
pub struct Task {
    // ... existing fields
    pub start_date: Option<DateTime<Utc>>,
    pub due_date: Option<DateTime<Utc>>,
    pub duration_days: Option<i32>,  // NEW: Calculated or manual override
    // ...
}
```

## Implementation Priority

### Phase 1 (Critical for Basic Gantt)
- ✅ Add `start_date` field to Task schema
- ✅ Update Task CRUD endpoints to support `start_date`
- ✅ Database migration

### Phase 2 (For Full Gantt Functionality)
- Add `task_dependencies` table
- Implement dependency CRUD endpoints
- Add circular dependency validation

### Phase 3 (Nice to Have)
- Add `duration_days` field
- Auto-calculate dates based on dependencies
- Add critical path calculation

## Frontend Impact

Once implemented, the frontend will:
1. Use actual `start_date` instead of `created_at` for timeline positioning
2. Support drag-and-drop task scheduling with real dates
3. Visualize task dependencies with connecting lines
4. Validate dependency constraints (can't start before predecessor finishes)

## Questions?

Please let me know if you need:
- More detailed API specifications
- Example migration scripts
- Clarification on dependency types
- Help with validation logic

## Timeline Request

Could you provide an estimate for:
- Phase 1 implementation time?
- Any blockers or concerns?
- Preferred approach for handling dependencies?
