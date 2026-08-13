export interface SafeApiResponse<T = any> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
  isJson: boolean;
  rawText?: string;
}

/**
 * Safely parses any fetch Response without throwing SyntaxError on HTML or non-JSON text.
 * Handles 2xx, 401, 403, 409, 500 JSON, and non-JSON 500 HTML/text gracefully.
 */
export async function safeParseResponse<T = any>(res: Response): Promise<SafeApiResponse<T>> {
  const status = res.status;
  const ok = res.ok;
  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');

  let rawText = '';
  try {
    rawText = await res.text();
  } catch (err) {
    return {
      ok: false,
      status,
      data: null,
      error: `Failed to read response body: ${err instanceof Error ? err.message : String(err)}`,
      isJson: false
    };
  }

  if (isJson) {
    try {
      const data = JSON.parse(rawText);
      return {
        ok,
        status,
        data,
        error: !ok ? (data?.error || data?.message || `HTTP ${status}`) : undefined,
        isJson: true,
        rawText
      };
    } catch (parseErr) {
      console.warn(`[safeParseResponse] Expected JSON but failed to parse (status ${status}):`, rawText.slice(0, 200));
      return {
        ok: false,
        status,
        data: null,
        error: `Server returned invalid JSON format (status ${status}): ${rawText.slice(0, 150)}`,
        isJson: false,
        rawText
      };
    }
  } else {
    // Non-JSON response (HTML, text, etc.)
    // Attempt fallback JSON parse in case Content-Type header was omitted
    try {
      const data = JSON.parse(rawText);
      return {
        ok,
        status,
        data,
        error: !ok ? (data?.error || data?.message || `HTTP ${status}`) : undefined,
        isJson: true,
        rawText
      };
    } catch {
      const isHtml = rawText.trim().startsWith('<');
      const errSummary = isHtml
        ? `Server returned HTML response (status ${status})`
        : `Server returned non-JSON text response (status ${status}): ${rawText.slice(0, 150)}`;
      
      console.warn(`[safeParseResponse] ${errSummary}`);
      return {
        ok,
        status,
        data: null,
        error: errSummary,
        isJson: false,
        rawText
      };
    }
  }
}

/**
 * Wrapper around global fetch that uses safeParseResponse.
 */
export async function safeFetch<T = any>(url: string, options?: RequestInit): Promise<SafeApiResponse<T>> {
  try {
    const res = await fetch(url, options);
    return await safeParseResponse<T>(res);
  } catch (fetchErr) {
    const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    console.error(`[safeFetch] Network/Fetch error for ${url}:`, msg);
    return {
      ok: false,
      status: 0,
      data: null,
      error: `Network request failed: ${msg}`,
      isJson: false
    };
  }
}
