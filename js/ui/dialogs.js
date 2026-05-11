/**
 * 共用對話框與摘要 UI。
 */

const dialogs = {
  createModal({ title, body, footer, large = false }) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'flex';

    const modal = document.createElement('div');
    modal.className = large ? 'modal modal-large' : 'modal';

    const header = document.createElement('div');
    header.className = 'modal-header';
    const heading = document.createElement('h2');
    heading.textContent = title;
    const close = document.createElement('button');
    close.className = 'btn-close';
    close.type = 'button';
    close.textContent = '×';
    header.appendChild(heading);
    header.appendChild(close);

    modal.appendChild(header);
    modal.appendChild(body);
    modal.appendChild(footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    return { overlay, close };
  },

  showAlert({ title = '提示', message = '', kind = 'info', buttonText = '確定' } = {}) {
    return new Promise((resolve) => {
      const body = document.createElement('div');
      body.className = 'modal-body';
      const callout = document.createElement('div');
      callout.className = `callout callout-${kind}`;
      const text = document.createElement('p');
      text.textContent = message;
      callout.appendChild(text);
      body.appendChild(callout);

      const footer = document.createElement('div');
      footer.className = 'modal-footer';
      const ok = document.createElement('button');
      ok.className = kind === 'danger' ? 'btn btn-danger' : 'btn btn-primary';
      ok.type = 'button';
      ok.textContent = buttonText;
      footer.appendChild(ok);

      const { overlay, close } = this.createModal({ title, body, footer });
      const cleanup = () => {
        overlay.remove();
        resolve();
      };

      close.addEventListener('click', cleanup);
      ok.addEventListener('click', cleanup);
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) cleanup();
      });
      setTimeout(() => ok.focus(), 0);
    });
  },

  showConfirm({
    title = '確認',
    message = '',
    confirmText = '確認',
    cancelText = '取消',
    kind = 'info'
  } = {}) {
    return new Promise((resolve) => {
      const body = document.createElement('div');
      body.className = 'modal-body';
      const callout = document.createElement('div');
      callout.className = `callout callout-${kind}`;
      const text = document.createElement('p');
      text.textContent = message;
      callout.appendChild(text);
      body.appendChild(callout);

      const footer = document.createElement('div');
      footer.className = 'modal-footer';
      const cancel = document.createElement('button');
      cancel.className = 'btn btn-ghost';
      cancel.type = 'button';
      cancel.textContent = cancelText;
      const confirm = document.createElement('button');
      confirm.className = kind === 'danger' ? 'btn btn-danger' : 'btn btn-primary';
      confirm.type = 'button';
      confirm.textContent = confirmText;
      footer.appendChild(cancel);
      footer.appendChild(confirm);

      const { overlay, close } = this.createModal({ title, body, footer });
      const cleanup = (result) => {
        overlay.remove();
        resolve(result);
      };

      close.addEventListener('click', () => cleanup(false));
      cancel.addEventListener('click', () => cleanup(false));
      confirm.addEventListener('click', () => cleanup(true));
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) cleanup(false);
      });
      setTimeout(() => confirm.focus(), 0);
    });
  },

  showPrompt({
    title = '輸入',
    message = '',
    defaultValue = '',
    placeholder = '',
    confirmText = '確認',
    cancelText = '取消'
  } = {}) {
    return new Promise((resolve) => {
      const body = document.createElement('div');
      body.className = 'modal-body';
      const group = document.createElement('div');
      group.className = 'form-group';
      const label = document.createElement('label');
      label.textContent = message;
      const input = document.createElement('input');
      input.className = 'form-input';
      input.type = 'text';
      input.value = defaultValue;
      input.placeholder = placeholder;
      group.appendChild(label);
      group.appendChild(input);
      body.appendChild(group);

      const footer = document.createElement('div');
      footer.className = 'modal-footer';
      const cancel = document.createElement('button');
      cancel.className = 'btn btn-ghost';
      cancel.type = 'button';
      cancel.textContent = cancelText;
      const confirm = document.createElement('button');
      confirm.className = 'btn btn-primary';
      confirm.type = 'button';
      confirm.textContent = confirmText;
      footer.appendChild(cancel);
      footer.appendChild(confirm);

      const { overlay, close } = this.createModal({ title, body, footer });
      const cleanup = (result) => {
        overlay.remove();
        resolve(result);
      };

      close.addEventListener('click', () => cleanup(null));
      cancel.addEventListener('click', () => cleanup(null));
      confirm.addEventListener('click', () => cleanup(input.value));
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') cleanup(input.value);
        if (event.key === 'Escape') cleanup(null);
      });
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) cleanup(null);
      });
      setTimeout(() => {
        input.focus();
        input.select();
      }, 0);
    });
  },

  showSelect({
    title = '選擇',
    message = '',
    options = [],
    confirmText = '確認',
    cancelText = '取消'
  } = {}) {
    return new Promise((resolve) => {
      const body = document.createElement('div');
      body.className = 'modal-body';

      if (message) {
        const intro = document.createElement('p');
        intro.className = 'dialog-intro';
        intro.textContent = message;
        body.appendChild(intro);
      }

      const list = document.createElement('div');
      list.className = 'choice-list';
      let selectedValue = options[0]?.value || null;
      const choiceName = `dialog-choice-${Date.now()}`;

      for (const option of options) {
        const label = document.createElement('label');
        label.className = 'choice-item';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = choiceName;
        radio.value = option.value;
        radio.checked = option.value === selectedValue;
        radio.addEventListener('change', () => {
          selectedValue = option.value;
        });
        const text = document.createElement('span');
        text.textContent = option.label;
        label.appendChild(radio);
        label.appendChild(text);
        list.appendChild(label);
      }

      body.appendChild(list);

      const footer = document.createElement('div');
      footer.className = 'modal-footer';
      const cancel = document.createElement('button');
      cancel.className = 'btn btn-ghost';
      cancel.type = 'button';
      cancel.textContent = cancelText;
      const confirm = document.createElement('button');
      confirm.className = 'btn btn-primary';
      confirm.type = 'button';
      confirm.textContent = confirmText;
      footer.appendChild(cancel);
      footer.appendChild(confirm);

      const { overlay, close } = this.createModal({ title, body, footer });
      const cleanup = (result) => {
        overlay.remove();
        resolve(result);
      };

      close.addEventListener('click', () => cleanup(null));
      cancel.addEventListener('click', () => cleanup(null));
      confirm.addEventListener('click', () => cleanup(selectedValue));
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) cleanup(null);
      });
      setTimeout(() => confirm.focus(), 0);
    });
  },

  showToast(message, { kind = 'info', duration = 3200 } = {}) {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${kind}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-leaving');
      setTimeout(() => toast.remove(), 180);
    }, duration);
  },

  renderImpactSummary(container, title, items, options = {}) {
    if (!container) return;
    container.innerHTML = '';
    container.hidden = false;

    const heading = document.createElement('p');
    heading.className = options.danger ? 'impact-title impact-danger' : 'impact-title';
    heading.textContent = title;
    container.appendChild(heading);

    const grid = document.createElement('div');
    grid.className = 'impact-grid';

    for (const item of items) {
      const cell = document.createElement('div');
      cell.className = 'impact-item';
      const label = document.createElement('strong');
      label.textContent = item.label;
      const value = document.createElement('span');
      value.textContent = item.value;
      cell.appendChild(label);
      cell.appendChild(value);
      grid.appendChild(cell);
    }

    container.appendChild(grid);
  },

  confirmDangerAction({ title, message, items = [], confirmText = '確認執行' }) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.style.display = 'flex';

      const modal = document.createElement('div');
      modal.className = 'modal';

      const header = document.createElement('div');
      header.className = 'modal-header';
      const heading = document.createElement('h2');
      heading.textContent = title;
      const close = document.createElement('button');
      close.className = 'btn-close';
      close.type = 'button';
      close.textContent = '×';
      header.appendChild(heading);
      header.appendChild(close);

      const body = document.createElement('div');
      body.className = 'modal-body';
      const callout = document.createElement('div');
      callout.className = 'callout callout-danger';
      const calloutTitle = document.createElement('p');
      calloutTitle.className = 'callout-title';
      calloutTitle.textContent = '此操作無法復原';
      const calloutMessage = document.createElement('p');
      calloutMessage.textContent = message;
      callout.appendChild(calloutTitle);
      callout.appendChild(calloutMessage);
      body.appendChild(callout);

      if (items.length > 0) {
        const summary = document.createElement('div');
        summary.className = 'impact-summary';
        this.renderImpactSummary(summary, '影響摘要', items, { danger: true });
        body.appendChild(summary);
      }

      const footer = document.createElement('div');
      footer.className = 'modal-footer';
      const cancel = document.createElement('button');
      cancel.className = 'btn btn-ghost';
      cancel.type = 'button';
      cancel.textContent = '取消';
      const confirm = document.createElement('button');
      confirm.className = 'btn btn-danger';
      confirm.type = 'button';
      confirm.textContent = confirmText;
      footer.appendChild(cancel);
      footer.appendChild(confirm);

      modal.appendChild(header);
      modal.appendChild(body);
      modal.appendChild(footer);
      overlay.appendChild(modal);
      document.body.appendChild(overlay);

      const cleanup = (result) => {
        overlay.remove();
        resolve(result);
      };

      close.addEventListener('click', () => cleanup(false));
      cancel.addEventListener('click', () => cleanup(false));
      confirm.addEventListener('click', () => cleanup(true));
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) cleanup(false);
      });
    });
  }
};
