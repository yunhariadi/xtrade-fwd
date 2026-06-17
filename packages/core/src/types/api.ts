/**
 * Query parameters accepted by the GET /api/candles endpoint.
 */
export interface CandleQueryParams {
  symbol: string;
  timeframe: string;
  limit?: number;
}

/**
 * Response shape returned by the GET /api/health endpoint.
 */
export interface HealthResponse {
  status: "ok" | "error";
  timestamp?: number;
  message?: string;
}

/**
 * Standard error response shape returned by the API on failures.
 */
export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
}
