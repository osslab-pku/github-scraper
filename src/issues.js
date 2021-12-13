import { generateJSONResponse, generateErrorResponse } from './common/response';
import { fieldMap, HTMLParser } from './common/htmlparser'
import { fetchURL, getParams } from './common/request'

/**
 * Issue Request should look like this
 * @type {{owner: string, query: string, maxPages: number, name: string}}
 */
const sampleIssuesRequest = {
  name: "PyGitHub",
  owner: "PyGitHub",
  query: "is:pr author:dependabot[bot]",
  maxPages: 10,
  fromPage: 1
}

const defaultIssuesRequest = {
  maxPages: 10,
  fromPage: 1
}

/**
 * parse Issues List and return results
 * @param response
 * @returns {Promise<{}>} res
 */
async function parseIssues(response) {
  const parser = new HTMLParser();

  // set issue id
  parser.addKeyParser('.js-issue-row', (element, key)=>{
    const id = element.getAttribute('id');
    if(id === null){
      throw new Error("missing id in js-issue-row");
    }
    const matches = id.match(/(\d+)/g);
    if (!matches) return key;
    return matches.pop();
  })

  // set title
  parser.addTextParser('title','.markdown-title');
  // set author
  parser.addTextParser('author', '.opened-by [data-hovercard-type="user"]');
  parser.addTextParser('bot', '.opened-by a[href]:not([data-hovercard-type="user"])')
  // set actedAt
  parser.addAttributeParser('actedAt', 'relative-time', 'datetime');

  // checks
  parser.addAttributeParser('check', '.color-fg-danger[aria-label*="heck"]', 'aria-label');
  parser.addAttributeParser('check', '.color-fg-success[aria-label*="heck"]', 'aria-label');

  // checkStatus
  parser.addCaseParser('checkStatus', {
    '.color-fg-danger[aria-label*="heck"]': 'failed',
    '.color-fg-success[aria-label*="heck"]': 'passed'
  })

  // state
  parser.addCaseParser('state', {
    '[aria-label~="Open"]': 'open',
    '[aria-label~="Closed"]': 'closed',
    '[aria-label~="Merged"]': 'merged'
  })

  // labels
  parser.addTextParser('labels', 'a.IssueLabel');

  // set next
  parser.addAttributeParser('next', '.next_page', 'href', 'pagination');
  // set total
  parser.addAttributeParser('total', 'em.current', 'data-total-pages', 'pagination');
  // set current
  parser.addTextParser('current', 'em.current', 'pagination');

  let res = await parser.parse(response);

  // transform results
  res = fieldMap(res, 'title', v => v.join(''));
  res = fieldMap(res, 'author', v => v.join(''));
  res = fieldMap(res, 'bot', v => v.join(''));
  res = fieldMap(res, 'actedAt', v => v.join(''));
  res = fieldMap(res, 'check', v => v.join(''));
  res = fieldMap(res, 'checkStatus', v => v.join(''));
  res = fieldMap(res, 'next', v => v.join(''));
  res = fieldMap(res, 'total', v => v.join(''));
  res = fieldMap(res, 'current', v => v.join(''));
  res = fieldMap(res, 'state', v => v.join(''));
  res = fieldMap(res, 'labels', v => v.map(t => t.trim()));

  // parse check text
  res = fieldMap(res, 'check', v => {
    const matches = v.match(/(\d+)/g)
    if (matches && matches.length === 2) {
      if (matches[0] === matches[1]) {
        return {
          "status": "passed",
          "total": matches[1],
          "passed": matches[0]
        }
      } else {
        return {
          "status": "failed",
          "total": matches[1],
          "passed": matches[0]
        }
      }
    } else return {
      "unknown": v
    };
  });
  return res;
}


export async function handleIssues(request){
  const {headers, method, url} = request;
  const urlObject = new URL(url);

  const params = getParams(request, defaultIssuesRequest, sampleIssuesRequest);

  let queryComponent = null;
  if (urlObject.pathname.includes("issues")){
    queryComponent = "/issues?"
  } else if (urlObject.pathname.includes("pulls")){
    queryComponent = "/pulls?"
  } else {
    throw new Error("Request is not issues or pulls");
  }

  const reqURL = "https://github.com/" + params.owner + "/" + params.name + queryComponent
    + "page=" + params.fromPage + "&q=" + encodeURIComponent(params.query);
  // console.log(reqURL);
  const response = await fetchURL(reqURL);
  let pageCount = 1;
  let res = await parseIssues(response);

  const full_res = {...res};

  while("pagination" in res && "next" in res["pagination"] && res["pagination"]["next"]
  && pageCount < params.maxPages){
    // page limit: to control cpu time
    const reqURL = "https://github.com" + res["pagination"]["next"];
    // console.log(reqURL);
    const response = await fetchURL(reqURL);
    res = await parseIssues(response);
    // merge object res
    Object.assign(full_res, full_res, res);
    pageCount += 1;
  }

  // transform
  const ret = { "data": [], "url": reqURL };
  if("pagination" in full_res) {
    ret["total"] = full_res["pagination"]["total"];
    ret["current"] = full_res["pagination"]["current"];
    if (full_res["pagination"]["next"]){ // no null
      ret["next"] = "https://github.com" + full_res["pagination"]["next"];
    }
  }

  for(let entry in full_res){
    if(entry === "pagination") continue;
    if(entry === "$keyIsNull") {
      ret["uncollected"] = full_res[entry];
      continue;
    }
    ret["data"].push({
      "id": entry,
      ...full_res[entry]
    })
  }

  return generateJSONResponse(ret);
}