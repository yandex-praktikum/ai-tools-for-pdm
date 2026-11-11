// Загружает слоты с сервера, рисует их и обрабатывает запись.

const slotsList = document.getElementById('slots');
const dateEl = document.getElementById('today-date');

// Общее сообщение о результате записи (например, «слот только что заняли»)
const messageEl = document.createElement('p');
messageEl.className = 'message';
messageEl.hidden = true;
slotsList.before(messageEl);

dateEl.textContent = new Date().toLocaleDateString('ru-RU', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

function showMessage(text) {
  messageEl.textContent = text;
  messageEl.hidden = false;
}

function renderSlots(slots) {
  slotsList.innerHTML = '';
  for (const slot of slots) {
    const li = document.createElement('li');
    li.className = 'slot ' + (slot.booked_by ? 'slot--booked' : 'slot--free');

    const time = document.createElement('span');
    time.className = 'slot__time';
    time.textContent = slot.slot_time;

    const status = document.createElement('span');
    status.className = 'slot__status';
    status.textContent = slot.booked_by
      ? 'Занят — ' + slot.booked_by
      : 'Свободен';

    li.append(time, status);

    // Форма записи — только у свободного слота
    if (!slot.booked_by) {
      li.appendChild(buildBookForm(slot));
    }
    slotsList.appendChild(li);
  }
}

function buildBookForm(slot) {
  const form = document.createElement('form');
  form.className = 'slot__form';

  const input = document.createElement('input');
  input.name = 'name';
  input.placeholder = 'Ваше ФИО';
  input.required = true;

  const button = document.createElement('button');
  button.type = 'submit';
  button.textContent = 'Записаться';

  form.append(input, button);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    button.disabled = true;
    try {
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slot_time: slot.slot_time, name: input.value }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        messageEl.hidden = true;
      } else {
        showMessage(data.error || 'Не удалось записаться');
      }
    } catch {
      showMessage('Сервер недоступен. Попробуйте ещё раз.');
    } finally {
      button.disabled = false;
      // В любом случае перерисовываем слоты с сервера — он источник истины
      await loadSlots();
    }
  });

  return form;
}

async function loadSlots() {
  slotsList.innerHTML = '<li class="slots__loading">Загружаем слоты…</li>';
  try {
    const res = await fetch('/api/slots');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const slots = await res.json();
    renderSlots(slots);
  } catch (err) {
    slotsList.innerHTML =
      '<li class="slots__error">Не удалось загрузить слоты. Обновите страницу.</li>';
  }
}

// --- Карточка «Последнее кормление» ---

const feedingCard = document.getElementById('feeding-card');
const feedingForm = document.getElementById('feeding-form');
const feedingName = document.getElementById('feeding-name');

function formatFedAt(iso) {
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function loadFeeding() {
  try {
    const res = await fetch('/api/feeding');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const feeding = await res.json();
    if (feeding) {
      feedingCard.textContent =
        'Бориса покормил(а): ' +
        feeding.employee_name +
        ' — ' +
        formatFedAt(feeding.fed_at);
    } else {
      feedingCard.textContent = 'Бориса ещё никто не кормил сегодня.';
    }
  } catch {
    feedingCard.textContent =
      'Не удалось загрузить карточку кормления. Обновите страницу.';
  }
}

feedingForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = feedingForm.querySelector('button');
  button.disabled = true;
  try {
    const res = await fetch('/api/feeding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: feedingName.value }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showMessage(data.error || 'Не удалось отметить кормление');
    } else {
      messageEl.hidden = true;
    }
  } catch {
    showMessage('Сервер недоступен. Попробуйте ещё раз.');
  } finally {
    button.disabled = false;
    feedingName.value = '';
    await loadFeeding();
  }
});

loadSlots();
loadFeeding();
