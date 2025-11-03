export interface FetchOptions {
  timeout: number;
  waitUntil: "load" | "domcontentloaded" | "networkidle" | "commit";
  extractContent: boolean;
  maxLength: number;
  returnHtml: boolean;
  waitForNavigation: boolean;
  navigationTimeout: number;
  disableMedia: boolean;
  debug?: boolean;
}

export interface FetchResult {
  success: boolean;
  content: string;
  error?: string;
  index?: number;
}

export interface SearchOptions {
  limit?: number;
  timeout?: number;
  stateFile?: string;
  noSaveState?: boolean;
  locale?: string;
  debug?: boolean;
}

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
}

export interface MultiSearchResponse {
  searches: SearchResponse[];
}