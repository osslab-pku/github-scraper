import { json, RouteEntry, Router, StatusError } from 'itty-router'
import { fromIttyRouter, OpenAPIRoute } from 'chanfana'
import { z } from 'zod'
import { generateJSONResponse, generateErrorResponse } from './common/response'

import { checkAuth } from './auth'
import { GetIP } from './ip'

import { handleTimeline } from './github/timeline'
import { handleIssues } from './github/issues'
import { handleScore } from './dependabot/score'
import { GetDependents } from './github/dependents'

type RouterHandler = (request?: Request) => Promise<Response>

const withAuth = (fn: RouterHandler) => {
  return async (request: Request) => {
    if (checkAuth(request)) {
      try {
        return await fn(request)
      } catch (e) {
        return generateErrorResponse(e)
      }
    } else {
      return generateErrorResponse(
        'Not authorized: check `Authorization` header',
        401,
      )
    }
  }
}

const router = Router()

router.get('/github/issues', withAuth(handleIssues))
router.get('/github/pulls', withAuth(handleIssues))
router.get('/github/issue', withAuth(handleTimeline))
router.get('/github/pull', withAuth(handleTimeline))

router.get('/github/:owner/:name/issues', withAuth(handleIssues))
router.get('/github/:owner/:name/pulls', withAuth(handleIssues))
router.get('/github/:owner/:name/issues/:id', withAuth(handleTimeline))
router.get('/github/:owner/:name/pull/:id', withAuth(handleTimeline))

router.get('/dependabot/score', withAuth(handleScore))

router.all('*', () => {
  throw new StatusError(404, {
    error: 'Not Found',
    endpoints: router.routes.map((route) => ({
      method: route[0],
      path: route[3],
    })),
  })
})

const openapi = fromIttyRouter(router, {
  docs_url: '/',
})
openapi.get('/ip', GetIP)
openapi.get('/github/dependents', GetDependents)

export default router
