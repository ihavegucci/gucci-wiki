#!/usr/bin/env bash
# Идемпотентная настройка сервера: ставит Docker/compose-плагин/nginx/certbot,
# если их ещё нет, кладёт nginx-конфиг для домена и выпускает сертификат
# Let's Encrypt при первом запуске. При повторных запусках (каждый деплой)
# просто ничего не делает лишний раз — безопасно гонять при каждом деплое.
# Запускается из GitHub Actions на сервере через SSH (под root напрямую или
# через `sudo`, если SSH-пользователь не root — сам скрипт от этого не
# зависит, элевацию делает вызывающая сторона, см. deploy.yml).
#
# Ничего в этом файле не знает про конкретный домен/порт/сервер клиента —
# это чистовик, который передаётся заказчикам как есть.
# DOMAIN и UPSTREAM_PORT — то, что отличается от деплоя к деплою, поэтому
# приходят из окружения (секреты репозитория, вкладка Secrets), а не хардкожены
# здесь. NGINX_CONF_NAME по умолчанию выводится из домена (точки → дефисы),
# как и у соседних сервисов на той же машине.
set -euo pipefail

DOMAIN="${DOMAIN:?DOMAIN не задан (например, gucciwiki.example.com)}"
UPSTREAM_PORT="${UPSTREAM_PORT:?UPSTREAM_PORT не задан (порт, на котором слушает контейнер app)}"
EMAIL="${LETSENCRYPT_EMAIL:?LETSENCRYPT_EMAIL не задан}"

WEBROOT="/var/www/certbot"
NGINX_CONF="/etc/nginx/conf.d/${DOMAIN//./-}.conf"
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

render_template() {
  # sed вместо envsubst — не тянет лишний пакет (gettext-base) ради двух
  # плейсхолдеров.
  sed -e "s/__DOMAIN__/$DOMAIN/g" -e "s/__PORT__/$UPSTREAM_PORT/g" "$1" > "$NGINX_CONF"
}

# Вся "базовая" часть стека, которую даёт apt (Docker, nginx, certbot, curl —
# последний нужен ниже для compose-плагина), ставится одним `apt-get install`,
# только если чего-то реально не хватает — `apt-get update` не гоняется
# лишний раз на сервере, где уже всё стоит (обычный повторный деплой). На
# сервере, где Docker уже используется другими контейнерами, `docker.io` в
# списке просто не окажется — `command -v docker` найдёт существующий движок,
# ничего не переустанавливается и не перезапускается.
# ОБЯЗАТЕЛЬНО до первого обращения к /etc/nginx/conf.d/ ниже — этот каталог
# создаёт сам пакет nginx при установке; на чистом сервере, где nginx ещё
# нет, `cp` в него упал бы с "No such file or directory" (живой баг, нашёл
# пользователь на первом прогоне после этой автоустановки).
# `docker-compose-plugin` НЕ в этом списке специально: на части зеркал (Timeweb —
# нашёл пользователь живым прогоном) пакета с этим именем в apt просто нет, и
# `apt-get install` с несколькими пакетами падает целиком, даже если только
# одного из них не хватает — роняя заодно и nginx, и certbot, которые apt
# прекрасно знает. Плагин ставится отдельным шагом ниже.
missing_pkgs=()
command -v docker >/dev/null 2>&1 || missing_pkgs+=(docker.io)
command -v nginx >/dev/null 2>&1 || missing_pkgs+=(nginx)
command -v certbot >/dev/null 2>&1 || missing_pkgs+=(certbot)
command -v curl >/dev/null 2>&1 || missing_pkgs+=(curl)

if [ "${#missing_pkgs[@]}" -gt 0 ]; then
  apt-get update -y
  apt-get install -y "${missing_pkgs[@]}"
fi

# Compose v2 — статический CLI-плагин с GitHub Releases проекта docker/compose,
# не пакет apt: так это работает одинаково на любом сервере вне зависимости от
# того, есть ли в его репозиториях `docker-compose-plugin` (не везде есть, см.
# выше) — тот же "chistovik для любого сервера клиента", что и остальной
# скрипт. `/usr/local/lib/docker/cli-plugins/` — системный путь поиска
# плагинов Docker CLI, не привязан к `$HOME` конкретного пользователя (важно,
# потому что докер-команды в deploy.yml идут то под root, то под sudo).
if ! docker compose version >/dev/null 2>&1; then
  case "$(uname -m)" in
    x86_64) COMPOSE_ARCH=x86_64 ;;
    aarch64|arm64) COMPOSE_ARCH=aarch64 ;;
    *) echo "Неизвестная архитектура для docker compose plugin: $(uname -m)" >&2; exit 1 ;;
  esac
  mkdir -p /usr/local/lib/docker/cli-plugins
  curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-${COMPOSE_ARCH}" \
    -o /usr/local/lib/docker/cli-plugins/docker-compose
  chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
