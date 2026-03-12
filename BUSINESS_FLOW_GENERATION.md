# Business Flow -> Playwright Generation

## Goal

Use `business_flow.yaml` as the single source to generate Playwright scenario tests.

## Files

- `business_flow_example.yaml`: non-executable business taxonomy example.
- `business_flow.yaml`: executable flow definition (with action templates + locators).
- `scripts/generate-scenario-tests.mjs`: generator from YAML to Playwright spec.
- `e2e/generated/business-flow.generated.spec.ts`: generated output.

## Why this approach is better

`business_flow_example.yaml` is strong for domain language, but cannot be auto-run yet because:
- no route per scenario
- no UI locator contract
- no explicit action type (`click`, `fill`, `expect_visible`, etc.)

`business_flow.yaml` adds an automation layer while keeping business naming:
- reusable `action_library`
- per-flow `steps` that reference business actions
- env-backed credentials mapping

## Command flow

1. Generate test from YAML:
   - `npm run generate:e2e:scenario`
2. Run generated test with `.env` credentials:
   - `npm run test:e2e:scenario`

## Responsive Locators and Fallback Pattern

`business_flow.yaml` now uses a mobile-safe fallback pattern for action-heavy rows:

- Primary desktop locator step uses `kind: click_if_visible` for direct row buttons.
- Secondary mobile/tablet step opens compact actions (`projects-row-actions-toggle`) and clicks compact items.
- Both steps can exist in sequence; non-visible locators are safely skipped by the generator.

This keeps one YAML flow working across desktop and mobile-responsive UIs without duplicating the full flow definition.

## Current Projects Coverage

Projects module generated flows now include:

1. `project_create`
2. `project_read_dashboard`
3. `project_settings_read` (members/resource-rates/general tab visibility)
4. `project_settings_rate_override` (resource-rate override save + reset)
5. `project_update` (desktop + compact action fallback)
6. `project_delete` (desktop + compact action fallback)

## Env variables

Credential fallback priority in current config:

- Username:
  1. `PLAYWRIGHT_USERNAME`
  2. `TEST_EMAIL`
- Password:
  1. `PLAYWRIGHT_PASSWORD`
  2. `TEST_PASSWORD`

## Recommended next upgrade

1. Keep `business_flow_example.yaml` as business contract only.
2. Keep `business_flow.yaml` as executable contract.
3. Add CI job:
   - generate test
   - fail if generated file has diff
   - run generated scenarios in Playwright.
