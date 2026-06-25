// ── GitHub API Module ─────────────────────────────────────────────────────────
// Pushea archivos al repo de GitHub via API REST

const GITHUB = {
  owner:  'GAGdelSolar',
  repo:   'carryclub',
  branch: 'main',

  async getToken() {
    return new Promise(resolve => {
      chrome.storage.local.get(['githubToken'], r => resolve(r.githubToken || ''));
    });
  },

  async saveToken(token) {
    return new Promise(resolve => {
      chrome.storage.local.set({ githubToken: token }, resolve);
    });
  },

  async headers() {
    const token = await this.getToken();
    return {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
  },

  async getSHA(path) {
    const headers = await this.headers();
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${path}?ref=${this.branch}`;
    const r = await fetch(url, { headers });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`GitHub getSHA error ${r.status}`);
    const data = await r.json();
    return data.sha;
  },

  // ── Encoding robusto para UTF-8 con tildes/caracteres especiales ──────────
  // btoa() nativo solo soporta latin-1; esto convierte correctamente a base64
  toBase64(str) {
    // Convertir string UTF-8 a bytes y luego a base64
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    bytes.forEach(b => { binary += String.fromCharCode(b); });
    return btoa(binary);
  },

  async putFile(path, content, message) {
    const headers = await this.headers();
    const sha = await this.getSHA(path);
    const body = {
      message,
      content: this.toBase64(content), // UTF-8 seguro
      branch: this.branch,
    };
    if (sha) body.sha = sha;

    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${path}`;
    const r = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const err = await r.json();
      throw new Error(err.message || `GitHub putFile error ${r.status}`);
    }
    return await r.json();
  },

  async verify() {
    const headers = await this.headers();
    const r = await fetch(`https://api.github.com/repos/${this.owner}/${this.repo}`, { headers });
    if (!r.ok) throw new Error('Token inválido o sin acceso al repo');
    return true;
  },
};
