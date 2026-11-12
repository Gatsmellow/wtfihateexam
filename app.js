'use strict';

/* ==========================================================================
   wtfihateexam · 学习工作台
   原生 JavaScript，无构建、无依赖。数据只存浏览器。
   代码分区：常量 → 存储 → 渲染 → 对话 → 记忆 → 关账 → 导入导出 → 启动
   ========================================================================== */

const APP_NAME = 'wtfihateexam';
const APP_VERSION = 1;
const DB_NAME = 'wtfihateexam';
const DB_VERSION = 1;
const LS_PREFIX = 'wtfihateexam.';
const EXPORT_FORMAT = 'wtfihateexam-workspace';

const DEFAULT_SETTINGS = {
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  apiKey: '',
  debug: false
};

const SKILLS = [
  { id: '批改', desc: '按步给分 · 抓错因', hint: '把题目和你的答案一起贴上，先给参考答案与识别反馈。' },
  { id: '讲题', desc: '四段式讲透', hint: '指定一道题，按“正确解法→你错在哪→丢分原因→考场对策”讲。' },
  { id: '出题', desc: '按薄弱模块组卷', hint: '根据失分总账出一份整卷，答案与评分要点放最后。' },
  { id: '自学', desc: '苏格拉底式追问', hint: '从一个知识点出发，AI 用问题带你自己走通。' }
];

/* --------------------------------------------------------------------------
   5 段系统提示词常量：用户可以直接用记事本修改本文件。
   {{subject}} 会在发送时替换成当前学科名。
   -------------------------------------------------------------------------- */
const PROMPT_PIGAI = `【批改模式】
你是《{{subject}}》的批改助教。本次对话只做批改，不讲题、不出卷。
规则：
1. 首轮只给参考答案和初步反馈，不逐题打分；等我确认后，再逐题批改。
2. 逐题批改时按步骤给分，明确写出每一步的得分或扣分；选择题只看最终结果。
3. 每道错题必须把错因归入四类之一：知识空缺 / 计算粗心 / 书写规范 / 程序缺步。
4. 看不清、缺条件或无法判断时直接说出来，不要替我猜答案。
5. 每发现一道错题，在回答最后另起一行输出一张结构化错题卡，不要放进代码块：
【错题卡】{"题号":"练习卷 3-2","错因":"知识空缺：忘记讨论端点","对策":"下次先写定义域再求导","状态":"待复习"}
每道错题一张卡，字段必须完整；没有错题就不要输出错题卡。`;

const PROMPT_JIANGTI = `【讲题模式】
你是《{{subject}}》的讲题助教。本次对话只精讲我指定的题，不批改整卷、不更新总账。
按四段式回答：
1. 正确解法：从读题到答案，关键步骤写全，点明用了哪条定理/公式以及适用条件。
2. 我错在哪：对照我的做法，指出第一个走偏的步骤和原因。
3. 丢分原因：归入知识空缺 / 计算粗心 / 书写规范 / 程序缺步中的一类或几类。
4. 考场对策：给一个下次遇到同类题可立即执行的检查动作。
如果我没有贴自己的做法，就先只讲正确解法，并问我当时是怎么想的。`;

const PROMPT_CHUTI = `【出题模式】
你是《{{subject}}》的命题人。本次对话只出题，不讲题。
先参考 system 中提供的失分总账：薄弱模块合计约占一半分值，其余模块按正常比例覆盖。
按本学科 rules 中的题型、题量和分值结构出一份完整试卷：
1. 题目从易到难，题干完整，大题留出足够答题空间。
2. 选择题给出四个选项；填空题留空；解答题标明分值。
3. 参考答案与评分要点统一放在最后，单独分页或分隔线隔开。
4. 出完就停，不主动讲解，等我做完再回到批改模式。`;

const PROMPT_ZIXUE = `【自学模式】
你是《{{subject}}》的苏格拉底式学习教练。本次对话以我自己学会为目标，不以你讲完为目标。
规则：
1. 先用 2-3 个诊断问题摸清我已有的理解，再决定从哪里开始。
2. 每次只推进一小步，用问题引导我自己说出关键推理；不要一次灌完整篇讲义。
3. 我答错时先指出我推理链断在哪，再给一个更小的提示，让我重试。
4. 每轮结束给一个“下一问”，保持我自己思考的惯性。
5. 发现我反复卡住的知识点，明确写成“知识空缺：……”，方便我之后收录。`;

const PROMPT_FEYNMAN = `【费曼模式 · 已开启】
现在角色反转：我是老师，你是学生。规则：
1. 我讲一个知识点，你只以“学生”的视角听，不要抢着替我讲。
2. 听完后只提三类反馈：概念性错误、逻辑断点、你作为学生没听懂而追问的地方。
3. 反馈要具体到我刚才说的哪一句，不要泛泛地说“讲得很好”。
4. 最后输出“本次授课暴露的知识点空缺”清单，并问我是否要并入错题本。
5. 不要替我总结成标准答案；保留我自己的表达漏洞，那才是有用的地方。`;

const SKILL_PROMPTS = {
  '批改': PROMPT_PIGAI,
  '讲题': PROMPT_JIANGTI,
  '出题': PROMPT_CHUTI,
  '自学': PROMPT_ZIXUE
};

const STATUS_OPTIONS = ['待复习', '复习中', '已掌握'];
const QUEUE_STATUS_OPTIONS = ['待办', '进行中', '已办'];

/* 附件只存在当前页面的内存里，绝不写进 IndexedDB / localStorage / 导出文件。 */
const ATTACHMENT_MAX_FILES = 8;
const ATTACHMENT_MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const ATTACHMENT_MAX_FILE_BYTES = 8 * 1024 * 1024;
const ATTACHMENT_MAX_TEXT_CHARS = 80000;
const ATTACHMENT_TOTAL_IMAGE_BYTES = 12 * 1024 * 1024;
const ATTACHMENT_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const ATTACHMENT_TEXT_EXTENSIONS = ['txt', 'md', 'markdown', 'docx'];
// 没有统一的能力接口，用可维护的白名单/命名约定做发送前检查。
// 用户换成本地中转的视觉模型时，把模型名加到这里即可。
const VISION_MODEL_PATTERNS = [
  /deepseek[-_ ]?v4[-_ ]?pro/i,
  /(^|[\/_-])(vision|multimodal|vl)([\/_-]|$)/i,
  /gpt-4o|gpt-4\.1|gpt-5|o4/i,
  /gemini|claude-(3|4)|qwen.*vl|llava|pixtral/i
];

/* --------------------------------------------------------------------------
   小工具
   -------------------------------------------------------------------------- */
function $(id) { return document.getElementById(id); }

function uid() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function nowIso() { return new Date().toISOString(); }

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

function formatTime(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  } catch (error) { return ''; }
}

function formatDate(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch (error) { return ''; }
}

function fileStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes());
}

function toast(message, type) {
  const wrap = $('toasts');
  if (!wrap) return;
  const node = document.createElement('div');
  node.className = 'toast ' + (type || '');
  const dot = document.createElement('span');
  dot.className = 'toast-dot';
  const text = document.createElement('span');
  text.textContent = message;
  node.append(dot, text);
  wrap.appendChild(node);
  window.setTimeout(() => {
    node.style.opacity = '0';
    node.style.transform = 'translateY(4px)';
    window.setTimeout(() => node.remove(), 200);
  }, type === 'bad' ? 5200 : 3200);
}

function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    return navigator.clipboard.writeText(text);
  }
  return new Promise((resolve, reject) => {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try {
      document.execCommand('copy');
      resolve();
    } catch (error) { reject(error); }
    area.remove();
  });
}

function safeJsonParse(text, fallback) {
  try { return JSON.parse(text); } catch (error) { return fallback; }
}

function truncateText(text, max) {
  const value = String(text || '');
  return value.length > max ? value.slice(0, max) + '…' : value;
}

/* --------------------------------------------------------------------------
   附件：只进内存与 API 请求，不落盘、不写 localStorage。
   -------------------------------------------------------------------------- */
function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return value + ' B';
  if (value < 1024 * 1024) return (value / 1024).toFixed(value < 10240 ? 1 : 0) + ' KB';
  return (value / 1024 / 1024).toFixed(1) + ' MB';
}

function modelSupportsVision(model) {
  const name = String(model || '').trim();
  if (!name) return false;
  return VISION_MODEL_PATTERNS.some((pattern) => pattern.test(name));
}

function fileExtension(file) {
  const name = String(file && file.name ? file.name : '');
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function attachmentKind(file) {
  const ext = fileExtension(file);
  if (ATTACHMENT_IMAGE_TYPES.indexOf(file.type) >= 0 || ['png', 'jpg', 'jpeg', 'webp'].indexOf(ext) >= 0) return 'image';
  if (ATTACHMENT_TEXT_EXTENSIONS.indexOf(ext) >= 0) return 'text';
  return '';
}

function imageMimeFor(file) {
  const ext = fileExtension(file);
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'png') return 'image/png';
  return ATTACHMENT_IMAGE_TYPES.indexOf(file.type) >= 0 ? file.type : '';
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

async function docxToText(file) {
  const lib = window.mammoth;
  if (!lib || typeof lib.extractRawText !== 'function') {
    throw new Error('docx 解析库未加载，请刷新页面后重试');
  }
  const result = await lib.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return String(result && result.value ? result.value : '');
}

async function fileToAttachment(file) {
  const kind = attachmentKind(file);
  if (!kind) throw new Error('只支持 png/jpg/jpeg/webp 图片和 txt/md/docx 文本');
  if (file.size > ATTACHMENT_MAX_FILE_BYTES) {
    throw new Error('文件超过 ' + formatBytes(ATTACHMENT_MAX_FILE_BYTES) + '，请压缩后再传');
  }
  if (kind === 'image') {
    if (file.size > ATTACHMENT_MAX_IMAGE_BYTES) {
      throw new Error('图片超过 ' + formatBytes(ATTACHMENT_MAX_IMAGE_BYTES) + '，请压缩后再传');
    }
    const mime = imageMimeFor(file);
    if (!mime) throw new Error('无法识别图片格式');
    let dataUrl = await readFileAsDataUrl(file);
    if (!/^data:image\//i.test(dataUrl)) {
      dataUrl = dataUrl.replace(/^data:[^;]*;/, 'data:' + mime + ';');
    }
    return {
      id: uid(),
      kind: 'image',
      name: truncateText(file.name || '图片', 120),
      size: file.size,
      mime: mime,
      dataUrl: dataUrl
    };
  }

  const ext = fileExtension(file);
  let content;
  try {
    content = ext === 'docx' ? await docxToText(file) : await file.text();
  } catch (error) {
    throw new Error(ext === 'docx' ? 'docx 解析失败：' + (error.message || error) : '读取文本失败：' + (error.message || error));
  }
  content = String(content || '').replace(/\r\n/g, '\n').trim();
  if (!content) throw new Error('文件里没有可读取的文字');
  if (content.length > ATTACHMENT_MAX_TEXT_CHARS) {
    throw new Error('文本超过 ' + ATTACHMENT_MAX_TEXT_CHARS.toLocaleString('zh-CN') + ' 字，请截取后再传');
  }
  return {
    id: uid(),
    kind: 'text',
    name: truncateText(file.name || '文本', 120),
    size: file.size,
    text: content,
    format: ext === 'docx' ? 'DOCX' : ext.toUpperCase()
  };
}

async function addPendingAttachments(fileList) {
  if (state.streaming) { toast('AI 正在回复，等它说完再添加附件'); return; }
  const files = Array.from(fileList || []);
  if (!files.length) return;
  if (state.pendingAttachments.length >= ATTACHMENT_MAX_FILES) {
    toast('一次最多带 ' + ATTACHMENT_MAX_FILES + ' 个附件', 'bad');
    return;
  }
  const remaining = ATTACHMENT_MAX_FILES - state.pendingAttachments.length;
  if (files.length > remaining) toast('一次最多带 ' + ATTACHMENT_MAX_FILES + ' 个附件，已忽略多余的', 'bad');
  for (const file of files.slice(0, remaining)) {
    try {
      const attachment = await fileToAttachment(file);
      if (attachment.kind === 'image') {
        const imageBytes = state.pendingAttachments
          .filter((item) => item.kind === 'image')
          .reduce((sum, item) => sum + item.size, attachment.size);
        if (imageBytes > ATTACHMENT_TOTAL_IMAGE_BYTES) {
          throw new Error('待发送图片合计超过 ' + formatBytes(ATTACHMENT_TOTAL_IMAGE_BYTES));
        }
      }
      state.pendingAttachments.push(attachment);
    } catch (error) {
      toast((file.name || '文件') + '：' + (error.message || error), 'bad');
    }
  }
  renderPendingAttachments();
}

function removePendingAttachment(id) {
  if (state.streaming) return;
  state.pendingAttachments = state.pendingAttachments.filter((item) => item.id !== id);
  renderPendingAttachments();
  $('composer').focus();
}

function clearPendingAttachments() {
  state.pendingAttachments = [];
  renderPendingAttachments();
}

function extensionIcon(attachment) {
  if (attachment.kind === 'image') return '';
  return attachment.format || 'TXT';
}

function renderPendingAttachments() {
  const wrap = $('attachmentStrip');
  if (!wrap) return;
  wrap.textContent = '';
  const items = state.pendingAttachments;
  if (!items.length) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  items.forEach((attachment) => {
    const chip = el('div', 'attachment-chip');
    if (attachment.kind === 'image') {
      const img = document.createElement('img');
      img.src = attachment.dataUrl;
      img.alt = attachment.name;
      chip.appendChild(img);
    } else {
      chip.appendChild(el('div', 'attachment-file-icon', extensionIcon(attachment)));
    }
    const meta = el('div', 'attachment-meta');
    meta.append(
      el('span', 'attachment-name', attachment.name),
      el('span', 'attachment-size', (attachment.kind === 'image' ? '图片 · ' : '文本 · ') + formatBytes(attachment.size))
    );
    const remove = el('button', 'attachment-remove', '×');
    remove.type = 'button';
    remove.title = '移除附件';
    remove.setAttribute('aria-label', '移除附件 ' + attachment.name);
    remove.addEventListener('click', () => removePendingAttachment(attachment.id));
    chip.append(meta, remove);
    wrap.appendChild(chip);
  });
  if (items.some((item) => item.kind === 'image') && !modelSupportsVision(state.settings.model)) {
    wrap.appendChild(el('div', 'attachment-warning', '当前模型未支持图片：批改图片请切换 deepseek-v4-pro（设置里可改）。'));
  }
}

function attachmentsForMessage(messageId) {
  return state.messageAttachments.get(messageId) || [];
}

function clearMessageAttachmentsForConversation(conversation) {
  if (!conversation) return;
  conversation.messages.forEach((message) => state.messageAttachments.delete(message.id));
}

function clearAllMessageAttachments() {
  state.messageAttachments.clear();
  clearPendingAttachments();
}

function attachmentApiText(message) {
  const attachments = attachmentsForMessage(message.id);
  const parts = [];
  if (message.content && String(message.content).trim()) parts.push(String(message.content).trim());
  const images = attachments.filter((item) => item.kind === 'image');
  if (images.length) parts.push('（附图：' + images.map((item) => item.name).join('、') + '）');
  attachments.filter((item) => item.kind === 'text').forEach((item) => {
    parts.push('【附件：' + item.name + '】\n' + item.text);
  });
  return parts.join('\n\n');
}

// 把带附件的用户消息转成 OpenAI 多模态 content；纯文本仍保留字符串格式。
function messageForApi(message) {
  const attachments = attachmentsForMessage(message.id);
  const images = attachments.filter((item) => item.kind === 'image');
  const text = attachmentApiText(message);
  if (!images.length) return { role: message.role, content: text || message.content };
  const content = images.map((item) => ({ type: 'image_url', image_url: { url: item.dataUrl } }));
  if (text) content.push({ type: 'text', text: text });
  return { role: message.role, content: content };
}

function debounce(fn, wait) {
  let timer = null;
  return function () {
    const args = arguments;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn.apply(null, args), wait);
  };
}

