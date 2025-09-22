import { z } from 'zod'
import { fetchURL, getParams, Optional } from '../common/request'
import { HTMLParser, fieldMap } from '../common/htmlparser'
import { OpenAPIRoute, Str, Num, Arr } from 'chanfana'

const MaintainerRequestSchema = z.object({
    package: Arr(Str({ example: 'requests' }), {
    }).max(100).min(1),
})

const maintainerResponseSchema = z.object({
    data: z.record(z.string(), z.string()),
    errors: z.record(z.string(), z.string()),
})

async function parseMaintainer(response: Response): Promise<string[]> {
    const parser = new HTMLParser()
    parser.addTextParser('maintainer', 'span.sidebar-section__user-gravatar-text')
    let res = await parser.parse(response)
    res = fieldMap(res, 'maintainer', (v) => v.map((t) => t.trim()))
    return [...new Set(res['$keyIsNull']['maintainer'])]
}

export class GetPypiMaintainer extends OpenAPIRoute {
    schema = {
        request: {
            query: MaintainerRequestSchema,
        },
        responses: {
            '200': {
                description: 'Successful response',
                content: {
                    'application/json': {
                        schema: maintainerResponseSchema
                    },
                },
            },
        },
    }

    async handle(request: Request, env: Env, ctx: ExecutionContext) {
        const params = (await this.getValidatedData<typeof this.schema>()).query
        const pkgs = params.package
        const results: Record<string, string[]> = {}
        const errors: Record<string, string> = {}
        for (const pkg of pkgs) {
            const url = `https://pypi.org/project/${pkg}/`
            try {
                console.log(url)
                const response = await fetchURL(url)
                if (response.status === 200) {
                    const maintainers = await parseMaintainer(response)
                    results[pkg] = maintainers
                } else if (response.status === 404) {
                    errors[pkg] = 'package not found'
                } else {
                    errors[pkg] = `unexpected status code: ${response.status}`
                }
            } catch (error) {
                errors[pkg] = error.message
            }
        }
        return { data: results, errors: errors }
    }
}
