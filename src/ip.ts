import { generateJSONResponse } from './common/response'

export async function handleIP(request: Request) {
  const cfProperties = request.cf
  const response = await fetch("http://ifconfig.me/ip")
  return generateJSONResponse({
    "workerIp": await response.text(),
    "requestProps": cfProperties
  })
}