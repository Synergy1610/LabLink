const deadlineDate = document.querySelector('#deadline-date');

if (deadlineDate) {
  const preview = document.querySelector('#deadline-weekday');
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' });
  function updateWeekday() {
    const parts = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(deadlineDate.value);
    if (parts) {
      const [, day, month, year] = parts;
      const iso = `${year}-${month}-${day}`;
      const date = new Date(`${iso}T00:00:00Z`);
      if (Number.isFinite(date.getTime()) && date.toISOString().startsWith(iso)) {
        preview.textContent = `${weekday.format(date)}, ${deadlineDate.value}`;
        return;
      }
    }
    preview.textContent = '';
  }
  deadlineDate.addEventListener('input', updateWeekday);
  window.addEventListener('pageshow', updateWeekday);
}