/* --------------------------------------------------------------------------
   localStorage（key、界面设置、最后一次选择）
   -------------------------------------------------------------------------- */
const memoryFallback = new Map();

function lsGet(key, fallback) {
  try {
    const value = window.localStorage.getItem(LS_PREFIX + key);
    return value == null ? fallback : value;
  } catch (error) {
    return memoryFallback.has(key) ? memoryFallback.get(key) : fallback;
  }
}

function lsSet(key, value) {
  memoryFallback.set(key, String(value));
  try { window.localStorage.setItem(LS_PREFIX + key, String(value)); } catch (error) { /* 隐私模式下降级到内存 */ }
}

function lsRemove(key) {
  memoryFallback.delete(key);
  try { window.localStorage.removeItem(LS_PREFIX + key); } catch (error) { /* ignore */ }
}

function loadSettings() {
  return {
    baseUrl: lsGet('baseUrl', DEFAULT_SETTINGS.baseUrl),
    model: lsGet('model', DEFAULT_SETTINGS.model),
    apiKey: lsGet('apiKey', ''),
    debug: lsGet('debug', '0') === '1'
  };
}

function persistSettings(settings) {
  lsSet('baseUrl', settings.baseUrl);
  lsSet('model', settings.model);
  lsSet('apiKey', settings.apiKey);
  lsSet('debug', settings.debug ? '1' : '0');
}

function loadMode(subjectId) {
  const raw = safeJsonParse(lsGet('mode.' + subjectId, '{}'), {});
  return {
    skill: SKILL_PROMPTS[raw.skill] ? raw.skill : '批改',
    feynman: raw.feynman === true
  };
}

function saveMode(subjectId, skill, feynman) {
  if (!subjectId) return;
  lsSet('mode.' + subjectId, JSON.stringify({ skill: skill, feynman: !!feynman }));
}

/* --------------------------------------------------------------------------
   IndexedDB 存储层（主）；极少数 file:// 环境不可用时降级 localStorage
   -------------------------------------------------------------------------- */
const store = {
  mode: 'idb',
  db: null,

  async init() {
    try {
      this.db = await openDatabase();
      this.mode = 'idb';
    } catch (error) {
      console.warn('[wtfihateexam] IndexedDB 不可用，降级到 localStorage：', error);
      this.mode = 'local';
    }
  },

  fallbackKey(name) { return LS_PREFIX + 'fallback.' + name; },

  async getAll(name) {
    if (this.mode === 'idb') {
      const db = this.db;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(name, 'readonly');
        const req = tx.objectStore(name).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    }
    return safeJsonParse(lsGet('fallback.' + name, '[]'), []);
  },

  async put(name, value) {
    if (this.mode === 'idb') {
      const db = this.db;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(name, 'readwrite');
        tx.objectStore(name).put(value);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('事务被取消'));
      });
    }
    const list = safeJsonParse(lsGet('fallback.' + name, '[]'), []);
    const index = list.findIndex((item) => item.id === value.id);
    if (index >= 0) list[index] = value; else list.push(value);
    lsSet('fallback.' + name, JSON.stringify(list));
  },

  async delete(name, id) {
    if (this.mode === 'idb') {
      const db = this.db;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(name, 'readwrite');
        tx.objectStore(name).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }
    const list = safeJsonParse(lsGet('fallback.' + name, '[]'), []);
    lsSet('fallback.' + name, JSON.stringify(list.filter((item) => item.id !== id)));
  },

  async replaceAll(subjects, conversations) {
    if (this.mode === 'idb') {
      const db = this.db;
      return new Promise((resolve, reject) => {
        const tx = db.transaction(['subjects', 'conversations'], 'readwrite');
        const subjectStore = tx.objectStore('subjects');
        const conversationStore = tx.objectStore('conversations');
        subjectStore.clear();
        conversationStore.clear();
        subjects.forEach((subject) => subjectStore.put(subject));
        conversations.forEach((conversation) => conversationStore.put(conversation));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('导入事务被取消'));
      });
    }
    lsSet('fallback.subjects', JSON.stringify(subjects));
    lsSet('fallback.conversations', JSON.stringify(conversations));
  }
};

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('浏览器没有 IndexedDB'));
      return;
    }
    let request;
    try { request = window.indexedDB.open(DB_NAME, DB_VERSION); } catch (error) { reject(error); return; }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('subjects')) db.createObjectStore('subjects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('conversations')) {
        const conversationStore = db.createObjectStore('conversations', { keyPath: 'id' });
        conversationStore.createIndex('subjectId', 'subjectId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('无法打开 IndexedDB'));
    request.onblocked = () => reject(new Error('IndexedDB 被其他标签页阻塞，请关闭后重试'));
  });
}

/* --------------------------------------------------------------------------
   应用状态
   -------------------------------------------------------------------------- */
const state = {
  subjects: [],
  conversations: [],
  currentSubjectId: null,
  currentConversationId: null,
  currentSkill: '批改',
  feynman: false,
  settings: loadSettings(),
  expanded: new Set(),
  view: 'chat',
  memoryTab: 'questions',
  streaming: null,
  streamRenderPending: false,
  chatError: '',
  editingSubjectId: null,
  editingQuestionId: null,
  editingLedgerId: null,
  pendingCapture: null,
  reviewProposal: null,
  reviewAbort: null,
  pendingAttachments: [],
  // messageId -> 附件数组；只活在本页内存里，刷新即清空。
  messageAttachments: new Map(),
  seeded: lsGet('seeded', '0') === '1'
};

/* --------------------------------------------------------------------------
   数据规范化
   -------------------------------------------------------------------------- */
function normalizeQuestion(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    id: source.id || uid(),
    number: String(source.number || source['题号'] || '未编号').trim().slice(0, 120),
    reason: String(source.reason || source['错因'] || '').trim().slice(0, 1000),
    strategy: String(source.strategy || source['对策'] || '').trim().slice(0, 1000),
    status: STATUS_OPTIONS.includes(source.status || source['状态']) ? (source.status || source['状态']) : '待复习',
    source: String(source.source || '手动记录').slice(0, 40),
    createdAt: source.createdAt || nowIso()
  };
}

function normalizeLedgerRow(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const lost = Number(source.lost != null ? source.lost : source['失分']);
  const total = Number(source.total != null ? source.total : source['满分']);
  return {
    id: source.id || uid(),
    module: String(source.module || source['模块'] || '未命名模块').trim().slice(0, 80),
    lost: Number.isFinite(lost) && lost >= 0 ? Math.round(lost * 10) / 10 : 0,
    total: Number.isFinite(total) && total >= 0 ? Math.round(total * 10) / 10 : 0,
    note: String(source.note || source['备注'] || '').trim().slice(0, 300),
    updatedAt: source.updatedAt || nowIso()
  };
}

function normalizeQueueItem(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const status = source.status || source['状态'];
  return {
    id: source.id || uid(),
    item: String(source.item || source['事项'] || '未命名事项').trim().slice(0, 180),
    status: QUEUE_STATUS_OPTIONS.includes(status) ? status : '待办',
    createdAt: source.createdAt || nowIso()
  };
}

function normalizeSubject(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    id: source.id || uid(),
    name: String(source.name || '未命名学科').trim().slice(0, 40),
    rules: String(source.rules || '').slice(0, 20000),
    questions: Array.isArray(source.questions) ? source.questions.map(normalizeQuestion) : [],
    ledger: Array.isArray(source.ledger) ? source.ledger.map(normalizeLedgerRow) : [],
    queue: Array.isArray(source.queue) ? source.queue.map(normalizeQueueItem) : [],
    createdAt: source.createdAt || nowIso(),
    updatedAt: source.updatedAt || nowIso()
  };
}

function normalizeMessage(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    id: source.id || uid(),
    role: source.role === 'assistant' ? 'assistant' : 'user',
    content: String(source.content || ''),
    createdAt: source.createdAt || nowIso(),
    stopped: source.stopped === true
  };
}

function normalizeConversation(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    id: source.id || uid(),
    subjectId: String(source.subjectId || ''),
    title: String(source.title || '新对话').trim().slice(0, 80) || '新对话',
    skill: SKILL_PROMPTS[source.skill] ? source.skill : '批改',
    feynman: source.feynman === true,
    messages: Array.isArray(source.messages) ? source.messages.map(normalizeMessage) : [],
    createdAt: source.createdAt || nowIso(),
    updatedAt: source.updatedAt || nowIso(),
    closedAt: source.closedAt || ''
  };
}

