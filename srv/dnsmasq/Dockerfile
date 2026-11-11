ARG ALPINE_RELEASE=3.21
FROM alpine:$ALPINE_RELEASE

RUN apk --no-cache upgrade && apk --no-cache add dnsmasq
EXPOSE 53 53/udp
EXPOSE 67/udp 69/udp
ENTRYPOINT ["/usr/sbin/dnsmasq", "--keep-in-foreground", "--conf-file=/etc/dnsmasq.conf", "--dhcp-broadcast"]