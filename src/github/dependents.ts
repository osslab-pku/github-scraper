import { fieldMap, HTMLParser } from '../common/htmlparser'
import { fetchURL } from '../common/request'
import { OpenAPIRoute, Str, Num } from 'chanfana'
import { z } from 'zod'

const DependentsRequestSchema = z.object({
  name: Str({
    description: 'name of the repository',
    example: 'tensorflow',
  }).optional(),
  owner: Str({
    description: 'name of the user or organization',
    example: 'tensorflow',
  }).optional(),
  type: z.enum(['REPOSITORY', 'PACKAGE']).default('REPOSITORY'),
  packageId: Str({
    description:
      'PackageId. You can click the package button on the dependents page and find it in the URL.',
    example: 'UGFja2FnZS01MjcyNjAxNg',
  }).optional(),
  maxPages: Num({
    description:
      'Number of pages to fetch. Set it moderate to avoid triggering the rate limit.',
    example: 10,
  })
    .min(1)
    .max(10)
    .default(10),
  after: z.string().optional(),
})

async function parseDependents(
  response: Response,
): Promise<z.infer<typeof DependentsResponseSchema>> {
  const parser = new HTMLParser()
  // get total number of repositories and packages
  parser.addTextParser('repositories', 'div[role="status"] > a:nth-child(1)')
  parser.addTextParser('packages', 'div[role="status"] > a:nth-child(2)')
  
  // set Release id
  parser.addKeyParser('div.Box-row', (element, key) => {
    return typeof key !== 'number' ? 0 : key + 1
  })

  // owner of the repo
  parser.addTextParser('owner', '.Box-row [data-hovercard-type="user"]')
  parser.addTextParser('owner', '.Box-row [data-hovercard-type="organization"]')
  // name of the repo
  parser.addTextParser('name', '.Box-row [data-hovercard-type="repository"]')
  // name of the package
  parser.addTextParser(
    'package',
    '.Box-row > span:not([data-repository-hovercards-enabled])',
  )
  parser.addTextParser(
    'package',
    '.Box-row > span[data-repository-hovercards-enabled] > small',
  )

  parser.addTextParser(
    'stars',
    '.Box-row .flex-justify-end > span:nth-of-type(1)',
  )
  parser.addTextParser(
    'forks',
    '.Box-row .flex-justify-end > span:nth-of-type(2)',
  )

  // set next
  parser.addAttributeParser(
    'next',
    '.paginate-container a[href]',
    'href',
    'pagination',
  )
  let res = await parser.parse(response)

  // transform results
  res = fieldMap(res, 'owner', (v) => v.join('').replace('\n', '').trim())
  res = fieldMap(res, 'name', (v) => v.join('').replace('\n', '').trim())
  res = fieldMap(res, 'package', (v) => v.join('').replace('\n', '').trim())
  res = fieldMap(res, 'stars', (v) =>
    parseInt(v.join('').replace('\n', '').replace(',', '').trim()),
  )
  res = fieldMap(res, 'forks', (v) =>
    parseInt(v.join('').replace('\n', '').replace(',', '').trim()),
  )
  res['total'] = {
    packages: res['$keyIsNull']?.['packages']
    ? parseInt(
        res['$keyIsNull']?.['packages']
          .join('')
          .replace('\n', '')
          .replace(',', '')
          .trim()
          .split(' ')[0],
      )
    : undefined,
  repositories: res['$keyIsNull']?.['repositories']
    ? parseInt(
        res['$keyIsNull']?.['repositories']
          .join('')
          .replace('\n', '')
          .replace(',', '')
          .trim()
          .split(' ')[0],
      )
    : undefined
  }

  // delete repositories and packages from $keyIsNull
  if (res['$keyIsNull']) {
    delete res['$keyIsNull']['repositories']
    delete res['$keyIsNull']['packages']
    if (Object.keys(res['$keyIsNull']).length === 0) {
      delete res['$keyIsNull']
    }
  }

  if ('pagination' in res) {
    res['pagination']['next'] =
      res['pagination']['next'].length > 1
        ? res['pagination']['next'][1]
        : res['pagination']['next'][0]
    const matched = res['pagination']['next'].match(
      /dependents_after=([a-zA-Z0-9]*)/,
    )
    if (!matched) {
      // no next page
      res['pagination']['after'] = ''
      res['pagination']['next'] = ''
    } else {
      res['pagination']['after'] = matched[1]
    }
  }
  return res
}

const DependentSchema = z.object({
  owner: Str({
    description: 'owner of the repository if exists',
  }).optional(),
  name: Str({ description: 'name of the repository if exists' }).optional(),
  package: Str({ description: 'name of the package if exists' }).optional(),
  stars: Num({
    description: 'stars of the repository if exists',
  }).optional(),
  forks: Num({
    description: 'forks of the repository if exists',
  }).optional(),
})

const DependentsResponseSchema = z.object({
  data: z.array(DependentSchema),
  url: z.string(),
  next: z.string().optional(),
  after: z.string().optional(),
  total: z.object({
    repositories: z.number().optional(),
    packages: z.number().optional(),
  }).optional(),
})

export class GetDependents extends OpenAPIRoute {
  schema = {
    request: {
      query: DependentsRequestSchema,
    },
    responses: {
      '200': {
        description: 'Successful response',
        content: {
          'application/json': {
            schema: DependentsResponseSchema,
          },
        },
      },
    },
  }

  async handle(request: Request, env: Env, ctx: ExecutionContext) {
    const params = (await this.getValidatedData<typeof this.schema>()).query

    let reqURL = `https://github.com/${params.owner}/${params.name}/network/dependents?dependent_type=${params.type}`

    if (params.packageId) reqURL += `&package_id=${params.packageId}`
    if (params.after) reqURL += `&dependents_after=${params.after}`

    console.log(0, reqURL)
    const response = await fetchURL(reqURL)

    let pageCount = 1
    let res = await parseDependents(response)

    const full_res = { ...res }

    while (
      'pagination' in res &&
      'next' in res['pagination'] &&
      res['pagination']['next'] &&
      pageCount < params.maxPages
    ) {
      // page limit: to control cpu time
      const reqURL = res['pagination']['next']
      console.log(pageCount, reqURL)
      const response = await fetchURL(reqURL)
      res = await parseDependents(response)
      // merge object res
      // console.log(Object.keys(full_res).length)
      const res_mutated = Object.fromEntries(
        Object.entries(res).map(([k, v]) => {
          if (['$keyIsNull', 'pagination'].indexOf(k) === -1) {
            return [parseInt(k) + Object.keys(full_res).length, v]
          } else {
            return [k, v]
          }
        }),
      )
      Object.assign(full_res, full_res, res_mutated)
      // add total if not exists
      if (!('total' in full_res) && 'total' in res) {
        full_res['total'] = res['total']
      }
      pageCount += 1
    }

    // transform
    const ret = { data: [], url: reqURL }
    if ('pagination' in full_res) {
      ret['total'] = full_res['pagination']['total']
      ret['current'] = full_res['pagination']['current']
      if (full_res['pagination']['next']) {
        // no null
        ret['next'] = full_res['pagination']['next']
        ret['after'] = full_res['pagination']['after']
      }
    }
    if ('total' in full_res) {
      ret['total'] = full_res['total']
    }

    for (let entry in full_res) {
      if (entry === 'pagination' || entry === 'total') continue
      // if entry is null or NaN, it is uncollected data
      if (entry === null || isNaN(entry as any)) {
        continue
      }
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
