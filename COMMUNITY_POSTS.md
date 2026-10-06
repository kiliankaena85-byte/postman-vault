# Материалы для публикации в сообществе: Postman Vault

В этом документе собраны готовые тексты для публикации на разных площадках, чтобы заявить о себе, привлечь внимание разработчиков, собрать звёзды на GitHub и протестировать реальный интерес рынка.

---

## 1. Большая статья для Хабра (Habr.com)
*Хаб: Разработка под веб, Reverse Engineering, Информационная безопасность, Искусственный интеллект*

### Заголовок:
> **Postman принудительно запер всех в облаке. Как мы за 30 минут с помощью ИИ-агента расковыряли его LevelDB и сделали оффлайн-конвертер**

### Текст статьи:

Привет, Хабр!

Если вы используете Postman, вы наверняка знаете про недавнюю драму: Postman окончательно похоронил оффлайн-режим **Scratch Pad**. Теперь, чтобы сохранить хотя бы один запрос или переменную, вы обязаны залогиниться и отправить данные в американское облако.

Для финтеха, банков и проектов с жестким комплаенсом это стало катастрофой:
1. В коллекциях запросов часто живут боевые JWT-токены, внутренние адреса микросервисов и API-ключи. Сливать их в чужое SaaS-облако категорически запрещено службами безопасности.
2. Postman вынуждает переходить на закрытые enterprise-тарифы просто за базовое право изолировать свои данные внутри корпоративного периметра.
3. Разработчики массово побежали в открытые альтернативы (в первую очередь **Bruno**), но внезапно оказалось: в новой 12-й версии Postman спрятал локальные файлы так, что обычным экспортом забрать всё скопом без логина — та ещё задачка.

Мы решили устроить краш-тест современным ИИ-агентам для реверс-инжиниринга (**REA**) и поставили задачу: **вскрыть локальное хранилище десктопного Postman, разобраться, где и в каком виде лежат коллекции, и написать автономный оффлайн-конвертер.**

Что из этого вышло за полчаса — под катом.

---

### Шаг 1. Куда Postman прячет данные?

Postman — классическое Electron-приложение. Главный архив логики весит внушительные 162 МБ (`app.asar`), но самое интересное происходит в директории профиля пользователя:
`%APPDATA%\Postman` (или `~/.config/Postman` на Linux).

Запустив сканирование через агента, мы сразу наткнулись на директорию:
`Postman\Partitions\<UUID>\IndexedDB\https_desktop.postman.com_0.indexeddb.leveldb`

Здесь живет стандартная Chromium IndexedDB, реализованная на базе **LevelDB**.
Но просто прочитать строки оттуда нельзя: объекты сериализованы внутренним бинарным сериализатором **V8 Structured Serialization** (`v8::ValueSerializer`).

В логах LevelDB (`000032.log`) агент выцепил ключевой реестр связей:
```text
8o"?primaryPath".E:/projects/postman/collections/My API"?associatedPathsA?...type" collection
```

Postman хранит пути ко всем локальным репозиториям и коллекциям прямо в LevelDB!

---

### Шаг 2. Новый модульный формат Postman v12

Когда коллекция синхронизируется или сохраняется локально, Postman v12 разбивает её на модульные YAML-файлы:
* `.resources/definition.yaml` — манифест коллекции с переменными (`baseUrl`, токены).
* Папки с файлами вида `Create Order.request.yaml`, в которых лежит декларативное описание:
```yaml
$kind: http-request
method: POST
url: '{{baseUrl}}/api/v1/orders'
headers:
  - key: Authorization
    value: 'Bearer {{secretToken}}'
body:
  type: json
  content: '{"serviceId": 12, "quantity": 100}'
scripts:
  - type: afterResponse
    language: text/javascript
    code: 'pm.test("Status is 200", () => pm.expect(pm.response.code).to.eq(200));'
```

Ни один сторонний инструмент (Insomnia, Bruno, Hoppscotch) **не умеет открывать эти папки напрямую**. Им нужен либо стандартный JSON v2.1, либо спецификация OpenAPI.

---

### Шаг 3. Создаем оффлайн-мост и утилиту

Мы упаковали логику в небольшую утилиту **Postman Vault**:
1. **Автопоиск:** Сама находит установленный Postman, профили и все скрытые репозитории в LevelDB.
2. **Конвертация:** В 1 клик собирает разрозненные `.request.yaml` в:
   * Единый файл **Postman Collection v2.1.0 JSON** (который за секунду импортируется в Bruno или Insomnia).
   * Полноценную спецификацию **OpenAPI 3.0.3 (Swagger YAML/JSON)** со схемами и параметрами.
