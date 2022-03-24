const JSON_CONTENT_TYPE = 'application/json;charset=UTF-8';
const DEFAULT_RESPONSE_HEADERS = {
  'Content-Type': JSON_CONTENT_TYPE,
  'Access-Control-Allow-Origin': '*'
}

const formatJSON = (obj: Object, pretty: boolean) => JSON.stringify(obj, null, pretty ? 2 : 0);

type ResponseOptions = {
  status: number,
  headers?: { [key: string]: string },
  pretty?: boolean
}

export const generateJSONResponse = (obj: Object, options?: ResponseOptions) => {
  const pretty = options && options.pretty || true;
  const status = options && options.status || 200;
  const headers = options && options.headers || DEFAULT_RESPONSE_HEADERS;

  const json = formatJSON(obj, pretty);

  return new Response(json, {
    status: status,
    headers: { ...headers },
  });
}

export const generateErrorResponse = (error: Error | string, status?: number) => {
  const errorMessage = typeof error === 'string' ? error : error.message;
  const errorStack = typeof error === 'string' ? '' : error.stack;
  return generateJSONResponse({
    error: errorMessage,
    stack: errorStack,
  }, { status: status || 400 });
}