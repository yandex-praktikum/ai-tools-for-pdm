const confirmationDialog = document.querySelector('#confirmationDialog');
const confirmationTitle = document.querySelector('#confirmationTitle');
const confirmationText = document.querySelector('#confirmationText');
const confirmationClose = document.querySelector('.confirm-dialog__close');

function showConfirmation(title, text) {
  confirmationTitle.textContent = title;
  confirmationText.textContent = text;
  confirmationDialog.showModal();
  confirmationClose.focus();
}

confirmationClose.addEventListener('click', () => confirmationDialog.close());
confirmationDialog.addEventListener('click', event => {
  if (event.target === confirmationDialog) {
    confirmationDialog.close();
  }
});

if (confirmationDialog.dataset.showOnLoad === 'true') {
  showConfirmation('Борис гуляет весь день', 'Возможность записи откроется завтра.');
}

document.addEventListener('submit', async event => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || !form.matches('.booking-form, .feeding-form')) {
    return;
  }

  event.preventDefault();
  const submitButton = form.querySelector('button[type="submit"]');
  const originalLabel = submitButton.textContent;
  const scrollX = window.scrollX;
  const scrollY = window.scrollY;
  const isBooking = form.matches('.booking-form');
  const blockSelector = isBooking ? '.walk-section' : '.feeding-panel';

  submitButton.disabled = true;
  submitButton.setAttribute('aria-busy', 'true');

  try {
    const response = await fetch(form.action, {
      method: 'POST',
      body: new URLSearchParams(new FormData(form))
    });
    const responseHtml = await response.text();
    const updatedDocument = new DOMParser().parseFromString(responseHtml, 'text/html');
    const currentBlock = form.closest(blockSelector);
    const updatedBlock = updatedDocument.querySelector(blockSelector);

    if (!currentBlock || !updatedBlock) {
      throw new Error('Не удалось обновить страницу.');
    }

    const succeeded = response.redirected && response.ok;
    if (succeeded) {
      updatedBlock.querySelector('.notice--success')?.remove();
    }

    currentBlock.replaceWith(updatedBlock);
    window.scrollTo(scrollX, scrollY);

    if (updatedBlock.dataset.allSlotsBooked === 'true') {
      showConfirmation('Борис гуляет весь день', 'Возможность записи откроется завтра.');
    } else if (succeeded) {
      showConfirmation(
        isBooking ? 'Прогулка записана' : 'Кормление отмечено',
        isBooking ? 'Слот закреплён за вами.' : 'Последнее кормление обновлено.'
      );
    }
  } catch {
    showConfirmation('Не удалось сохранить', 'Проверьте соединение и попробуйте ещё раз.');
  } finally {
    if (submitButton.isConnected) {
      submitButton.disabled = false;
      submitButton.removeAttribute('aria-busy');
      submitButton.textContent = originalLabel;
    }
  }
});
