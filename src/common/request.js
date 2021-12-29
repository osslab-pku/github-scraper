/**
 * handle exception in fetch
 * @param url
 * @returns {Promise<Response>}
 */
export const fetchURL = async (url) => {
  const response = await fetch(url);
  if(response.status !== 200){
    throw Error(url + " returned code " + response.status + " : " + response.statusText);
  }
  return response;
}

/**
 * validate params
 * @param request
 * @param defaultParams default params object
 * @param sampleParams full params object
 * @returns {{}}
 */
export const getParams = (request, defaultParams, sampleParams) => {
  const {headers, method, url} = request;
  const urlObject = new URL(url);
  const params = urlObject.searchParams;

  // support path params
  const res = Object.assign({}, request.params)

  for(let key in sampleParams){
    (key in res) || (res[key] = params.get(key));
    if (res[key] === null){
      if (key in defaultParams){
        res[key] = defaultParams[key];
      } else {
        throw new Error("Missing parameter `" + key + "`, use this api like: "
          + JSON.stringify(sampleParams));
      }
    }
  }

  return res;
}
