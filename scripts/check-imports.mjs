/**
 * 导入自检。
 *
 * 起因：TocPanel 里写了 `import { SidebarSimple } from '@phosphor-icons/vue'`，
 * 而该包实际导出名是 `PhSidebarSimple`。Vite 编译不报错、HTTP 也是 200，
 * 只有浏览器执行到那行才抛 SyntaxError，整页白屏。这类错误光看编译结果发现不了。
 *
 * 这个脚本查两件事：
 *   1. 源码里的具名导入，在包本身里到底存不存在
 *   2. 这些名字在 Vite 预构建产物里有没有被保留下来
 *
 * 用法：npm run check
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const SRC = 'src'

/* ---------- 收集源码里的具名导入 ---------- */

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (/\.(vue|js)$/.test(e.name)) out.push(p)
  }
  return out
}

const imports = [] // { file, pkg, names }
for (const file of walk(SRC)) {
  const src = fs.readFileSync(file, 'utf8')
  const re = /import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g
  let m
  while ((m = re.exec(src))) {
    const pkg = m[2]
    if (pkg.startsWith('.') || pkg.startsWith('/') || pkg.startsWith('virtual')) continue
    const names = m[1]
      .split(',')
      .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
      .filter(Boolean)
    if (names.length) imports.push({ file, pkg, names })
  }
}

/* ---------- 检查一：包本身有没有这些导出 ---------- */

async function loadPkg(pkg) {
  try {
    return require(pkg)
  } catch {
    try {
      return await import(pkg)
    } catch {
      return null
    }
  }
}

let checked = 0
const missing = []

for (const { file, pkg, names } of imports) {
  const mod = await loadPkg(pkg)
  if (!mod) {
    missing.push(`${file}\n     整包加载失败: ${pkg}`)
    continue
  }
  for (const n of names) {
    checked++
    if (!(n in mod)) {
      const guess = /^[A-Z]/.test(n) && 'Ph' + n in mod ? `，应为 Ph${n}` : ''
      missing.push(`${file}\n     从 ${pkg} 导入的 ${n} 不存在${guess}`)
    }
  }
}

console.log(`检查具名导入 ${checked} 个`)
if (missing.length) {
  console.log(`\n包导出对不上，共 ${missing.length} 处：`)
  for (const x of missing) console.log('   ' + x)
}

/* ---------- 检查二：Vite 预构建产物里有没有被保留 ---------- */

const META = 'node_modules/.vite/deps/_metadata.json'
let viteBad = 0
let viteChecked = 0

if (fs.existsSync(META) && !missing.length) {
  const meta = JSON.parse(fs.readFileSync(META, 'utf8'))
  const fileOf = Object.fromEntries(
    Object.entries(meta.optimized || {}).map(([k, v]) => [k, v.file])
  )
  const want = new Map()
  for (const { pkg, names } of imports) {
    const dep = fileOf[pkg]
    if (!dep) continue
    if (!want.has(dep)) want.set(dep, new Set())
    names.forEach((n) => want.get(dep).add(n))
  }
  for (const [dep, names] of want) {
    const p = path.join('node_modules/.vite/deps', dep)
    if (!fs.existsSync(p)) continue
    const text = fs.readFileSync(p, 'utf8')
    const exported = new Set()
    for (const mm of text.matchAll(/export\s*\{([^}]+)\}/g)) {
      for (const raw of mm[1].split(',')) {
        const n = raw.trim().split(/\s+as\s+/).pop().trim()
        if (n) exported.add(n)
      }
    }
    for (const n of names) {
      viteChecked++
      if (!exported.has(n)) {
        console.log(`   ❌ 预构建产物 ${dep} 里没有 ${n}`)
        viteBad++
      }
    }
  }
  if (viteChecked) {
    console.log(`检查预构建导出 ${viteChecked} 个，缺失 ${viteBad} 个`)
  }
}

if (!missing.length && !viteBad) {
  console.log('\n✅ 导入全部有效')
} else {
  process.exitCode = 1
}
