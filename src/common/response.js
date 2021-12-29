const JSON_CONTENT_TYPE = 'application/json;charset=UTF-8';
const DEFAULT_RESPONSE_HEADERS = {
  'Content-Type': JSON_CONTENT_TYPE,
  'Access-Control-Allow-Origin': '*'
}

const formatJSON = (obj, pretty) => JSON.stringify(obj, null, pretty ? 2 : 0);

export const generateJSONResponse = (obj, options) => {
  const pretty = options && options.pretty || true;
  const status = options && options.status || 200;
  const headers = options && options.headers || DEFAULT_RESPONSE_HEADERS;

  const json = formatJSON(obj, pretty);

  return new Response(json, {
    status: status,
    headers: { ...headers },
  });
}

export const generateErrorResponse = (error, status) => {
  return generateJSONResponse({
    error: typeof error.message !== 'undefined' ? error.message : JSON.stringify(error),
    stack: typeof error.stack !== 'undefined'? error.stack: ''
  }, { status: status || 400 });
}