function makeSubject(name, rules) {
  return normalizeSubject({
    id: uid(),
    name: name,
    rules: rules || '',
    questions: [],
    ledger: [],
    queue: [],
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
}

function makeConversation(subjectId, skill, feynman) {
  return normalizeConversation({
    id: uid(),
    subjectId: subjectId,
    title: '新对话',
    skill: skill || '批改',
    feynman: !!feynman,
    messages: [],
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
}

/* --------------------------------------------------------------------------
   查询
   -------------------------------------------------------------------------- */
function getSubject(id) { return state.subjects.find((subject) => subject.id === id) || null; }
function getCurrentSubject() { return getSubject(state.currentSubjectId); }
function getConversation(id) { return state.conversations.find((conversation) => conversation.id === id) || null; }
function getCurrentConversation() { return getConversation(state.currentConversationId); }

function conversationsFor(subjectId) {
  return state.conversations
    .filter((conversation) => conversation.subjectId === subjectId)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function recentConversationFor(subjectId) {
  return conversationsFor(subjectId)[0] || null;
}

/* --------------------------------------------------------------------------
   系统提示词组装
   -------------------------------------------------------------------------- */
function memoryContextFor(subject) {
  if (!subject) return '';
  const parts = [];
  const openQuestions = subject.questions.filter((question) => question.status !== '已掌握').slice(0, 8);
  if (openQuestions.length) {
    parts.push('【待复习错题（供参考）】');
    openQuestions.forEach((question) => {
      parts.push('- ' + question.number + '｜错因：' + (question.reason || '未填') + '｜对策：' + (question.strategy || '未填'));
    });
  }
  const weakLedger = subject.ledger.slice().sort((a, b) => b.lost - a.lost).slice(0, 6);
  if (weakLedger.length) {
    parts.push('【失分总账（供参考）】');
    weakLedger.forEach((row) => {
      parts.push('- ' + row.module + '：失分 ' + row.lost + (row.total ? ' / 满分 ' + row.total : '') + (row.note ? '（' + row.note + '）' : ''));
    });
  }
  const openQueue = subject.queue.filter((item) => item.status !== '已办').slice(0, 6);
  if (openQueue.length) {
    parts.push('【考察清单（供参考）】');
    openQueue.forEach((item) => parts.push('- ' + item.item + '（' + item.status + '）'));
  }
  return parts.join('\n');
}

function buildSystemPrompt(subject, skill, feynman) {
  const template = SKILL_PROMPTS[skill] || PROMPT_PIGAI;
  const parts = [template.replace(/\{\{subject\}\}/g, subject.name)];
  // 费曼开关是叠加式的：无论当前技能是什么，都追加“我当老师、你当学生”的规则。
  if (feynman) parts.push(PROMPT_FEYNMAN.replace(/\{\{subject\}\}/g, subject.name));
  parts.push('【当前学科】' + subject.name);
  const memoryContext = memoryContextFor(subject);
  if (memoryContext) parts.push(memoryContext);
  // 学科 rules 永远放在 system 最尾部，便于用户观察和覆盖。
  if (String(subject.rules || '').trim()) parts.push('【本学科 rules】\n' + String(subject.rules).trim());
  return parts.join('\n\n');
}

/* --------------------------------------------------------------------------
   API 调用
   -------------------------------------------------------------------------- */
function resolveApiUrl(baseUrl, path) {
  const base = String(baseUrl || DEFAULT_SETTINGS.baseUrl).trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/.test(base)) {
    return path.indexOf('/chat/completions') === 0 ? base : base.replace(/\/chat\/completions$/, path);
  }
  return base + path;
}

function apiUrl(path) {
  return resolveApiUrl(state.settings.baseUrl, path);
}

function apiHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + String(state.settings.apiKey || '').trim(),
    'Accept': 'application/json'
  };
}

function parseApiError(status, text) {
  const data = safeJsonParse(text, null);
  const message = data && data.error && data.error.message ? data.error.message : String(text || '').slice(0, 600);
  if (status === 401) return 'API key 无效或已过期（401）。请到设置里检查 key。';
  if (status === 402) return '账户余额不足（402）。请到 DeepSeek 控制台充值后重试。';
  if (status === 429) return '请求太频繁或额度用尽（429）。稍等一会再试。';
  return 'API 返回 ' + status + '：' + (message || '未知错误');
}

async function apiRequestJson(path, options) {
  const response = await fetch(apiUrl(path), options);
  const text = await response.text();
  if (!response.ok) throw new Error(parseApiError(response.status, text));
  const data = safeJsonParse(text, null);
  if (!data) throw new Error('API 返回了无法解析的内容。');
  return data;
}

// 非流式调用，用于关账时让 AI 产出结构化 JSON。
async function callChatOnce(messages, options) {
  const opts = options || {};
  const controller = opts.signal ? null : new AbortController();
  const signal = opts.signal || controller.signal;
  const timer = controller ? window.setTimeout(() => controller.abort(), opts.timeoutMs || 120000) : null;
  try {
    const data = await apiRequestJson('/chat/completions', {
      method: 'POST',
      headers: apiHeaders(),
      signal: signal,
      body: JSON.stringify({
        model: state.settings.model || DEFAULT_SETTINGS.model,
        messages: messages,
        stream: false,
        temperature: opts.temperature != null ? opts.temperature : 0.2,
        max_tokens: opts.maxTokens || 2200
      })
    });
    const choice = data && Array.isArray(data.choices) ? data.choices[0] : null;
    const content = choice && choice.message && choice.message.content;
    if (!content) throw new Error('API 没有返回内容。');
    return content;
  } catch (error) {
    if (error && error.name === 'AbortError') throw new Error('请求超时或被取消。');
    throw error;
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

// 流式调用：逐块读取 SSE，把增量文字交给 onDelta。
async function streamChatCompletion(messages, onDelta, signal) {
  let response;
  try {
    response = await fetch(apiUrl('/chat/completions'), {
      method: 'POST',
      headers: apiHeaders(),
      signal: signal,
      body: JSON.stringify({
        model: state.settings.model || DEFAULT_SETTINGS.model,
        messages: messages,
        stream: true
      })
    });
  } catch (error) {
    if (error && error.name === 'AbortError') throw error;
    throw new Error('无法连接 API（Failed to fetch）。请检查网络、base_url，或 key 是否被浏览器插件拦截。');
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(parseApiError(response.status, text));
  }
  if (!response.body) throw new Error('当前浏览器不支持流式读取响应。');

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let done = false;
  let received = '';

  function consumeLine(line) {
    const clean = line.replace(/\r$/, '');
    if (!clean || clean.indexOf('data:') !== 0) return;
    const payload = clean.slice(5).trim();
    if (!payload) return;
    if (payload === '[DONE]') { done = true; return; }
    const data = safeJsonParse(payload, null);
    if (!data) return;
    const choice = data.choices && data.choices[0];
    if (!choice) return;
    const delta = choice.delta || {};
    const piece = delta.content != null ? delta.content : '';
    if (piece) {
      received += piece;
      onDelta(piece, received);
    }
  }

  try {
    while (!done) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        consumeLine(line);
        if (done) break;
        newlineIndex = buffer.indexOf('\n');
      }
    }
    buffer += decoder.decode();
    if (!done && buffer.trim()) consumeLine(buffer.trim());
  } finally {
    try { reader.releaseLock(); } catch (error) { /* ignore */ }
  }
  if (!received.trim()) throw new Error('API 流结束了，但没有收到任何文字。');
  return received;
}

/* --------------------------------------------------------------------------
   Markdown 渲染（先转义，再生成受控标签；不执行模型输出的 HTML）
   -------------------------------------------------------------------------- */
function inlineMarkdown(value) {
  let text = escapeHtml(value);
  text = text.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  text = text.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, function (match, label, url) {
    return '<a href="' + escapeAttr(url) + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
  });
  return text;
}

function renderMarkdown(source) {
  const text = String(source || '').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  const html = [];
  let paragraph = [];
  let listType = '';
  let listItems = [];
  let inCode = false;
  let codeLines = [];
  let codeLang = '';

  function flushParagraph() {
    if (!paragraph.length) return;
    html.push('<p>' + paragraph.map(inlineMarkdown).join('<br>') + '</p>');
    paragraph = [];
  }

  function flushList() {
    if (!listItems.length) return;
    html.push('<' + listType + '>' + listItems.map((item) => '<li>' + inlineMarkdown(item) + '</li>').join('') + '</' + listType + '>');
    listItems = [];
    listType = '';
  }

  function flushCode() {
    html.push('<pre><code' + (codeLang ? ' class="language-' + escapeAttr(codeLang) + '"' : '') + '>' + escapeHtml(codeLines.join('\n')) + '</code></pre>');
    codeLines = [];
    codeLang = '';
  }

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      flushParagraph(); flushList();
      if (inCode) { flushCode(); inCode = false; } else { inCode = true; codeLang = line.replace(/^\s*```/, '').trim().split(/\s+/)[0] || ''; }
      continue;
    }
    if (inCode) { codeLines.push(line); continue; }

    if (!line.trim()) { flushParagraph(); flushList(); continue; }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushParagraph(); flushList();
      const level = heading[1].length;
      html.push('<h' + level + '>' + inlineMarkdown(heading[2]) + '</h' + level + '>');
      continue;
    }

    if (/^\s*(---+|___+|\*\*\*+)\s*$/.test(line)) {
      flushParagraph(); flushList();
      html.push('<hr>');
      continue;
    }

    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      flushParagraph(); flushList();
      html.push('<blockquote>' + inlineMarkdown(quote[1]) + '</blockquote>');
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      if (listType && listType !== 'ul') flushList();
      listType = 'ul';
      listItems.push(unordered[1]);
      continue;
    }

    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      if (listType && listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push(ordered[1]);
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  if (inCode) flushCode();
  flushParagraph();
  flushList();
  return html.join('');
}

/* --------------------------------------------------------------------------
   错题卡解析
   -------------------------------------------------------------------------- */
function parseWrongCards(content) {
  const cards = [];
  const regex = /^[ \t]*【错题卡】[ \t]*(\{.*\})[ \t]*$/gm;
  let match;
  while ((match = regex.exec(String(content || ''))) !== null) {
    const raw = safeJsonParse(match[1], null);
    if (raw && typeof raw === 'object') {
      const card = normalizeQuestion(raw);
      if (card.number && (card.reason || card.strategy)) cards.push(card);
    }
  }
  if (!cards.length) return { clean: String(content || ''), cards: [] };
  const clean = String(content || '').replace(regex, '').replace(/\n{3,}/g, '\n\n').trim();
  return { clean: clean, cards: cards };
}

/* --------------------------------------------------------------------------
   渲染：侧栏三级树
   -------------------------------------------------------------------------- */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function renderTree() {
  const tree = $('subjectTree');
  tree.textContent = '';
  $('subjectCount').textContent = String(state.subjects.length);

  if (!state.subjects.length) {
    const empty = el('div', 'sidebar-empty');
    empty.append(
      el('div', '', '还没有学科'),
      el('div', '', '点上面的“新建学科”开始。')
    );
    tree.appendChild(empty);
    return;
  }

  state.subjects.forEach((subject) => {
    const isCurrent = subject.id === state.currentSubjectId;
    const expanded = state.expanded.has(subject.id);
    const block = el('div', 'subject-block' + (isCurrent ? ' is-current' : '') + (expanded ? ' expanded' : ''));
    block.dataset.subjectId = subject.id;

    const row = el('div', 'subject-row');
    const caret = el('button', 'subject-caret', '▶');
    caret.type = 'button';
    caret.setAttribute('aria-label', expanded ? '收起学科' : '展开学科');
    caret.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleSubjectExpanded(subject.id);
    });

    const main = el('button', 'subject-main');
    main.type = 'button';
    main.title = subject.name;
    main.append(el('span', 'subject-dot'), el('span', 'subject-name', subject.name));
    main.addEventListener('click', () => selectSubject(subject.id));

    const actions = el('div', 'subject-actions');
    const addChat = el('button', '', '＋');
    addChat.type = 'button';
    addChat.title = '在“' + subject.name + '”下开新对话';
    addChat.addEventListener('click', (event) => {
      event.stopPropagation();
      if (guardStreaming()) return;
      selectSubject(subject.id);
      createConversation(subject.id);
    });
    const edit = el('button', '', '✎');
    edit.type = 'button';
    edit.title = '编辑学科与 rules';
    edit.addEventListener('click', (event) => { event.stopPropagation(); openSubjectDialog(subject); });
    const remove = el('button', 'danger', '×');
    remove.type = 'button';
    remove.title = '删除学科';
    remove.addEventListener('click', (event) => { event.stopPropagation(); deleteSubject(subject.id); });
    actions.append(addChat, edit, remove);
    row.append(caret, main, actions);
    block.appendChild(row);

    if (expanded) {
      const body = el('div', 'subject-body');

      const skillList = el('div', 'skill-list');
      SKILLS.forEach((skill) => {
        const active = isCurrent && skill.id === state.currentSkill;
        const item = el('button', 'skill-item' + (active ? ' active' : ''));
        item.type = 'button';
        item.append(el('span', 'skill-marker'), el('span', '', skill.id), el('span', 'skill-desc', skill.desc));
        item.addEventListener('click', () => selectSkill(subject.id, skill.id));
        skillList.appendChild(item);
      });
      body.appendChild(skillList);

      const feynmanRow = el('div', 'feynman-row');
      const label = el('span', 'feynman-label');
      label.append(el('span', 'feynman-icon', 'F'), el('span', '', '费曼模式'));
      const toggle = el('button', 'switch' + (isCurrent && state.feynman ? ' on' : ''));
      toggle.type = 'button';
      toggle.setAttribute('role', 'switch');
      toggle.setAttribute('aria-checked', isCurrent && state.feynman ? 'true' : 'false');
      toggle.setAttribute('aria-label', '费曼模式开关');
      toggle.addEventListener('click', () => toggleFeynman(subject.id));
      feynmanRow.append(label, toggle);
      body.appendChild(feynmanRow);

      const convSection = el('div', 'conv-section');
      const convLabel = el('div', 'conv-label');
      convLabel.append(el('span', '', '该学科对话'));
      const convAdd = el('button', 'conv-add', '＋');
      convAdd.type = 'button';
      convAdd.title = '新对话';
      convAdd.addEventListener('click', () => {
        if (guardStreaming()) return;
        selectSubject(subject.id);
        createConversation(subject.id);
      });
      convLabel.appendChild(convAdd);
      convSection.appendChild(convLabel);

      const convList = el('div', 'conv-list');
      const conversations = conversationsFor(subject.id);
      if (!conversations.length) {
        convList.appendChild(el('div', 'conv-empty', '还没有对话'));
      } else {
        conversations.forEach((conversation) => {
          const active = conversation.id === state.currentConversationId;
          const item = el('div', 'conv-item' + (active ? ' active' : ''));
          const select = el('button', 'conv-select', conversation.title);
          select.type = 'button';
          select.title = conversation.title;
          select.addEventListener('click', () => selectConversation(conversation.id));
          const convActions = el('div', 'conv-actions');
          const rename = el('button', '', '✎');
          rename.type = 'button';
          rename.title = '重命名';
          rename.addEventListener('click', (event) => { event.stopPropagation(); openRenameDialog(conversation); });
          const del = el('button', '', '×');
          del.type = 'button';
          del.title = '删除对话';
          del.addEventListener('click', (event) => { event.stopPropagation(); deleteConversation(conversation.id); });
          convActions.append(rename, del);
          item.append(select, convActions);
          convList.appendChild(item);
        });
      }
      convSection.appendChild(convList);
      body.appendChild(convSection);
      block.appendChild(body);
    }

    tree.appendChild(block);
  });
}

function toggleSubjectExpanded(subjectId) {
  if (state.expanded.has(subjectId)) state.expanded.delete(subjectId); else state.expanded.add(subjectId);
  lsSet('expandedSubjects', JSON.stringify(Array.from(state.expanded)));
  renderTree();
}

function selectSubject(subjectId) {
  if (guardStreaming()) return;
  const subject = getSubject(subjectId);
  if (!subject) return;
  state.currentSubjectId = subjectId;
  state.expanded.add(subjectId);
  const mode = loadMode(subjectId);
  state.currentSkill = mode.skill;
  state.feynman = mode.feynman;
  clearPendingAttachments();
  const recent = recentConversationFor(subjectId);
  state.currentConversationId = recent ? recent.id : null;
  state.chatError = '';
  lsSet('lastSubjectId', subjectId);
  if (state.currentConversationId) lsSet('lastConversationId', state.currentConversationId);
  if (state.currentConversationId) {
    const conversation = getConversation(state.currentConversationId);
    if (conversation) {
      state.currentSkill = conversation.skill;
      state.feynman = conversation.feynman;
    }
  }
  closeMobileSidebar();
  renderAll();
}

function selectSkill(subjectId, skill) {
  if (guardStreaming()) return;
  if (state.currentSubjectId !== subjectId) {
    // 跨学科点技能时先完整切换学科，避免把旧学科的对话带过来。
    selectSubject(subjectId);
    if (state.currentSubjectId !== subjectId) return;
  }
  state.currentSkill = skill;
  saveMode(subjectId, state.currentSkill, state.feynman);
  const conversation = getCurrentConversation();
  if (conversation && conversation.subjectId === subjectId) {
    conversation.skill = skill;
    conversation.updatedAt = nowIso();
    store.put('conversations', serializeConversation(conversation)).catch((error) => console.warn(error));
  }
  renderAll();
}

function toggleFeynman(subjectId) {
  if (guardStreaming()) return;
  if (state.currentSubjectId !== subjectId) {
    // 跨学科拨开关时先切到该学科，再基于它自己的模式取反。
    selectSubject(subjectId);
    if (state.currentSubjectId !== subjectId) return;
  }
  state.feynman = !state.feynman;
  saveMode(subjectId, state.currentSkill, state.feynman);
  const conversation = getCurrentConversation();
  if (conversation && conversation.subjectId === subjectId) {
    conversation.feynman = state.feynman;
    conversation.updatedAt = nowIso();
    store.put('conversations', serializeConversation(conversation)).catch((error) => console.warn(error));
  }
  renderAll();
  if (state.feynman) toast('费曼模式已开：现在你讲，AI 当学生。', 'good');
}

function guardStreaming() {
  if (state.streaming) {
    toast('AI 正在回复，先点“停止”或等它说完。');
    return true;
  }
  return false;
}

/* --------------------------------------------------------------------------
   渲染：聊天头部、空状态与消息
   -------------------------------------------------------------------------- */
function currentModeText() {
  const skill = SKILLS.find((item) => item.id === state.currentSkill) || SKILLS[0];
  return (state.feynman ? '费曼模式 · ' : '') + skill.id + '模式：' + skill.hint;
}

function renderHeader() {
  const subject = getCurrentSubject();
  const conversation = getCurrentConversation();
  $('chatTitle').textContent = conversation ? conversation.title : (subject ? subject.name + ' · 新对话' : '开始学习');
  $('subjectBadge').textContent = subject ? subject.name : '未选择学科';
  $('skillBadge').textContent = state.currentSkill;
  $('modelBadge').textContent = state.settings.model || DEFAULT_SETTINGS.model;
  $('feynmanChip').hidden = !state.feynman;
  $('composerModeHint').textContent = currentModeText();
  $('noKeyBanner').hidden = !!state.settings.apiKey;
  $('memorySubjectBadge').textContent = subject ? subject.name : '未选择学科';
  $('renameConvBtn').disabled = !conversation;
  $('memoryBtn').disabled = !subject;
  $('closeBtn').disabled = !conversation || !conversation.messages.some((message) => message.role === 'assistant');
  $('newChatBtn').disabled = !subject;
}

function renderAll() {
  renderTree();
  renderHeader();
  if (state.view === 'memory') renderMemory(); else renderMessages();
}

function renderMessages() {
  const wrap = $('messages');
  wrap.textContent = '';
  const subject = getCurrentSubject();
  const conversation = getCurrentConversation();

  if (!subject) {
    renderWelcomeNoSubject(wrap);
    return;
  }
  if (!conversation || (!conversation.messages.length && !state.chatError)) {
    renderWelcome(wrap, subject, conversation);
    return;
  }

  conversation.messages.forEach((message) => {
    if (message.role === 'assistant' && !String(message.content || '').trim() && !message.stopped) return;
    wrap.appendChild(renderMessageNode(message, conversation));
  });

  if (state.chatError) {
    const error = el('div', 'msg-error');
    error.append(el('strong', '', '这次请求没有成功'), document.createTextNode(state.chatError));
    wrap.appendChild(error);
  }

  scrollToBottom(true);
}

function renderMessageAttachments(attachments) {
  if (!attachments.length) return null;
  const box = el('div', 'msg-attachments');
  attachments.forEach((attachment) => {
    if (attachment.kind === 'image') {
      const img = document.createElement('img');
      img.className = 'msg-attachment-image';
      img.src = attachment.dataUrl;
      img.alt = attachment.name;
      img.title = attachment.name;
      img.loading = 'lazy';
      box.appendChild(img);
    } else {
      const chip = el('div', 'msg-file-chip');
      const name = el('b', '', attachment.name);
      const meta = el('span', '', (attachment.format || 'TXT') + ' · ' + formatBytes(attachment.size));
      chip.append(name, meta);
      box.appendChild(chip);
    }
  });
  return box;
}

function renderMessageNode(message, conversation) {
  const isUser = message.role === 'user';
  const attachments = isUser ? attachmentsForMessage(message.id) : [];
  const node = el('div', 'msg ' + (isUser ? 'user' : 'assistant'));
  node.dataset.messageId = message.id;
  node.appendChild(el('div', 'msg-avatar', isUser ? '我' : 'AI'));

  const main = el('div', 'msg-main');
  const head = el('div', 'msg-head');
  head.append(el('span', 'msg-role', isUser ? '我' : '助教'), el('span', 'msg-time', formatTime(message.createdAt)));
  const copy = el('button', 'msg-copy', '复制');
  copy.type = 'button';
  copy.addEventListener('click', () => {
    copyText(message.content).then(() => toast('已复制')).catch(() => toast('复制失败，请手动选择', 'bad'));
  });
  head.appendChild(copy);
  main.appendChild(head);

  const content = el('div', 'msg-content');
  if (isUser) {
    if (message.content) content.textContent = message.content;
    if (message.content || !attachments.length) main.appendChild(content);
    const attachmentBox = renderMessageAttachments(attachments);
    if (attachmentBox) main.appendChild(attachmentBox);
  } else {
    const parsed = parseWrongCards(message.content);
    content.innerHTML = renderMarkdown(parsed.clean);
    if (message.stopped) {
      const stopped = el('div', 'msg-stopped', '已停止生成');
      content.appendChild(stopped);
    }
    if (parsed.cards.length) {
      const cards = el('div', 'wrongq-cards');
      parsed.cards.forEach((card) => {
        const cardNode = el('div', 'wrongq-card');
        cardNode.append(el('span', 'wrongq-card-icon', '错'));
        const text = el('div', 'wrongq-card-text');
        const title = el('b', '', card.number + ' · ');
        text.append(title, document.createTextNode(card.reason || '待补充错因'));
        const button = el('button', '', '收录');
        button.type = 'button';
        button.addEventListener('click', () => openCaptureDialog(card));
        cardNode.append(text, button);
        cards.appendChild(cardNode);
      });
      content.appendChild(cards);
    }
    main.appendChild(content);
  }
  node.appendChild(main);
  return node;
}

function renderWelcomeNoSubject(wrap) {
  const panel = el('div', 'welcome');
  panel.append(el('div', 'welcome-kicker', 'FIRST THINGS FIRST'));
  const h2 = el('h2');
  h2.append(document.createTextNode('先把你的'), el('em', '', '学科'), document.createTextNode('放进来。'));
  panel.appendChild(h2);
  panel.appendChild(el('p', '', '一个学科就是一个独立的工作区：有自己的规则、错题本、失分总账和对话。现在先建一个，哪怕只是“示例学科A”。'));
  const cta = el('div', 'welcome-cta');
  const create = el('button', 'primary-btn', '＋ 新建第一个学科');
  create.type = 'button';
  create.addEventListener('click', () => openSubjectDialog(null));
  cta.appendChild(create);
  if (!state.settings.apiKey) {
    const settings = el('button', 'ghost-btn', '先填 API Key');
    settings.type = 'button';
    settings.addEventListener('click', openSettings);
    cta.appendChild(settings);
  }
  panel.appendChild(cta);
  const note = el('div', 'welcome-note');
  note.append(document.createTextNode('数据只存当前浏览器的 IndexedDB。仓库里只有示例学科，没有你的真实成绩。'));
  panel.appendChild(note);
  wrap.appendChild(panel);
}

function renderWelcome(wrap, subject, conversation) {
  const panel = el('div', 'welcome');
  panel.append(el('div', 'welcome-kicker', 'A QUIET PLACE TO GET BETTER'));
  const h2 = el('h2');
  h2.append(document.createTextNode('把不会的题，'), el('em', '', '变成会做的题。'));
  panel.appendChild(h2);
  panel.appendChild(el('p', '', '选一个技能，把题目或你的答案贴进来。批改抓错因，讲题拆思路，出题打薄弱点，自学靠追问。每次结束点“结束并写回”，把结论沉淀下来。'));

  const steps = el('div', 'welcome-steps');
  [
    ['01', '填自己的 key', '设置里填 DeepSeek key，只存你的浏览器。'],
    ['02', '选技能再开口', '左侧 L2 选批改 / 讲题 / 出题 / 自学；L3 打开费曼。'],
    ['03', '结束并写回', '把对话压缩成错题、总账和考察清单，逐项确认后才写入。']
  ].forEach((item) => {
    const step = el('div', 'welcome-step');
    step.append(el('span', 'step-index', item[0]), el('strong', '', item[1]), el('p', '', item[2]));
    steps.appendChild(step);
  });
  panel.appendChild(steps);

  const preview = el('div', 'skill-preview');
  const previewHead = el('div', 'skill-preview-head');
  previewHead.append(el('strong', '', '当前：' + subject.name + ' · ' + (state.feynman ? '费曼模式 + ' : '') + state.currentSkill), el('span', '', 'system 会随技能与开关变化'));
  preview.appendChild(previewHead);
  const skill = SKILLS.find((item) => item.id === state.currentSkill) || SKILLS[0];
  preview.appendChild(el('p', '', skill.hint));
  panel.appendChild(preview);

  if (!state.settings.apiKey) {
    const banner = el('div', 'welcome-note');
    banner.append(el('strong', '', '还差 key：'), document.createTextNode('没有 key 也能先建学科、写 rules；发送消息前会提醒你填。'));
    panel.appendChild(banner);
  }

  const cta = el('div', 'welcome-cta');
  if (!conversation) {
    const start = el('button', 'primary-btn', '开始一个' + state.currentSkill + '对话');
    start.type = 'button';
    start.addEventListener('click', () => {
      if (!state.settings.apiKey) { openSettings(); toast('先填 API Key，再开始对话'); return; }
      createConversation(subject.id);
    });
    cta.appendChild(start);
  }
  if (!state.settings.apiKey) {
    const settings = el('button', 'ghost-btn', '去填 API Key');
    settings.type = 'button';
    settings.addEventListener('click', openSettings);
    cta.appendChild(settings);
  }
  const memory = el('button', 'ghost-btn', '打开记忆库');
  memory.type = 'button';
  memory.addEventListener('click', openMemory);
  cta.appendChild(memory);
  panel.appendChild(cta);

  const note = el('div', 'welcome-note');
  note.append(el('strong', '', '隐私：'), document.createTextNode('消息直接发往你填写的 API 地址；本站无服务器、无数据收集。'));
  panel.appendChild(note);
  wrap.appendChild(panel);
}

function scrollToBottom(force) {
  const scroller = $('messageScroller');
  if (!scroller) return;
  const nearBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 160;
  if (force || nearBottom) scroller.scrollTop = scroller.scrollHeight;
}

function updateStreamingUI(active) {
  $('sendBtn').disabled = active;
  $('stopBtn').hidden = !active;
  $('attachBtn').disabled = active;
  $('attachmentInput').disabled = active;
  $('closeBtn').disabled = active || !getCurrentConversation() || !getCurrentConversation().messages.some((message) => message.role === 'assistant');
  $('newChatBtn').disabled = active || !getCurrentSubject();
}

/* --------------------------------------------------------------------------
   对话操作
   -------------------------------------------------------------------------- */
function serializeConversation(conversation) {
  return {
    id: conversation.id,
    subjectId: conversation.subjectId,
    title: conversation.title,
    skill: conversation.skill,
    feynman: !!conversation.feynman,
    messages: conversation.messages.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      createdAt: message.createdAt,
      stopped: !!message.stopped
    })),
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    closedAt: conversation.closedAt || ''
  };
}

async function persistConversation(conversation) {
  conversation.updatedAt = nowIso();
  await store.put('conversations', serializeConversation(conversation));
}

async function persistSubject(subject) {
  subject.updatedAt = nowIso();
  await store.put('subjects', subject);
}

async function createConversation(subjectId, options) {
  if (guardStreaming()) return null;
  const subject = getSubject(subjectId || state.currentSubjectId);
  if (!subject) {
    toast('先建一个学科');
    return null;
  }
  if (state.currentSubjectId !== subject.id) {
    state.currentSubjectId = subject.id;
    const mode = loadMode(subject.id);
    state.currentSkill = mode.skill;
    state.feynman = mode.feynman;
  }
  state.expanded.add(subject.id);
  const conversation = makeConversation(subject.id, state.currentSkill, state.feynman);
  state.conversations.push(conversation);
  state.currentConversationId = conversation.id;
  state.chatError = '';
  lsSet('lastSubjectId', subject.id);
  lsSet('lastConversationId', conversation.id);
  try { await persistConversation(conversation); } catch (error) { toast('对话保存失败：' + error.message, 'bad'); }
  renderAll();
  if (!options || !options.silent) $('composer').focus();
  return conversation;
}

function selectConversation(conversationId) {
  if (guardStreaming()) return;
  const conversation = getConversation(conversationId);
  if (!conversation) return;
  if (!getSubject(conversation.subjectId)) return;
  state.currentConversationId = conversationId;
  state.currentSubjectId = conversation.subjectId;
  state.currentSkill = conversation.skill;
  state.feynman = conversation.feynman;
  state.expanded.add(conversation.subjectId);
  state.chatError = '';
  clearPendingAttachments();
  lsSet('lastSubjectId', conversation.subjectId);
  lsSet('lastConversationId', conversationId);
  closeMobileSidebar();
  renderAll();
}

function openRenameDialog(conversation) {
  if (!conversation) return;
  state.renamingConversationId = conversation.id;
  $('renameInput').value = conversation.title;
  openDialog('renameDialog');
  window.setTimeout(() => { $('renameInput').focus(); $('renameInput').select(); }, 50);
}

async function renameConversation(event) {
  event.preventDefault();
  const conversation = getConversation(state.renamingConversationId);
  if (!conversation) { closeDialog('renameDialog'); return; }
  const value = $('renameInput').value.trim();
  if (!value) { toast('名称不能为空', 'bad'); return; }
  conversation.title = value.slice(0, 60);
  await persistConversation(conversation);
  closeDialog('renameDialog');
  renderAll();
  toast('对话已重命名');
}

async function deleteConversation(conversationId) {
  if (guardStreaming()) return;
  const conversation = getConversation(conversationId);
  if (!conversation) return;
  const ok = await confirmAction({
    title: '删除这个对话？',
    text: '“' + conversation.title + '”的聊天记录会被永久删除。学科、错题本和总账不受影响。',
    okLabel: '删除对话'
  });
  if (!ok) return;
  clearMessageAttachmentsForConversation(conversation);
  await store.delete('conversations', conversationId);
  state.conversations = state.conversations.filter((item) => item.id !== conversationId);
  if (state.currentConversationId === conversationId) {
    const next = recentConversationFor(conversation.subjectId);
    state.currentConversationId = next ? next.id : null;
    if (next) lsSet('lastConversationId', next.id); else lsRemove('lastConversationId');
  }
  renderAll();
  toast('对话已删除');
}

/* --------------------------------------------------------------------------
   发送与流式接收
   -------------------------------------------------------------------------- */
function buildRequestMessages(conversation, systemPrompt) {
  const history = conversation.messages
    .filter((message) => message.role === 'user' || (message.role === 'assistant' && String(message.content || '').trim()))
    .slice(-40)
    .map(messageForApi);
  return [{ role: 'system', content: systemPrompt }].concat(history);
}

function autoTitleFrom(text) {
  return truncateText(String(text || '').replace(/\s+/g, ' ').trim(), 22) || '新对话';
}

async function sendMessage() {
  if (state.streaming) return;
  const text = $('composer').value.trim();
  const pending = state.pendingAttachments.slice();
  if (!text && !pending.length) return;
  if (!state.settings.apiKey) {
    toast('先填 API Key 才能发送', 'bad');
    openSettings();
    return;
  }
  if (pending.some((item) => item.kind === 'image') && !modelSupportsVision(state.settings.model)) {
    toast('批改图片请切换 deepseek-v4-pro', 'bad');
    openSettings();
    return;
  }
  let subject = getCurrentSubject();
  if (!subject) {
    toast('先新建一个学科');
    openSubjectDialog(null);
    return;
  }
  let conversation = getCurrentConversation();
  if (!conversation || conversation.subjectId !== subject.id) {
    conversation = await createConversation(subject.id, { silent: true });
    if (!conversation) return;
  }

  state.chatError = '';
  conversation.skill = state.currentSkill;
  conversation.feynman = state.feynman;
  $('composer').value = '';
  autoGrowComposer();
  const userMessage = normalizeMessage({ role: 'user', content: text });
  conversation.messages.push(userMessage);
  if (pending.length) state.messageAttachments.set(userMessage.id, pending);
  clearPendingAttachments();
  if (conversation.title === '新对话') conversation.title = autoTitleFrom(text || (pending[0] && pending[0].name) || '新对话');
  await persistConversation(conversation).catch((error) => toast('保存失败：' + error.message, 'bad'));
  renderAll();

  const systemPrompt = buildSystemPrompt(subject, state.currentSkill, state.feynman);
  if (state.settings.debug) {
    console.groupCollapsed('[wtfihateexam 调试] system prompt · ' + subject.name + ' · ' + state.currentSkill + (state.feynman ? ' + 费曼' : ''));
    console.log(systemPrompt);
    console.groupEnd();
  }

  const assistantMessage = normalizeMessage({ role: 'assistant', content: '' });
  conversation.messages.push(assistantMessage);
  const controller = new AbortController();
  state.streaming = {
    controller: controller,
    conversationId: conversation.id,
    assistantId: assistantMessage.id,
    subjectId: subject.id
  };
  updateStreamingUI(true);

  const bubble = renderStreamingBubble(assistantMessage);
  const contentNode = bubble ? bubble.querySelector('.msg-content') : null;
  let renderScheduled = false;
  let renderScheduledContent = '';

  function scheduleRender(content) {
    renderScheduledContent = content;
    if (renderScheduled) return;
    renderScheduled = true;
    window.setTimeout(() => {
      renderScheduled = false;
      if (contentNode) {
        contentNode.innerHTML = renderMarkdown(renderScheduledContent) + '<span class="stream-cursor"></span>';
        scrollToBottom(false);
      }
    }, 55);
  }

  try {
    const messages = buildRequestMessages(conversation, systemPrompt);
    // 不把空的 assistant 占位发给模型。
    const requestMessages = messages.filter((message, index) => !(index === messages.length - 1 && message.role === 'assistant' && !message.content));
    await streamChatCompletion(requestMessages, (delta, full) => {
      assistantMessage.content = full;
      scheduleRender(full);
    }, controller.signal);
    assistantMessage.content = String(assistantMessage.content || '').trim();
    if (!assistantMessage.content) throw new Error('AI 没有返回文字。');
    await persistConversation(conversation);
    state.streaming = null;
    updateStreamingUI(false);
    renderAll();
    scrollToBottom(true);
  } catch (error) {
    const aborted = error && (error.name === 'AbortError' || /aborted|中止/i.test(String(error.message || '')));
    state.streaming = null;
    updateStreamingUI(false);
    if (aborted) {
      assistantMessage.stopped = true;
      if (!assistantMessage.content.trim()) {
        conversation.messages = conversation.messages.filter((message) => message.id !== assistantMessage.id);
      }
      await persistConversation(conversation).catch(() => {});
      renderAll();
      toast('已停止生成');
    } else {
      conversation.messages = conversation.messages.filter((message) => message.id !== assistantMessage.id);
      state.chatError = error && error.message ? error.message : String(error);
      await persistConversation(conversation).catch(() => {});
      renderAll();
      toast('请求失败，详情见对话区', 'bad');
      console.error('[wtfihateexam]', error);
    }
  } finally {
    if (state.streaming && state.streaming.controller === controller) state.streaming = null;
    updateStreamingUI(false);
    $('composer').focus();
  }
}

function renderStreamingBubble(assistantMessage) {
  // 先把用户消息和空的 assistant 气泡画出来；空内容用打字点占位。
  renderAll();
  const selector = '.msg[data-message-id="' + cssEscape(assistantMessage.id) + '"]';
  let node = document.querySelector(selector);
  if (!node) {
    const wrap = $('messages');
    node = el('div', 'msg assistant');
    node.dataset.messageId = assistantMessage.id;
    node.appendChild(el('div', 'msg-avatar', 'AI'));
    const main = el('div', 'msg-main');
    const head = el('div', 'msg-head');
    head.append(el('span', 'msg-role', '助教'), el('span', 'msg-time', formatTime(assistantMessage.createdAt)));
    main.appendChild(head);
    const content = el('div', 'msg-content');
    content.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
    main.appendChild(content);
    node.appendChild(main);
    wrap.appendChild(node);
  }
  const content = node.querySelector('.msg-content');
  if (content) content.innerHTML = '<span class="typing"><i></i><i></i><i></i></span>';
  scrollToBottom(true);
  return node;
}

function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
  return String(value).replace(/["\\]/g, '\\$&');
}

function stopStreaming() {
  if (!state.streaming) return;
  state.streaming.controller.abort();
  $('stopBtn').disabled = true;
}

/* --------------------------------------------------------------------------
   记忆库渲染
   -------------------------------------------------------------------------- */
function openMemory() {
  if (!getCurrentSubject()) { toast('先选一个学科'); return; }
  state.view = 'memory';
  $('chatView').hidden = true;
  $('memoryView').hidden = false;
  renderMemory();
}

function closeMemory() {
  state.view = 'chat';
  $('memoryView').hidden = true;
  $('chatView').hidden = false;
  renderAll();
}

function setMemoryTab(tab) {
  state.memoryTab = tab;
  document.querySelectorAll('.memory-tab').forEach((button) => {
    const active = button.dataset.tab === tab;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  renderMemory();
}

function renderMemory() {
  const subject = getCurrentSubject();
  if (!subject) return;
  $('questionTabCount').textContent = String(subject.questions.length);
  $('ledgerTabCount').textContent = String(subject.ledger.length);
  $('queueTabCount').textContent = String(subject.queue.length);
  $('memorySubjectBadge').textContent = subject.name;
  const body = $('memoryBody');
  body.textContent = '';
  if (state.memoryTab === 'ledger') renderLedger(body, subject);
  else if (state.memoryTab === 'queue') renderQueue(body, subject);
  else renderQuestions(body, subject);
}

function renderQuestions(body, subject) {
  const inner = el('div', 'memory-inner');
  const toolbar = el('div', 'memory-toolbar');
  const titleWrap = el('div');
  titleWrap.append(el('h2', '', '错题本'), el('p', '', '题号 · 错因 · 对策 · 状态。AI 在批改时输出的错题卡，需要你点“收录”才会进来。'));
  const add = el('button', 'primary-btn small', '＋ 手动添加');
  add.type = 'button';
  add.addEventListener('click', () => openQuestionDialog(null));
  toolbar.append(titleWrap, add);
  inner.appendChild(toolbar);

  if (!subject.questions.length) {
    const empty = el('div', 'empty-panel');
    empty.append(el('span', 'empty-mark', '∅'), el('strong', '', '错题本还是空的'), el('p', '', '一次批改对话结束后，点“结束并写回”，或在聊天里点错题卡上的“收录”。'));
    const cta = el('button', 'ghost-btn', '回到对话');
    cta.type = 'button';
    cta.addEventListener('click', closeMemory);
    empty.appendChild(cta);
    inner.appendChild(empty);
  } else {
    const card = el('div', 'data-card');
    const table = el('table', 'data-table');
    const thead = el('thead');
    const hr = el('tr');
    ['题号', '错因', '对策', '状态', '操作'].forEach((label) => hr.appendChild(el('th', '', label)));
    thead.appendChild(hr);
    const tbody = el('tbody');
    subject.questions.slice().reverse().forEach((question) => {
      const tr = el('tr');
      tr.appendChild(el('td', 'num', question.number));
      tr.appendChild(el('td', '', question.reason || '—'));
      tr.appendChild(el('td', '', question.strategy || '—'));
      const statusTd = el('td');
      const pill = el('button', 'status-pill ' + questionStatusClass(question.status), question.status);
      pill.type = 'button';
      pill.title = '点一下推进状态';
      pill.addEventListener('click', () => cycleQuestionStatus(subject, question));
      statusTd.appendChild(pill);
      tr.appendChild(statusTd);
      const actions = el('td', 'actions');
      const edit = el('button', '', '编辑');
      edit.type = 'button';
      edit.addEventListener('click', () => openQuestionDialog(question));
      const del = el('button', 'danger', '删除');
      del.type = 'button';
      del.addEventListener('click', () => deleteQuestion(subject, question));
      actions.append(edit, del);
      tr.appendChild(actions);
      tbody.appendChild(tr);
    });
    table.append(thead, tbody);
    card.appendChild(table);
    inner.appendChild(card);
  }

  const note = el('div', 'memory-note');
  note.append(el('strong', '', '状态怎么用：'), document.createTextNode('待复习 → 复习中 → 已掌握。点状态胶囊就能推进；已掌握的题不会再进入 system 的待复习摘要。'));
  inner.appendChild(note);
  body.appendChild(inner);
}

function questionStatusClass(status) {
  if (status === '已掌握') return 'done';
  if (status === '复习中') return 'doing';
  return 'todo';
}

function renderLedger(body, subject) {
  const inner = el('div', 'memory-inner');
  const toolbar = el('div', 'memory-toolbar');
  const titleWrap = el('div');
  titleWrap.append(el('h2', '', '失分总账'), el('p', '', '按模块记账。数字来自关账确认或手动添加，失分率 = 失分 / 满分。'));
  const add = el('button', 'primary-btn small', '＋ 添加模块');
  add.type = 'button';
  add.addEventListener('click', () => openLedgerDialog(null));
  toolbar.append(titleWrap, add);
  inner.appendChild(toolbar);

  const totalLost = subject.ledger.reduce((sum, row) => sum + Number(row.lost || 0), 0);
  const totalFull = subject.ledger.reduce((sum, row) => sum + Number(row.total || 0), 0);
  const rate = totalFull > 0 ? totalLost / totalFull : 0;
  const openQuestions = subject.questions.filter((question) => question.status !== '已掌握').length;

  const stats = el('div', 'stats-grid');
  const cards = [
    ['总失分', formatNumber(totalLost), ''],
    ['总满分', formatNumber(totalFull), ''],
    ['失分率', totalFull > 0 ? (rate * 100).toFixed(1) + '%' : '—', 'accent'],
    ['待复习错题', String(openQuestions), '']
  ];
  cards.forEach((item) => {
    const card = el('div', 'stat-card ' + item[2]);
    const value = el('b', '', item[1]);
    card.append(el('span', '', item[0]), value);
    stats.appendChild(card);
  });
  inner.appendChild(stats);

  if (!subject.ledger.length) {
    const empty = el('div', 'empty-panel');
    empty.append(el('span', 'empty-mark', '0'), el('strong', '', '总账还没有数字'), el('p', '', '完成一次批改后点“结束并写回”，AI 会把失分按模块汇总成提案，你确认后才入账。'));
    inner.appendChild(empty);
  } else {
    const card = el('div', 'data-card');
    const table = el('table', 'data-table');
    const thead = el('thead');
    const hr = el('tr');
    ['模块', '失分 / 满分', '失分率', '备注', '操作'].forEach((label) => hr.appendChild(el('th', '', label)));
    thead.appendChild(hr);
    const tbody = el('tbody');
    subject.ledger.slice().sort((a, b) => b.lost - a.lost).forEach((row) => {
      const tr = el('tr');
      tr.appendChild(el('td', '', row.module));
      const score = el('td', 'num', formatNumber(row.lost) + ' / ' + formatNumber(row.total));
      tr.appendChild(score);
      const rowRate = row.total > 0 ? clamp(row.lost / row.total, 0, 1) : 0;
      const progressTd = el('td', 'progress-cell');
      progressTd.appendChild(el('span', 'ledger-math', row.total > 0 ? (rowRate * 100).toFixed(1) + '%' : '—'));
      const track = el('div', 'progress-track');
      const fill = el('div', 'progress-fill' + (rowRate <= 0.2 ? ' low' : ''));
      fill.style.width = (rowRate * 100).toFixed(1) + '%';
      track.appendChild(fill);
      progressTd.appendChild(track);
      tr.appendChild(progressTd);
      tr.appendChild(el('td', '', row.note || '—'));
      const actions = el('td', 'actions');
      const edit = el('button', '', '编辑');
      edit.type = 'button';
      edit.addEventListener('click', () => openLedgerDialog(row));
      const del = el('button', 'danger', '删除');
      del.type = 'button';
      del.addEventListener('click', () => deleteLedgerRow(subject, row));
      actions.append(edit, del);
      tr.appendChild(actions);
      tbody.appendChild(tr);
    });
    table.append(thead, tbody);
    card.appendChild(table);
    inner.appendChild(card);
  }

  const note = el('div', 'memory-note');
  note.append(el('strong', '', '注意：'), document.createTextNode('总账是“模块级”的账，不是单题分数。关账时 AI 给的是提案，只有你勾选的模块才会覆盖或新增。'));
  inner.appendChild(note);
  body.appendChild(inner);
}

function formatNumber(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0';
  return Number.isInteger(number) ? String(number) : String(Math.round(number * 10) / 10);
}

function renderQueue(body, subject) {
  const inner = el('div', 'memory-inner');
  const toolbar = el('div', 'memory-toolbar');
  const titleWrap = el('div');
  titleWrap.append(el('h2', '', '考察清单'), el('p', '', '还没解决的事，先记下来。关账时 AI 可以从对话里提取“队列更新”，你确认后写入。'));
  toolbar.appendChild(titleWrap);
  inner.appendChild(toolbar);

  if (!subject.queue.length) {
    const empty = el('div', 'empty-panel');
    empty.append(el('span', 'empty-mark', '…'), el('strong', '', '暂时没有待办'), el('p', '', '清单不是待办软件，只收和提分直接相关的事：重做哪道题、补哪个定理、找老师问什么。'));
    inner.appendChild(empty);
  } else {
    const card = el('div', 'data-card');
    const list = el('div', 'queue-list');
    subject.queue.forEach((item) => {
      const row = el('div', 'queue-item');
      const text = el('span', '', item.item);
      const pill = el('button', 'status-pill ' + queueStatusClass(item.status), item.status);
      pill.type = 'button';
      pill.title = '点一下切换状态';
      pill.addEventListener('click', () => cycleQueueStatus(subject, item));
      row.append(text, pill, el('time', '', formatDate(item.createdAt)));
      list.appendChild(row);
    });
    card.appendChild(list);
    inner.appendChild(card);
  }

  const note = el('div', 'memory-note');
  note.append(el('strong', '', '和错题本的区别：'), document.createTextNode('错题本是“错过什么”，考察清单是“接下来做什么”。两者都会进入 system 的参考摘要。'));
  inner.appendChild(note);
  body.appendChild(inner);
}

function queueStatusClass(status) {
  if (status === '已办') return 'done';
  if (status === '进行中') return 'doing';
  return 'pending';
}

async function cycleQuestionStatus(subject, question) {
  const index = STATUS_OPTIONS.indexOf(question.status);
  question.status = STATUS_OPTIONS[(index + 1) % STATUS_OPTIONS.length];
  await persistSubject(subject);
  renderMemory();
  renderTree();
  toast('状态改为“' + question.status + '”');
}

async function cycleQueueStatus(subject, item) {
  const index = QUEUE_STATUS_OPTIONS.indexOf(item.status);
  item.status = QUEUE_STATUS_OPTIONS[(index + 1) % QUEUE_STATUS_OPTIONS.length];
  await persistSubject(subject);
  renderMemory();
  toast('状态改为“' + item.status + '”');
}

/* --------------------------------------------------------------------------
   学科 CRUD
   -------------------------------------------------------------------------- */
function openSubjectDialog(subject) {
  state.editingSubjectId = subject ? subject.id : null;
  $('subjectDialogTitle').textContent = subject ? '编辑学科' : '新建学科';
  $('subjectNameInput').value = subject ? subject.name : '';
  $('subjectRulesInput').value = subject ? subject.rules : '';
  openDialog('subjectDialog');
  window.setTimeout(() => $('subjectNameInput').focus(), 50);
}

async function saveSubject(event) {
  event.preventDefault();
  const name = $('subjectNameInput').value.trim();
  const rules = $('subjectRulesInput').value;
  if (!name) { toast('学科名不能为空', 'bad'); return; }
  if (name.length > 30) { toast('学科名最多 30 个字', 'bad'); return; }

  if (state.editingSubjectId) {
    const subject = getSubject(state.editingSubjectId);
    if (!subject) { closeDialog('subjectDialog'); return; }
    subject.name = name;
    subject.rules = rules;
    await persistSubject(subject);
    closeDialog('subjectDialog');
    renderAll();
    toast('学科已保存');
  } else {
    const subject = makeSubject(name, rules);
    state.subjects.push(subject);
    await persistSubject(subject);
    state.currentSubjectId = subject.id;
    state.expanded.add(subject.id);
    state.currentConversationId = null;
    state.currentSkill = '批改';
    state.feynman = false;
    saveMode(subject.id, '批改', false);
    lsSet('lastSubjectId', subject.id);
    lsRemove('lastConversationId');
    closeDialog('subjectDialog');
    renderAll();
    toast('学科已创建：' + name);
  }
}

async function deleteSubject(subjectId) {
  if (guardStreaming()) return;
  const subject = getSubject(subjectId);
  if (!subject) return;
  const conversations = conversationsFor(subjectId);
  const ok = await confirmAction({
    title: '删除“' + subject.name + '”？',
    text: '会同时删除 ' + conversations.length + ' 个对话、' + subject.questions.length + ' 道错题、' + subject.ledger.length + ' 个总账模块和 ' + subject.queue.length + ' 条考察清单。此操作不可撤销。',
    okLabel: '删除整个学科'
  });
  if (!ok) return;
  await store.delete('subjects', subjectId);
  for (const conversation of conversations) {
    clearMessageAttachmentsForConversation(conversation);
    await store.delete('conversations', conversation.id).catch(() => {});
  }
  clearPendingAttachments();
  state.subjects = state.subjects.filter((item) => item.id !== subjectId);
  state.conversations = state.conversations.filter((item) => item.subjectId !== subjectId);
  state.expanded.delete(subjectId);
  lsRemove('mode.' + subjectId);
  if (state.currentSubjectId === subjectId) {
    const next = state.subjects[0] || null;
    state.currentSubjectId = next ? next.id : null;
    state.currentConversationId = next ? (recentConversationFor(next.id) || {}).id || null : null;
    if (next) {
      const mode = loadMode(next.id);
      state.currentSkill = mode.skill;
      state.feynman = mode.feynman;
      lsSet('lastSubjectId', next.id);
      if (state.currentConversationId) lsSet('lastConversationId', state.currentConversationId);
      else lsRemove('lastConversationId');
    } else {
      lsRemove('lastSubjectId');
      lsRemove('lastConversationId');
    }
  }
  closeDialog('subjectDialog');
  renderAll();
  toast('学科已删除');
}

/* --------------------------------------------------------------------------
   错题 CRUD
   -------------------------------------------------------------------------- */
function openQuestionDialog(question) {
  const subject = getCurrentSubject();
  if (!subject) { toast('先选一个学科'); return; }
  state.editingQuestionId = question ? question.id : null;
  $('questionDialogTitle').textContent = question ? '编辑错题' : '添加错题';
  $('questionNumberInput').value = question ? question.number : '';
  $('questionReasonInput').value = question ? question.reason : '';
  $('questionStrategyInput').value = question ? question.strategy : '';
  $('questionStatusInput').value = question ? question.status : '待复习';
  openDialog('questionDialog');
  window.setTimeout(() => $('questionNumberInput').focus(), 50);
}

async function saveQuestion(event) {
  event.preventDefault();
  const subject = getCurrentSubject();
  if (!subject) { toast('先选一个学科'); return; }
  const number = $('questionNumberInput').value.trim();
  if (!number) { toast('题号不能为空', 'bad'); return; }
  const data = {
    number: number,
    reason: $('questionReasonInput').value.trim(),
    strategy: $('questionStrategyInput').value.trim(),
    status: $('questionStatusInput').value
  };
  if (state.editingQuestionId) {
    const question = subject.questions.find((item) => item.id === state.editingQuestionId);
    if (!question) { closeDialog('questionDialog'); return; }
    Object.assign(question, data);
  } else {
    subject.questions.push(normalizeQuestion(Object.assign({ source: '手动记录' }, data)));
  }
  await persistSubject(subject);
  closeDialog('questionDialog');
  renderMemory();
  renderTree();
  toast('错题已保存');
}

async function deleteQuestion(subject, question) {
  const ok = await confirmAction({
    title: '删除这道错题？',
    text: question.number + '｜' + (question.reason || '未填错因'),
    okLabel: '删除'
  });
  if (!ok) return;
  subject.questions = subject.questions.filter((item) => item.id !== question.id);
  await persistSubject(subject);
  renderMemory();
  renderTree();
  toast('错题已删除');
}

async function addCapturedQuestions(cards) {
  const subject = getCurrentSubject();
  if (!subject) return;
  let added = 0;
  cards.forEach((card) => {
    const exists = subject.questions.some((item) => item.number === card.number && item.reason === card.reason);
    if (!exists) {
      subject.questions.push(normalizeQuestion(Object.assign({}, card, { source: 'AI 批改', status: card.status || '待复习' })));
      added += 1;
    }
  });
  await persistSubject(subject);
  renderTree();
  if (state.view === 'memory') renderMemory();
  toast(added ? '已收录 ' + added + ' 道错题' : '这些错题已经在错题本里了', added ? 'good' : '');
}

function openCaptureDialog(card) {
  const subject = getCurrentSubject();
  if (!subject) { toast('先选一个学科'); return; }
  state.pendingCapture = { subjectId: subject.id, cards: [normalizeQuestion(card)] };
  const body = $('captureBody');
  body.textContent = '';
  const preview = el('div', 'capture-preview');
  preview.append(el('b', '', card.number), document.createElement('br'), document.createTextNode('错因：' + (card.reason || '未填')), document.createElement('br'), document.createTextNode('对策：' + (card.strategy || '未填')));
  body.appendChild(preview);
  openDialog('captureDialog');
}

async function confirmCapture() {
  if (!state.pendingCapture) return;
  const subject = getSubject(state.pendingCapture.subjectId);
  if (subject) {
    const cards = state.pendingCapture.cards;
    let added = 0;
    cards.forEach((card) => {
      if (!subject.questions.some((item) => item.number === card.number && item.reason === card.reason)) {
        subject.questions.push(normalizeQuestion(Object.assign({}, card, { source: 'AI 批改' })));
        added += 1;
      }
    });
    await persistSubject(subject);
    renderTree();
    if (state.view === 'memory') renderMemory();
    toast(added ? '已写入错题本' : '这道题已经在错题本里了', added ? 'good' : '');
  }
  state.pendingCapture = null;
  closeDialog('captureDialog');
}

/* --------------------------------------------------------------------------
   总账 CRUD
   -------------------------------------------------------------------------- */
function openLedgerDialog(row) {
  const subject = getCurrentSubject();
  if (!subject) { toast('先选一个学科'); return; }
  state.editingLedgerId = row ? row.id : null;
  $('ledgerDialogTitle').textContent = row ? '编辑总账模块' : '添加总账模块';
  $('ledgerModuleInput').value = row ? row.module : '';
  $('ledgerLostInput').value = row ? row.lost : 0;
  $('ledgerTotalInput').value = row ? row.total : 0;
  $('ledgerNoteInput').value = row ? row.note : '';
  openDialog('ledgerDialog');
  window.setTimeout(() => $('ledgerModuleInput').focus(), 50);
}

async function saveLedgerRow(event) {
  event.preventDefault();
  const subject = getCurrentSubject();
  if (!subject) return;
  const moduleName = $('ledgerModuleInput').value.trim();
  const lost = Number($('ledgerLostInput').value);
  const total = Number($('ledgerTotalInput').value);
  if (!moduleName) { toast('模块名不能为空', 'bad'); return; }
  if (!Number.isFinite(lost) || lost < 0 || !Number.isFinite(total) || total < 0) { toast('失分和满分必须是非负数', 'bad'); return; }
  if (total > 0 && lost > total) { toast('失分不能大于满分', 'bad'); return; }

  if (state.editingLedgerId) {
    const row = subject.ledger.find((item) => item.id === state.editingLedgerId);
    if (!row) { closeDialog('ledgerDialog'); return; }
    row.module = moduleName;
    row.lost = lost;
    row.total = total;
    row.note = $('ledgerNoteInput').value.trim();
    row.updatedAt = nowIso();
  } else {
    const existing = subject.ledger.find((item) => item.module === moduleName);
    if (existing) {
      existing.lost = lost;
      existing.total = total;
      existing.note = $('ledgerNoteInput').value.trim();
      existing.updatedAt = nowIso();
      toast('同名模块已存在，已更新该行');
    } else {
      subject.ledger.push(normalizeLedgerRow({ module: moduleName, lost: lost, total: total, note: $('ledgerNoteInput').value.trim() }));
    }
  }
  await persistSubject(subject);
  closeDialog('ledgerDialog');
  renderMemory();
  renderTree();
  toast('总账已保存');
}

async function deleteLedgerRow(subject, row) {
  const ok = await confirmAction({
    title: '删除这个总账模块？',
    text: row.module + '：失分 ' + formatNumber(row.lost) + ' / 满分 ' + formatNumber(row.total),
    okLabel: '删除'
  });
  if (!ok) return;
  subject.ledger = subject.ledger.filter((item) => item.id !== row.id);
  await persistSubject(subject);
  renderMemory();
  renderTree();
  toast('总账行已删除');
}

/* --------------------------------------------------------------------------
   关账：对话 → JSON 提案 → 逐项确认 → 写回
   -------------------------------------------------------------------------- */
function buildTranscript(conversation) {
  const messages = conversation.messages
    .filter((message) => String(message.content || '').trim())
    .slice(-40);
  let total = 0;
  const lines = [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    const role = message.role === 'user' ? '我' : '助教';
    let content = message.content.replace(/【错题卡】\s*\{.*\}/g, '').trim();
    content = truncateText(content, 5000);
    const line = role + '：\n' + content;
    if (total + line.length > 26000) break;
    lines.unshift(line);
    total += line.length;
  }
  return lines.join('\n\n');
}

function buildClosePrompt(subject, conversation) {
  const ledger = subject.ledger.map((row) => ({ 模块: row.module, 失分: row.lost, 满分: row.total, 备注: row.note }));
  const questions = subject.questions.map((question) => ({ 题号: question.number, 错因: question.reason, 对策: question.strategy, 状态: question.status }));
  const queue = subject.queue.map((item) => ({ 事项: item.item, 状态: item.status }));
  const system = `你是学习数据整理助手。你的任务是把一次辅导对话压缩成严格 JSON，供用户逐项确认后写回本地数据库。
只输出一个 JSON 对象，不要输出解释、Markdown 代码块或任何多余文字。JSON 结构必须是：
{
  "错题新增": [{"题号": "字符串", "错因": "字符串", "对策": "字符串", "状态": "待复习|复习中|已掌握"}],
  "总账更新": [{"模块": "字符串", "失分": 数字, "满分": 数字, "备注": "字符串"}],
  "队列更新": [{"事项": "字符串", "状态": "待办|进行中|已办"}]
}
规则：
1. 只提取对话中确实出现、且有依据的内容；不要编造分数、题号或模块。
2. 错题新增只收真实做错或明确暴露知识空缺的题；已经存在的同一道题不要重复添加。
3. 总账更新给“模块级”的当前累计值，不是单题分数；如果对话没有给出可靠数字，就不要写总账。
4. 队列更新只收接下来要做的具体动作，不要写空泛口号。
5. 某一类没有内容就给空数组 []，不要省略键。
6. 所有字符串使用中文，简明、可执行。`;
  const user = `当前学科：${subject.name}
当前日期：${formatDate(nowIso())}

【已有错题本】
${JSON.stringify(questions, null, 2)}

【已有失分总账】
${JSON.stringify(ledger, null, 2)}

【已有考察清单】
${JSON.stringify(queue, null, 2)}

【本次对话】
${buildTranscript(conversation)}`;
  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ];
}

function extractJsonObject(text) {
  let value = String(text || '').trim();
  value = value.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const start = value.indexOf('{');
  const end = value.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI 没有返回 JSON 对象。');
  const sliced = value.slice(start, end + 1);
  try { return JSON.parse(sliced); } catch (error) {
    throw new Error('AI 返回的 JSON 无法解析：' + error.message);
  }
}

function normalizeProposal(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const questionsRaw = source['错题新增'] || source.questions || [];
  const ledgerRaw = source['总账更新'] || source.ledger || [];
  const queueRaw = source['队列更新'] || source.queue || [];
  return {
    questions: Array.isArray(questionsRaw) ? questionsRaw.map(normalizeQuestion) : [],
    ledger: Array.isArray(ledgerRaw) ? ledgerRaw.map(normalizeLedgerRow) : [],
    queue: Array.isArray(queueRaw) ? queueRaw.map(normalizeQueueItem) : []
  };
}

async function startCloseFlow() {
  if (state.streaming) { toast('先等回复结束或点停止'); return; }
  const subject = getCurrentSubject();
  const conversation = getCurrentConversation();
  if (!subject || !conversation) { toast('先有一个对话'); return; }
  if (!state.settings.apiKey) { toast('先填 API Key', 'bad'); openSettings(); return; }
  if (!conversation.messages.some((message) => message.role === 'assistant' && message.content.trim())) {
    toast('对话还没有 AI 回复，暂时没有可写回的内容');
    return;
  }

  state.reviewProposal = null;
  $('reviewContent').textContent = '';
  const loading = el('div', 'review-loading');
  loading.style.padding = '22px';
  loading.style.textAlign = 'center';
  loading.style.color = '#6f7a73';
  loading.style.fontSize = '12px';
  loading.innerHTML = '<span class="typing"><i></i><i></i><i></i></span><div style="margin-top:8px">正在让 AI 把这次对话压缩成提案…</div>';
  $('reviewContent').appendChild(loading);
  $('reviewWarning').hidden = true;
  $('reviewConfirmBtn').disabled = true;
  $('reviewCancelBtn').textContent = '取消，仅保存对话';
  openDialog('reviewDialog');

  const controller = new AbortController();
  state.reviewAbort = controller;
  try {
    const responseText = await callChatOnce(buildClosePrompt(subject, conversation), {
      signal: controller.signal,
      temperature: 0.2,
      maxTokens: 2200
    });
    if (!$('reviewDialog').open) return;
    const proposal = normalizeProposal(extractJsonObject(responseText));
    state.reviewProposal = proposal;
    renderReviewProposal(proposal);
  } catch (error) {
    if (!$('reviewDialog').open) return;
    if (error && error.name === 'AbortError') return;
    console.error('[wtfihateexam] 关账失败', error);
    $('reviewContent').textContent = '';
    const box = el('div', 'msg-error');
    box.append(el('strong', '', '整理失败'), document.createTextNode(error.message || String(error)));
    $('reviewContent').appendChild(box);
    const retry = el('button', 'ghost-btn', '重试');
    retry.type = 'button';
    retry.style.marginTop = '12px';
    retry.addEventListener('click', () => { closeDialog('reviewDialog'); window.setTimeout(startCloseFlow, 100); });
    $('reviewContent').appendChild(retry);
    $('reviewWarning').hidden = false;
    $('reviewWarning').textContent = '这次没有写回任何内容。你可以重试，或取消后只保留对话。';
  } finally {
    if (state.reviewAbort === controller) state.reviewAbort = null;
  }
}

function renderReviewProposal(proposal) {
  const content = $('reviewContent');
  content.textContent = '';
  const groups = [
    { key: 'questions', title: '错题新增', count: proposal.questions.length, render: renderReviewQuestion },
    { key: 'ledger', title: '总账更新', count: proposal.ledger.length, render: renderReviewLedger },
    { key: 'queue', title: '队列更新', count: proposal.queue.length, render: renderReviewQueue }
  ];
  let total = 0;
  groups.forEach((group) => {
    const section = el('div', 'review-group');
    const head = el('div', 'review-group-head');
    head.append(el('strong', '', group.title), el('span', '', group.count + ' 条'));
    section.appendChild(head);
    const items = el('div', 'review-items');
    if (!group.count) {
      items.appendChild(el('div', 'review-item-empty', '没有需要写回的条目'));
    } else {
      proposal[group.key].forEach((item, index) => {
        total += 1;
        items.appendChild(group.render(item, index));
      });
    }
    section.appendChild(items);
    content.appendChild(section);
  });

  $('reviewWarning').hidden = total > 0;
  if (!total) $('reviewWarning').textContent = '这次没有可写回的条目。你可以取消，仅保存对话。';
  $('reviewConfirmBtn').disabled = total === 0;
  $('reviewConfirmBtn').textContent = total ? '确认写入 ' + total + ' 条' : '没有可写入内容';
}

function reviewItemCheckbox(group, index) {
  const label = el('label', 'review-item');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = true;
  input.dataset.group = group;
  input.dataset.index = String(index);
  const text = el('div', 'review-item-text');
  label.append(input, text);
  return { label: label, text: text };
}

function renderReviewQuestion(item, index) {
  const parts = reviewItemCheckbox('questions', index);
  parts.text.append(el('b', '', item.number + ' · ' + (item.status || '待复习')));
  const reason = el('span', '', '错因：' + (item.reason || '未填'));
  const strategy = el('span', '', '　对策：' + (item.strategy || '未填'));
  parts.text.append(reason, strategy);
  return parts.label;
}

function renderReviewLedger(item, index) {
  const parts = reviewItemCheckbox('ledger', index);
  parts.text.append(el('b', '', item.module), el('span', '', '失分 ' + formatNumber(item.lost) + ' / 满分 ' + formatNumber(item.total) + (item.note ? '　备注：' + item.note : '')));
  return parts.label;
}

function renderReviewQueue(item, index) {
  const parts = reviewItemCheckbox('queue', index);
  parts.text.append(el('b', '', item.item), el('span', '', '状态：' + item.status));
  return parts.label;
}

async function applyReviewProposal() {
  if (!state.reviewProposal) return;
  const subject = getCurrentSubject();
  const conversation = getCurrentConversation();
  if (!subject || !conversation) { closeDialog('reviewDialog'); return; }
  const proposal = state.reviewProposal;
  const checked = document.querySelectorAll('#reviewContent input[type="checkbox"]:checked');
  const selected = { questions: [], ledger: [], queue: [] };
  checked.forEach((input) => {
    const group = input.dataset.group;
    const index = Number(input.dataset.index);
    if (selected[group] && proposal[group] && proposal[group][index]) selected[group].push(proposal[group][index]);
  });

  let addedQuestions = 0;
  let updatedLedger = 0;
  let updatedQueue = 0;

  selected.questions.forEach((item) => {
    const exists = subject.questions.some((question) => question.number === item.number && question.reason === item.reason);
    if (!exists) {
      subject.questions.push(normalizeQuestion(Object.assign({}, item, { source: 'AI 关账' })));
      addedQuestions += 1;
    }
  });

  selected.ledger.forEach((item) => {
    const existing = subject.ledger.find((row) => row.module === item.module);
    if (existing) {
      existing.lost = item.lost;
      existing.total = item.total;
      existing.note = item.note || existing.note;
      existing.updatedAt = nowIso();
    } else {
      subject.ledger.push(normalizeLedgerRow(item));
    }
    updatedLedger += 1;
  });

  selected.queue.forEach((item) => {
    const existing = subject.queue.find((row) => row.item === item.item);
    if (existing) {
      existing.status = item.status;
    } else {
      subject.queue.push(normalizeQueueItem(item));
    }
    updatedQueue += 1;
  });

  subject.updatedAt = nowIso();
  conversation.closedAt = nowIso();
  await store.put('subjects', subject);
  await persistConversation(conversation);
  state.reviewProposal = null;
  closeDialog('reviewDialog');
  renderAll();
  if (state.view === 'memory') renderMemory();
  const parts = [];
  if (addedQuestions) parts.push(addedQuestions + ' 道错题');
  if (updatedLedger) parts.push(updatedLedger + ' 个总账模块');
  if (updatedQueue) parts.push(updatedQueue + ' 条清单');
  toast(parts.length ? '已写回：' + parts.join('、') : '没有勾选任何条目', parts.length ? 'good' : '');
}

/* --------------------------------------------------------------------------
   设置与连接测试
   -------------------------------------------------------------------------- */
function openSettings() {
  $('baseUrlInput').value = state.settings.baseUrl || DEFAULT_SETTINGS.baseUrl;
  $('modelInput').value = state.settings.model || DEFAULT_SETTINGS.model;
  $('apiKeyInput').value = state.settings.apiKey || '';
  $('apiKeyInput').type = 'password';
  $('revealKeyBtn').textContent = '显示';
  $('debugInput').checked = !!state.settings.debug;
  $('connectionResult').textContent = '';
  $('connectionResult').className = 'connection-result';
  openDialog('settingsDialog');
}

async function saveSettings(event) {
  event.preventDefault();
  const baseUrl = $('baseUrlInput').value.trim().replace(/\/+$/, '');
  const model = $('modelInput').value.trim();
  const apiKey = $('apiKeyInput').value.trim();
  if (!/^https?:\/\//i.test(baseUrl)) { toast('base_url 必须以 http:// 或 https:// 开头', 'bad'); return; }
  if (!model) { toast('模型名不能为空', 'bad'); return; }
  state.settings = { baseUrl: baseUrl, model: model, apiKey: apiKey, debug: $('debugInput').checked };
  persistSettings(state.settings);
  closeDialog('settingsDialog');
  renderHeader();
  renderAll();
  renderPendingAttachments();
  toast(apiKey ? '设置已保存，key 只在你的浏览器里' : '设置已保存；还没有 key', apiKey ? 'good' : '');
}

async function testConnection() {
  const baseUrl = $('baseUrlInput').value.trim().replace(/\/+$/, '');
  const apiKey = $('apiKeyInput').value.trim();
  const result = $('connectionResult');
  if (!/^https?:\/\//i.test(baseUrl)) { result.className = 'connection-result bad'; result.textContent = 'base_url 格式不对'; return; }
  if (!apiKey) { result.className = 'connection-result bad'; result.textContent = '先填 key 再测试'; return; }
  result.className = 'connection-result';
  result.textContent = '连接中…';
  const button = $('testConnectionBtn');
  button.disabled = true;
  try {
    const response = await fetch(resolveApiUrl(baseUrl, '/models'), {
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Accept': 'application/json' }
    });
    const text = await response.text();
    if (!response.ok) {
      result.className = 'connection-result bad';
      result.textContent = parseApiError(response.status, text);
      return;
    }
    const data = safeJsonParse(text, {});
    const count = Array.isArray(data.data) ? data.data.length : 0;
    result.className = 'connection-result ok';
    result.textContent = '连接成功，看到 ' + count + ' 个模型';
  } catch (error) {
    result.className = 'connection-result bad';
    result.textContent = '连接失败：' + (error.message || error) + '（可能是 CORS、网络或地址错误）';
  } finally {
    button.disabled = false;
  }
}

/* --------------------------------------------------------------------------
   导出 / 导入
   -------------------------------------------------------------------------- */
function buildExportPayload() {
  const subjects = state.subjects.map((subject) => ({
    id: subject.id,
    name: subject.name,
    rules: subject.rules,
    questions: subject.questions.map((question) => ({
      id: question.id,
      number: question.number,
      reason: question.reason,
      strategy: question.strategy,
      status: question.status,
      source: question.source,
      createdAt: question.createdAt
    })),
    ledger: subject.ledger.map((row) => ({
      id: row.id,
      module: row.module,
      lost: row.lost,
      total: row.total,
      note: row.note,
      updatedAt: row.updatedAt
    })),
    queue: subject.queue.map((item) => ({
      id: item.id,
      item: item.item,
      status: item.status,
      createdAt: item.createdAt
    })),
    createdAt: subject.createdAt,
    updatedAt: subject.updatedAt
  }));
  const conversations = state.conversations.map(serializeConversation);
  return {
    format: EXPORT_FORMAT,
    version: APP_VERSION,
    exportedAt: nowIso(),
    note: '此文件不包含 API key。导入后请在设置里重新填写 key。',
    subjects: subjects,
    conversations: conversations
  };
}

function exportWorkspace() {
  try {
    const payload = buildExportPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'wtfihateexam-workspace-' + fileStamp() + '.json';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('已导出 JSON（不含 key）', 'good');
  } catch (error) {
    toast('导出失败：' + error.message, 'bad');
  }
}

function validateImportPayload(data) {
  if (!data || typeof data !== 'object') throw new Error('不是有效的 JSON 对象。');
  if (data.format !== EXPORT_FORMAT) throw new Error('不是 wtfihateexam 工作区备份（format 不匹配）。');
  if (!Array.isArray(data.subjects) || !Array.isArray(data.conversations)) throw new Error('备份缺少 subjects 或 conversations 数组。');
  if (data.subjects.length > 200) throw new Error('学科数量异常，已拒绝导入。');
  const subjects = data.subjects.map(normalizeSubject);
  const subjectIds = new Set(subjects.map((subject) => subject.id));
  if (subjectIds.size !== subjects.length) throw new Error('备份中存在重复的学科 ID。');
  const conversations = data.conversations
    .map(normalizeConversation)
    .filter((conversation) => subjectIds.has(conversation.subjectId));
  return { subjects: subjects, conversations: conversations };
}

async function importWorkspaceFromFile(file) {
  if (!file) return;
  if (file.size > 25 * 1024 * 1024) { toast('备份文件超过 25MB，已拒绝导入', 'bad'); return; }
  let text;
  try { text = await file.text(); } catch (error) { toast('读取文件失败：' + error.message, 'bad'); return; }
  let data;
  try { data = JSON.parse(text); } catch (error) { toast('JSON 解析失败：' + error.message, 'bad'); return; }
  let parsed;
  try { parsed = validateImportPayload(data); } catch (error) { toast(error.message, 'bad'); return; }

  const questionCount = parsed.subjects.reduce((sum, subject) => sum + subject.questions.length, 0);
  const ok = await confirmAction({
    title: '导入并覆盖当前工作区？',
    text: '将导入 ' + parsed.subjects.length + ' 个学科、' + parsed.conversations.length + ' 个对话、' + questionCount + ' 道错题。\n\n当前浏览器的学科与对话会被替换；API key 不会改变，也不会被导入。建议先导出当前工作区备份。',
    okLabel: '确认导入'
  });
  if (!ok) return;

  try {
    await store.replaceAll(parsed.subjects, parsed.conversations);
  } catch (error) {
    toast('写入失败：' + error.message, 'bad');
    return;
  }
  state.subjects = parsed.subjects;
  state.conversations = parsed.conversations;
  clearAllMessageAttachments();
  state.currentSubjectId = parsed.subjects.length ? parsed.subjects[0].id : null;
  state.currentConversationId = null;
  state.expanded = new Set(state.currentSubjectId ? [state.currentSubjectId] : []);
  state.view = 'chat';
  $('memoryView').hidden = true;
  $('chatView').hidden = false;
  if (state.currentSubjectId) {
    const mode = loadMode(state.currentSubjectId);
    state.currentSkill = mode.skill;
    state.feynman = mode.feynman;
    // 恢复导入工作区的最近一次对话，让“导入后一切照旧”而不是停在欢迎页。
    const recent = recentConversationFor(state.currentSubjectId);
    if (recent) {
      state.currentConversationId = recent.id;
      state.currentSkill = recent.skill;
      state.feynman = recent.feynman;
      lsSet('lastConversationId', recent.id);
    } else {
      lsRemove('lastConversationId');
    }
    lsSet('lastSubjectId', state.currentSubjectId);
  } else {
    state.currentSkill = '批改';
    state.feynman = false;
    lsRemove('lastSubjectId');
    lsRemove('lastConversationId');
  }
  renderAll();
  toast('导入完成：' + parsed.subjects.length + ' 个学科、' + parsed.conversations.length + ' 个对话', 'good');
}

/* --------------------------------------------------------------------------
   对话框与确认框
   -------------------------------------------------------------------------- */
function openDialog(id) {
  const dialog = $(id);
  if (!dialog) return;
  if (typeof dialog.showModal === 'function') {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
}

function closeDialog(id) {
  const dialog = $(id);
  if (!dialog) return;
  if (typeof dialog.close === 'function' && dialog.open) dialog.close();
  else dialog.removeAttribute('open');
}

function confirmAction(options) {
  const dialog = $('confirmDialog');
  $('confirmTitle').textContent = options.title || '确认操作';
  $('confirmText').textContent = options.text || '';
  $('confirmOkBtn').textContent = options.okLabel || '确认';
  return new Promise((resolve) => {
    let settled = false;
    function finish(value) {
      if (settled) return;
      settled = true;
      $('confirmOkBtn').removeEventListener('click', onOk);
      $('confirmCancelBtn').removeEventListener('click', onCancel);
      dialog.removeEventListener('close', onClose);
      if (dialog.open) dialog.close();
      resolve(value);
    }
    function onOk() { finish(true); }
    function onCancel() { finish(false); }
    function onClose() { finish(false); }
    $('confirmOkBtn').addEventListener('click', onOk);
    $('confirmCancelBtn').addEventListener('click', onCancel);
    dialog.addEventListener('close', onClose);
    openDialog('confirmDialog');
  });
}

/* --------------------------------------------------------------------------
   侧栏移动端
   -------------------------------------------------------------------------- */
function openMobileSidebar() {
  $('sidebar').classList.add('open');
  $('scrim').hidden = false;
  $('menuBtn').setAttribute('aria-expanded', 'true');
}

function closeMobileSidebar() {
  $('sidebar').classList.remove('open');
  $('scrim').hidden = true;
  $('menuBtn').setAttribute('aria-expanded', 'false');
}

function toggleMobileSidebar() {
  if ($('sidebar').classList.contains('open')) closeMobileSidebar(); else openMobileSidebar();
}

/* --------------------------------------------------------------------------
   输入框
   -------------------------------------------------------------------------- */
function autoGrowComposer() {
  const textarea = $('composer');
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 180) + 'px';
}

/* --------------------------------------------------------------------------
   启动与事件
   -------------------------------------------------------------------------- */
function bindEvents() {
  $('menuBtn').addEventListener('click', toggleMobileSidebar);
  $('scrim').addEventListener('click', closeMobileSidebar);
  $('newSubjectBtn').addEventListener('click', () => openSubjectDialog(null));
  $('settingsBtn').addEventListener('click', openSettings);
  $('bannerSettingsBtn').addEventListener('click', openSettings);
  $('exportBtn').addEventListener('click', exportWorkspace);
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (file) importWorkspaceFromFile(file);
  });

  $('settingsForm').addEventListener('submit', saveSettings);
  $('testConnectionBtn').addEventListener('click', testConnection);
  $('revealKeyBtn').addEventListener('click', () => {
    const input = $('apiKeyInput');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    $('revealKeyBtn').textContent = show ? '隐藏' : '显示';
  });

  $('subjectForm').addEventListener('submit', saveSubject);
  $('renameForm').addEventListener('submit', renameConversation);
  $('questionForm').addEventListener('submit', saveQuestion);
  $('ledgerForm').addEventListener('submit', saveLedgerRow);

  $('newChatBtn').addEventListener('click', () => {
    if (!getCurrentSubject()) { openSubjectDialog(null); return; }
    clearPendingAttachments();
    createConversation(state.currentSubjectId);
  });
  $('renameConvBtn').addEventListener('click', () => openRenameDialog(getCurrentConversation()));
  $('memoryBtn').addEventListener('click', openMemory);
  $('backToChatBtn').addEventListener('click', closeMemory);
  $('closeBtn').addEventListener('click', startCloseFlow);

  document.querySelectorAll('.memory-tab').forEach((button) => {
    button.addEventListener('click', () => setMemoryTab(button.dataset.tab));
  });

  $('sendBtn').addEventListener('click', sendMessage);
  $('stopBtn').addEventListener('click', stopStreaming);
  $('attachBtn').addEventListener('click', () => {
    if (state.streaming) return;
    $('attachmentInput').click();
  });
  $('attachmentInput').addEventListener('change', (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    addPendingAttachments(files);
  });
  $('composer').addEventListener('input', autoGrowComposer);
  $('composer').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      sendMessage();
    }
  });

  $('reviewCancelBtn').addEventListener('click', () => {
    if (state.reviewAbort) state.reviewAbort.abort();
    state.reviewProposal = null;
    closeDialog('reviewDialog');
    toast('已取消写回，对话仍然保留');
  });
  $('reviewConfirmBtn').addEventListener('click', applyReviewProposal);
  $('captureConfirmBtn').addEventListener('click', confirmCapture);

  document.querySelectorAll('[data-close-dialog]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.getAttribute('data-close-dialog');
      if (id === 'reviewDialog' && state.reviewAbort) state.reviewAbort.abort();
      if (id === 'reviewDialog') state.reviewProposal = null;
      closeDialog(id);
    });
  });

  document.querySelectorAll('dialog.modal').forEach((dialog) => {
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) {
        if (dialog.id === 'reviewDialog' && state.reviewAbort) state.reviewAbort.abort();
        if (dialog.id === 'reviewDialog') state.reviewProposal = null;
        dialog.close();
      }
    });
    dialog.addEventListener('close', () => {
      if (dialog.id === 'reviewDialog') {
        if (state.reviewAbort) { state.reviewAbort.abort(); }
        state.reviewProposal = null;
      }
    });
  });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && $('sidebar').classList.contains('open')) closeMobileSidebar();
  });

  window.addEventListener('beforeunload', () => {
    if (state.streaming) state.streaming.controller.abort();
  });
}

async function seedIfNeeded() {
  if (state.seeded) return;
  if (state.subjects.length) { state.seeded = true; lsSet('seeded', '1'); return; }
  const sample = makeSubject(
    '示例学科A',
    '这是示例规则，请改成你自己的：\n1. 计算题按步骤给分，公式写对但结果错只扣结果分。\n2. 选择题只看最终选项。\n3. 错因统一归入四类：知识空缺 / 计算粗心 / 书写规范 / 程序缺步。\n4. 每次批改结束，把本模块失分记入失分总账。'
  );
  state.subjects.push(sample);
  state.currentSubjectId = sample.id;
  state.expanded.add(sample.id);
  state.currentSkill = '批改';
  state.feynman = false;
  await store.put('subjects', sample);
  lsSet('seeded', '1');
  state.seeded = true;
  lsSet('lastSubjectId', sample.id);
}

async function hydrate() {
  await store.init();
  const [subjects, conversations] = await Promise.all([store.getAll('subjects'), store.getAll('conversations')]);
  state.subjects = subjects.map(normalizeSubject);
  state.conversations = conversations.map(normalizeConversation);
  await seedIfNeeded();

  const expandedRaw = safeJsonParse(lsGet('expandedSubjects', '[]'), []);
  state.expanded = new Set(Array.isArray(expandedRaw) ? expandedRaw : []);

  const lastSubject = lsGet('lastSubjectId', '');
  let subject = state.subjects.find((item) => item.id === lastSubject) || state.subjects[0] || null;
  if (subject) {
    state.currentSubjectId = subject.id;
    state.expanded.add(subject.id);
    const mode = loadMode(subject.id);
    state.currentSkill = mode.skill;
    state.feynman = mode.feynman;
    const lastConversation = lsGet('lastConversationId', '');
    const candidate = getConversation(lastConversation);
    if (candidate && candidate.subjectId === subject.id) {
      state.currentConversationId = candidate.id;
      state.currentSkill = candidate.skill;
      state.feynman = candidate.feynman;
    } else {
      const recent = recentConversationFor(subject.id);
      state.currentConversationId = recent ? recent.id : null;
    }
  }

  closeDialog('settingsDialog');
  renderAll();
  if (store.mode === 'local') toast('浏览器未开放 IndexedDB，已临时用 localStorage 保存', 'bad');
}

async function init() {
  bindEvents();
  autoGrowComposer();
  try {
    await hydrate();
  } catch (error) {
    console.error('[wtfihateexam] 启动失败', error);
    const wrap = $('messages');
    wrap.textContent = '';
    const box = el('div', 'msg-error');
    box.append(el('strong', '', '工作台启动失败'), document.createTextNode(error.message || String(error)));
    wrap.appendChild(box);
    toast('启动失败：' + error.message, 'bad');
  }
}

init();
