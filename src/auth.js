const MAGIC = "OSSLab@PKU";
const WHITELIST_ASNS = [4358, 23910, 24349, 59201]

/**
 * parse Issues List and return results
 * @param request
 * @returns {boolean} res
 */
export const checkAuth = (request) => {
  const {headers, method, url} = request;
  const headersObj = new Headers(headers);
  const asn = request.cf.asn
  // pku asns
  if (WHITELIST_ASNS.indexOf(asn) !== -1) return true;
  // not in pku
  return (headersObj.get("Authorization")) && (headersObj.get("Authorization") === MAGIC);
}