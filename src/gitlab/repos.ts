import { z } from 'zod'
import { fetchURL } from '../common/request'
import { OpenAPIRoute, Str, Num, Arr } from 'chanfana'

const GitlabNamespaceSchema = z.object({
  id: z.number(),
  name: z.string(),
  path: z.string(),
  kind: z.string(),
  full_path: z.string(),
  parent_id: z.number(),
  avatar_url: z.string().nullable(),
  web_url: z.string(),
})

type GitlabNamespace = z.infer<typeof GitlabNamespaceSchema>

const GitlabRepositorySchema = z.object({
  id: z.number(),
  description: z.string(),
  name: z.string(),
  name_with_namespace: z.string(),
  path: z.string(),
  path_with_namespace: z.string(),
  created_at: z.string(),
  default_branch: z.string(),
  tag_list: z.array(z.string()),
  topics: z.array(z.string()),
  ssh_url_to_repo: z.string(),
  http_url_to_repo: z.string(),
  web_url: z.string(),
  readme_url: z.string().nullable(),
  forks_count: z.number(),
  avatar_url: z.string().nullable(),
  star_count: z.number(),
  last_activity_at: z.string(),
  namespace: GitlabNamespaceSchema.optional(),
})

type GitlabRepository = z.infer<typeof GitlabRepositorySchema>

const RepoSchema = z.object({
  name: z.string(),
  id: z.number(),
  url: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
})

type Repo = z.infer<typeof RepoSchema>

export async function fetchGitlabReposPage({
  baseURL,
  page,
  perPage,
  namespace,
}: {
  baseURL: string
  page: number
  perPage: number
  namespace?: string
}): Promise<Repo[]> {
  console.log(`fetching page ${page} of ${perPage} for namespace ${namespace}`)
  let url = `${baseURL}/api/v4/projects?page=${page}&per_page=${perPage}&statistics=true`
  if (namespace) {
    url += `&namespace_path=${namespace}`
  }

  // let us do a get fetch
  const response = await fetch(url)
  const data = (await response.json()) as GitlabRepository[]

  return data.map((repo) => ({
    name: repo.path_with_namespace,
    id: repo.id,
    url: repo.web_url || repo.http_url_to_repo,
    created_at: repo.created_at,
    updated_at: repo.last_activity_at,
  }))
}

const GitlabReposRequestSchema = z.object({
  url: Str({ example: 'https://gitlab.archlinux.org/' }),
  namespace: Str({
    example: 'archlinux/packaging/packages',
    description: 'namespace (can be username)',
  }).optional(),
  startPage: Num({ example: 1, description: 'start page' }).default(1),
  numPages: Num({
    example: 10,
    description: 'number of pages to fetch',
  }).default(10),
})

export class GetGitlabRepos extends OpenAPIRoute {
  schema = {
    request: {
      query: GitlabReposRequestSchema,
    },
    responses: {
      '200': {
        description: 'Successful response',
        content: {
          'application/json': {
            schema: Arr(RepoSchema),
          },
        },
      },
    },
  }
  async handle(request: Request, env: Env, ctx: ExecutionContext) {
    const {
      url: baseUrl,
      namespace,
      startPage,
      numPages,
    } = (await this.getValidatedData<typeof this.schema>()).query

    const r: Repo[] = []
    const promises = []
    for (let page = startPage; page < startPage + numPages; page++) {
      promises.push(
        fetchGitlabReposPage({
          baseURL: baseUrl,
          page,
          perPage: 100,
          namespace,
        }),
      )
    }
    const repos = await Promise.all(promises)
    r.push(...repos.flat())
    return r
  }
}
