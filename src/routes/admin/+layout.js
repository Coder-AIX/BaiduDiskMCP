// WHY: 管理端数据全部依赖浏览器 fetch，关闭 SSR 避免首屏无数据与重复请求
export const ssr = false;
