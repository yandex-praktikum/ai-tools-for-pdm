const { createServer } = require('node:http');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { addFeeding, bookWalkSlot, getLatestFeeding, getWalkSlotsForCurrentDate } = require('./database');

const host = '127.0.0.1';
const port = 3000;
const assets = {
  '/styles.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  '/app.js': { file: 'app.js', contentType: 'text/javascript; charset=utf-8' },
  '/boris.svg': { file: 'boris.svg', contentType: 'image/svg+xml; charset=utf-8' }
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function renderPage(walkDate, slots, {
  message = '',
  isError = false,
  employeeName = '',
  selectedSlotTime = '',
  latestFeeding = null,
  feedingMessage = '',
  feedingIsError = false,
  feedingEmployeeName = ''
} = {}) {
  const allSlotsBooked = slots.length === 5 && slots.every(slot => slot.bookedBy !== null);
  const slotList = slots.map(({ slotTime, bookedBy }) => {
    const time = `<time class="slot-time">${escapeHtml(slotTime)}</time>`;
    const state = bookedBy === null
      ? `<label class="slot-card slot-card--free"><input type="radio" name="slotTime" value="${escapeHtml(slotTime)}"${selectedSlotTime === slotTime ? ' checked' : ''} required><span class="slot-card__top">${time}<span class="slot-status"><span class="status-dot"></span> Свободно</span></span><span class="slot-card__action">Выбрать время <span aria-hidden="true">↗</span></span></label>`
      : `<article class="slot-card slot-card--booked"><span class="slot-card__top">${time}<span class="slot-status"><span class="status-dot"></span> Занято</span></span><strong class="slot-booker">${escapeHtml(bookedBy)}</strong></article>`;

    return state;
  }).join('');
  const feedback = message
    ? `<p class="notice ${isError ? 'notice--error' : 'notice--success'}" role="${isError ? 'alert' : 'status'}">${escapeHtml(message)}</p>`
    : '';
  const feedingFeedback = feedingMessage
    ? `<p class="notice ${feedingIsError ? 'notice--error' : 'notice--success'}" role="${feedingIsError ? 'alert' : 'status'}">${escapeHtml(feedingMessage)}</p>`
    : '';
  const feedingDetails = latestFeeding
    ? `<p class="feeding-name">${escapeHtml(latestFeeding.employeeName)}</p><time class="feeding-time" datetime="${escapeHtml(latestFeeding.fedAt)}">${escapeHtml(new Intl.DateTimeFormat('ru-RU', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(latestFeeding.fedAt)))}</time>`
    : '<p class="feeding-empty">Пока без отметок</p>';
  const displayDate = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date(`${walkDate}T00:00:00`));

  return `<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#f4f3eb">
    <link rel="stylesheet" href="/styles.css">
    <title>Кто выгуливает Бориса</title>
  </head>
  <body>
    <div class="page-shell">
      <header class="topbar">
        <a class="wordmark" href="/" aria-label="Кто выгуливает Бориса — на главную">
          <span class="wordmark__stamp" aria-hidden="true">Б</span>
          <span><strong>Догяндекс</strong><small>добрые дела по очереди</small></span>
        </a>
        <span class="topbar__note"><span class="status-dot"></span> Офисная жизнь, но с хвостом</span>
      </header>

      <main>
        <section class="hero" aria-labelledby="page-title">
          <div class="hero__copy">
            <p class="eyebrow">ВЫГУЛ · СЕГОДНЯ</p>
            <h1 id="page-title">Кто выгуливает <span>Бориса?</span></h1>
            <p class="hero__description">Выберите время для прогулки. Борис уже присматривает за поводком.</p>
            <a class="hero__jump" href="#walk-slots">Выбрать время <span aria-hidden="true">↓</span></a>
          </div>
          <figure class="hero__art">
            <img src="/boris.svg" alt="Рыжий хвост Бориса свернут в вопросительный знак" width="560" height="430">
            <figcaption><span>Борис</span><span>главный по прогулкам</span></figcaption>
          </figure>
          <span class="hero__scribble" aria-hidden="true">гав!</span>
        </section>

        <section class="walk-section" id="walk-slots" aria-labelledby="walk-heading">
          <div class="section-heading">
            <div>
              <p class="eyebrow">ВАШ ВЫХОД НА СВЕЖИЙ ВОЗДУХ</p>
              <h2 id="walk-heading">Записаться на прогулку</h2>
            </div>
            <time class="date-chip" datetime="${escapeHtml(walkDate)}">${escapeHtml(displayDate)}</time>
          </div>

          ${feedback}
          <div class="walk-section__booking" data-all-slots-booked="${allSlotsBooked}">
            ${allSlotsBooked
              ? `<div class="slot-grid" aria-label="Занятые слоты прогулки">${slotList}</div>`
              : `<form class="booking-form" method="post" action="/book">
                  <div class="slot-grid" role="radiogroup" aria-label="Свободные слоты прогулки">
                    ${slotList}
                  </div>
                  <div class="booking-controls">
                    <label class="name-field" for="employeeName">
                      <span>Ваше ФИО</span>
                      <input id="employeeName" name="employeeName" type="text" autocomplete="name" maxlength="120" required value="${escapeHtml(employeeName)}" placeholder="Например, Анна Тестова">
                    </label>
                    <button class="primary-button" type="submit">Записаться <span aria-hidden="true">↗</span></button>
                  </div>
                </form>`}
          </div>
        </section>

        <section class="feeding-panel" aria-labelledby="feeding-heading">
          <div class="feeding-panel__mark" aria-hidden="true">
            <svg viewBox="0 0 48 48" role="presentation"><path d="M8 24h32l-4 14H12L8 24Z"/><path d="M13 18c2-3 5-4 8-2m6 0c3-2 6-1 8 2M8 24c0 10 7 17 16 17s16-7 16-17"/><path d="M18 29h.1m12-.1h.1"/></svg>
          </div>
          <div class="feeding-panel__copy">
            <p class="eyebrow">МАЛЕНЬКАЯ ЗАБОТА</p>
            <h2 id="feeding-heading">Последнее кормление</h2>
            ${feedingDetails}
            ${feedingFeedback}
          </div>
          <form class="feeding-form" method="post" action="/feeding">
            <label class="name-field" for="feedingEmployeeName">
              <span>Кто покормил Бориса?</span>
              <input id="feedingEmployeeName" name="employeeName" type="text" autocomplete="name" maxlength="120" required value="${escapeHtml(feedingEmployeeName)}" placeholder="ФИО сотрудника">
            </label>
            <button class="secondary-button" type="submit">Отметить <span aria-hidden="true">+</span></button>
          </form>
        </section>
      </main>
      <footer class="page-footer"><span>Сегодня хороший день для прогулки.</span><span>Для Бориса, с заботой.</span></footer>
    </div>
    <dialog class="confirm-dialog" id="confirmationDialog" data-show-on-load="${allSlotsBooked}" aria-labelledby="confirmationTitle" aria-describedby="confirmationText">
      <button class="confirm-dialog__close" type="button" aria-label="Закрыть подтверждение"><span aria-hidden="true">×</span></button>
      <span class="confirm-dialog__mark" aria-hidden="true">✓</span>
      <p class="eyebrow">ГОТОВО</p>
      <h2 id="confirmationTitle"></h2>
      <p id="confirmationText"></p>
    </dialog>
    <script src="/app.js" defer></script>
  </body>
</html>`;
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${host}:${port}`);

  if (request.method === 'GET' && assets[url.pathname]) {
    const asset = assets[url.pathname];
    const contents = await readFile(join(__dirname, asset.file));
    response.writeHead(200, { 'Content-Type': asset.contentType, 'Cache-Control': 'no-cache' });
    response.end(contents);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/') {
    const { walkDate, slots } = getWalkSlotsForCurrentDate();
    const message = url.searchParams.get('booking') === 'success' ? 'Запись подтверждена.' : '';
    const feedingMessage = url.searchParams.get('feeding') === 'success'
      ? 'Кормление отмечено.'
      : '';
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(renderPage(walkDate, slots, {
      message,
      latestFeeding: getLatestFeeding(),
      feedingMessage,
      selectedSlotTime: url.searchParams.get('slotTime') ?? ''
    }));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/book') {
    const chunks = [];
    let bodyLength = 0;

    for await (const chunk of request) {
      bodyLength += chunk.length;
      if (bodyLength > 8192) {
        response.writeHead(413, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Данные формы слишком велики.');
        return;
      }
      chunks.push(chunk);
    }

    const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
    const result = bookWalkSlot(form.get('slotTime'), form.get('employeeName'));

    if (result.outcome === 'booked') {
      response.writeHead(303, { Location: '/?booking=success' });
      response.end();
      return;
    }

    const { walkDate, slots } = result.outcome === 'conflict'
      ? result
      : getWalkSlotsForCurrentDate();
    const allSlotsBooked = slots.length === 5 && slots.every(slot => slot.bookedBy !== null);
    const message = allSlotsBooked
      ? ''
      : result.outcome === 'conflict'
        ? 'Этот слот уже занят. Выберите другой свободный слот.'
      : result.error;
    const statusCode = result.outcome === 'conflict' ? 409 : 400;

    response.writeHead(statusCode, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(renderPage(walkDate, slots, {
      message,
      isError: true,
      employeeName: form.get('employeeName') ?? '',
      selectedSlotTime: form.get('slotTime') ?? '',
      latestFeeding: getLatestFeeding()
    }));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/feeding') {
    const chunks = [];
    let bodyLength = 0;

    for await (const chunk of request) {
      bodyLength += chunk.length;
      if (bodyLength > 8192) {
        response.writeHead(413, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Данные формы слишком велики.');
        return;
      }
      chunks.push(chunk);
    }

    const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
    const result = addFeeding(form.get('employeeName'));

    if (result.feeding) {
      response.writeHead(303, { Location: '/?feeding=success' });
      response.end();
      return;
    }

    const { walkDate, slots } = getWalkSlotsForCurrentDate();
    response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(renderPage(walkDate, slots, {
      latestFeeding: getLatestFeeding(),
      feedingMessage: result.error,
      feedingIsError: true,
      feedingEmployeeName: form.get('employeeName') ?? '',
      selectedSlotTime: form.get('slotTime') ?? ''
    }));
    return;
  }

  {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Страница не найдена');
  }
}

const server = createServer((request, response) => {
  handleRequest(request, response).catch(() => {
    if (!response.headersSent) {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    response.end('Не удалось обработать запрос.');
  });
});

server.listen(port, host, () => {
  console.log(`Сервер запущен: http://${host}:${port}`);
});