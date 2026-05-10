/**
 * 共用對話框與摘要 UI。
 */

const dialogs = {
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
