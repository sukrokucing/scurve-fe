# react-use Hooks Reference

Docs: https://streamich.github.io/react-use

**Policy**: Prefer React built-ins first. react-use only when built-in needs 10+ lines boilerplate.

---

## Approved Hooks

### `useDebounce`
Delay value update until typing stops. Replaces manual `setTimeout` + cleanup.
```ts
import { useDebounce } from 'react-use'

const [searchInput, setSearchInput] = useState('')
const [debouncedSearch, setDebouncedSearch] = useState('')
useDebounce(() => setDebouncedSearch(searchInput), 400, [searchInput])
```

### `useLocalStorage`
Reactive localStorage with SSR safety. Replaces `useState` + `getItem/setItem`.
```ts
import { useLocalStorage } from 'react-use'

const [token, setToken, removeToken] = useLocalStorage<string>('auth-token', '')
```

### `useWindowSize`
Track window dimensions. Replaces `resize` listener boilerplate.
```ts
import { useWindowSize } from 'react-use'

const { width, height } = useWindowSize()
```

### `usePrevious`
Previous render value. Replaces `useRef` tracking pattern.
```ts
import { usePrevious } from 'react-use'

const prevCount = usePrevious(count)
```

### `useToggle`
Boolean toggle with stable function. Replaces `useState(false)` + manual flip.
```ts
import { useToggle } from 'react-use'

const [isOpen, toggle] = useToggle(false)
<Button onClick={toggle}>Toggle</Button>
```

### `useIntersection`
Viewport enter/exit observer. For: lazy load, infinite scroll, scroll animation.
```ts
import { useIntersection } from 'react-use'

const ref = useRef(null)
const intersection = useIntersection(ref, { threshold: 0.5 })
const isVisible = intersection?.isIntersecting ?? false
```

### `useCopyToClipboard`
```ts
import { useCopyToClipboard } from 'react-use'

const [, copyToClipboard] = useCopyToClipboard()
<Button onClick={() => copyToClipboard(shareUrl)}>Copy Link</Button>
```

### `useMedia`
Reactive CSS media query. Replaces `matchMedia` + listener cleanup.
```ts
import { useMedia } from 'react-use'

const isMobile = useMedia('(max-width: 768px)')
```

### `useInterval`
Repeating callback. Replaces `setInterval` + `clearInterval` in `useEffect`.
```ts
import { useInterval } from 'react-use'

useInterval(() => refetch(), 30_000) // poll every 30s
```

### `useIdle`
Detect user inactivity.
```ts
import { useIdle } from 'react-use'

const isIdle = useIdle(60_000) // idle after 1 min
```

---

## Skip List

| Hook | Reason |
|---|---|
| `useAsync` / `useFetch` | Use TanStack Query |
| `useEffectOnce` | `useEffect` with `[]` |
| `useMount` / `useUnmount` | Trivial — `useEffect` clearer |
| `useStateList` | Too niche — use `useState` |
| `createReducer` | Use React `useReducer` |
| `useMountedState` | React 19 handles this |
| `useSearchParam` | Use router hook |
