import { Config, Effect, Option } from 'effect';
import { chromium, type BrowserContext } from 'patchright';
import { Sessions } from './session-service.js';
import { origin } from './session-layer.js';
import { SessionError, UsageError } from './errors.js';
import { readBootstrap } from './browser-layer.js';

const authFailed = () => new SessionError({ message: 'Could not import a signed-in Semrush session. Check the browser, complete sign-in, and retry. No credentials were logged.' });
const authCall = <A>(run: () => Promise<A>) => Effect.tryPromise({ try: run, catch: authFailed });

const saveContext = Effect.fn('Auth.saveContext')(function* (context: BrowserContext) {
  const sessions = yield* Sessions;
  const page = yield* Effect.acquireRelease(authCall(() => context.newPage()), page => Effect.promise(() => page.close()));
  yield* authCall(() => page.goto(origin + '/robots.txt', { waitUntil: 'domcontentloaded', timeout: 45000 }));
  const html = yield* authCall(() => page.evaluate(async () => {
    const response = await fetch('/analytics/overview/?db=us', { credentials: 'include', signal: AbortSignal.timeout(45000) });
    return response.ok ? response.text() : '';
  }));
  yield* Effect.try({ try: () => readBootstrap(html), catch: authFailed });
  const cookies = yield* authCall(() => context.cookies(origin));
  if (!cookies.length) return yield* Effect.fail(authFailed());
  // Bare cookies are intentionally bound to the single approved origin by Galleton.
  return yield* sessions.save({ provider: 'semrush', cookie_origin: origin, cookie_header: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ') });
});

export const importBrowser = Effect.fn('Auth.import')(function* (url: string) {
  const valid = yield* Effect.try({ try: () => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(parsed.hostname) || parsed.username || parsed.password) throw new Error('Not loopback');
    return parsed.origin;
  }, catch: () => new UsageError({ message: 'CDP must be a literal loopback HTTP URL. Forward remote browsers over SSH first.' }) });
  const browser = yield* authCall(() => chromium.connectOverCDP(valid, { timeout: 30000 }));
  // Closing a CDP connection disconnects this client and leaves the existing browser running.
  yield* Effect.addFinalizer(() => Effect.promise(() => browser.close()));
  const context = browser.contexts()[0];
  if (!context) return yield* Effect.fail(authFailed());
  const status = yield* saveContext(context);
  return { logged_in: true, source: 'galleton', session: status.id };
});

export const login = Effect.fn('Auth.login')(function* () {
  const executable = yield* Config.option(Config.String('SEMRUSH_BROWSER_EXECUTABLE'));
  const browser = yield* Effect.acquireRelease(authCall(() => chromium.launch({ headless: false, executablePath: Option.getOrUndefined(executable) })), browser => Effect.promise(() => browser.close()));
  const context = yield* authCall(() => browser.newContext({ userAgent: 'OpenAI File Downloader, XaiImageApiFetch/1.0' }));
  const page = yield* authCall(() => context.newPage());
  yield* authCall(() => page.goto(origin + '/login/', { waitUntil: 'domcontentloaded', timeout: 45000 }));
  yield* Effect.sync(() => process.stderr.write('Sign into Semrush in the browser. Waiting up to 5 minutes.\n'));
  yield* authCall(() => page.waitForURL(url => url.hostname === 'www.semrush.com' && !url.pathname.startsWith('/login') && !url.pathname.startsWith('/signup'), { timeout: 300000 }));
  const status = yield* saveContext(context);
  return { logged_in: true, source: 'galleton', session: status.id };
});
