for (const form of document.querySelectorAll('form[data-ai]')) {
  const button = form.querySelector('button');
  const status = form.querySelector('[data-wait]');
  form.addEventListener('submit', (event) => {
    if (button.getAttribute('aria-disabled') === 'true') {
      event.preventDefault();
      return;
    }
    button.setAttribute('aria-disabled', 'true');
    status.textContent = 'Waiting for Gemini…';
  });
  window.addEventListener('pageshow', () => {
    button.removeAttribute('aria-disabled');
    status.textContent = '';
  });
}
