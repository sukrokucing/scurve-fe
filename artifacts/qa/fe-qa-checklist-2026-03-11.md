# FE QA Checklist Report (BE update: March 11, 2026)

- Generated at: 2026-03-11T09:05:54.749Z
- Base URL: https://localhost:8800
- Overall: 10/10 passed, 0 failed, 0 skipped

## 1. Regenerate client from latest OpenAPI and verify progress payload cleanup
- Status: **PASS**
- Duration: 8370 ms
- Details:
  - command: npm run -s generate:schemas:remote
  - forbiddenFieldMatches: 0

## 2. Auth smoke
- Status: **PASS**
- Duration: 489 ms
- Details:
  - health: 200
  - protectedWithoutToken: 401
  - protectedWithToken: 200
  - userId: a248d96a-765e-4fae-9977-969110cffb86

## 3. Membership contract update
- Status: **PASS**
- Duration: 3523 ms
- Details:
  - projectId: c91b4974-d0c6-4704-9dcd-b903d63cc499
  - createdMemberStatus: 201
  - membersCount: 2
  - myScopesCount: 11
  - legacyPayloadStatus: 422
  - assignedResourceRoleIds: ["40000000-0000-0000-0000-000000000001"]

## 4. Resource role catalog CRUD
- Status: **PASS**
- Duration: 484 ms
- Details:
  - createStatus: 201
  - updateStatus: 200
  - deleteStatus: 204

## 5. Project role rate overrides
- Status: **PASS**
- Duration: 469 ms
- Details:
  - roleId: 40000000-0000-0000-0000-000000000001
  - defaultRate: 0
  - overrideRate: 17.25
  - putStatus: 200
  - deleteStatus: 204

## 6. Work logs CRUD (economic source of truth)
- Status: **PASS**
- Duration: 1603 ms
- Details:
  - projectId: c91b4974-d0c6-4704-9dcd-b903d63cc499
  - taskId: e4d19a66-d6d2-4b81-9ab6-cf27de42d180
  - createdStatus: 201
  - updatedStatus: 200
  - deletedStatus: 204
  - metricLogStatus: 201
  - metricLogId: e5f8261a-c1de-41f5-8e1e-2ebef2539f0f

## 7. Work-log authorization rules
- Status: **PASS**
- Duration: 1828 ms
- Details:
  - outsiderReadStatus: 404
  - outsiderWriteStatus: 404
  - unassignedRoleStatus: 403
  - otherUserStatus: 403
  - restrictedAccessRole: backend_developer

## 8. Progress contract breaking change
- Status: **PASS**
- Duration: 202 ms
- Details:
  - createStatus: 201
  - updateStatus: 200
  - invalidLegacyPostStatus: 422
  - invalidLegacyPutStatus: 422
  - progressId: bace835c-0ccc-41ec-a4a4-e2014248078f

## 9. Dashboard + S-curve metrics contract
- Status: **PASS**
- Duration: 409 ms
- Details:
  - projectId: c91b4974-d0c6-4704-9dcd-b903d63cc499
  - metrics: [{"metric":"progress","dashboardStatus":200,"dashboardDataStatus":"ok","healthStatus":200,"healthDataStatus":"ok","portfolioStatus":200,"portfolioDataStatus":"ok"},{"metric":"hours","dashboardStatus":200,"dashboardDataStatus":"ok","healthStatus":200,"healthDataStatus":"ok","portfolioStatus":200,"portfolioDataStatus":"ok"},{"metric":"cost","dashboardStatus":200,"dashboardDataStatus":"ok","healthStatus":200,"healthDataStatus":"ok","portfolioStatus":200,"portfolioDataStatus":"ok"}]

## 10. Regression checks + strict route coverage
- Status: **PASS**
- Duration: 113 ms
- Details:
  - taskUpdateStatus: 200
  - progressListStatus: 200
  - checkedStrictPaths: ["/projects/{project_id}/resource-roles/{resource_role_id}/rate","/projects/{project_id}/tasks/{task_id}/work-logs","/projects/{project_id}/tasks/{task_id}/work-logs/{id}"]
  - rateEndpointStatuses: [200,204]
  - workLogEndpointStatuses: [201,200,200,204,200,201,404,404,403,403]

