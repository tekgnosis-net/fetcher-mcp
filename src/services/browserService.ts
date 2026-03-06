import { Browser, BrowserContext, Page, chromium } from "playwright";
import { logger } from "../utils/logger.js";
import { FetchOptions } from "../types/index.js";

/**
 * Service for managing browser instances with anti-detection features
 */
export class BrowserService {
  // Static pools — allocated once per process, not per request
  private static readonly USER_AGENTS: string[] = [
    // Chrome - Windows
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    // Chrome - Mac
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
    // Firefox
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:135.0) Gecko/20100101 Firefox/135.0",
    // Safari
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15",
  ];

  private static readonly VIEWPORTS: { width: number; height: number }[] = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1536, height: 864 },
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
  ];

  private options: FetchOptions;
  private isDebugMode: boolean;

  constructor(options: FetchOptions) {
    this.options = options;
    this.isDebugMode = process.argv.includes("--debug");
    
    // Debug mode from options takes precedence over command line flag
    if (options.debug !== undefined) {
      this.isDebugMode = options.debug;
    }
  }

  /**
   * Get whether debug mode is enabled
   */
  public isInDebugMode(): boolean {
    return this.isDebugMode;
  }

  /**
   * Pick a random user agent string from the static pool
   */
  private getRandomUserAgent(): string {
    return BrowserService.USER_AGENTS[
      Math.floor(Math.random() * BrowserService.USER_AGENTS.length)
    ];
  }

  /**
   * Generate a single random viewport — call once and reuse for both
   * chromium.launch (--window-size) and browser.newContext (viewport),
   * so the browser window and context pixel dimensions always match.
   */
  public generateViewport(): { width: number; height: number } {
    return BrowserService.VIEWPORTS[
      Math.floor(Math.random() * BrowserService.VIEWPORTS.length)
    ];
  }

  /**
   * Setup anti-detection script to evade browser automation detection
   */
  private async setupAntiDetection(context: BrowserContext): Promise<void> {
    await context.addInitScript(() => {
      // Override navigator.webdriver
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
      
      // Remove automation fingerprints
      delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Array;
      delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Promise;
      delete (window as any).cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
      
      // Add Chrome object for fingerprinting evasion
      const chrome = {
        runtime: {},
      };
      
      // Add fingerprint characteristics
      (window as any).chrome = chrome;
      
      // Modify screen and navigator properties
      Object.defineProperty(screen, 'width', { value: window.innerWidth });
      Object.defineProperty(screen, 'height', { value: window.innerHeight });
      Object.defineProperty(screen, 'availWidth', { value: window.innerWidth });
      Object.defineProperty(screen, 'availHeight', { value: window.innerHeight });
      
      // Add language features
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
      
      // Simulate random number of plugins
      Object.defineProperty(navigator, 'plugins', {
        get: () => {
          const plugins = [];
          for (let i = 0; i < 5 + Math.floor(Math.random() * 5); i++) {
            plugins.push({
              name: 'Plugin ' + i,
              description: 'Description ' + i,
              filename: 'plugin' + i + '.dll',
            });
          }
          return plugins;
        },
      });
    });
  }

  /**
   * Setup media handling - disable media loading if needed
   */
  private async setupMediaHandling(context: BrowserContext): Promise<void> {
    if (this.options.disableMedia) {
      await context.route("**/*", async (route) => {
        const resourceType = route.request().resourceType();
        if (["image", "stylesheet", "font", "media"].includes(resourceType)) {
          await route.abort();
        } else {
          await route.continue();
        }
      });
    }
  }

  /**
   * Create a new stealth browser instance.
   * Pass the viewport from generateViewport() so --window-size matches
   * the context viewport set in createContext().
   */
  public async createBrowser(viewport: { width: number; height: number }): Promise<Browser> {
    return await chromium.launch({ 
      headless: !this.isDebugMode,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        // Required for Docker: prevents GPU-related crashes in headless containers
        '--disable-gpu',
        '--disable-software-rasterizer',
        // Disables the zygote launcher process which can crash inside Docker namespaces
        '--no-zygote',
        '--disable-webgl',
        '--disable-infobars',
        '--window-size=' + viewport.width + ',' + viewport.height,
        '--disable-extensions'
      ]
    });
  }

  /**
   * Create a new browser context with stealth configurations.
   * Accepts the same viewport used in createBrowser() to keep dimensions consistent.
   */
  public async createContext(browser: Browser, viewport: { width: number; height: number }): Promise<{ context: BrowserContext, viewport: {width: number, height: number} }> {
    const context = await browser.newContext({
      javaScriptEnabled: true,
      ignoreHTTPSErrors: true,
      userAgent: this.getRandomUserAgent(),
      viewport: viewport,
      deviceScaleFactor: Math.random() > 0.5 ? 1 : 2,
      isMobile: false,
      hasTouch: false,
      locale: 'en-US',
      timezoneId: 'America/New_York',
      colorScheme: 'light',
      acceptDownloads: true,
      extraHTTPHeaders: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Cache-Control': 'max-age=0',
      }
    });

    // Set up anti-detection measures
    await this.setupAntiDetection(context);
    
    // Configure media handling
    await this.setupMediaHandling(context);
    
    return { context, viewport };
  }

  /**
   * Create a new page
   */
  public async createPage(context: BrowserContext, viewport: {width: number, height: number}): Promise<Page> {
    const page = await context.newPage();
    return page;
  }

  /**
   * Clean up resources
   */
  public async cleanup(browser: Browser | null, page: Page | null): Promise<void> {
    if (!this.isDebugMode) {
      if (page) {
        await page
          .close()
          .catch((e) => logger.error(`Failed to close page: ${e.message}`));
      }
      if (browser) {
        await browser
          .close()
          .catch((e) => logger.error(`Failed to close browser: ${e.message}`));
      }
    }
  }
}