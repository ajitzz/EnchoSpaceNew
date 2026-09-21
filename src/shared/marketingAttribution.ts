// Shape validation only. Authenticity and revision binding require the server verifier.
export const attributionTokenPattern=/^v1\.[a-zA-Z0-9_-]{1,24}\.[A-Za-z0-9_-]{43}\.[A-Za-z0-9_-]{43}$/;
export function hasOnlyAttributionQuery(url:URL):boolean{
 const value=url.searchParams.get('enc_ref');
 return !!value&&attributionTokenPattern.test(value)&&url.search===`?enc_ref=${value}`;
}
