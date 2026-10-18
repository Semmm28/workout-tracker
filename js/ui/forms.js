export function wireAsyncForm(form, save, onError) {
  let saving = false;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving) return;
    saving = true;
    const buttons = Array.from(document.querySelectorAll('button[type="submit"]'))
      .filter((button) => button.form === form);
    buttons.forEach((button) => { button.disabled = true; });
    form.setAttribute('aria-busy', 'true');
    try {
      await save();
    } catch (error) {
      console.warn('Saving failed:', error);
      onError('Opslaan niet gelukt. Je invoer blijft staan; probeer het opnieuw.');
    } finally {
      saving = false;
      buttons.forEach((button) => { button.disabled = false; });
      form.removeAttribute('aria-busy');
    }
  });
}
