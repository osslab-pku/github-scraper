import { z } from 'zod'
import { fetchURL } from '../common/request'
import { OpenAPIRoute, Str, Num, Arr } from 'chanfana'
import { fetchGitlabReposPage } from './repos'

const GitlabRepoCountRequestSchema = z.object({
  url: Str({ example: 'https://gitlab.archlinux.org/' }),
  namespace: Str({
    example: 'archlinux/packaging/packages',
    description: 'namespace (can be username)',
  }).optional(),
  estimate: Num({
    example: 100000,
    description: 'estimated number of repos',
  }).default(100000),
})

export class GetGitlabRepoCount extends OpenAPIRoute {
  schema = {
    request: {
      query: GitlabRepoCountRequestSchema,
    },
    responses: {
      '200': {
        description: 'Successful response',
        content: {
          'application/json': {
            schema: z.object({
              total_pages: z.number(),
              total: z.number(),
            }),
          },
        },
      },
    },
  }
  async handle(request: Request, env: Env, ctx: ExecutionContext) {
    const {
      url: baseUrl,
      namespace,
      estimate,
    } = (await this.getValidatedData<typeof this.schema>()).query

    let estimatePageCount = Math.ceil(estimate / 100) // estimated number of pages to fetch

    // let's correct the estimate if it's too low
    while (true) {
      const repos = await fetchGitlabReposPage({
        baseURL: baseUrl,
        page: estimatePageCount,
        perPage: 100,
        namespace,
      })
      if (repos.length === 100) {
        estimatePageCount *= 2
        console.log(`estimatePageCount: ${estimatePageCount}`)
      } else {
        break
      }
    }

    // use binary search to find the page count
    let low = 1
    let high = estimatePageCount
    let mid = Math.floor((low + high) / 2)
    let lastFetchNumRepos = 100

    while (low < high) {
      const repos = await fetchGitlabReposPage({
        baseURL: baseUrl,
        page: mid,
        perPage: 100,
        namespace,
      })
      console.log(
        `repos.length: ${repos.length}, mid: ${mid}, low: ${low}, high: ${high}`,
      )
      lastFetchNumRepos = repos.length
      if (repos.length === 100) {
        low = mid + 1
      } else if (repos.length === 0) {
        high = mid - 1
      } else {
        return {
          total_pages: mid,
          total: (mid - 1) * 100 + lastFetchNumRepos,
        }
      }
      mid = Math.floor((low + high) / 2)
    }
    return {
      total_pages: mid,
      total: (mid - 1) * 100 + lastFetchNumRepos,
    }
  }
}
