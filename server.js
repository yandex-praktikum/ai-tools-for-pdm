const http = require('node:http');

const {
  addFeeding,
  bookWalkSlot,
  currentDate,
  getLatestFeeding,
  getWalkSlotsForDate,
} = require('./database');

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const host = process.env.HOST ?? '127.0.0.1';
const MAX_FORM_BYTES = 4096;

function escapeHtml(value) {
  const characters = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };

  return String(value).replace(/[&<>"']/g, (character) => characters[character]);
}

function renderWalkSlot({ slot_time: slotTime, booked_by: bookedBy }, formError) {
  const safeSlotTime = escapeHtml(slotTime);

  if (bookedBy === null) {
    const inputId = `employee-name-${safeSlotTime.replace(':', '-')}`;
    const errorId = `${inputId}-error`;
    const hasError = formError?.slotTime === slotTime;
    const inputValue = hasError ? escapeHtml(formError.employeeName) : '';
    const errorAttributes = hasError
      ? ` value="${inputValue}" aria-invalid="true" aria-describedby="${errorId}"`
      : '';
    const errorMessage = hasError
      ? `<p class="slot__error" id="${errorId}" role="alert">${escapeHtml(formError.message)}</p>`
      : '';

    return `<li class="slot slot--free">
            <time class="slot__time" datetime="${safeSlotTime}">${safeSlotTime}</time>
            <form class="slot__form" method="post" action="walks">
              <input type="hidden" name="slotTime" value="${safeSlotTime}">
              <label class="slot__label" for="${inputId}">ФИО сотрудника</label>
              <div class="slot__fields">
                <input id="${inputId}" name="employeeName" type="text" maxlength="120" required autocomplete="name"${errorAttributes}>
                <button type="submit">Записаться</button>
              </div>
              ${errorMessage}
            </form>
            <span class="slot__status">Свободен</span>
          </li>`;
  }

  return `<li class="slot slot--booked">
            <time class="slot__time" datetime="${safeSlotTime}">${safeSlotTime}</time>
            <p class="slot__details">Записан: <strong>${escapeHtml(bookedBy)}</strong></p>
            <span class="slot__status">Занят</span>
          </li>`;
}

function renderFeedingCard(lastFeeding, formError) {
  const inputId = 'feeding-employee-name';
  const errorId = `${inputId}-error`;
  const hasError = formError !== null;
  const inputValue = hasError ? escapeHtml(formError.employeeName) : '';
  const errorAttributes = hasError
    ? ` value="${inputValue}" aria-invalid="true" aria-describedby="${errorId}"`
    : '';
  const errorMessage = hasError
    ? `<p class="feeding-card__error" id="${errorId}" role="alert">${escapeHtml(formError.message)}</p>`
    : '';
  let feedingState = '<p class="feeding-card__state">Кормление пока не отмечали.</p>';

  if (lastFeeding !== null) {
    const formattedFeedingTime = new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Europe/Moscow',
    }).format(new Date(lastFeeding.fed_at));

    feedingState = `<p class="feeding-card__state">Последним отметил: <strong>${escapeHtml(lastFeeding.employee_name)}</strong></p>
        <p class="feeding-card__time">Время: <time datetime="${escapeHtml(lastFeeding.fed_at)}">${escapeHtml(formattedFeedingTime)}</time></p>`;
  }

  return `<section class="feeding-card" aria-labelledby="feeding-title">
        <h2 id="feeding-title">Последнее кормление</h2>
        ${feedingState}
        <form class="feeding-card__form" method="post" action="feedings">
          <label class="feeding-card__label" for="${inputId}">ФИО сотрудника</label>
          <div class="feeding-card__fields">
            <input id="${inputId}" name="employeeName" type="text" maxlength="120" required autocomplete="name"${errorAttributes}>
            <button type="submit">Отметить кормление</button>
          </div>
          ${errorMessage}
        </form>
      </section>`;
}

