#!/bin/sh
set -eu

# Nuxt/Nitro включает в манифест только ассеты текущей сборки. Старые хэши
# сохраняем отдельно, а nginx выдаёт их Webvisor напрямую, минуя этот манифест.
source_dir="${WEBVISOR_ASSET_SOURCE_DIR:-/app/webvisor-assets-seed}"
target_dir="${WEBVISOR_ASSET_TARGET_DIR:-/app/.output/public/_nuxt}"
retention_days="${WEBVISOR_ASSET_RETENTION_DAYS:-30}"

case "$retention_days" in
  '' | *[!0-9]*) retention_days=30 ;;
esac

if [ ! -d "$source_dir" ]; then
  echo "Webvisor asset seed directory is missing: $source_dir" >&2
  exit 1
fi

mkdir -p "$target_dir"
# Не используем -a: при каждом запуске mtime актуальных файлов обновляется и
# очистка не удалит хэш, который всё ещё нужен текущей версией приложения.
cp -R "$source_dir"/. "$target_dir"/
find "$target_dir" -type f -mtime "+$retention_days" -delete

exec "$@"
