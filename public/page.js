const dialog = document.querySelector('#booking-dialog');
const slotField = dialog.querySelector('[name="slot"]');
const timeLabel = dialog.querySelector('#booking-time');
const nameField = dialog.querySelector('#full-name');

for (const button of document.querySelectorAll('[data-slot]')) {
  button.addEventListener('click', () => {
    slotField.value = button.dataset.slot;
    timeLabel.textContent = `Сегодня в ${button.dataset.slot} по Москве`;
    nameField.value = '';
    dialog.showModal();
  });
}
