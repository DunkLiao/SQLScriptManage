/**
 * 專案管理模組
 * 負責專案的建立、切換、刪除等操作
 */

class ProjectManager {
  constructor() {
    this.db = null;
    this.currentProjectId = null;
    this.projects = [];
  }

  /**
   * 初始化專案管理器
   */
  async init(dbManager) {
    this.db = dbManager;
    await this.loadProjects();

    if (this.projects.length === 0) {
      await this.ensureDefaultProject();
    }

    // 從 IndexedDB 恢復當前專案
    const savedPref = await this.db.getMetadata('currentProjectId');
    const saved = savedPref?.value;
    if (saved && this.projects.some(p => p.projectId === saved)) {
      this.currentProjectId = saved;
    } else if (this.projects.length > 0) {
      // 默認使用第一個專案
      this.currentProjectId = this.projects[0].projectId;
      await this.saveCurrentProjectId();
    }

    console.log('✓ 專案管理器初始化完成');
    console.log(`  - 當前專案: ${this.currentProjectId}`);
  }

  /**
   * 加載所有專案
   */
  async loadProjects() {
    try {
      this.projects = await this.db.getAllProjects();
      console.log(`✓ 已加載 ${this.projects.length} 個專案`);
    } catch (error) {
      console.error('❌ 加載專案失敗:', error);
      this.projects = [];
    }
  }

  /**
   * 確保至少有一個可用專案，避免空資料庫初始化後版本管理器沒有專案上下文。
   */
  async ensureDefaultProject() {
    const now = Date.now();
    const defaultProject = {
      projectId: 'default',
      projectName: '預設',
      rootVersionId: null,
      createdAt: now,
      updatedAt: now
    };

    await this.db.saveProject(defaultProject);
    this.projects = [defaultProject];
    this.currentProjectId = defaultProject.projectId;
    await this.saveCurrentProjectId();
    console.log('✓ 已建立預設專案');
  }

  /**
   * 獲取當前專案 ID
   */
  getCurrentProjectId() {
    return this.currentProjectId;
  }

  /**
   * 獲取當前專案
   */
  getCurrentProject() {
    return this.projects.find(p => p.projectId === this.currentProjectId);
  }

  /**
   * 設定當前專案
   */
  async setCurrentProject(projectId) {
    if (!this.projects.some(p => p.projectId === projectId)) {
      throw new Error(`專案 ${projectId} 不存在`);
    }
    this.currentProjectId = projectId;
    await this.saveCurrentProjectId();
    console.log(`✓ 已切換到專案: ${projectId}`);
  }

  /**
   * 保存當前專案 ID 到 IndexedDB
   */
  async saveCurrentProjectId() {
    await this.db.saveMetadata('currentProjectId', this.currentProjectId);
  }

  /**
   * 建立新專案
   */
  async createProject(projectName) {
    if (!projectName || projectName.trim() === '') {
      throw new Error('專案名稱不能為空');
    }

    // 檢查名稱是否重複
    if (this.projects.some(p => p.projectName === projectName.trim())) {
      throw new Error(`專案「${projectName}」已存在`);
    }

    const projectId = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const project = {
      projectId,
      projectName: projectName.trim(),
      rootVersionId: null,  // 首次保存版本時才會設定
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await this.db.saveProject(project);
    this.projects.push(project);
    console.log(`✓ 已建立新專案: ${projectName} (${projectId})`);
    
    return project;
  }

  /**
   * 刪除專案及其所有版本
   */
  async deleteProject(projectId) {
    if (projectId === this.currentProjectId) {
      throw new Error('不能刪除當前活躍的專案');
    }

    const project = this.projects.find(p => p.projectId === projectId);
    if (!project) {
      throw new Error('專案不存在');
    }

    await this.db.deleteProject(projectId);
    this.projects = this.projects.filter(p => p.projectId !== projectId);
    console.log(`✓ 已刪除專案: ${project.projectName}`);
  }

  /**
   * 重新命名專案
   */
  async renameProject(projectId, newName) {
    if (!newName || newName.trim() === '') {
      throw new Error('新專案名稱不能為空');
    }

    const project = this.projects.find(p => p.projectId === projectId);
    if (!project) {
      throw new Error('專案不存在');
    }

    if (this.projects.some(p => p.projectName === newName.trim() && p.projectId !== projectId)) {
      throw new Error(`專案「${newName}」已存在`);
    }

    await this.db.updateProject(projectId, { projectName: newName.trim() });
    project.projectName = newName.trim();
    console.log(`✓ 已重新命名專案: ${projectId} -> ${newName}`);
  }

  /**
   * 獲取所有專案
   */
  getProjects() {
    return this.projects.slice();
  }

  /**
   * 獲取指定專案的根版本 ID
   */
  getRootVersionId(projectId) {
    const project = this.projects.find(p => p.projectId === projectId);
    return project ? project.rootVersionId : null;
  }

  /**
   * 設定指定專案的根版本 ID
   */
  async setRootVersionId(projectId, versionId) {
    const project = this.projects.find(p => p.projectId === projectId);
    if (!project) {
      throw new Error('專案不存在');
    }

    await this.db.updateProject(projectId, { rootVersionId: versionId });
    project.rootVersionId = versionId;
    console.log(`✓ 已設定專案 ${projectId} 的根版本: ${versionId}`);
  }

  /**
   * 獲取專案的版本統計
   */
  async getProjectStats(projectId) {
    const [totalVersions, latestVersion] = await Promise.all([
      this.db.getVersionCountByProject(projectId),
      this.db.getLatestVersionByProject(projectId)
    ]);

    return {
      projectId,
      totalVersions,
      totalSize: null,
      rootVersionId: this.getRootVersionId(projectId),
      latestVersionId: latestVersion?.versionId || null
    };
  }
}

// 導出全局實例
const projectManager = new ProjectManager();
