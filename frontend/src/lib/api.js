// src/lib/api.js
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

// Internal error codes that map to user-friendly messages
const PROVIDER_ERROR_CODES = new Set([
  'AI_PROVIDER_UNAVAILABLE',
  'AI_PROVIDER_QUOTA_EXCEEDED',
  'AI_PROVIDER_RATE_LIMITED',
  'AI_PROVIDER_ACCESS_DENIED',
  'AI_PROVIDER_CONFIGURATION_ERROR',
  'AI_RESPONSE_INVALID',
  'MCP_SERVER_UNAVAILABLE',
  'RAG_RETRIEVAL_UNAVAILABLE',
  'INVESTIGATION_TIMEOUT',
  'INSUFFICIENT_EVIDENCE',
  'INTERNAL_SERVICE_ERROR',
]);

/**
 * Normalise an error response from the API into a human-readable string.
 * Raw provider error dictionaries, stack traces, and SDK exception bodies
 * must never reach the UI.
 */
function normaliseErrorMessage(errorData, status) {
  // Structured AI error response (from ai-rca-service errors.py)
  if (errorData && errorData.error && errorData.error.code) {
    const { code, message, request_id } = errorData.error;
    // Return a structured error object that the UI can render properly
    const err = new Error(message || 'An unexpected error occurred.');
    err.code = code;
    err.request_id = request_id;
    err.retryable = errorData.error.retryable ?? false;
    err.is_ai_error = true;
    return err;
  }

  // FastAPI validation error (422)
  if (errorData && Array.isArray(errorData.detail)) {
    const msg = errorData.detail.map(d => `${d.loc?.join('.')} ${d.msg}`).join(', ');
    return new Error(msg);
  }

  // FastAPI string detail
  if (errorData && typeof errorData.detail === 'string') {
    // Sanitise — do not pass raw provider exception strings to the UI
    const detail = errorData.detail;
    if (
      detail.includes('openai') ||
      detail.includes('boto3') ||
      detail.includes('botocore') ||
      detail.includes('Traceback') ||
      detail.includes('ClientError') ||
      detail.includes('insufficient_quota') ||
      detail.includes('Error code:')
    ) {
      // This is a raw provider error leaking from legacy code
      const sanitisedErr = new Error(
        'AI analysis is temporarily unavailable because the configured provider ' +
        'cannot process this request. Please retry later or contact the administrator.'
      );
      sanitisedErr.code = 'AI_PROVIDER_UNAVAILABLE';
      sanitisedErr.retryable = true;
      sanitisedErr.is_ai_error = true;
      return sanitisedErr;
    }
    return new Error(detail);
  }

  // FastAPI object detail
  if (errorData && typeof errorData.detail === 'object' && errorData.detail !== null) {
    return new Error('An unexpected error occurred. Please retry.');
  }

  // Plain message field
  if (errorData && errorData.message) {
    return new Error(errorData.message);
  }

  return new Error(`Request failed (${status || 'unknown'})`);
}

export async function fetchApi(endpoint, options = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('jwt_token') : null;
  
  let path = endpoint;
  if (path.startsWith('/api')) {
    path = path.substring(4);
  }
  
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');
  
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorData = {};
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      errorData = await response.json().catch(() => ({}));
    } else {
      const text = await response.text().catch(() => '');
      errorData = { message: text || `Request failed: ${response.statusText}` };
    }

    if (response.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('jwt_token');
        window.location.href = '/login';
      }
    }
    
    throw normaliseErrorMessage(errorData, response.status);
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

/**
 * Extracts the user role from the stored JWT token.
 * Defaults to 'user' if token is missing or invalid.
 */
export function getUserRole() {
  if (typeof window === 'undefined') return 'user';
  const token = localStorage.getItem('jwt_token');
  if (!token) return 'user';
  
  try {
    const payloadBase64 = token.split('.')[1];
    const decodedJson = atob(payloadBase64);
    const payload = JSON.parse(decodedJson);
    const role = String(payload.role || 'user').toLowerCase();
    if (role === 'admin' || role === 'administrator') {
      return 'admin';
    }
    return role;
  } catch (e) {
    return 'user';
  }
}
