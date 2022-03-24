import { Router } from 'itty-router'

import { generateJSONResponse, generateErrorResponse } from './common/response'

import { checkAuth } from './auth'
import { handleIP } from './ip'
import { handleTimeline } from './github/timeline'
import { handleIssues } from './github/issues'
import { handleScore } from './dependabot/score'

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
        "Not authorized: check `Authorization` header",
        401)
    }
  }
}

const router = Router()

const apiUsage = {
  "/ip": "ip address of the scraper",
  "/github": "github scraper",
  "/dependabot": "compatibility score"
}

router.get("/", () => {
  return generateJSONResponse(apiUsage)
})

// ip
router.get("/ip", handleIP)

// github
const githubUsage = {
  "/issues": "scrape and parse GitHub issues pages",
  "/pulls": "scrape and parse GitHub pull requests pages",
  "/issue": "scrape and parse a GitHub issue comment page",
  "/pull": "scrape and parse a GitHub pull request comment page",
}

router.get("/github", () => generateJSONResponse(githubUsage))
router.get("/github/issues", withAuth(handleIssues))
router.get("/github/pulls", withAuth(handleIssues))
router.get("/github/issue", withAuth(handleTimeline))
router.get("/github/pull", withAuth(handleTimeline))

router.get("/github/:owner/:name/issues", withAuth(handleIssues))
router.get("/github/:owner/:name/pulls", withAuth(handleIssues))
router.get("/github/:owner/:name/issues/:id", withAuth(handleTimeline))
router.get("/github/:owner/:name/pull/:id", withAuth(handleTimeline))

router.get("/github/*", () => generateJSONResponse(githubUsage, {status: 404}))

// dependabot
const dependabotUsage = {
  "/score": " fetch compatibility socre"
}
router.get("/dependabot", () => generateJSONResponse(dependabotUsage))
router.get("/dependabot/score", withAuth(handleScore))
router.get("/dependabot/*", () => generateJSONResponse(dependabotUsage, {status: 404}))

// match unhandled requests
router.all("*", () => generateJSONResponse(apiUsage, {status: 404}))

export default {
  async fetch(request: Request, env: any, ctx: any) {
    return router.handle(request);
  }
}