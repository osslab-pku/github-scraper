import { generateJSONResponse } from './common/response'

export async function handleIP(request) {
  const response = await fetch("http://ifconfig.me/ip")
  return generateJSONResponse(
    response
  )
}