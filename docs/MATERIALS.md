# Материалы sprint_1

Project slug: `sprint-1`

Материалы находятся внутри project root, поэтому видимы в файловом дереве
WebUI, но весь каталог `/materials/` исключён из Git:

- uploads: `materials/uploads/`;
- generated: `materials/generated/`;
- exports: `materials/exports/`;
- shared: `materials/shared/`;
- temporary: `materials/tmp/`.

Если пользователь не задал иной путь, каждый выбранный финальный артефакт,
созданный для проекта, копируется в `materials/generated/` до завершения
задачи. Runtime-каталог инструмента не считается project-local хранилищем.
Имена файлов должны быть понятными; без явного запроса существующие файлы не
перезаписываются. Артефакт, который должен войти в Git или runtime продукта, получает
отдельную tracked-копию в соответствующем каталоге продукта.

Удаление Git repository затрагивает и эту ignored-директорию, поэтому перед
удалением проекта постоянные материалы переносят или восстанавливают из backup.
Опишите здесь project-specific quota, retention, backup/restore и допустимые
inline preview formats до появления значимых данных.
