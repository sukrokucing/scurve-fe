browser_click
Title: Click
Description: Perform click on a web page
Parameters:
element (string): Human-readable element description used to obtain permission to interact with the element
ref (string): Exact target element reference from the page snapshot
doubleClick (boolean, optional): Whether to perform a double click instead of a single click
button (string, optional): Button to click, defaults to left
modifiers (array, optional): Modifier keys to press
Read-only: false
browser_close
Title: Close browser
Description: Close the page
Parameters: None
Read-only: false
browser_console_messages
Title: Get console messages
# MCP Client — Browser Automation Tool Reference

This document lists the available browser automation helper functions (used by the MCP automation client) with descriptions and parameters.

> Note: `Read-only` indicates whether the function modifies page state or is intended only to read information.

---

### browser_click

- **Description:** Perform a click on a web page element.
- **Read-only:** false

**Parameters:**

| Name | Type | Description |
|---|---:|---|
| `element` | `string` | Human-readable element description used to obtain permission to interact with the element |
| `ref` | `string` | Exact target element reference from the page snapshot |
| `doubleClick` | `boolean` (optional) | Whether to perform a double click instead of a single click |
| `button` | `string` (optional) | Button to click, defaults to `left` |
| `modifiers` | `string[]` (optional) | Modifier keys to press (e.g., `['Control', 'Shift']`) |

---

### browser_close

- **Description:** Close the current browser page.
- **Read-only:** false

**Parameters:** None

---

### browser_console_messages

- **Description:** Return console messages captured during the session.
- **Read-only:** true

**Parameters:**

| Name | Type | Description |
|---|---:|---|
| `onlyErrors` | `boolean` (optional) | Only return error messages |

---

### browser_drag

- **Description:** Perform a drag-and-drop operation between two elements.
- **Read-only:** false

**Parameters:**

| Name | Type | Description |
|---|---:|---|
| `startElement` | `string` | Human-readable source element description to request permission for interaction |
| `startRef` | `string` | Exact source element reference from the page snapshot |
| `endElement` | `string` | Human-readable target element description to request permission for interaction |
| `endRef` | `string` | Exact target element reference from the page snapshot |

---

### browser_evaluate

- **Description:** Evaluate JavaScript in the page context and return the result.
- **Read-only:** false

**Parameters:**

| Name | Type | Description |
|---|---:|---|
| `function` | `string` | JavaScript function source as a string; e.g. `() => { /* code */ }` or `(element) => { /* code */ }` when element is provided |
| `element` | `string` (optional) | Human-readable element description for permission to interact with an element |
| `ref` | `string` (optional) | Exact target element reference from the page snapshot |

---

### browser_file_upload

- **Description:** Upload one or more files via the page file chooser.
- **Read-only:** false

**Parameters:**

| Name | Type | Description |
|---|---:|---|
| `paths` | `string[]` (optional) | Absolute paths to files to upload. If omitted the file chooser is cancelled |

---

### browser_fill_form

- **Description:** Fill multiple form fields in one call.
- **Read-only:** false

**Parameters:**

| Name | Type | Description |
|---|---:|---|
| `fields` | `Array<{ name: string, value: string }>` | Array describing fields to fill (name/selectors and desired values) |

---

### browser_handle_dialog

- **Description:** Handle a modal dialog (alert/prompt/confirm).
- **Read-only:** false

**Parameters:**

| Name | Type | Description |
|---|---:|---|
| `accept` | `boolean` | Whether to accept the dialog |
| `promptText` | `string` (optional) | Text to provide for `prompt` dialogs |

---

### browser_hover

- **Description:** Move the mouse to hover over an element.
- **Read-only:** false

**Parameters:**

| Name | Type | Description |
|---|---:|---|
| `element` | `string` | Human-readable element description for permission |
| `ref` | `string` | Exact element reference from the page snapshot |

---

### browser_navigate

- **Description:** Navigate the page to a URL.
- **Read-only:** false

**Parameters:**

| Name | Type | Description |
|---|---:|---|
| `url` | `string` | URL to navigate to |

---

### browser_navigate_back

- **Description:** Navigate back in browser history.
- **Read-only:** false

**Parameters:** None

---

### browser_network_requests

- **Description:** Return captured network requests since the page was loaded.
- **Read-only:** true

**Parameters:** None

---

### browser_press_key

- **Description:** Press a keyboard key or character.
- **Read-only:** false

**Parameters:**

| Name | Type | Description |
|---|---:|---|
| `key` | `string` | Key name or character to press (e.g., `ArrowLeft`, `a`) |

---

### browser_resize

- **Description:** Resize the browser viewport.
- **Read-only:** false

**Parameters:**

