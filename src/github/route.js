import { generateErrorResponse, generateJSONResponse } from '../common/response'
import { handleIssues } from './issues'
import { checkAuth } from '../auth'
import { handleTimeline } from './timeline'

const apiUsage = {
  "/issues": "scrape and parse GitHub issues pages",
  "/pulls": "scrape and parse GitHub pull requests pages",
  "/issue": "scrape and parse a GitHub issue comment page",
  "/pull": "scrape and parse a GitHub pull request comment page",
}

export default async function handleRequest(request) {
  const {headers, method, url} = request;
  const urlObj = new URL(url);

  if(!checkAuth(request)){
    return generateErrorResponse("Missing `Authorization` in headers", 401);
  }

  // routes
  console.log(urlObj.pathname);

  if (urlObj.pathname.endsWith("/issues") || urlObj.pathname.endsWith("/pulls")) {
    return await handleIssues(request);
  } else if (urlObj.pathname.endsWith("/issue") || urlObj.pathname.endsWith("/pull")) {
    return await handleTimeline(request);
  } else {
    return generateJSONResponse(apiUsage);
  }
}