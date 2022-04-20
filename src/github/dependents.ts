import { generateJSONResponse, generateErrorResponse } from '../common/response';
import { fieldMap, HTMLParser } from '../common/htmlparser'
import { fetchURL, getParams, Optional } from '../common/request'
import { Request } from 'itty-router';

/**
 * Release Request should look like this
 * @type {{owner: string, query: string, maxPages: number, name: string}}
 */

type DependentsRequest = {
    name: string,
    owner: string,
    type?: string,
    packageId?: string,
    maxPages?: number,
    after?: string,
}

const DependentsRequest: DependentsRequest = {
  name: "PyGitHub",
  owner: "PyGitHub",
  type: "REPOSITORY",
  packageId: "UGFja2FnZS0yODI3ODQ2MzYx",
  after: "MjA4OTk4ODI3NjA",
  maxPages: 10,
}

const defaultReleasesRequest: Optional<DependentsRequest> = {
  type: "REPOSITORY",
  maxPages: 10,
  packageId: "",
  after: ""
}

/**
 * parse Releases List and return results
 * @param response
 * @returns {Promise<{}>} res
 */
async function parseDependents(response: Response): Promise<{}> {
  const parser = new HTMLParser();

  // set Release id
  parser.addKeyParser('div.Box-row', (element, key)=>{
    return typeof key !== "number" ? 0 : key+1;
  })

  // owner of the repo
  parser.addTextParser('owner', '.Box-row [data-hovercard-type="user"]');
  parser.addTextParser('owner', '.Box-row [data-hovercard-type="organization"]');
  // name of the repo
  parser.addTextParser('name', '.Box-row [data-hovercard-type="repository"]');
  // name of the package
  parser.addTextParser('package', '.Box-row > span:not([data-repository-hovercards-enabled])');
  parser.addTextParser('package', '.Box-row > span[data-repository-hovercards-enabled] > small');

  parser.addTextParser('stars', '.Box-row .flex-justify-end > span:nth-of-type(1)');
  parser.addTextParser('forks', '.Box-row .flex-justify-end > span:nth-of-type(2)');

  // set next
  parser.addAttributeParser('next', '.paginate-container a[href]', 'href', 'pagination');
  let res = await parser.parse(response);

  // transform results
  res = fieldMap(res, 'owner', v=>v.join('').replace('\n', '').trim());
  res = fieldMap(res, 'name', v=>v.join('').replace('\n', '').trim());
  res = fieldMap(res, 'package', v=>v.join('').replace('\n', '').trim());
  res = fieldMap(res, 'stars', v=>parseInt(v.join('').replace('\n', '').replace(',', '').trim()));
  res = fieldMap(res, 'forks', v=>parseInt(v.join('').replace('\n', '').replace(',', '').trim()));

  if ("pagination" in res) {
    res["pagination"]["next"] = res["pagination"]["next"].length > 1 ? res["pagination"]["next"][1] : res["pagination"]["next"][0];
    const matched = res["pagination"]["next"].match(/dependents_after=([a-zA-Z0-9]*)/);
    if (!matched) { // no next page
      res["pagination"]["after"] = "";
      res["pagination"]["next"] = "";
    } else {
      res["pagination"]["after"] = matched[1];
    }
  }

  return res;
}


export async function handleDependents(request: Request){
  const { url } = request;
  const urlObject = new URL(url);
  
  const params = getParams<DependentsRequest>(request, DependentsRequest, defaultReleasesRequest);

  if (['PACKAGE', 'REPOSITORY'].indexOf(params.type) === -1) {
    return generateErrorResponse("type must be PACKAGE or REPOSITORY", 400);
  }

  let reqURL = `https://github.com/${params.owner}/${params.name}/network/dependents?dependent_type=${params.type}`;

  if (params.packageId) reqURL += `&package_id=${params.packageId}`;
  if (params.after) reqURL += `&dependents_after=${params.after}`;

  console.log(0, reqURL);
  const response = await fetchURL(reqURL);

  let pageCount = 1;
  let res = await parseDependents(response);

  const full_res = {...res};

  while("pagination" in res && "next" in res["pagination"] && res["pagination"]["next"]
    && pageCount < params.maxPages){
    // page limit: to control cpu time
    const reqURL = res["pagination"]["next"];
    console.log(pageCount, reqURL);
    const response = await fetchURL(reqURL);
    res = await parseDependents(response);
    // merge object res
    // console.log(Object.keys(full_res).length)
    const res_mutated = Object.fromEntries(Object.entries(res).map(([k,v]) => {
      if (['$keyIsNull', 'pagination'].indexOf(k) === -1){
        return [parseInt(k) + Object.keys(full_res).length, v];
      } else {
        return [k, v];
      }
    }));
    Object.assign(full_res, full_res, res_mutated);
    pageCount += 1;
  }

  // transform
  const ret = { "data": [], "url": reqURL };
  if("pagination" in full_res) {
    ret["total"] = full_res["pagination"]["total"];
    ret["current"] = full_res["pagination"]["current"];
    if (full_res["pagination"]["next"]){ // no null
      ret["next"] = full_res["pagination"]["next"];
      ret["after"] = full_res["pagination"]["after"];
    }
  }

  for(let entry in full_res){
    if(entry === "pagination") continue;
    if(entry === "$keyIsNull") {
      ret["uncollected"] = full_res[entry];
      continue;
    }
    ret["data"].push({
      "id": parseInt(entry),
      ...full_res[entry]
    })
  }

  return generateJSONResponse(ret);
}