| Name | Type | Description |
|---|---:|---|
| `width` | `number` | Width of the viewport in pixels |
| `height` | `number` | Height of the viewport in pixels |

---

### browser_run_code

- **Description:** Run an arbitrary Playwright/automation code snippet. The snippet should use the `page` object available in the runner.
- **Read-only:** false

**Parameters:**

| Name | Type | Description |
|---|---:|---|
| `code` | `string` | Playwright code snippet to run (must be `async`-friendly); e.g. `await page.getByRole('button', { name: 'Submit' }).click();` |

---

### browser_select_option

- **Description:** Select one or more option values in a `<select>` element.
- **Read-only:** false

**Parameters:**

| Name | Type | Description |
|---|---:|---|
| `element` | `string` | Human-readable element description |
| `ref` | `string` | Exact element reference from the page snapshot |
| `values` | `string[]` | Array of values to select; single-value arrays are allowed |

---

### browser_snapshot

- **Description:** Capture an accessibility snapshot of the current page (preferred over screenshots for automated checks).
- **Read-only:** true

**Parameters:** None

---

### browser_take_screenshot

- **Description:** Take a PNG/JPEG screenshot of the page or a specific element. Note: you cannot perform DOM-interaction actions from the screenshot result; use `browser_snapshot` for accessibility-aware checks.
- **Read-only:** true

**Parameters:**

| Name | Type | Description |
|---|---:|---|
| `type` | `"png" | "jpeg"` (optional) | Image format; default `png` |
| `filename` | `string` (optional) | Output filename; defaults to `page-{timestamp}.{ext}` |
| `element` | `string` (optional) | Human-readable element description to capture |
| `ref` | `string` (optional) | Exact target element reference (required when `element` supplied) |
| `fullPage` | `boolean` (optional) | Capture full scrollable page when `true` (cannot be used with element screenshots) |

---

### browser_type

- **Description:** Type text into an editable element.
- **Read-only:** false

**Parameters:**

| Name | Type | Description |
|---|---:|---|
| `element` | `string` | Human-readable element description |
| `ref` | `string` | Exact target element reference |
| `text` | `string` | Text to type into the element |
| `submit` | `boolean` (optional) | Whether to press Enter after typing |
| `slowly` | `boolean` (optional) | Type one character at a time (useful for triggering key handlers) |

---

### browser_wait_for

- **Description:** Wait for text to appear/disappear or wait a specific time.
- **Read-only:** false

**Parameters:**

| Name | Type | Description |
|---|---:|---|
| `time` | `number` (optional) | Time to wait in seconds |
| `text` | `string` (optional) | Text to wait for to appear |
| `textGone` | `string` (optional) | Text to wait for to disappear |

---

If you'd like, I can add short example snippets for the most-used helpers (`browser_evaluate`, `browser_snapshot`, `browser_click`, `browser_run_code`) next.

## Examples

Below are short, copyable examples that show how to use a few commonly-used helpers. These can be passed as the MCP tool payloads or used as `page` snippets when running `browser_run_code`.

### 1) browser_evaluate — get page title and H1s

Example payload (tool call):

```json
{
	"function": "() => ({ title: document.title, h1: Array.from(document.querySelectorAll('h1')).map(el => el.innerText) })"
}
```

Example result:

```json
{ "title": "frontend", "h1": ["Welcome back"] }
```

---

### 2) browser_snapshot — accessibility snapshot (preferred)

Call `browser_snapshot` with no parameters. It returns a structured accessibility tree useful for automated checks.

Example (pseudo-call):

```json
// request: tool=browser_snapshot, params={}
// response: {
//   timestamp: "...",
//   url: "http://...",
//   headings: [...],
//   roles: [...],
//   focusable: [...],
//   alerts: [...]
// }
```

---

### 3) browser_click — click by ref (from snapshot) or selector

Use a human `element` description for logging/permission and a precise `ref` selector from the snapshot.

```json
{
	"element": "Sign in button",
	"ref": "button[type=\"submit\"]"
}
```

If you have a snapshot element `ref` identifier (returned by `browser_snapshot`), pass that `ref` instead of a CSS selector for more deterministic clicks.

---

### 4) browser_run_code — run Playwright snippet (JS)

This runs an arbitrary Playwright-friendly snippet that can use the `page` object. Example: navigate, click, and return the title.

```js
// payload for browser_run_code
{
	code: "await page.goto('http://localhost:3001/login'); await page.getByRole('textbox', { name: /email/i }).fill('jimmy@dwp.co.id'); await page.getByRole('button', { name: /sign in/i }).click(); await page.waitForNavigation({ waitUntil: 'networkidle' }); return await page.title();"
}
```

The response will be whatever the snippet returns (e.g., the page title string).
