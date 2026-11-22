function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

export function renderPage({ day, dateLabel, slots, bookings, feeding, feedingLabel, notice }) {
  const rows = slots.map((slot) => {
    const fullName = bookings.get(slot);
    return `
      <li class="slot${fullName ? ' slot-booked' : ''}">
        <time class="slot-time" datetime="${slot}">${slot}</time>
        <div class="slot-details">
          <span class="status">${fullName ? 'Занято' : 'Свободно'}</span>
          ${fullName ? `<strong class="slot-name">${escapeHtml(fullName)}</strong>` : ''}
        </div>
        ${fullName ? '<span class="slot-check" aria-hidden="true">✓</span>' : `
          <button type="button" class="button button-book" data-slot="${slot}"
            aria-label="Записаться на ${slot}">Записаться <span aria-hidden="true">↗</span></button>`}
      </li>`;
  }).join('');
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Кто выгуливает Бориса · Догяндекс</title>
  <link rel="stylesheet" href="/styles.css">
  <script src="/page.js" defer></script>
</head>
<body>
  <header class="masthead">
    <div class="wrap masthead-inner">
      <div class="brand"><span class="brand-mark" aria-hidden="true">✦</span> Догяндекс</div>
      <span class="location">Московский офис</span>
    </div>
  </header>
  <main class="wrap">
    <div class="hero">
      <h1>Кто выгуливает<br>Бориса<span class="punctuation">?</span></h1>
      <p>Выберите время для прогулки и запишитесь.</p>
    </div>
    <div class="dashboard">
      <section class="schedule" aria-labelledby="schedule-title">
        <div class="section-head">
          <h2 id="schedule-title">Прогулки на сегодня</h2>
          <time class="date" datetime="${day}">${escapeHtml(dateLabel)}</time>
        </div>
        ${notice && notice.area !== 'feeding' ? renderNotice(notice) : ''}
        <ul class="slots">${rows}</ul>
      </section>
      <section class="feeding" id="feeding" aria-labelledby="feeding-title">
        <span class="feeding-icon" aria-hidden="true">◷</span>
        <h2 id="feeding-title">Последнее<br>кормление</h2>
        <p class="feeding-value">${feeding
          ? `<time datetime="${escapeHtml(feeding.fed_at)}">${escapeHtml(feedingLabel)}</time>
             <span class="feeding-name">${escapeHtml(feeding.employee_name)}</span>`
          : 'Кормление ещё не отмечали'}</p>
        ${notice?.area === 'feeding' ? renderNotice(notice) : ''}
        <form action="/feeding" method="post">
          <label for="feeding-name">Кто покормил Бориса?</label>
          <input id="feeding-name" name="fullName" autocomplete="name" placeholder="Имя Фамилия" maxlength="120" required>
          <button class="button button-primary" type="submit">Отметить кормление</button>
        </form>
      </section>
    </div>
    <p class="footnote">Время указано по Москве.</p>
  </main>
  <dialog id="booking-dialog" aria-labelledby="booking-title">
    <div class="dialog-head">
      <div><h2 id="booking-title">Запись на прогулку</h2><p id="booking-time"></p></div>
      <form method="dialog"><button class="close" aria-label="Закрыть">×</button></form>
    </div>
    <form action="/bookings" method="post">
      <input type="hidden" name="date" value="${day}">
      <input type="hidden" name="slot">
      <label for="full-name">ФИО</label>
      <input id="full-name" name="fullName" autocomplete="name" placeholder="Имя Фамилия" maxlength="120" required autofocus>
      <button class="button button-primary" type="submit">Подтвердить запись</button>
    </form>
  </dialog>
</body>
</html>`;
}

function renderNotice({ message, error }) {
  return `<p class="notice${error ? ' notice-error' : ''}" role="${error ? 'alert' : 'status'}">${escapeHtml(message)}</p>`;
}
