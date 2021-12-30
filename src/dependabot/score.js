import { fetchURL, getParams } from '../common/request'
import { HTMLParser } from '../common/htmlparser'
import { generateJSONResponse } from '../common/response'

const sampleScoreRequest = {
  'package': 'lodash',
  'ecosystem': 'npm',
  'oldver': '1.14.0',
  'newver': '1.15.0',
}

const defaultScoreRequest = {}

const ecoNamesFromDependabot = {
  'bundler': 'bundler',
  'composer': 'composer',
  'docker': 'docker',
  'maven': 'maven',
  'npm': 'npm_and_yarn',
  'elm': 'elm',
  'gitsubmodule': 'submodules',
  'mix': 'hex',
  'cargo': 'cargo',
  'gradle': 'gradle',
  'nuget': 'nuget',
  'gomod': 'go_modules',
  'pip': 'pip',
  'terraform': 'terraform',
  'github-actions': 'github_actions',
}

async function parseSVG(response) {
  const parser = new HTMLParser()
  parser.addTextParser('title', 'title', 'global')
  const res = await parser.parse(response)
  try {
    const title = res['global']['title'][0]
    return title.split(":")[1].trim()
  } catch (e) {
    throw new Error('failed to parse svg: ' + JSON.stringify(res))
  }
}

export async function handleScore(request) {
  const { headers, method, url } = request
  const urlObject = new URL(url)

  const params = getParams(request, defaultScoreRequest, sampleScoreRequest)

  const allowedEco = Object.values(ecoNamesFromDependabot)
  const mappedEco = Object.keys(ecoNamesFromDependabot)
  if (allowedEco.indexOf(params.ecosystem) === -1) {
    if (mappedEco.indexOf(params.ecosystem) === -1) {
      throw new Error('ecosystem `' + params.ecosystem + '` is not valid')
    }
    params.ecosystem = ecoNamesFromDependabot[params.ecosystem]
  }

  const reqURL = 'https://dependabot-badges.githubapp.com/badges/compatibility_score?dependency-name=' +
    params.package + '&package-manager=' + params.ecosystem + '&previous-version=' +
    params.oldver + '&new-version=' + params.newver

  const response = await fetchURL(reqURL);
  const res = await parseSVG(response);
  return generateJSONResponse({
    "data": res
  })
}