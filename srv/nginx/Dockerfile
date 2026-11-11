ARG ALPINE_RELEASE=3.21
FROM alpine:$ALPINE_RELEASE

RUN apk --no-cache upgrade && apk --no-cache add --upgrade nginx
EXPOSE 80
ENTRYPOINT ["/usr/sbin/nginx", "-c", "/etc/nginx.conf"]