3. **Безопасность (Sanitized Export):** Главная фича, которой не хватало — автоматическая зачистка боевых секретов перед коммитом в публичный Git или передачей подрядчикам (замена паролей и JWT на `{{SECRET_PLACEHOLDER}}`).

Для тех, кто не любит терминал, мы добавили локальный веб-дашборд на чистом `node:http`:
Запускается командой `node bin/cli.js ui` и открывает дашборд прямо на `localhost:4567`.

---

### Результаты и код

Инструмент полностью открыт и доступен на GitHub под лицензией MIT.

* **Репозиторий проекта:** `https://github.com/kiliankaena85-byte/postman-vault`

**Выводы эксперимента:**
Эра, когда реверс-инжиниринг требовал недели копания в Ghidra ради тривиальной задачи, уходит. Связка ИИ-агента и специализированных инструментов анализа позволяет за один вечер пройти путь от «где этот проприетарный софт хранит мои файлы» до готового инструмента, спасающего данные из закрытого вендорского облака.

Буду рад вашему фидбеку и звездам на GitHub!

---

## 2. Пост для Reddit (r/programming, r/webdev, r/selfhosted)

**Title:** 
> Postman killed Scratchpad, so we built an open-source, 100% offline LevelDB extractor & OpenAPI porter

**Body:**

Hey everyone,

Like many of you, we were frustrated when Postman officially deprecated offline Scratch Pad and began forcing cloud account synchronization for saved requests and variables. For companies with strict infosec and data residency policies, pushing production tokens to 3rd-party clouds is a non-starter.

Migrating away to open-source alternatives like **Bruno** or **Insomnia** is great, but Postman v12 stores collections in a proprietary modular `.request.yaml` + Chromium LevelDB format that third-party tools can't parse out-of-the-box.

We built **Postman Vault** — a lightweight, zero-cloud utility:
* 🔍 **Zero Config:** Automatically scans `%APPDATA%\Postman` and extracts collection registries directly from LevelDB logs.
* 📦 **Universal Export:** Converts v12 repositories into standard **Postman Collection v2.1.0** (importable into Bruno/Insomnia) and **OpenAPI 3.0.3 (Swagger)**.
* 🛡️ **Sanitized Export:** Automatically scrubs hardcoded authorization headers, JWTs, and passwords before exporting for public Git or contractors.
* 🖥️ **Built-in Local Web UI:** Runs locally on `localhost:4567` with 1-click downloads.

It's 100% local, MIT licensed, and has zero tracking.

GitHub: https://github.com/kiliankaena85-byte/postman-vault

Would love your thoughts and feedback!

---

## 3. Пост для Hacker News (Show HN)

**Title:**
> Show HN: Postman Vault – 100% offline LevelDB extractor and OpenAPI porter for Postman v12

**Text / Link:**
> https://github.com/kiliankaena85-byte/postman-vault
> 
> Hi HN,
> 
> Since Postman deprecated Scratchpad and mandated cloud sync, exporting collections locally has become surprisingly painful—especially in Postman v12, which stores workspaces in modular YAML and Chromium LevelDB partitions.
> 
> We created Postman Vault to solve this completely offline:
> 1. Discovers Postman partitions and collections via local LevelDB write-ahead logs.
> 2. Compiles modular v12 requests into standard Postman v2.1 JSON and OpenAPI 3.0 YAML.
> 3. Audits and sanitizes credentials (JWTs, AWS keys) before exporting.
> 
> Includes a lightweight local Web UI (no external dependencies except `js-yaml`).
> 
> Code & README: https://github.com/kiliankaena85-byte/postman-vault

---

## 4. Пост для Telegram / Twitter (X)

🚀 **Как забрать свои данные из Postman без облака и принудительных подписок**

Помните, как Postman убил оффлайн-режим и заставил всех логиниться в облако? Для банков и финтеха это боль — боевые токены и закрытые API нельзя отдавать наружу.

Мы решили проблему: за полчаса с помощью ИИ-агента расковыряли кишки десктопного Postman (LevelDB и новый v12 формат `.request.yaml`) и написали **Postman Vault**:

* ⚡ Сам находит локальные коллекции на диске.
* 📥 В 1 клик переносит всё в Bruno, Insomnia или OpenAPI 3.0 (Swagger).
* 🛡️ «Санитизирует» запросы — затирает пароли и токены перед публикацией в Git.
* 🖥️ Есть красивый локальный веб-дашборд.

Код полностью открыт под MIT:
👉 https://github.com/kiliankaena85-byte/postman-vault

Забирайте в закладки и поддержите звёздочкой на GitHub! ⭐
