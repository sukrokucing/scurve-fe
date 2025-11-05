# GitHub Copilot Prompt for `scurve-fe` (Frontend Companion for S-Curve)

You are a senior frontend engineer.
This project is the frontend for the S-Curve backend (`scurve-be`), a task & project management system built with **Axum (Rust)**, **SQLx**, **JWT**, and **Utoipa (OpenAPI)**.

The backend exposes all endpoints under HTTPS with HTTP/2 and serves a valid OpenAPI 3.1.0 JSON specification at:
https://localhost:8800/api-docs/openapi.json

less
Copy code

---

## 🎯 Goal

Build a **TypeScript + React** web application that fully consumes the backend API as a provider — including authentication, project/task CRUD, and visualization (e.g., matrix, Gantt, and S-curve views).

The frontend must be:
- Fast and modern (powered by **Vite**)
- Type-safe (using **OpenAPI-generated types**)
- Beautiful and consistent (using **shadcn/ui** + Tailwind)
- Data-aware and responsive (using **TanStack Query**)
- Secure (via JWT Bearer token authentication)

---

## 🧱 Framework & Libraries

| Layer | Library / Tool | Description |
|-------|----------------|--------------|
| **Build Tool** | [Vite](https://vitejs.dev) | Lightweight React + TypeScript bundler |
| **Framework** | [React 18+](https://react.dev) | Core frontend library |
| **Language** | [TypeScript](https://www.typescriptlang.org) | Type safety for UI and API |
| **UI Kit** | [shadcn/ui](https://ui.shadcn.com) | Headless UI with Radix & Tailwind |
| **Data Layer** | [TanStack Query](https://tanstack.com/query) | Declarative async data fetching |
| **Forms & Validation** | [React Hook Form](https://react-hook-form.com) + [Zod](https://zod.dev) | Schema-based validation |
| **Routing** | [React Router 7](https://reactrouter.com) or [TanStack Router](https://tanstack.com/router) | Page navigation |
| **HTTP Client** | [Axios](https://axios-http.com) | API calls + JWT interceptors |
| **Auth State** | [Zustand](https://zustand-demo.pmnd.rs/) | Global auth/session state |
| **API Types** | [openapi-typescript](https://github.com/drwpow/openapi-typescript) | Generate TypeScript types from backend OpenAPI |
| **Styling** | [Tailwind CSS](https://tailwindcss.com) | Utility-first styling |
| **Toast/Feedback** | [sonner](https://ui.shadcn.com/docs/components/sonner) | Notifications for user actions |

---

## ⚙️ Project Setup

### Base Commands
```bash
npm create vite@latest scurve-fe -- --template react-ts
cd scurve-fe

# Core dependencies
npm i axios @tanstack/react-query react-hook-form zod react-router-dom zustand sonner

# UI setup
npx shadcn-ui@latest init
npx shadcn-ui@latest add button card input label form table toast dialog

# Generate types from backend
npm i -D openapi-typescript
npx openapi-typescript https://localhost:443/api-docs/openapi.json -o src/types/api.d.ts
📁 Directory Structure
graphql
Copy code
scurve-fe/
├─ src/
│  ├─ api/
│  │   ├─ client.ts               # Axios instance w/ interceptors
│  │   └─ queries/                # TanStack Query hooks (useTasks, useProjects)
│  ├─ auth/
│  │   ├─ LoginForm.tsx
│  │   ├─ RegisterForm.tsx
│  │   ├─ useAuth.ts              # Auth logic (login, logout, me)
│  │   └─ ProtectedRoute.tsx
│  ├─ components/                 # Reusable UI (shadcn components)
│  ├─ pages/                      # Dashboard, Projects, Tasks, Calendar, etc.
│  ├─ routes/
│  │   └─ index.tsx               # React Router or TanStack Router config
│  ├─ store/
│  │   └─ authStore.ts            # Zustand-based token storage
│  ├─ types/
│  │   └─ api.d.ts                # Generated OpenAPI types
│  ├─ main.tsx
│  └─ App.tsx
└─ tailwind.config.js
🔐 Authentication Flow
User logs in via /auth/login → backend returns { token, user }.

JWT is stored in localStorage (or Zustand state).

Axios attaches Authorization: Bearer <token> to every request.

Protected routes redirect unauthenticated users to /login.

Logout clears token and redirects to /login.

Example: src/api/client.ts

ts
Copy code
import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "https://localhost:443",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
🔁 Example Data Query (TanStack)
ts
Copy code
import { useQuery } from "@tanstack/react-query";
import { api } from "@/api/client";
import type { Project } from "@/types/api";

export const useProjects = () =>
  useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: async () => (await api.get("/projects")).data,
  });
🧠 Example Auth Hook
ts
Copy code
import { api } from "@/api/client";
import { create } from "zustand";

type AuthState = {
  user: any | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
};

export const useAuth = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem("token"),
  login: async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("token", data.token);
    set({ token: data.token });
    await useAuth.getState().fetchMe();
  },
  logout: () => {
    localStorage.removeItem("token");
    set({ user: null, token: null });
  },
  fetchMe: async () => {
    const { data } = await api.get("/auth/me");
    set({ user: data });
  },
}));
🧩 Environment Variables
.env

env
Copy code
VITE_API_URL=https://localhost:443
VITE_APP_NAME=S-Curve
🧠 Developer Workflow
Step 1: Run backend (scurve-be) with HTTP/2 enabled (cargo run --release).

Step 2: Run frontend:

bash
Copy code
npm run dev
Step 3: Generate OpenAPI types when backend changes:

bash
Copy code
npx openapi-typescript https://localhost:443/api-docs/openapi.json -o src/types/api.d.ts
Step 4: Commit both copilot-prompt.md (backend + frontend) to maintain architecture alignment.

🧭 Copilot Guidance
When Copilot is active in this project:

Always follow folder structure and naming conventions.

Use TypeScript types generated from backend OpenAPI.

Prefer TanStack Query for data operations.

Use shadcn/ui for all UI components (no raw HTML).

Ensure authenticated requests include JWT header.

Keep frontend behavior consistent with backend models (User, Project, Task).

✅ Goal
Create a fast, secure, and beautiful React + TypeScript dashboard for the S-Curve backend,
supporting:

JWT authentication

Project and task visualization

Progress tracking (daily/matrix view)

Gantt & S-curve reporting

Responsive UI with clean design (shadcn/ui + Tailwind)

Ensure Copilot understands this prompt as the architecture reference for all future code generation in scurve-fe.

yaml
Copy code

---

Would you like me to **export this as `copilot-prompt-frontend.md`** (like the backend one) so you can download and drop it directly into your frontend repo?
