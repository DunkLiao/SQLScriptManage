/**
 * SQL 腳本管理模組
 * 負責專案內多支 SQL 的建立、切換、刪除等操作。
 */

class ScriptManager {
  constructor() {
    this.db = null;
    this.projectManager = null;
    this.currentScriptId = null;
    this.scripts = [];
  }

  async init(dbManager, projectManagerInstance) {
    this.db = dbManager;
    this.projectManager = projectManagerInstance;
    await this.loadScriptsForCurrentProject();
    console.log('✓ SQL 腳本管理器初始化完成');
    console.log(`  - 當前 SQL 腳本: ${this.currentScriptId}`);
  }

  async loadScriptsForCurrentProject() {
    const projectId = this.projectManager.getCurrentProjectId();
    if (!projectId) {
      this.scripts = [];
      this.currentScriptId = null;
      return;
    }

    this.scripts = await this.db.getScriptsByProject(projectId);
    if (this.scripts.length === 0) {
      const script = await this.ensureDefaultScript(projectId);
      this.scripts = [script];
    }

    const savedPref = await this.db.getMetadata(`currentScriptId:${projectId}`);
    const saved = savedPref?.value;
    if (saved && this.scripts.some(script => script.scriptId === saved)) {
      this.currentScriptId = saved;
    } else {
      this.currentScriptId = this.scripts[0].scriptId;
      await this.saveCurrentScriptId();
    }
  }

  async ensureDefaultScript(projectId) {
    const project = await this.db.getProject(projectId);
    if (!project) throw new Error('專案不存在，無法建立預設 SQL 腳本');
    const now = Date.now();
    const script = {
      scriptId: `script_${projectId}_${now}_${Math.random().toString(36).substr(2, 6)}`,
      projectId,
      scriptName: 'main',
      description: '',
      rootVersionId: project?.rootVersionId || null,
      createdAt: project?.createdAt || now,
      updatedAt: now
    };

    await this.db.saveScript(script);
    await this.db.saveMetadata(`currentScriptId:${projectId}`, script.scriptId);
    return script;
  }

  getCurrentScriptId() {
    return this.currentScriptId;
  }

  getCurrentScript() {
    return this.scripts.find(script => script.scriptId === this.currentScriptId) || null;
  }

  getScripts() {
    return this.scripts.slice();
  }

  async setCurrentScript(scriptId) {
    if (!this.scripts.some(script => script.scriptId === scriptId)) {
      throw new Error(`SQL 腳本 ${scriptId} 不存在`);
    }
    this.currentScriptId = scriptId;
    await this.saveCurrentScriptId();
    console.log(`✓ 已切換到 SQL 腳本: ${scriptId}`);
  }

  async saveCurrentScriptId() {
    const projectId = this.projectManager.getCurrentProjectId();
    if (!projectId || !this.currentScriptId) return;
    await this.db.saveMetadata(`currentScriptId:${projectId}`, this.currentScriptId);
  }

  async createScript(scriptName, description = '') {
    const projectId = this.projectManager.getCurrentProjectId();
    if (!projectId) throw new Error('未指定專案');

    const normalizedName = (scriptName || '').trim();
    if (!normalizedName) throw new Error('SQL 腳本名稱不能為空');

    if (this.scripts.some(script => script.scriptName === normalizedName)) {
      throw new Error(`SQL 腳本「${normalizedName}」已存在`);
    }

    const now = Date.now();
    const script = {
      scriptId: `script_${projectId}_${now}_${Math.random().toString(36).substr(2, 6)}`,
      projectId,
      scriptName: normalizedName,
      description: description.trim(),
      rootVersionId: null,
      createdAt: now,
      updatedAt: now
    };

    await this.db.saveScript(script);
    this.scripts.push(script);
    this.currentScriptId = script.scriptId;
    await this.saveCurrentScriptId();
    return script;
  }

  async renameScript(scriptId, newName) {
    const normalizedName = (newName || '').trim();
    if (!normalizedName) throw new Error('SQL 腳本名稱不能為空');

    const script = this.scripts.find(item => item.scriptId === scriptId);
    if (!script) throw new Error('SQL 腳本不存在');

    if (this.scripts.some(item => item.scriptId !== scriptId && item.scriptName === normalizedName)) {
      throw new Error(`SQL 腳本「${normalizedName}」已存在`);
    }

    const updated = await this.db.updateScript(scriptId, { scriptName: normalizedName });
    script.scriptName = updated.scriptName;
    script.updatedAt = updated.updatedAt;
    return updated;
  }

  async setRootVersionId(scriptId, versionId) {
    const script = this.scripts.find(item => item.scriptId === scriptId);
    if (!script) throw new Error('SQL 腳本不存在');

    const updated = await this.db.updateScript(scriptId, { rootVersionId: versionId });
    script.rootVersionId = updated.rootVersionId;
    script.updatedAt = updated.updatedAt;
  }

  async deleteScript(scriptId) {
    const script = this.scripts.find(item => item.scriptId === scriptId);
    if (!script) throw new Error('SQL 腳本不存在');

    if (this.scripts.length <= 1) {
      throw new Error('至少需要保留一支 SQL 腳本');
    }

    await this.db.deleteScript(scriptId);
    this.scripts = this.scripts.filter(item => item.scriptId !== scriptId);

    if (this.currentScriptId === scriptId) {
      this.currentScriptId = this.scripts[0]?.scriptId || null;
      await this.saveCurrentScriptId();
    }
  }
}

const scriptManager = new ScriptManager();
