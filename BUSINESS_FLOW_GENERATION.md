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
