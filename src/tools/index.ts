import { fetchUrlTool, fetchUrl } from './fetchUrl.js';
import { fetchUrlsTool, fetchUrls } from './fetchUrls.js';
import { browserInstallTool, browserInstall } from './browserInstall.js';
import { searchGoogleTool, searchGoogle } from './searchGoogle.js';

// Export tool definitions
export const tools = [
  fetchUrlTool,
  fetchUrlsTool,
  browserInstallTool,
  searchGoogleTool
];

// Export tool implementations
export const toolHandlers = {
  [fetchUrlTool.name]: fetchUrl,
  [fetchUrlsTool.name]: fetchUrls,
  [browserInstallTool.name]: browserInstall,
  [searchGoogleTool.name]: searchGoogle
};

