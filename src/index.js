import { generateErrorResponse, generateJSONResponse } from './common/response'
import { handleIssues } from './issues'
import { checkAuth } from './auth'
import { handleTimeline } from './timeline'
import { handleIP } from './ip'

const apiUsage = {
  "/issues": "scrape and parse GitHub issues pages",
  "/pulls": "scrape and parse GitHub pull requests pages",
  "/ip": "ip address of the scraper",
  "/issue": "scrape and parse a GitHub issue comment page",
  "/pull": "scrape and parse a GitHub pull request comment page",
}

async function handleRequest(request) {
  const {headers, method, url} = request;
  const urlObj = new URL(url);

  if(!checkAuth(request)){
    return generateErrorResponse("Missing `Authorization` in headers", 401);
  }

  // routes
  console.log(urlObj.pathname);
  try {
    if (urlObj.pathname === "/issues" || urlObj.pathname === "/pulls" ) {
      return await handleIssues(request);
    } else if (urlObj.pathname === "/issue" || urlObj.pathname === "/pull" ) {
      return await handleTimeline(request);
    } else if (urlObj.pathname === "ip"){
      return await handleIP(request);
    } else {
      return generateJSONResponse({
        ...apiUsage
      });
    }
  } catch (e) {
    // throw e;
    return generateErrorResponse(e);
  }
}

export default {
  // * request is the same as `event.request` from the service worker format
  // * waitUntil() and passThroughOnException() are accessible from `ctx` instead of `event` from the service worker format
  // * env is where bindings like KV namespaces, Durable Object namespaces, Config variables, and Secrets
  // are exposed, instead of them being placed in global scope.
  async fetch(request, env, ctx) {
    return handleRequest(request);
  }
}
