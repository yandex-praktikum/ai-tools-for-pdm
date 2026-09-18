# Архитектура sprint_1

Статус: initial scaffold

## Назначение и границы

Опишите пользователей, ключевые сценарии, что входит в проект и что остаётся снаружи.

## Компоненты и данные

Опишите runtime-компоненты, хранилища, внешние зависимости и потоки данных.
Крупные пользовательские файлы и generated artifacts находятся в полностью
ignored `materials/` внутри project root согласно
[`MATERIALS.md`](MATERIALS.md), но не входят в Git history.
Выбранный финальный артефакт, созданный по запросу пользователя, по умолчанию
копируется из tool/runtime storage в `materials/generated/`.

## Публикация и shared infrastructure

Текущий prototype опубликован на
`https://vibe-apps.aikibox.ru/sprint-1/` без авторизации по явному решению
владельца. Анонимное исключение ограничено exact prefix `/sprint-1/` в
MAIN-side gateway; корень origin и соседние Vibe-приложения сохраняют SSO.
Внешний cloud hosting не используется. Любой путь на основном `aikibox.ru` или
другое изменение shared infrastructure проходит через структурированный
административный запрос и синхронное обновление реестра. Нормативный путь
проверки описан в [`OPERATIONS.md`](OPERATIONS.md).

## Секреты, backup и recovery

Опишите классы секретов без значений, данные для backup, RPO/RTO и проверяемый recovery path.
