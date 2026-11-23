const navToggle = document.querySelector('.nav-toggle');
if (navToggle) {
  const nav = navToggle.closest('nav');
  const links = nav.querySelector('.nav-links');
  const phone = window.matchMedia('(max-width: 42rem)');
  function setOpen(open) {
    navToggle.setAttribute('aria-expanded', String(open));
    links.hidden = phone.matches && !open;
  }
  function sync() {
    const toggleHadFocus = document.activeElement === navToggle;
    navToggle.hidden = !phone.matches;
    setOpen(phone.matches && links.contains(document.activeElement));
    if (toggleHadFocus && !phone.matches) (links.querySelector('[aria-current]') ?? links.querySelector('a')).focus();
  }
  navToggle.addEventListener('click', () => setOpen(navToggle.getAttribute('aria-expanded') === 'false'));
  nav.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && phone.matches && !links.hidden) {
      event.preventDefault();
      setOpen(false);
      navToggle.focus();
    }
  });
  window.addEventListener('pageshow', sync);
  phone.addEventListener('change', sync);
  sync();
}
