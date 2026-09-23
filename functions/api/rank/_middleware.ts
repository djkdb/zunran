// Native WKWebView uses this fixed origin; web clients remain same-origin.
export const onRequest: PagesFunction = async ({ request, next }) => {
  const origin = request.headers.get('Origin');
  if (origin !== 'capacitor://localhost') return next();
  const headers = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  const original = await next();
  const response = new Response(original.body, original);
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
  return response;
};
