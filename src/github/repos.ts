import { z } from 'zod'
import { fetchURL } from '../common/request'
import { OpenAPIRoute, Str, Num, Arr } from 'chanfana'
import { getRandomUA } from 'common/ua'

const GithubRepositorySchema = z.object({
  id: z.number(),
  name: z.string(),
  full_name: z.string(),
  owner: z.object({
    login: z.string(),
    id: z.number(),
    type: z.string().optional(),
    user_view_type: z.string().optional(),
    site_admin: z.boolean().optional(),
  }),
  html_url: z.string(),
  description: z.string().nullable(),
  fork: z.boolean(),
})

type GithubRepository = z.infer<typeof GithubRepositorySchema>

const RepoSchema = z.object({
  name: z.string(),
  id: z.number(),
  url: z.string(),
  description: z.string().nullable(),
})

type Repo = z.infer<typeof RepoSchema>

export async function fetchGithubReposPage({
  baseURL,
  since,
}: {
  baseURL: string
  since: number
}): Promise<Repo[]> {
  let url = `${baseURL}/repositories?since=${since}&per_page=100`
  // let us do a get fetch
  const response = await fetchURL(url)
  const data = (await response.json()) as GithubRepository[]
  return data.map((repo) => ({
    name: repo.full_name,
    id: repo.id,
    url: repo.html_url,
    description: repo.description,
  }))
}

const GithubReposRequestSchema = z.object({
  url: Str({ example: 'https://api.github.com' }).default(
    'https://api.github.com',
  ),
  since: Num({ example: 1, description: 'start repo id' }).default(0),
  numPages: Num({ example: 10, description: 'number of pages to fetch' })
    .min(1)
    .max(50)
    .default(10),
})

export class GetGithubRepos extends OpenAPIRoute {
  schema = {
    request: {
      query: GithubReposRequestSchema,
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
      since,
      numPages,
    } = (await this.getValidatedData<typeof this.schema>()).query

    const promises = []
    for (
      let startIdx = since;
      startIdx < since + numPages * 100;
      startIdx += 100
    ) {
      promises.push(
        fetchGithubReposPage({
          baseURL: baseUrl,
          since: startIdx,
        }),
      )
    }
    const repos = await Promise.all(promises)
    // merge based on id
    const map = new Map()
    for (const repo of repos.flat()) {
      map.set(repo.id, repo)
    }
    return Array.from(map.values())
  }
}
