import { useQuery } from "@tanstack/react-query";

import { openapi } from "@/api/openapiClient";

const PROJECTS_QUERY_KEY = ["projects"] as const;

export const projectsKeys = {
  all: PROJECTS_QUERY_KEY,
  detail: (id: string) => [...PROJECTS_QUERY_KEY, id] as const,
};

export function useProjectsQuery() {
  return useQuery({
    queryKey: projectsKeys.all,
    queryFn: async () => {
      return openapi.listProjects();
    },
  });
}
