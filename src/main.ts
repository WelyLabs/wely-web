import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig).catch((error: unknown) => {
  // Bootstrap failed, so LoggerService does not exist yet — there is nothing else to
  // report through, and a silent blank page would be worse.
  // eslint-disable-next-line no-console
  console.error('[bootstrap] application failed to start', error);
});
