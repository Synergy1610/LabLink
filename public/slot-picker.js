const date = document.querySelector('#slot-date');
if (date) {
  const times = document.querySelector('#slot-time');
  const templates = new Map([...document.querySelectorAll('template[data-slot-date]')]
    .map((template) => [template.dataset.slotDate, template]));
  const placeholder = times.options[0];
  const timeForm = document.querySelector('#slot-times');
  document.querySelector('#show-times').hidden = true;
  date.addEventListener('change', () => {
    const slots = templates.get(date.value);
    times.replaceChildren(placeholder);
    if (slots) times.append(slots.content.cloneNode(true));
    times.value = '';
    timeForm.hidden = !slots;
  });
}
