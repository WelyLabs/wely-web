import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// iOS Safari ignores user-scalable=no in the viewport meta: its pinch-zoom is only stopped by
// cancelling its own gesture events. Maps keep their pinch, which runs on touch events.
document.addEventListener('gesturestart', event => event.preventDefault());

bootstrapApplication(App, appConfig).catch((error: unknown) => {
  // Bootstrap failed, so LoggerService does not exist yet — there is nothing else to
  // report through, and a silent blank page would be worse.
  // eslint-disable-next-line no-console
  console.error('[bootstrap] application failed to start', error);
});
