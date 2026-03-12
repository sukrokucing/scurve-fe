# react-use Hooks Reference

Docs: https://streamich.github.io/react-use

**Policy**: Only use `react-use` when the equivalent React built-in requires
significant boilerplate. Always prefer `useState`, `useEffect`, `useCallback`,
`useMemo`, `useRef`, `useContext` first.

---

## Approved Hooks for scurve-fe

### `useDebounce`
Delay a value update until the user stops typing.
```ts
import { useDebounce } from 'react-use'

const [searchInput, setSearchInput] = useState('')
const [debouncedSearch, setDebouncedSearch] = useState('')
useDebounce(() => setDebouncedSearch(searchInput), 400, [searchInput])
```
Use instead of: a manual `setTimeout` + cleanup `useEffect`.

---

### `useLocalStorage`
Read/write localStorage with reactive state and SSR safety.
```ts
import { useLocalStorage } from 'react-use'

const [token, setToken, removeToken] = useLocalStorage<string>('auth-token', '')
```
Use instead of: `useState` + `localStorage.getItem/setItem` in `useEffect`.

---

### `useWindowSize`
Reactively track the browser window dimensions.
```ts
import { useWindowSize } from 'react-use'

const { width, height } = useWindowSize()
```
Use instead of: `window.addEventListener('resize', ...)` boilerplate.

---

### `usePrevious`
Access the previous render's value of a prop or state.
```ts
import { usePrevious } from 'react-use'

const prevCount = usePrevious(count)
```
Use instead of: `useRef` pattern to manually track previous value.

---

### `useToggle`
Simple boolean toggle with a stable toggle function.
```ts
import { useToggle } from 'react-use'

const [isOpen, toggle] = useToggle(false)
<Button onClick={toggle}>Toggle</Button>
```
Use instead of: `useState(false)` + a manual `setIsOpen(v => !v)` callback.

---

### `useMountedState`
Guard against state updates on unmounted components.
```ts
import { useMountedState } from 'react-use'

const isMounted = useMountedState()
// In async callbacks:
if (isMounted()) setState(data)
```
Use when: making async calls that may resolve after navigation away.

---

### `useIntersection`
Observe when an element enters/exits the viewport.
```ts
import { useIntersection } from 'react-use'

const ref = useRef(null)
const intersection = useIntersection(ref, { threshold: 0.5 })
const isVisible = intersection?.isIntersecting ?? false
```
Use for: lazy loading, infinite scroll triggers, animation on scroll.

---

### `useCopyToClipboard`
Copy text to clipboard with success state.
```ts
import { useCopyToClipboard } from 'react-use'

const [, copyToClipboard] = useCopyToClipboard()
<Button onClick={() => copyToClipboard(shareUrl)}>Copy Link</Button>
```

---

### `useMedia`
Reactively match a CSS media query.
```ts
import { useMedia } from 'react-use'

const isMobile = useMedia('(max-width: 768px)')
```
Use instead of: `window.matchMedia` with manual event listener cleanup.

---

### `useInterval`
Run a callback on a repeating interval.
```ts
import { useInterval } from 'react-use'

useInterval(() => refetch(), 30_000) // poll every 30s
```
Use instead of: `setInterval` + `clearInterval` in `useEffect`.

---

### `useIdle`
Detect when the user has been inactive for N milliseconds.
```ts
import { useIdle } from 'react-use'

const isIdle = useIdle(60_000) // idle after 1 min
```

---

## Hooks to Avoid / Skip

| Hook | Reason to skip |
|---|---|
| `useAsync` | Use TanStack Query instead |
| `useFetch` | Use TanStack Query instead |
| `useEffectOnce` | Just use `useEffect` with `[]` |
| `useMount` / `useUnmount` | Trivial — `useEffect` is clearer |
| `useStateList` | Too niche; use `useState` |
| `createReducer` | Use `useReducer` from React |
| `useSearchParam` | Use your router's hook instead |

---

## Decision Rule

Before reaching for react-use, ask:
> "Would a senior React developer expect built-in hooks to handle this clearly?"

If **yes** → use built-in.
If **no** (requires 10+ lines of boilerplate) → use react-use.
