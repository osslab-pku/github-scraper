import { error, Router, cors } from 'itty-router'
import { fromIttyRouter } from 'chanfana'

import { authorized } from './auth'
import { GetIP } from './ip'
import { GetIssueTimeline } from './github/timeline'
import { GetIssues } from './github/issues'
import { GetDependents } from './github/dependents'
import { GetGitRefs } from './git/refs'
import { GetGitlabRepos } from './gitlab/repos'
import { GetGitlabRepoCount } from './gitlab/repoCount'
import { GetDependabotScore } from './dependabot/score'
import { GetGithubRepos } from './github/repos'

const { preflight, corsify } = cors()
const router = Router()
router.all('*', preflight)

const openapi = fromIttyRouter(router, {
  docs_url: '/',
  schema: {
    info: {
      title: 'Scraper API',
      version: '1.0.0',
      description:
        'A collection of scrapers for software supply chain analysis.',
    },
  },
})
openapi.registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
})
openapi.get('/ip', authorized(GetIP))
openapi.get('/github/dependents', authorized(GetDependents))
openapi.get('/github/issues', authorized(GetIssues))
openapi.get('/github/issue', authorized(GetIssueTimeline))
openapi.get('/github/pulls', authorized(GetIssues))
openapi.get('/github/pull', authorized(GetIssueTimeline))
openapi.get('/github/repos', authorized(GetGithubRepos))
openapi.get('/git/refs', authorized(GetGitRefs))
openapi.get('/gitlab/repos', authorized(GetGitlabRepos))
openapi.get('/gitlab/repos/count', authorized(GetGitlabRepoCount))
openapi.get('/dependabot/score', authorized(GetDependabotScore))

router.all('*', () => {
  return error(404, {
    error: 'Not Found',
    endpoints: router.routes.map((route) => ({
      method: route[0],
      path: route[3],
    })),
  })
})

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    return await router
      .fetch(request, env, ctx)
      .catch((error_) => {
        console.error(error_)
        const resp = error(error_)
        resp.headers.set('Cache-Control', 'max-age=0')
        return resp
      })
      .then(corsify)
  },
}
