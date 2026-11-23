const dialog = document.querySelector('#slot-dialog');

if (dialog && typeof dialog.showModal === 'function') {
  const form = dialog.querySelector('form');
  const date = dialog.querySelector('#dialog-date');
  const time = dialog.querySelector('#dialog-time');
  const next = form.querySelector('button');
  const status = dialog.querySelector('[data-slot-status]');
  const equipment = dialog.querySelector('[data-equipment]');
  let dates = [];
  let trigger;
  let pending;

  function fillTimes() {
    const slots = dates.find((day) => day.date === date.value)?.slots ?? [];
    time.replaceChildren(new Option('Select a time', ''), ...slots.map(({ id, label }) => new Option(label, id)));
    time.disabled = !slots.length;
    next.disabled = true;
  }

  date.addEventListener('change', fillTimes);
  time.addEventListener('change', () => { next.disabled = !time.value; });
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (dialog.open) return;
    pending?.abort();
    trigger?.focus();
  });

  for (const link of document.querySelectorAll('[data-slot-dialog]')) {
    link.setAttribute('aria-haspopup', 'dialog');
    link.addEventListener('click', async (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault();
      pending?.abort();
      const controller = new AbortController();
      pending = controller;
      trigger = link;
      form.hidden = true;
      equipment.textContent = '';
      status.textContent = 'Checking availability…';
      dialog.showModal();

      try {
        const url = new URL(link.href);
        url.searchParams.set('format', 'json');
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok || response.redirected) throw new Error('Availability unavailable');
        const { name, dates: available } = await response.json();
        if (controller.signal.aborted || !dialog.open) return;
        dates = available;
        equipment.textContent = name;
        status.textContent = dates.length ? '' : 'No slots are currently available for this equipment.';
        date.replaceChildren(new Option('Select a date', ''), ...dates.map((day) => new Option(day.date, day.date)));
        fillTimes();
        form.hidden = !dates.length;
      } catch {
        if (controller.signal.aborted || !dialog.open) return;
        status.textContent = 'Could not load availability. ';
        const fallback = document.createElement('a');
        fallback.href = link.href;
        fallback.className = 'button outline';
        fallback.textContent = 'Open slot picker';
        status.append(fallback);
      }
    });
  }
}
