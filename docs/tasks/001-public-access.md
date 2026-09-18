# Публичный доступ к sprint-1

- Статус: complete
- Дата: 2026-09-18

## Запрос и результат

Учебное приложение опубликовано на
`https://vibe-apps.aikibox.ru/sprint-1/` без авторизации. Код и deployment
revision не менялись; изменена только shared ingress policy и согласована
документация.

## Граница

Публичен только exact prefix `/sprint-1/`. Корень `vibe-apps.aikibox.ru`,
соседние slugs и служебные paths остаются за SSO. Клиентские cookies,
Authorization и identity headers не передаются приложению.

Приложение сохраняет введённые значения в SQLite. Использовать можно только
синтетические ФИО: публичный режим не подходит для реальных персональных данных.

## Проверка

Анонимный запрос к `/sprint-1/` отвечает `200`; корень origin и
`/sprint-1-other/` отвечают `401`. Private publisher health, gateway self-test,
SSO matrix и полный системный verifier проходят.

## Rollback

Удалить `/sprint-1` из MAIN ingress allowlist и перезапустить только Vibe Apps
gateway. Затем вернуть эти документы Git revert. Deployment и persistent SQLite
при rollback доступа не удаляются.
