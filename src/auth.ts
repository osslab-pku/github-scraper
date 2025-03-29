import { error } from 'itty-router'
import { OpenAPIRoute } from 'chanfana'

export const checkAuth = (request: Request, env: Env): boolean => {
  const { headers } = request
  const headersObj = new Headers(headers)

  if (env.WHITELIST_ASNS) {
    const asn = request.cf && request.cf.asn ? (request.cf.asn as number) : -1
    const whitelist = env.WHITELIST_ASNS.split(',').map(Number)
    if (whitelist.indexOf(asn) !== -1) return true
  }

  if (env.MAGIC) {
    const authHeader = headersObj.get('Authorization')
    if (!authHeader) {
      return false
    }
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return false
    }
    const token = authHeader.slice(7)
    if (token != env.MAGIC) {
      return false
    }
  }
  return true
}

export function authorized<T extends typeof OpenAPIRoute>(RouteClass: T): T {
  const originalHandle = RouteClass.prototype.handle
  RouteClass.prototype.handle = async function (
    request: Request,
    env: any,
    ctx: ExecutionContext,
  ) {
    if (!checkAuth(request, env)) {
      return error(401, 'Not authorized')
    }
    return originalHandle.call(this, request, env, ctx)
  }

  // chanfana uses getSchemaZod to get the schema internally
  // so we can intercept it to add the security scheme
  // https://github.com/cloudflare/chanfana/blob/2867db1a49d068f2aa527cf5e2eb35b004099d0c/src/openapi.ts#L142
  const originalGetSchemaZod = RouteClass.prototype.getSchemaZod
  RouteClass.prototype.getSchemaZod = function () {
    const originalSchema = originalGetSchemaZod.call(this)
    originalSchema.security = [{ bearerAuth: [] }]
    return originalSchema
  }
  return RouteClass
}
