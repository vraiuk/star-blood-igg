/** Build-time version (vite `define`); tests and tsx runs fall back to 'dev'. */
declare const __APP_VERSION__: string;
declare const __APP_BUILD__: string;

export const VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
export const BUILD: string = typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : 'dev';
/** "v0.5.3 · 644d055" */
export const VERSION_LABEL = `v${VERSION}${BUILD !== 'dev' ? ` · ${BUILD}` : ''}`;
