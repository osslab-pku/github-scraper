import type { Request } from "itty-router";

type OptionalKeys<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? K : never }[keyof T];
export type Optional<T> = Pick<T, OptionalKeys<T>>

/**
 * handle exception in fetch
 * @param url
 * @returns Response
 */
export const fetchURL = async (url: string): Promise<Response> => {
  const response = await fetch(url);
  if (response.status !== 200) {
    throw Error(url + " returned code " + response.status + " : " + response.statusText);
  }
  return response;
}

/**
 * validate params
 * @param request
 * @param sampleParams full params object
 * @param defaultParams default params object
 * @returns {Record<string, string>}
 */

export const getParams = <T extends Record<string, string | number>>(request: Request, sampleParams: T, defaultParams?: Optional<T>): T => {
  const { url } = request;
  const urlObject = new URL(url);
  const params = urlObject.searchParams;

  if (!defaultParams) defaultParams = {} as Optional<T>;

  // support path params
  const res = Object.assign({}, request.params) as Record<string, string | number>;

  for (let key in sampleParams) {
    (key in res) || (res[key] = params.get(key));
    if (res[key] === null) {
      if (key in defaultParams) {
        res[key] = defaultParams[key];
      } else {
        throw new Error("Missing parameter `" + key + "`, use this api like: "
          + JSON.stringify(sampleParams));
      }
    }
  }

  return res as T;
}