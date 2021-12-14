import { checkAuth } from './auth'
import { generateErrorResponse, generateJSONResponse } from './common/response'
import handleGithub from './github/route'
import { handleIP } from './ip'

const apiUsage = {
  "/ip": "ip address of the scraper",
  "/github": "github scraper"
}

async function handleRequest(request) {
  const { headers, method, url } = request;
  const urlObj = new URL(url);

  if (!checkAuth(request)) {
    return generateErrorResponse("Missing `Authorization` in headers", 401);
  }

  try {
    if (urlObj.pathname.startsWith("/github")){
      return await handleGithub(request);
    } else if (urlObj.pathname.startsWith("/ip")){
      return await handleIP(request);
    } else {
      return generateJSONResponse(apiUsage);
    }
  } catch (e) {
    // throw e;
    console.log(e);
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
