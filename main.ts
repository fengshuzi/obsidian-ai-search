import { App, Plugin, PluginSettingTab, Setting, Modal, Notice } from 'obsidian';
import { exec } from 'child_process';
import { platform } from 'os';

interface AISite {
  name: string;
  url: string;
  enabled: boolean;
  queryParam: string;
  appendParam?: string; // 追问参数名，如 'append'
}

interface AISearchSettings {
  sites: AISite[];
}

const DEFAULT_SITES: AISite[] = [
  { name: 'DeepSeek', url: 'https://chat.deepseek.com/', enabled: true, queryParam: 'q' },
  { name: 'ChatGPT', url: 'https://chatgpt.com/', enabled: true, queryParam: 'q' },
  { name: 'Kimi', url: 'https://kimi.moonshot.cn/', enabled: true, queryParam: 'q' },
  { name: '腾讯元宝', url: 'https://yuanbao.tencent.com/chat/naQivTmsDa', enabled: true, queryParam: 'q', appendParam: 'append' },
  { name: 'Grok', url: 'https://grok.com/', enabled: true, queryParam: 'q' },
  { name: 'Gemini', url: 'https://gemini.google.com/', enabled: true, queryParam: 'q' },
];

const DEFAULT_SETTINGS: AISearchSettings = {
  sites: DEFAULT_SITES
};

export default class AISearchPlugin extends Plugin {
  settings: AISearchSettings;

  async onload() {
    await this.loadSettings();

    // 添加侧边栏图标 - 使用 brain 图标更符合 AI 主题
    const ribbonIcon = this.addRibbonIcon('brain', 'AI 搜索', (evt: MouseEvent) => {
      // 如果有选中的文字，直接搜索
      const selection = window.getSelection()?.toString().trim();
      if (selection) {
        this.searchAll(selection);
      } else {
        this.openSearchModal();
      }
    });
    // 添加 tooltip
    ribbonIcon.setAttribute('aria-label', 'AI 搜索 (选中文字可直接搜索)');

    // 添加命令 - 打开搜索框
    this.addCommand({
      id: 'open-ai-search',
      name: '打开AI搜索框',
      callback: () => {
        this.openSearchModal();
      }
    });

    // 添加命令 - 快速搜索选中文本
    this.addCommand({
      id: 'search-selection',
      name: '搜索选中的文字',
      checkCallback: (checking: boolean) => {
        const selection = window.getSelection()?.toString().trim();
        if (selection) {
          if (!checking) {
            this.searchAll(selection);
          }
          return true;
        }
        return false;
      }
    });

    // 注册编辑器右键菜单
    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu: any, editor: any) => {
        const selection = editor.getSelection()?.trim();
        if (selection) {
          menu.addItem((item: any) => {
            item
              .setTitle('🔍 AI 搜索')
              .setIcon('search')
              .onClick(() => {
                this.searchAll(selection);
              });
          });
        }
      })
    );

    // 添加设置面板
    this.addSettingTab(new AISearchSettingTab(this.app, this));
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    // 确保sites数组存在
    if (!this.settings.sites || this.settings.sites.length === 0) {
      this.settings.sites = DEFAULT_SITES;
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  openSearchModal() {
    new AISearchModal(this.app, this.settings, this).open();
  }

  openInSystemBrowser(url: string) {
    const currentPlatform = platform();

    let command: string;
    if (currentPlatform === 'darwin') {
      // macOS
      command = `open "${url}"`;
    } else if (currentPlatform === 'win32') {
      // Windows
      command = `start "" "${url}"`;
    } else {
      // Linux 和其他系统
      command = `xdg-open "${url}"`;
    }

    exec(command, (error) => {
      if (error) {
        console.error('打开浏览器失败:', error);
        new Notice('打开浏览器失败');
      }
    });
  }

  searchAll(query: string, isAppend: boolean = false) {
    const enabledSites = this.settings.sites.filter(site => site.enabled);

    if (enabledSites.length === 0) {
      new Notice('请至少启用一个AI网站');
      return;
    }

    const encodedQuery = encodeURIComponent(query);

    enabledSites.forEach((site, index) => {
      // 延迟打开，避免浏览器阻止弹窗
      setTimeout(() => {
        let url = `${site.url}?${site.queryParam}=${encodedQuery}`;
        // 如果是追问且网站支持 append 参数
        if (isAppend && site.appendParam) {
          url += `&${site.appendParam}=${encodedQuery}`;
        }
        this.openInSystemBrowser(url);
      }, index * 300); // 每个链接间隔300ms
    });

    new Notice(`正在打开 ${enabledSites.length} 个AI搜索...`);
  }
}

class AISearchModal extends Modal {
  settings: AISearchSettings;
  plugin: AISearchPlugin;
  query: string = '';
  selectedSites: Set<string>;
  isAppend: boolean = false;

