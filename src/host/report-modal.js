import { renderMethods } from './report-render.js';
import { aiPanelMethods } from './report-ai.js';

export class ReportModal {
  constructor(root, { getMember, getProvider, getBriefer, onDownload }) {
    this.root = root;
    this.onDownload = onDownload;
    this.getMember = getMember;
    this.getProvider = getProvider;
    this.getBriefer = getBriefer;
    this.id = null;
    root.addEventListener('click', (e) => { if (e.target === root) this.close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.id) this.close(); });
  }

  open(id) {
    this.id = id;
    this.root.hidden = false;
    this.render();
  }

  close() {
    this.id = null;
    this.root.hidden = true;
    this.root.textContent = '';
  }

  refresh(id) {
    if (this.id != null && id === this.id) this.render();
  }
}

Object.assign(ReportModal.prototype, renderMethods);
Object.assign(ReportModal.prototype, aiPanelMethods);
