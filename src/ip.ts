import { OpenAPIRoute } from 'chanfana'
import { z } from 'zod'

export class GetIP extends OpenAPIRoute {
  schema = {
    responses: {
      '200': {
        description: 'Successful response',
        content: {
          'application/json': {
            schema: z.object({
              workerIp: z.string(),
              requestProps: z.custom<CfProperties>(),
            }),
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
  }

  async handle(request: Request, env: Env, context: ExecutionContext) {
    const cfProperties = request.cf
    const response = await fetch('http://ifconfig.me/ip')
    return {
      workerIp: await response.text(),
      requestProps: cfProperties,
    }
  }
}
