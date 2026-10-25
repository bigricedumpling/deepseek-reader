/**
 * 个人历史路径的一次性兼容层。
 *
 * 这些名字来自 2026-09 的两次资料整理：抽屉合并、目录归类。
 * 它们只负责让已经发出去的旧链接继续打开，不参与新文档命名，
 * 也不要在这里继续添加"顺手也支持一下"的新规则 —— 新链接应该直接写当前路径。
 *
 * 兼容分三层：
 *   1. 旧抽屉名（?lib=业务面）统一成现在的抽屉；
 *   2. 旧链接第一段对应的库根（笔试题 / 业务面）；
 *   3. 面试准备内部做过归类的文档（interviewPaths 与根部资料表）。
 */

/** 旧抽屉名 → 现在的抽屉名 */
const LIBRARY_ALIASES = {
  业务面: '面试准备'
}

/**
 * 旧链接第一段 → 现在所在的库根。
 *
 * 业务面这一条是"在旧库名前补一层"，不是替换：旧库本身就是叫「业务面」的
 * 目录，后来整个搬进了「面试准备」，所以 /业务面/会议总结 对应
 * /面试准备/业务面/会议总结。
 */
const PREFIX_ALIASES = {
  笔试题: { mode: 'replace', root: 'Agent（设计方向）' },
  业务面: { mode: 'prepend', root: '面试准备' }
}

/** 2026-09 面试材料整理：旧书签继续指向原材料。 */
const INTERVIEW_PATHS = {
  '面试准备/总览/笔试面试总复习速览': '面试准备/过程稿/总览/笔试面试总复习速览',
  '面试准备/总览/下一步计划': '面试准备/过程稿/总览/下一步计划',
  '面试准备/总览/面试准备': '面试准备/过程稿/总览/面试准备',
  '面试准备/项目素材/wegen项目事实卡': '面试准备/常用资料/wegen项目事实卡',
  '面试准备/岗位与策略/能力线与笔试题型预测': '面试准备/过程稿/岗位与策略/能力线与笔试题型预测',
  '面试准备/岗位与策略/岗位JD与目标': '面试准备/常用资料/岗位JD与目标',
  '面试准备/岗位与策略/访问画像线索': '面试准备/过程稿/岗位与策略/访问画像线索',
  '面试准备/调研底稿/评测实证调研': '面试准备/常用资料/评测实证调研',
  '面试准备/调研底稿/训练数据调研原始记录': '面试准备/过程稿/调研底稿/训练数据调研原始记录',
  '面试准备/调研底稿/测评Survey': '面试准备/过程稿/调研底稿/测评Survey',
  '面试准备/调研底稿/术语表': '面试准备/过程稿/调研底稿/术语表',
  '面试准备/调研底稿/训练数据构造Survey': '面试准备/过程稿/调研底稿/训练数据构造Survey',
  '面试准备/调研底稿/平台机制调研原始记录': '面试准备/过程稿/调研底稿/平台机制调研原始记录',
  '面试准备/调研底稿/Web能力评测Survey': '面试准备/过程稿/调研底稿/Web能力评测Survey',
  '面试准备/技术验证/视觉奖励渲染验证记录': '面试准备/过程稿/技术验证/视觉奖励渲染验证记录',
  '面试准备/问答演练/模拟题库': '面试准备/过程稿/问答演练/模拟题库',
  '面试准备/问答演练/反问清单与叙事结构': '面试准备/过程稿/问答演练/反问清单与叙事结构',
  '面试准备/问答演练/术语急救卡': '面试准备/常用资料/术语急救卡',
  '面试准备/问答演练/全量问答手册': '面试准备/过程稿/问答演练/全量问答手册'
}

/** 原先散在面试准备根部、后来归入分类目录的资料 */
const ROOT_SECTIONS = {
  README: '总览',
  面试准备: '总览',
  笔试面试总复习速览: '总览',
  下一步计划: '总览',
  岗位JD与目标: '岗位与策略',
  能力线与笔试题型预测: '岗位与策略',
  访问画像线索: '岗位与策略',
  模拟题库: '问答演练',
  全量问答手册: '问答演练',
  术语急救卡: '问答演练',
  反问清单与叙事结构: '问答演练',
  wegen项目事实卡: '项目素材'
}

/** 地址栏里的旧抽屉名换成当前名；只用于 ?lib= 与本地存储键，不改文档路径。 */
export function normalizeLibraryName(name) {
  const value = String(name || '').trim()
  return LIBRARY_ALIASES[value] || value
}

/**
 * 旧文档路径的第一段映射。
 * 构建期重定向（routes.js）与运行时入口共用这一份，避免两处规则漂移。
 */
export function legacyDocPath(raw) {
  const doc = String(raw || '')
  const slash = doc.indexOf('/')
  if (slash <= 0) return doc
  const first = doc.slice(0, slash)
  const alias = PREFIX_ALIASES[first]
  if (!alias) return doc
  if (alias.mode === 'replace') return alias.root + '/' + doc.slice(slash + 1)
  return alias.root + '/' + doc
}

/**
 * 旧文档路径的固定改名（不依赖文档树）。
 * 返回的路径可能仍指向一个目录，由调用方再按当前树落到具体文件。
 */
export function legacyInterviewDoc(raw) {
  const doc = legacyDocPath(raw)
  const extension = /\.md$/i.test(doc) ? doc.slice(-3) : ''
  const relocated = INTERVIEW_PATHS[doc.replace(/\.md$/i, '')]
  return relocated ? relocated + extension : doc
}

/**
 * 散在面试准备根部的旧文档，按固定表补上分类目录。
 * 返回空串表示这条路径不需要归类。
 */
export function legacyRootSectionPath(raw) {
  const doc = String(raw || '')
  if (!doc.startsWith('面试准备/')) return ''
  const leaf = doc.slice('面试准备/'.length)
  const section = ROOT_SECTIONS[leaf.replace(/\.md$/i, '')]
  return section ? '面试准备/' + section + '/' + leaf : ''
}
