import { fieldMap, HTMLParser } from '../common/htmlparser'
import { fetchURL, getParams, Optional } from '../common/request'
import { Num, OpenAPIRoute, Str } from 'chanfana'
import { z } from 'zod'

/**
 * Issue Request should look like this
 * @type {{owner: string, query: string, maxPages: number, name: string}}
 */
const IssueRequestSchema = z.object({
  owner: Str({
    description: 'name of the user or organization',
    example: 'PyGitHub',
  }),
  name: Str({
    description: 'name of the repository',
    example: 'PyGitHub',
  }),
  query: Str({
    description: 'search query for filtering issues',
    example: 'is:pr author:dependabot[bot]',
  }).optional(),
  maxPages: Num({
    description: 'number of pages to fetch',
    example: 10,
  }).optional(),
  fromPage: Num({
    description: 'page number to start fetching from',
    example: 1,
  }).optional(),
})

type IssueRequest = z.infer<typeof IssueRequestSchema>

const sampleIssuesRequest: IssueRequest = {
  name: 'PyGitHub',
  owner: 'PyGitHub',
  query: 'is:pr author:dependabot[bot]',
  maxPages: 10,
  fromPage: 1,
}

const defaultIssuesRequest: Optional<IssueRequest> = {
  maxPages: 1,
  fromPage: 1,
  query: '',
}

const IssueEntrySchema = z.object({
  title: z.string(),
  author: z.string(),
  bot: z.string(),
  actedAt: z.string(),
  check: z
    .object({
      status: z.enum(['passed', 'failed']),
      total: z.number(),
      passed: z.number(),
    })
    .optional(),
  checkStatus: z.enum(['passed', 'failed']).optional(),
  state: z.enum(['open', 'closed', 'merged']),
  labels: z.array(z.string()),
})

const IssueResponseSchema = z.object({
  data: z.array(IssueEntrySchema),
  next: z.string().nullable(),
  total: z.string(),
  current: z.string(),
  url: z.string(),
  $keyIsNull: z.array(z.unknown()).optional(),
})

type IssueEntry = z.infer<typeof IssueEntrySchema>
type IssueResponse = z.infer<typeof IssueResponseSchema>

/**
 * parse Issues List and return results
 * @param response
 * @returns {Promise<{}>} res
 */
async function parseIssues(response: Response): Promise<IssueEntry> {
  const parser = new HTMLParser()

  // set issue id
  parser.addKeyParser('.js-issue-row', (element, key) => {
    const id = element.getAttribute('id')
    if (id === null) {
      throw new Error('missing id in js-issue-row')
    }
    const matches = id.match(/(\d+)/g)
    if (!matches) return key
    return matches.pop()
  })

  // set title
  parser.addTextParser('title', '.markdown-title')
  // set author
  parser.addTextParser('author', '.opened-by [data-hovercard-type="user"]')
  parser.addTextParser(
    'bot',
    '.opened-by a[href]:not([data-hovercard-type="user"])',
  )
  // set actedAt
  parser.addAttributeParser('actedAt', 'relative-time', 'datetime')

  // checks
  parser.addAttributeParser(
    'check',
    '.color-fg-danger[aria-label*="heck"]',
    'aria-label',
  )
  parser.addAttributeParser(
    'check',
    '.color-fg-success[aria-label*="heck"]',
    'aria-label',
  )

  // checkStatus
  parser.addCaseParser('checkStatus', {
    '.color-fg-danger[aria-label*="heck"]': 'failed',
    '.color-fg-success[aria-label*="heck"]': 'passed',
  })

  // state
  parser.addCaseParser('state', {
    '[aria-label~="Open"]': 'open',
    '[aria-label~="Closed"]': 'closed',
    '[aria-label~="Merged"]': 'merged',
  })

  // labels
  parser.addTextParser('labels', 'a.IssueLabel')

  // set next
  parser.addAttributeParser('next', 'a[rel="next"]', 'href', 'pagination')

  parser.addTextParser('total', 'a[aria-label^="Page"]', 'pagination')
  // set current
  parser.addTextParser('current', 'a[aria-current="page"]', 'pagination')

  let res = await parser.parse(response)

  // transform results
  res = fieldMap(res, 'title', (v) => v.join(''))
  res = fieldMap(res, 'author', (v) => v.join(''))
  res = fieldMap(res, 'bot', (v) => v.join(''))
  res = fieldMap(res, 'actedAt', (v) => v.join(''))
  res = fieldMap(res, 'check', (v) => v.join(''))
  res = fieldMap(res, 'checkStatus', (v) => v.join(''))
  res = fieldMap(res, 'next', (v) => v.join(''))
  res = fieldMap(res, 'total', (v) => v.join(''))
  res = fieldMap(res, 'current', (v) => v.join(''))
  res = fieldMap(res, 'state', (v) => v.join(''))
  res = fieldMap(res, 'labels', (v) => v.map((t) => t.trim()))

  // parse check text
  res = fieldMap(res, 'check', (v) => {
    const matches = v.match(/(\d+)/g)
    if (matches && matches.length === 2) {
      if (matches[0] === matches[1]) {
        return {
          status: 'passed',
          total: parseInt(matches[1]),
          passed: parseInt(matches[0]),
        }
      } else {
        return {
          status: 'failed',
          total: parseInt(matches[1]),
          passed: parseInt(matches[0]),
        }
      }
    } else return undefined
  })

  return res
}

