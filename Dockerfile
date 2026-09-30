# The Angular bundle is built before this image, not inside it.
#
# It used to be a two-stage build running `npm ci` and `ng build` in a node stage. That is fine
# on one architecture; the image is published for linux/amd64 and linux/arm64, because the
# cluster runs on Raspberry Pi nodes, and buildx runs the whole stage once per platform — the
# arm64 pass under QEMU emulation. Emulating a full TypeScript and esbuild compilation took
# hours and eventually hung the job outright. The five Java services never hit this: their
# images only copy a jar that Maven already produced.
#
# So the bundle is produced once, natively, by the workflow, and this image only copies it.
# Per architecture that is a file copy, which is what a multi-arch build should cost.
#
# Consequence to know about: `docker build .` needs dist/ to exist. Run
#   npm ci --legacy-peer-deps && npm run build -- --configuration production
# first, or the COPY below fails with a clear message rather than silently shipping nothing.

# The unprivileged nginx image runs as uid 101 and listens on 8080, rather than needing root to
# bind port 80. The Service keeps exposing 80 externally.
FROM nginxinc/nginx-unprivileged:stable-alpine

# nginx.conf is a template: entrypoint.sh substitutes the DNS resolver into it at start, because
# the resolver address is only known inside the cluster.
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --chown=101:101 dist/calendar-app/browser /usr/share/nginx/html
COPY entrypoint.sh /entrypoint.sh

USER root
RUN chmod +x /entrypoint.sh
USER 101

EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]