  constructor(app: App, settings: AISearchSettings, plugin: AISearchPlugin) {
    super(app);
    this.settings = settings;
    this.plugin = plugin;
    this.selectedSites = new Set(settings.sites.filter(s => s.enabled).map(s => s.name));
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass('ai-search-modal');

    // 标题
    contentEl.createEl('h2', { text: 'AI 搜索' });

    // 搜索输入框
    const inputContainer = contentEl.createDiv({ cls: 'ai-search-input-container' });
    const input = inputContainer.createEl('input', {
      cls: 'ai-search-input',
      attr: {
        type: 'text',
        placeholder: '输入要搜索的问题...',
        autofocus: 'true'
      }
    });

    input.addEventListener('input', (e) => {
      this.query = (e.target as HTMLInputElement).value;
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && this.query.trim()) {
        this.doSearch();
      }
    });

    // 追问选项
    const appendContainer = contentEl.createDiv({ cls: 'ai-search-append-container' });
    const appendCheckbox = appendContainer.createEl('input', {
      attr: {
        type: 'checkbox',
        id: 'ai-search-append'
      }
    });
    appendContainer.createEl('label', {
      text: '追问模式 (URL 带 append 参数)',
      attr: { for: 'ai-search-append' }
    });
    appendCheckbox.addEventListener('change', () => {
      this.isAppend = appendCheckbox.checked;
    });
    appendContainer.addEventListener('click', (e) => {
      if (e.target !== appendCheckbox) {
        appendCheckbox.checked = !appendCheckbox.checked;
        this.isAppend = appendCheckbox.checked;
      }
    });

    // 网站选择
    contentEl.createEl('h3', { text: '选择AI网站' });

    const sitesContainer = contentEl.createDiv({ cls: 'ai-search-sites' });

    this.settings.sites.forEach(site => {
      const siteDiv = sitesContainer.createDiv({ cls: 'ai-search-site' });

      const checkbox = siteDiv.createEl('input', {
        attr: {
          type: 'checkbox',
          id: `site-${site.name}`
        }
      });
      if (this.selectedSites.has(site.name)) {
        checkbox.checked = true;
      }

      siteDiv.createEl('label', {
        text: site.name,
        attr: { for: `site-${site.name}` }
      });

      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          this.selectedSites.add(site.name);
        } else {
          this.selectedSites.delete(site.name);
        }
      });

      // 点击整个div也可以切换
      siteDiv.addEventListener('click', (e) => {
        if (e.target !== checkbox) {
          checkbox.checked = !checkbox.checked;
          checkbox.dispatchEvent(new Event('change'));
        }
      });
    });

    // 按钮区域
    const buttonsContainer = contentEl.createDiv({ cls: 'ai-search-buttons' });

    buttonsContainer.createEl('button', { text: '取消' })
      .addEventListener('click', () => this.close());

    const searchBtn = buttonsContainer.createEl('button', {
      text: '搜索',
      cls: 'mod-cta'
    });
    searchBtn.addEventListener('click', () => this.doSearch());
  }

  doSearch() {
    if (!this.query.trim()) {
      new Notice('请输入搜索内容');
      return;
    }

    if (this.selectedSites.size === 0) {
      new Notice('请至少选择一个AI网站');
      return;
    }

    // 更新settings中的enabled状态
    this.settings.sites.forEach(site => {
      site.enabled = this.selectedSites.has(site.name);
    });

    this.plugin.searchAll(this.query, this.isAppend);
    this.close();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}

class AISearchSettingTab extends PluginSettingTab {
  plugin: AISearchPlugin;

  constructor(app: App, plugin: AISearchPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('h2', { text: 'AI Search 设置' });

    containerEl.createEl('p', {
      text: '配置要使用的AI搜索引擎。启用/禁用各个网站。'
    });

    this.plugin.settings.sites.forEach((site, index) => {
      new Setting(containerEl)
        .setName(site.name)
        .setDesc(`${site.url} (参数: ${site.queryParam})`)
        .addToggle(toggle => toggle
          .setValue(site.enabled)
          .onChange(async (value) => {
            this.plugin.settings.sites[index].enabled = value;
            await this.plugin.saveSettings();
          }));
    });

    // 添加自定义网站
    containerEl.createEl('h3', { text: '添加自定义网站' });

    let customName = '';
    let customUrl = '';
    let customParam = 'q';

    new Setting(containerEl)
      .setName('网站名称')
      .addText(text => text
        .setPlaceholder('例如: Claude')
        .onChange((value) => customName = value));

    new Setting(containerEl)
      .setName('网站URL')
      .addText(text => text
        .setPlaceholder('例如: https://claude.ai/')
        .onChange((value) => customUrl = value));

    new Setting(containerEl)
      .setName('查询参数')
      .addText(text => text
        .setValue('q')
        .onChange((value) => customParam = value));

    new Setting(containerEl)
      .setName('添加网站')
      .addButton(button => button
        .setButtonText('添加')
        .setCta()
        .onClick(async () => {
          if (!customName || !customUrl) {
            new Notice('请填写网站名称和URL');
            return;
          }

          this.plugin.settings.sites.push({
            name: customName,
            url: customUrl,
            enabled: true,
            queryParam: customParam
          });

          await this.plugin.saveSettings();
          this.display(); // 刷新设置页面
          new Notice(`已添加 ${customName}`);
        }));
  }
}
