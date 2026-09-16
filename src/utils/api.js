/**
 * 接口地址前缀。
 *
 * 部署到子路径（如 /deepseek/reader/）时，前端发出去的 /api/… 必须带上这个前缀，
 * 否则会打到站点根上，nginx 匹配不到对应的 location。
 * Dev 下 BASE_URL 是 /，常量为空串，拼接后等于原样。
 */
export const API_BASE = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '')
