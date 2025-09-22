import { z } from 'zod'
import { fetchURL, getParams, Optional } from '../common/request'
import { HTMLParser, fieldMap } from '../common/htmlparser'
import { OpenAPIRoute, Str, Num, Arr } from 'chanfana'

const MaintainerRequestSchema = z.object({
    package: Arr(Str({ example: 'numpy' }), {
    }).max(100).min(1),
})

const maintainerResponseSchema = z.object({
    data: z.record(z.string(), z.object({
        owner: z.string(),
        maintainers: z.array(z.string()),
    })),
    errors: z.record(z.string(), z.string()),
})

async function parseMaintainer(response: Response): Promise<{ owner: string; maintainers: string[] }> {
    const parser = new HTMLParser()
    parser.addTextParser('owner', "a.vertical-tabs__tab[href^='/org/']")
    parser.addTextParser('maintainer', 'span.sidebar-section__user-gravatar-text')
    let res = await parser.parse(response)
    res = fieldMap(res, 'owner', (v) => v.map((t) => t.trim()))
    res = fieldMap(res, 'maintainer', (v) => v.map((t) => t.trim()))
    const owner = res['$keyIsNull']['owner']? res['$keyIsNull']['owner'].filter((v) => v.length > 0)[0] : undefined
    const maintainers = [...new Set(res['$keyIsNull']['maintainer'])]
    return {
        owner,
        maintainers,
    }
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
        const results: Record<string, { owner: string; maintainers: string[] }> = {}
        const errors: Record<string, string> = {}
        for (const pkg of pkgs) {
            const url = `https://pypi.org/project/${pkg}/`
            try {
                console.log(url)
                const response = await fetchURL(url)
                if (response.status === 200) {
                    results[pkg] = await parseMaintainer(response)
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
