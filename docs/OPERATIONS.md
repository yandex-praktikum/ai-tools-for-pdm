# Операции sprint_1

## Build и запуск

Добавьте копируемые команды локальной установки, build и запуска.

## Проверки

Добавьте unit/integration/e2e тесты, lint, health check и ожидаемые результаты.

## Развёртывание и rollback

Prototype deploy выполняется из `/srv/vibe/system` командой
`scripts/publishctl publish sprint-1` и открывается на
`https://vibe-apps.aikibox.ru/sprint-1/` без авторизации.
Внешний cloud hosting не используйте без отдельного явного запроса пользователя.
Путь на основном `aikibox.ru` оформляйте через `scripts/requestctl`.

Проверяйте runtime через `scripts/publishctl status`, внутренний health check
publisher и `scripts/publishctl logs sprint-1`. MAIN-side acceptance должна
подтверждать внешний `200` без cookies для `/sprint-1/`, а также `401` для корня
origin и соседнего `/sprint-1-other/`. Vibe VDS не использует MAIN browser
session и не управляет ingress allowlist.

## Диагностика и recovery

Добавьте пути к логам без секретов, типовые сбои, backup/restore и критерии успешного
восстановления.

## Ресурсный бюджет крупных операций

Для импортов, экспортов, render и build зафиксируйте размер порции, soft memory
limit, container/cgroup hard limit и команду измерения peak RSS. Сначала
проверяйте малый preview, затем репрезентативный полный запуск. Частичный
результат не должен подменять финальный; публикация выполняется атомарно.

## Материалы

Используйте только material roots из [`MATERIALS.md`](MATERIALS.md). Не считайте
Git backup для uploads, generated artifacts или exports. До завершения
задачи копируйте выбранный финальный артефакт из tool/runtime storage в
`materials/generated/` и сообщите его абсолютный путь.
