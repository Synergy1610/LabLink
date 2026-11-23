if (typeof HTMLDialogElement !== 'undefined' && typeof HTMLDialogElement.prototype.showModal === 'function') {
  for (const trigger of document.querySelectorAll('[data-open-catalog]')) {
    const id = trigger.dataset.openCatalog;
    const panel = document.querySelector(`[data-catalog-panel="${id}"]`);
    const dialog = document.createElement('dialog');
    dialog.id = id;
    dialog.className = 'catalog-dialog';
    dialog.setAttribute('aria-labelledby', panel.getAttribute('aria-labelledby'));

    const heading = document.createElement('div');
    heading.className = 'dialog-heading';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'outline';
    close.textContent = 'Close';
    close.autofocus = true;
    heading.append(panel.querySelector('h2'), close);
    panel.replaceWith(dialog);
    dialog.append(heading, ...panel.childNodes);

    let followingMatch = false;
    trigger.hidden = false;
    trigger.setAttribute('aria-controls', id);
    trigger.addEventListener('click', () => dialog.showModal());
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      if (!followingMatch) trigger.focus();
      followingMatch = false;
    });

    for (const link of dialog.querySelectorAll('.match-list a')) {
      link.addEventListener('click', (event) => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
        const target = link.getAttribute('href');
        if (!target.startsWith('#')) return;
        const resource = document.querySelector(target);
        if (!resource) return;
        followingMatch = true;
        dialog.close();
        resource.focus({ preventScroll: true });
      });
    }
    if (panel.hasAttribute('data-show-on-load')) dialog.showModal();
  }

  const equipmentDialog = document.querySelector('#equipment-details-dialog');
  if (equipmentDialog) {
    const heading = equipmentDialog.querySelector('h2');
    const content = equipmentDialog.querySelector('[data-details-content]');
    let opener;
    equipmentDialog.querySelector('[data-close]').addEventListener('click', () => equipmentDialog.close());
    equipmentDialog.addEventListener('close', () => {
      if (!equipmentDialog.open) opener?.focus({ preventScroll: true });
    });

    for (const details of document.querySelectorAll('.equipment-details')) {
      const summary = details.querySelector('summary');
      const title = details.closest('.catalog-card').querySelector('h3').textContent;
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'outline equipment-details-trigger';
      trigger.textContent = summary.textContent;
      trigger.setAttribute('aria-label', summary.getAttribute('aria-label'));
      trigger.setAttribute('aria-haspopup', 'dialog');
      trigger.setAttribute('aria-controls', equipmentDialog.id);
      trigger.addEventListener('click', () => {
        opener = trigger;
        heading.textContent = title;
        content.replaceChildren(...Array.from(details.querySelectorAll('p'), (paragraph) => paragraph.cloneNode(true)));
        trigger.focus({ preventScroll: true });
        equipmentDialog.showModal();
      });
      details.replaceWith(trigger);
    }
  }
}
