#!/bin/sh
# Run as root by etc/init.d/app once this image is mounted at /opt/app,
# before app-backend and the kiosk start.
#
# udev itself is already running (eudev, sysinit runlevel) - this just
# adds this app's rule to it. /etc is tmpfs like the rest of the root
# filesystem, so the rule is gone again on the next boot.

APP_DIR="/opt/app"

cp "${APP_DIR}"/udev/*.rules /etc/udev/rules.d/
udevadm control --reload

logger -t usb-monitor "installed udev rules from ${APP_DIR}/udev"