fi

mkdir -p "$WEBROOT"

# Статический файл (не шаблон — не содержит __DOMAIN__/__PORT__), просто
# копируется как есть, перезаписывается при каждом запуске — так же
# идемпотентно, как render_template ниже перезаписывает per-домен конфиг.
# ОБЯЗАТЕЛЬНО до первого `nginx -t` ниже: per-домен конфиг уже ссылается на
# `zone=auth_limit`, без этого файла `nginx -t` упадёт на первом же чистом
# сервере с "unknown directive limit_req".
cp "$DEPLOY_DIR/nginx/rate-limit.conf" "/etc/nginx/conf.d/rate-limit.conf"

if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  echo "Сертификата ещё нет — сначала ставим HTTP-конфиг для ACME-проверки"
  render_template "$DEPLOY_DIR/nginx/http-only.conf.template"
  nginx -t
  systemctl reload nginx
  if ! certbot certonly --webroot -w "$WEBROOT" -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL"; then
    # Let's Encrypt сообщает только код ответа ("404") и не говорит, ЧЕЙ это
    # ответ. Без подсказки причину ищут руками по всему серверу, а вариантов
    # ровно три и они различаются двумя запросами. Поэтому при провале сразу
    # печатаем разбор, а не голую ошибку certbot.
    probe="acme-probe-$$"
    mkdir -p "$WEBROOT/.well-known/acme-challenge"
    echo "$probe" > "$WEBROOT/.well-known/acme-challenge/$probe"
    # Запрос по петле с нужным Host: обходит и DNS, и внешний фаервол —
    # проверяет ровно одно: отдаёт ли nginx НА ЭТОЙ машине файлы из вебрута.
    # `|| true` обязателен: под `set -e` неудачный curl оборвал бы диагностику
    # ровно там, где она и нужна.
    probe_code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10       -H "Host: $DOMAIN" "http://127.0.0.1/.well-known/acme-challenge/$probe" || true)"
    [ "$probe_code" = "000" ] && probe_code=""
    rm -f "$WEBROOT/.well-known/acme-challenge/$probe"

    # Каждая строка считается заранее и отдельно: под `set -o pipefail`
    # конструкция "$(конвейер || echo запасное)" печатает И пустой результат
    # конвейера, И запасное значение — двумя строками вместо одной.
    server_ip="$(curl -s --max-time 10 https://api.ipify.org || true)"
    domain_ip="$(getent hosts "$DOMAIN" | awk '{print $1}' | paste -sd, - || true)"
    our_blocks="$(nginx -T 2>/dev/null | grep -c "server_name $DOMAIN" || true)"
    port80="$(ss -ltnp 2>/dev/null | grep ':80 ' | tr -s ' ' | cut -d' ' -f4 | paste -sd', ' - || true)"

    {
      echo ""
      echo "=== Почему не прошла проверка домена ==="
      echo "Локальный запрос к вебруту через nginx: ${probe_code:-нет ответа} (ожидалось 200)"
      echo "IP этого сервера:                       ${server_ip:-не определился}"
      echo "Куда указывает домен:                   ${domain_ip:-не резолвится}"
      echo "Наш server-блок в конфиге nginx:        ${our_blocks:-0} шт. (ожидалось не меньше 1)"
      echo "Слушают порт 80:                        ${port80:-никто}"
      echo ""
      if [ "$probe_code" = "200" ]; then
        echo "nginx на этом сервере настроен верно — значит запрос снаружи до него не доходит."
        echo "Проверьте: A-запись домена указывает на IP этого сервера; порт 80 открыт в"
        echo "фаерволе хостера; домен не проксируется через Cloudflare в режиме proxied."
      else
        echo "nginx на этом сервере НЕ отдаёт файлы вебрута, то есть 404 пришёл не от нас."
        echo "Вероятно, конфиг $NGINX_CONF не подключён: проверьте, что в /etc/nginx/nginx.conf"
        echo "есть строка include /etc/nginx/conf.d/*.conf; — на сервере с чужим nginx.conf её"
        echo "иногда нет, и тогда домен обслуживает сайт по умолчанию, отвечающий 404 на всё."
      fi
    } >&2
    exit 1
  fi
  # автопродление уже включено systemd-таймером пакета certbot, ничего
  # дополнительно настраивать не нужно
fi

render_template "$DEPLOY_DIR/nginx/with-ssl.conf.template"
nginx -t
systemctl reload nginx