export class GetIssues extends OpenAPIRoute {
  schema = {
    request: {
      query: IssueRequestSchema,
    },
    responses: {
      '200': {
        description: 'Successful response',
        content: {
          'application/json': {
            schema: IssueResponseSchema,
          },
        },
      },
    },
  }

  async handle(request: Request, env: Env, ctx: ExecutionContext) {
    const params = (await this.getValidatedData<typeof this.schema>()).query

    let queryComponent = null
    if (request.url.includes('issues')) {
      queryComponent = '/issues?'
      params.query || (params.query = 'is:issue')
    } else if (request.url.includes('pulls')) {
      queryComponent = '/pulls?'
      params.query || (params.query = 'is:pr')
    } else {
      throw new Error('Request is not issues or pulls')
    }

    const reqURL =
      'https://github.com/' +
      params.owner +
      '/' +
      params.name +
      queryComponent +
      'page=' +
      params.fromPage +
      '&q=' +
      encodeURIComponent(params.query)
    console.log(reqURL)
    const response = await fetchURL(reqURL)
    let pageCount = 1
    let res = await parseIssues(response)

    const full_res = { ...res }

    while (
      typeof res === 'object' &&
      res !== null &&
      'pagination' in res &&
      typeof res.pagination === 'object' &&
      res.pagination !== null &&
      'next' in res.pagination &&
      res.pagination.next &&
      pageCount < params.maxPages
    ) {
      // page limit: to control cpu time
      const reqURL = 'https://github.com' + res['pagination']['next']
      // console.log(reqURL);
      const response = await fetchURL(reqURL)
      res = await parseIssues(response)
      // merge object res
      Object.assign(full_res, full_res, res)
      pageCount += 1
    }

    // transform
    const ret = { data: [], url: reqURL }
    if ('pagination' in full_res) {
      ret['total'] = full_res['pagination']['total']
      ret['current'] = full_res['pagination']['current']
      if (full_res['pagination']['next']) {
        // no null
        ret['next'] = 'https://github.com' + full_res['pagination']['next']
      }
    }

    for (let entry in full_res) {
      if (entry === 'pagination') continue
      if (entry === '$keyIsNull') {
        ret['uncollected'] = full_res[entry]
        continue
      }
      ret['data'].push({
        id: parseInt(entry),
        ...full_res[entry],
      })
    }

    return ret
  }
}
