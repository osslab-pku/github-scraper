import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import { OpenAPIRoute, Str, Num, Arr } from 'chanfana';
import { z } from 'zod';

const GitRefsRequestSchema = z.object({
    url: Arr(Str({example: 'https://github.com/cloudflare/chanfana.git'}), {
        description: 'The urls of the git repositories',
    }).max(100).min(1),
})

const GitRefsResponseSchema = z.object({
    data: z.record(z.string(), z.string()),
    errors: z.record(z.string(), z.string()),
})

export class GetGitRefs extends OpenAPIRoute {
    schema = {
      request: {
        query: GitRefsRequestSchema,
      },
      responses: {
        '200': {
          description: 'Successful response',
          content: {
            'application/json': {
              schema: GitRefsResponseSchema
            },
          },
        },
      },
    }
  
async handle(request: Request, env: Env, ctx: ExecutionContext) {
	const gitUrls = (await this.getValidatedData<typeof this.schema>()).query.url;
	const AllRefs: Record<string, Record<string, string>> = {};
	const AllErrs: Record<string, string> = {};

	function getByPath(obj: Record<string, any>, path: string | string[]) {
		const parts = Array.isArray(path) ? path : path.split('/');
		if (parts.length === 0) return obj;
		if (obj === undefined) return undefined;
		return getByPath(obj[parts[0]], parts.slice(1));
	}

	const promises = gitUrls.map(async (oUrl) => {
		// if the url does not end with .git, add .git
		let gitUrl = oUrl;
		if (!gitUrl.endsWith('.git')) {
			gitUrl += '.git';
		}
		// if the url does not have a protocol, add https://
		if (!gitUrl.startsWith('http')) {
			gitUrl = 'https://' + gitUrl;
		}

		try {
			const info = await git.getRemoteInfo({
				http,
				url: gitUrl,
			});
			const refs: Record<string, string> = {};
			const headName = info.HEAD;
			if (headName) {
				refs['HEAD'] = getByPath(info, headName) as unknown as string;
			}
			if (info.refs.tags) {
				Object.entries(info.refs.tags as Record<string, string>).forEach(([name, oid]) => {
					// if oid is not a string, do nothing
					if (typeof oid == 'string') {
						if (name.endsWith('^{}')) {
							// override unpeeled tags
							refs[name.slice(0, -3)] = oid;
						} else {
							refs[name] = oid;
						}
					}
				});
			}

			return {
				url: oUrl,
				refs,
				success: true,
			};
		} catch (error) {
			return {
				url: oUrl,
				error: error instanceof Error ? error.message : 'An unexpected error occurred',
				success: false,
			};
		}
	});

	// Wait for all promises to resolve
	const results = await Promise.all(promises);

	// Process results
	results.forEach((result) => {
		if (result.success) {
			AllRefs[result.url] = result.refs || {};
		} else {
			AllErrs[result.url] = result.error || 'An unexpected error occurred';
		}
	});

	return {
		data: AllRefs,
		error: AllErrs,
	};
}
}