function renderPage(
  walkDate,
  walkSlots,
  lastFeeding,
  walkFormError = null,
  pageMessage = null,
  feedingFormError = null,
) {
  const formattedDate = new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Moscow',
  }).format(new Date(`${walkDate}T12:00:00+03:00`));
  const slotItems = walkSlots
    .map((walkSlot) => renderWalkSlot(walkSlot, walkFormError))
    .join('\n          ');
  const pageMessageHtml = pageMessage
    ? `<p class="page-message" role="alert">${escapeHtml(pageMessage)}</p>`
    : '';
  const feedingCard = renderFeedingCard(lastFeeding, feedingFormError);

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Кто выгуливает Бориса</title>
    <style>
      :root {
        color: #24211d;
        background: #f7f4ee;
        font-family: system-ui, sans-serif;
      }

      body {
        margin: 0;
      }

      main {
        box-sizing: border-box;
        width: min(100%, 720px);
        margin: 0 auto;
        padding: 40px 20px;
      }

      ol {
        display: grid;
        gap: 12px;
        padding: 0;
        list-style: none;
      }

      .slot {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 16px;
        align-items: center;
        padding: 18px;
        border: 2px solid;
        border-radius: 12px;
      }

      .slot--free {
        border-color: #2d7d4b;
        background: #eef9f1;
      }

      .slot--booked {
        border-color: #a7493d;
        background: #fff0ed;
      }

      .slot__time {
        font-size: 1.25rem;
        font-weight: 700;
      }

      .slot__details {
        margin: 0;
      }

      .slot__form {
        display: grid;
        gap: 6px;
      }

      .slot__label {
        font-size: 0.875rem;
        font-weight: 600;
      }

      .slot__fields {
        display: flex;
        gap: 8px;
      }

      .slot__fields input {
        box-sizing: border-box;
        min-width: 0;
        width: 100%;
        padding: 8px 10px;
        border: 1px solid #5f6c62;
        border-radius: 8px;
        font: inherit;
      }

      .slot__fields button {
        padding: 8px 12px;
        border: 0;
        border-radius: 8px;
        color: #fff;
        background: #24663e;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }

      .slot__error {
        margin: 0;
        color: #8b241c;
        font-size: 0.875rem;
        font-weight: 600;
      }

      .page-message {
        padding: 12px 14px;
        border: 2px solid #a7493d;
        border-radius: 10px;
        color: #742d25;
        background: #fff0ed;
        font-weight: 700;
      }

      .slot__status {
        padding: 4px 10px;
        border-radius: 999px;
        color: #fff;
        font-size: 0.875rem;
        font-weight: 700;
      }

      .slot--free .slot__status {
        background: #2d7d4b;
      }

      .slot--booked .slot__status {
        background: #a7493d;
      }

      .feeding-card {
        margin-top: 28px;
        padding: 18px;
        border: 2px solid #8a704f;
        border-radius: 12px;
        background: #fffaf0;
      }

      .feeding-card h2,
      .feeding-card__state,
      .feeding-card__time {
        margin-top: 0;
      }

      .feeding-card__form {
        display: grid;
        gap: 6px;
      }

      .feeding-card__label {
        font-size: 0.875rem;
        font-weight: 600;
      }

      .feeding-card__fields {
        display: flex;
        gap: 8px;
      }

      .feeding-card__fields input {
        box-sizing: border-box;
        min-width: 0;
        width: 100%;
        padding: 8px 10px;
        border: 1px solid #6c604f;
        border-radius: 8px;
        font: inherit;
      }

      .feeding-card__fields button {
        padding: 8px 12px;
        border: 0;
        border-radius: 8px;
        color: #fff;
        background: #725a3a;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }

      .feeding-card__error {
        margin: 0;
        color: #8b241c;
        font-size: 0.875rem;
        font-weight: 600;
      }

      @media (max-width: 600px) {
        main {
          padding: 24px 12px;
        }

        .slot {
          grid-template-columns: 1fr;
          gap: 12px;
          align-items: stretch;
          padding: 14px;
        }

        .slot__fields,
        .feeding-card__fields {
          flex-direction: column;
        }

        .slot__fields button,
        .feeding-card__fields button {
          width: 100%;
        }

        .slot__status {
          justify-self: start;
        }

        .feeding-card {
          padding: 14px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Кто выгуливает Бориса</h1>
      <p>Сегодня: <time datetime="${walkDate}">${formattedDate}</time></p>
      ${pageMessageHtml}
      <section aria-labelledby="walk-slots-title">
        <h2 id="walk-slots-title">Слоты прогулок</h2>
        <ol class="slots">
          ${slotItems}
        </ol>
      </section>
      ${feedingCard}
    </main>
  </body>
</html>`;
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(message);
}

function sendPage(
  response,
  statusCode,
  walkSlots,
  lastFeeding,
  walkFormError = null,
  pageMessage = null,
  feedingFormError = null,
) {
  response.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(
    renderPage(
      currentDate,
      walkSlots,
      lastFeeding,
      walkFormError,
      pageMessage,
      feedingFormError,
    ),
  );
}

async function readForm(request) {
  let body = '';
  request.setEncoding('utf8');

  for await (const chunk of request) {
    body += chunk;

    if (Buffer.byteLength(body) > MAX_FORM_BYTES) {
      throw new Error('FORM_TOO_LARGE');
    }
  }

  return new URLSearchParams(body);
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/') {
    const walkSlots = getWalkSlotsForDate(currentDate);
    const lastFeeding = getLatestFeeding();

    sendPage(response, 200, walkSlots, lastFeeding);
    return;
  }

  if (request.method === 'POST' && request.url === '/walks') {
    const contentType = request.headers['content-type'] ?? '';

    if (!contentType.startsWith('application/x-www-form-urlencoded')) {
      sendText(response, 415, 'Поддерживается только отправка формы');
      return;
    }

    try {
      const form = await readForm(request);
      const slotTime = form.get('slotTime') ?? '';
      const enteredEmployeeName = form.get('employeeName') ?? '';
      const employeeName = enteredEmployeeName.trim();
      const walkSlots = getWalkSlotsForDate(currentDate);
      const lastFeeding = getLatestFeeding();
      const slotExists = walkSlots.some(({ slot_time: time }) => time === slotTime);

      if (!slotExists) {
        sendText(response, 400, 'Выберите доступный слот');
        return;
      }

      if (!employeeName || employeeName.length > 120) {
        sendPage(
          response,
          400,
          walkSlots,
          lastFeeding,
          {
            employeeName: enteredEmployeeName,
            message: 'Введите непустое ФИО',
            slotTime,
          },
        );
        return;
      }

      if (!bookWalkSlot(currentDate, slotTime, employeeName)) {
        const currentWalkSlots = getWalkSlotsForDate(currentDate);
        const currentLastFeeding = getLatestFeeding();

        sendPage(
          response,
          409,
          currentWalkSlots,
          currentLastFeeding,
          null,
          'Этот слот уже занят. Первоначальная запись сохранена.',
        );
        return;
      }

      response.writeHead(303, { Location: './' });
      response.end();
      return;
    } catch (error) {
      if (error.message === 'FORM_TOO_LARGE') {
        sendText(response, 413, 'Данные формы слишком велики');
        return;
      }

      console.error(error);
      sendText(response, 500, 'Не удалось обработать запись');
      return;
    }
  }

  if (request.method === 'POST' && request.url === '/feedings') {
    const contentType = request.headers['content-type'] ?? '';

    if (!contentType.startsWith('application/x-www-form-urlencoded')) {
      sendText(response, 415, 'Поддерживается только отправка формы');
      return;
    }

    try {
      const form = await readForm(request);
      const enteredEmployeeName = form.get('employeeName') ?? '';
      const employeeName = enteredEmployeeName.trim();

      if (!employeeName || employeeName.length > 120) {
        const walkSlots = getWalkSlotsForDate(currentDate);
        const lastFeeding = getLatestFeeding();

        sendPage(response, 400, walkSlots, lastFeeding, null, null, {
          employeeName: enteredEmployeeName,
          message: 'Введите непустое ФИО',
        });
        return;
      }

      addFeeding(employeeName);
      response.writeHead(303, { Location: './' });
      response.end();
      return;
    } catch (error) {
      if (error.message === 'FORM_TOO_LARGE') {
        sendText(response, 413, 'Данные формы слишком велики');
        return;
      }

      console.error(error);
      sendText(response, 500, 'Не удалось отметить кормление');
      return;
    }
  }

  sendText(response, 404, 'Страница не найдена');
});

server.listen(port, host, () => {
  console.log(`Приложение запущено: http://localhost:${port}`);
});
