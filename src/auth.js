const MAGIC = "OSSLab@PKU";

/**
 * parse Issues List and return results
 * @param request
 * @returns {boolean} res
 */
export const checkAuth = (request) => {
  const {headers, method, url} = request;
  const headersObj = new Headers(headers);
  return (headersObj.get("Authorization")) && (headersObj.get("Authorization") === MAGIC);
}