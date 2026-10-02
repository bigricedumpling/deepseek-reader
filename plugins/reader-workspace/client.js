/* DSH's client loader expects a registered browser module, not Node ESM. */
window.__ModuleLoader__.load({
  id: 'dsh-reader-workspace',
  factory: (require) => {
    const React = require('react')
    const DEFAULT_URL = 'http://127.0.0.1:8090/'
    const URL_KEY = 'dsh-reader-workspace:url'
    const URL_EVENT = 'dsh-reader-workspace:url-change'
    const STYLE_ID = 'dsh-reader-workspace-style'
    const FILTER_ID = 'dsh-reader-superellipse'
    let managedUrl = ''
    let managedState = 'starting'
    let managedError = ''

    function configuredUrl() {
      try { return window.localStorage.getItem(URL_KEY) || '' } catch { return '' }
    }

    function readerUrl() {
      try {
        const stored = configuredUrl() || managedUrl || DEFAULT_URL
        const url = new URL(stored)
        if (url.username || url.password || !['http:', 'https:'].includes(url.protocol)) return DEFAULT_URL
        if (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return DEFAULT_URL
        return url.toString()
      } catch {
        return DEFAULT_URL
      }
    }

    function mobileDevice() {
      return /iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Mac/i.test(navigator.platform) && navigator.maxTouchPoints > 1)
    }

    function waitingForManagedReader() { return !configuredUrl() && !managedUrl && managedState === 'starting' && !mobileDevice() }
    function ReaderStarting() { return React.createElement('div', { className: 'dsh-reader-connect', role: 'status' },
      React.createElement(ReaderIcon, { size: 24 }), React.createElement('strong', null, '正在打开阅读器'),
      React.createElement('p', null, '首次启动可能需要几秒钟。')) }

    function needsReaderConnection() { return mobileDevice() && readerUrl() === DEFAULT_URL }

    function parseReaderUrl(value) {
      const address = new URL(value.trim())
      const local = ['localhost', '127.0.0.1', '[::1]'].includes(address.hostname)
      if (address.username || address.password || address.protocol !== 'https:' && (address.protocol !== 'http:' || !local || mobileDevice())) throw Error(mobileDevice() ? '请输入可从此设备访问的 HTTPS 地址' : '远程地址需使用 HTTPS，本机可用 HTTP')
      address.pathname = '/'; address.search = ''; address.hash = ''
      return address.toString()
    }

    function saveReaderUrl(address) {
      window.localStorage.setItem(URL_KEY, address)
      window.dispatchEvent(new CustomEvent(URL_EVENT, { detail: address }))
    }

    function ReaderConnection({ onConnect, onRetry, initialUrl = readerUrl(), firstUse = false }) {
      const [editing, setEditing] = React.useState(firstUse)
      const [value, setValue] = React.useState(mobileDevice() && initialUrl === DEFAULT_URL ? '' : initialUrl)
      const [error, setError] = React.useState('')
      return React.createElement('form', { className: 'dsh-reader-connect', onSubmit: event => {
        event.preventDefault()
        try { const address = parseReaderUrl(value); saveReaderUrl(address); onConnect(address) }
        catch (reason) { setError(reason.message || '地址无效') }
      } }, React.createElement(ReaderIcon, { size: 24 }),
      React.createElement('strong', null, firstUse ? '连接阅读器' : '无法连接阅读器'),
      React.createElement('p', null, firstUse ? '填写此设备可访问的 Reader 地址。' : managedError || '请重试，或连接已有的 Reader。'),
      editing ? React.createElement('label', null, '阅读器地址',
        React.createElement('input', { type: 'url', value, placeholder: mobileDevice() ? 'https://…' : DEFAULT_URL, onChange: event => { setValue(event.target.value); setError('') }, autoComplete: 'url', required: true })) : null,
      React.createElement('div', { className: 'dsh-reader-connect-actions' },
        !firstUse && React.createElement('button', { type: 'button', className: 'dsh-reader-connect-cancel', onClick: () => { setError(''); if (editing) setEditing(false); else onRetry() } }, editing ? '取消' : '重试'),
        editing ? React.createElement('button', { type: 'submit' }, '连接') : React.createElement('button', { type: 'button', onClick: () => setEditing(true) }, '更换地址')),
      React.createElement('a', { href: 'https://zangqucheng.site/git/zangqucheng/deepseek-reader', target: '_blank', rel: 'noopener noreferrer' }, '查看安装说明'),
      error ? React.createElement('span', { role: 'alert' }, error) : null)
    }

    function ReaderConnectionSettings() {
      const [url, setUrl] = React.useState(readerUrl())
      const [value, setValue] = React.useState(url)
      const [editing, setEditing] = React.useState(false)
      const [error, setError] = React.useState('')
      React.useEffect(() => {
        const sync = event => { setUrl(event.detail); if (!editing) setValue(event.detail) }
        window.addEventListener(URL_EVENT, sync)
        return () => window.removeEventListener(URL_EVENT, sync)
      }, [editing])
      return React.createElement('section', { className: 'dsh-reader-config' },
        React.createElement('h3', null, '阅读器连接'),
        React.createElement('p', null, '插件会自动启动本机 Reader。只有连接已有服务时才需要填写地址。'),
        editing ? React.createElement('form', { onSubmit: event => {
          event.preventDefault()
          try { const address = parseReaderUrl(value); saveReaderUrl(address); setUrl(address); setEditing(false); setError('') }
          catch (reason) { setError(reason.message || '地址无效') }
        } },
          React.createElement('label', null, '访问地址', React.createElement('input', { type: 'url', value, onChange: event => { setValue(event.target.value); setError('') }, required: true, autoComplete: 'url' })),
          React.createElement('div', { className: 'dsh-reader-config-actions' },
            React.createElement('button', { type: 'button', onClick: () => { setValue(url); setEditing(false); setError('') } }, '取消'),
            React.createElement('button', { type: 'submit' }, '保存')),
          error ? React.createElement('span', { role: 'alert' }, error) : null
        ) : React.createElement('div', { className: 'dsh-reader-config-current' },
          React.createElement('code', null, url),
          React.createElement('button', { type: 'button', onClick: () => setEditing(true) }, '更换地址')))
    }

    function ReaderIcon({ size = 24, className, tone = 'brand' }) {
      const isTab = tone === 'neutral'
      const iconSize = Math.min(Number(size) || (isTab ? 16 : 24), isTab ? 16 : 24)
      const front = isTab ? '#9aa1ab' : '#5b9cff'
      const page = 'M5.9 5.25C4.85 4.95 4 5.7 4 6.85v7.8c0 .8.5 1.45 1.22 1.75l6.08 2.43c.45.18.95.18 1.4 0l6.08-2.43c.72-.3 1.22-.95 1.22-1.75v-7.8c0-1.15-.85-1.9-1.9-1.6L12 7.35 5.9 5.25Z'
      const tabPage = 'M5.95 5.4C4.65 4.97 3.85 5.8 3.85 7.08v7.25c0 1.18.64 1.95 1.7 2.36l5.33 2.09c.73.29 1.51.29 2.24 0l5.33-2.09c1.06-.41 1.7-1.18 1.7-2.36V7.08c0-1.28-.8-2.11-2.1-1.68L12 7.37 5.95 5.4Z'
      return React.createElement('svg', {
        width: iconSize, height: iconSize,
        viewBox: isTab ? '2.5 2.5 19 19' : '0 0 24 24', fill: 'none',
        className, 'aria-hidden': 'true'
      }, !isTab && React.createElement('rect', {
        x: 2.4, y: 7.35, width: 19.2, height: 13.05, rx: 3.25, fill: '#a9d1f0'
      }), React.createElement('path', {
        d: isTab ? tabPage : page, fill: front,
        stroke: isTab ? undefined : '#fff', strokeWidth: isTab ? undefined : 2.2,
        strokeLinejoin: 'round', paintOrder: 'stroke',
        transform: isTab ? undefined : 'translate(0 .55) translate(12 0) scale(.88 .94) translate(-12 0)'
      }))
    }

    async function workspaceSourcePath(ctx, reference) {
      const parts = new URL(reference).pathname.split('/').filter(Boolean).map(decodeURIComponent)
      if (new URL(reference).protocol !== 'dsh-resource:' || parts[0] !== 'session' || !parts[1] || parts.length < 3) return ''
      const result = await ctx.remote.workspaceFiles.stat(parts[1], parts.slice(2).join('/'))
      return result.ok ? String(result.value.absolutePath || '') : ''
    }

    function createReaderView(ctx) { return function ReaderView(props) {
      const [url, setUrl] = React.useState(readerUrl())
      const [connected, setConnected] = React.useState(false)
      const [connectionOpen, setConnectionOpen] = React.useState(needsReaderConnection())
      const [attempt, setAttempt] = React.useState(0)
      const [, forceUpdate] = React.useState(0)
      const frame = React.useRef(null)
      const { tab } = props.useTabInfo()
      React.useEffect(() => {
        const sync = event => { if (event.detail !== url) { setUrl(event.detail); setConnected(false); setConnectionOpen(false); setAttempt(value => value + 1) } }
        window.addEventListener(URL_EVENT, sync)
        const status = () => forceUpdate(value => value + 1)
        window.addEventListener('dsh-reader-workspace:status', status)
        return () => { window.removeEventListener(URL_EVENT, sync); window.removeEventListener('dsh-reader-workspace:status', status) }
      }, [url])
      React.useEffect(() => {
        if (connectionOpen || waitingForManagedReader()) return
        const origin = new URL(url).origin
        const timer = connected ? null : setTimeout(() => setConnectionOpen(true), 7000)
        const onMessage = event => {
          if (event.source !== frame.current?.contentWindow || event.origin !== origin) return
          if (event.data?.type === 'dsh-reader:ready') { clearTimeout(timer); setConnected(true); return }
          const reference = String(event.data.reference || '')
          if (event.data?.type === 'dsh-reader:open-source' && /^dsh-resource:\/\/file\/session\/[^/]+\/.+/i.test(reference)) tab.actions.openResource(reference)
          if (event.data?.type === 'dsh-reader:resolve-source') workspaceSourcePath(ctx, reference)
            .then(sourcePath => frame.current?.contentWindow?.postMessage({ type: 'dsh-reader:resolved-source', requestId: event.data.requestId, sourcePath }, origin))
            .catch(() => frame.current?.contentWindow?.postMessage({ type: 'dsh-reader:resolved-source', requestId: event.data.requestId, sourcePath: '' }, origin))
        }
        window.addEventListener('message', onMessage)
        return () => { clearTimeout(timer); window.removeEventListener('message', onMessage) }
      }, [url, tab, connectionOpen, connected])
      if (waitingForManagedReader()) return React.createElement(ReaderStarting)
      if (connectionOpen || !configuredUrl() && !managedUrl && managedState === 'error') return React.createElement(ReaderConnection, { initialUrl: url, firstUse: needsReaderConnection(),
        onConnect: address => { setConnected(false); setUrl(address); setConnectionOpen(false); setAttempt(value => value + 1) },
        onRetry: () => { setConnected(false); setConnectionOpen(false); setAttempt(value => value + 1) } })
      return React.createElement('div', { className: 'dsh-reader-frame' },
        React.createElement('iframe', {
          ref: frame, key: attempt,
          title: '阅读器', src: url, loading: 'eager', referrerPolicy: 'no-referrer',
          sandbox: 'allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox allow-modals',
          allow: 'clipboard-read; clipboard-write'
        }))
    } }

    function createReaderMarkdownPreview(ctx) { function ReaderMarkdownPreview(props) {
      const frame = React.useRef(null)
      const { tab } = props.useTabInfo()
      const [loaded, setLoaded] = React.useState(false)
      const [collected, setCollected] = React.useState('')
      const [frameHeight, setFrameHeight] = React.useState(700)
      const url = React.useMemo(() => new URL('preview/', readerUrl()).toString(), [])
      const origin = React.useMemo(() => new URL(url).origin, [url])
      const collectedUrl = React.useMemo(() => {
        if (!collected) return ''
        const parts = collected.split('/').map(encodeURIComponent)
        const target = new URL('doc/' + parts.join('/'), readerUrl())
        target.searchParams.set('lib', collected.split('/')[0])
        return target.toString()
      }, [collected])
      const resourceAddress = String(props.resourceAddress || '')
      const absolutePath = props.useResource(resourceAddress).value?.absolutePath || ''
      const title = (() => {
        try { return decodeURIComponent(resourceAddress.split('/').pop() || 'Markdown') }
        catch { return 'Markdown' }
      })()
      const text = props.content?.kind === 'text' ? props.content.text : ''
      const send = React.useCallback(() => {
        frame.current?.contentWindow?.postMessage({
          type: 'dsh-reader-preview:update', title, filePath: resourceAddress, sourcePath: absolutePath,
          text, eof: props.content?.kind === 'text' && props.content.eof === true
        }, origin)
      }, [title, absolutePath, resourceAddress, text, origin, props.content?.eof])
      const sendRef = React.useRef(send)
      sendRef.current = send
      React.useEffect(() => { if (loaded && !collectedUrl) send() }, [loaded, send, collectedUrl])
      React.useEffect(() => {
        const pending = new AbortController()
        const onMessage = event => {
          if (event.source !== frame.current?.contentWindow || event.origin !== origin) return
          if (event.data?.type === 'dsh-reader-preview:ready') { setLoaded(true); props.onReady?.(); sendRef.current() }
          if (event.data?.type === 'dsh-reader-preview:height') {
            const height = Number(event.data.height)
            if (Number.isFinite(height)) setFrameHeight(Math.min(200000, Math.max(320, Math.ceil(height))))
          }
          if (event.data?.type === 'dsh-reader-preview:collected') setCollected(String(event.data.file || '已收录'))
          if (event.data?.type === 'dsh-reader:resolve-source') {
            workspaceSourcePath(ctx, String(event.data.reference || ''))
              .then(sourcePath => frame.current?.contentWindow?.postMessage({ type: 'dsh-reader:resolved-source', requestId: event.data.requestId, sourcePath }, origin))
              .catch(() => frame.current?.contentWindow?.postMessage({ type: 'dsh-reader:resolved-source', requestId: event.data.requestId, sourcePath: '' }, origin))
          }
          if (event.data?.type === 'dsh-reader:open-source') {
            const reference = String(event.data.reference || '')
            if (/^dsh-resource:\/\/file\/session\/[^/]+\/.+/i.test(reference)) tab.actions.openResource(reference)
          }
          if (event.data?.type === 'dsh-reader-preview:open-link') {
            try {
              const href = String(event.data.href || '')
              if (!href || /^(?:[a-z][\w+.-]*:|\/\/)/i.test(href)) return
              const base = new URL(resourceAddress)
              const target = new URL(href, base)
              const baseParts = base.pathname.split('/').filter(Boolean)
              const targetParts = target.pathname.split('/').filter(Boolean)
              if (target.protocol !== base.protocol || target.host !== base.host ||
                  baseParts[0] !== 'session' || targetParts[0] !== 'session' ||
                  targetParts[1] !== baseParts[1]) return
              tab.actions.openResource(target.toString())
            } catch { /* Invalid workspace link stays in this preview. */ }
          }
          if (event.data?.type === 'dsh-reader-preview:asset-request') {
            const reference = String(event.data.reference || '')
            const requestId = String(event.data.requestId || '')
            const reply = data => frame.current?.contentWindow?.postMessage({ type: 'dsh-reader-preview:asset-response', requestId, reference, ...data }, origin)
            if (!requestId || !/\.(png|jpe?g|gif|webp)(?:[?#]|$)/i.test(reference) || reference.length > 600 || /^(?:[a-z][\w+.-]*:|\/\/)/i.test(reference)) { reply({ error: '不支持此图片地址' }); return }
            let file
            try {
              const parts = new URL(resourceAddress).pathname.split('/').filter(Boolean).map(decodeURIComponent)
              if (parts[0] !== 'session' || !parts[1]) throw Error('工作区文件地址无效')
              file = { sessionId: parts[1], path: parts.slice(2).join('/') }
            } catch (error) { reply({ error: error.message }); return }
            const suffix = reference.search(/[?#]/)
            let imagePath
            try { imagePath = decodeURIComponent(suffix < 0 ? reference : reference.slice(0, suffix)) }
            catch { reply({ error: '图片路径无效' }); return }
            ctx.remote.workspaceFiles.readBytes(file.sessionId, imagePath, { baseFile: file.path }, pending.signal).then(result => {
              if (!result.ok) throw Error(result.error?.message || '无法读取图片')
              const bytes = result.value.data
              if (bytes.byteLength > 10 * 1024 * 1024) throw Error('图片超过 10 MB')
              const ext = imagePath.split('.').pop().toLowerCase()
              const mime = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }[ext]
              let binary = ''
              for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768))
              reply({ mime, base64: btoa(binary) })
            }).catch(error => { if (!pending.signal.aborted) reply({ error: error.message || '无法读取图片' }) })
          }
          if (event.data?.type === 'dsh-reader-preview:full-request') {
            ;(async () => {
              try {
                const parts = new URL(resourceAddress).pathname.split('/').filter(Boolean).map(decodeURIComponent)
                if (parts[0] !== 'session' || !parts[1]) throw Error('工作区文件地址无效')
                const sessionId = parts[1], path = parts.slice(2).join('/')
                let offset = 1, version = '', full = ''
                for (let pageIndex = 0; pageIndex < 500; pageIndex++) {
                  const result = await ctx.remote.workspaceFiles.read(sessionId, path, { offset }, pending.signal)
                  if (!result.ok) throw Error(result.error?.message || '读取工作区文件失败')
                  const page = result.value
                  if (version && page.version !== version) throw Error('文件读取期间发生修改，请重试')
                  version = page.version
                  full += (full ? '\n' : '') + page.text
                  if (full.length > 5 * 1024 * 1024) throw Error('文档超过 5 MB，暂不能收录')
                  if (page.eof) { frame.current?.contentWindow?.postMessage({ type: 'dsh-reader-preview:full-content', text: full }, origin); return }
                  if (!page.lines || page.lines < 1) throw Error('工作区文件分页无效')
                  offset += page.lines
                }
                throw Error('文档页数过多，暂不能收录')
              } catch (error) {
                if (!pending.signal.aborted) frame.current?.contentWindow?.postMessage({ type: 'dsh-reader-preview:full-content', error: error.message || '读取失败' }, origin)
              }
            })()
          }
        }
        window.addEventListener('message', onMessage)
        return () => { pending.abort(); window.removeEventListener('message', onMessage) }
      }, [origin, resourceAddress, tab, props.onReady])
      return React.createElement('div', { ref: props.scrollportRef, className: 'dsh-reader-frame dsh-reader-md' },
        React.createElement('iframe', {
          ref: frame, title: collectedUrl ? '阅读器文档' : '阅读器 Markdown 预览', src: collectedUrl || url,
          style: { height: '100%' },
          loading: 'eager', referrerPolicy: 'no-referrer',
          sandbox: 'allow-scripts allow-same-origin allow-forms allow-downloads allow-popups allow-popups-to-escape-sandbox allow-modals',
          allow: 'clipboard-read; clipboard-write'
        })
      )
    }
      return function ConnectedReaderMarkdownPreview(props) {
        const [connection, setConnection] = React.useState(readerUrl())
        const [, forceUpdate] = React.useState(0)
        const [connectionOpen, setConnectionOpen] = React.useState(needsReaderConnection())
        const [ready, setReady] = React.useState(false)
        const [attempt, setAttempt] = React.useState(0)
        const onReady = React.useCallback(() => setReady(true), [])
        React.useEffect(() => {
          const sync = event => { if (event.detail !== connection) { setConnection(event.detail); setReady(false); setConnectionOpen(false); setAttempt(value => value + 1) } }
          window.addEventListener(URL_EVENT, sync)
          const status = () => forceUpdate(value => value + 1)
          window.addEventListener('dsh-reader-workspace:status', status)
          return () => { window.removeEventListener(URL_EVENT, sync); window.removeEventListener('dsh-reader-workspace:status', status) }
        }, [connection])
        React.useEffect(() => {
          if (connectionOpen || ready || waitingForManagedReader()) return
          const timer = setTimeout(() => setConnectionOpen(true), 7000)
          return () => clearTimeout(timer)
        }, [connection, connectionOpen, ready])
        if (waitingForManagedReader()) return React.createElement(ReaderStarting)
        if (connectionOpen || !configuredUrl() && !managedUrl && managedState === 'error') return React.createElement(ReaderConnection, { initialUrl: connection, firstUse: needsReaderConnection(),
          onConnect: address => { setReady(false); setConnection(address); setConnectionOpen(false); setAttempt(value => value + 1) },
          onRetry: () => { setReady(false); setConnectionOpen(false); setAttempt(value => value + 1) } })
        return React.createElement(ReaderMarkdownPreview, { ...props, key: `${connection}:${attempt}`, onReady })
      }
    }

    function installStyle() {
      if (document.getElementById(STYLE_ID)) return () => {}
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = `
        .dsh-reader-connect { box-sizing:border-box;display:flex;flex-direction:column;align-items:flex-start;gap:13px;max-width:360px;margin:clamp(18px,8vh,52px) auto;padding:18px 22px;color:#303640;font:14px -apple-system,BlinkMacSystemFont,sans-serif; }
        .dsh-reader-connect strong { font-size:17px;font-weight:600; }
        .dsh-reader-connect p { margin:0;color:#858b94;line-height:1.55; }
        .dsh-reader-connect label { display:flex;flex-direction:column;gap:8px;width:100%; }
        .dsh-reader-connect input { box-sizing:border-box;width:100%;height:40px;padding:0 12px;border:1px solid #e1e5ea;border-radius:12px;background:#f7f8fa;color:#303640;font:inherit;outline:none; }
        .dsh-reader-connect input:focus { border-color:#6a91f7; }
        .dsh-reader-connect-actions { display:flex;justify-content:flex-end;gap:8px;width:100%; }
        .dsh-reader-connect button { padding:9px 17px;border:0;border-radius:12px;background:#526dff;color:#fff;font:inherit;cursor:pointer; }
        .dsh-reader-connect button.dsh-reader-connect-cancel { background:#f2f3f5;color:#5c626b; }
        .dsh-reader-connect a { color:#697589;text-decoration:none;font-size:12px; }
        .dsh-reader-connect a:hover { text-decoration:underline; }
        .dsh-reader-connect [role=alert] { color:#be4848;font-size:12px; }
        .dsh-reader-config { box-sizing:border-box;width:100%;max-width:680px;padding:22px 24px;border:1px solid var(--dsw-alias-border-l3,#e9e9e9);border-radius:18px;background:var(--dsw-alias-bg-layer-1,#fff);color:var(--dsw-alias-label-primary,#222);font:14px -apple-system,BlinkMacSystemFont,sans-serif; }
        .dsh-reader-config h3 { margin:0 0 8px;font-size:16px;font-weight:600; }
        .dsh-reader-config p { margin:0 0 18px;color:var(--dsw-alias-label-secondary,#777);line-height:1.55; }
        .dsh-reader-config-current { display:flex;align-items:center;justify-content:space-between;gap:12px;min-width:0; }
        .dsh-reader-config-current code { min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:inherit; }
        .dsh-reader-config button { flex:none;padding:8px 12px;border:0;border-radius:10px;background:var(--dsw-alias-bg-layer-2,#f1f2f4);color:var(--dsw-alias-label-primary,#333);font:inherit;cursor:pointer; }
        .dsh-reader-config form { display:flex;flex-direction:column;gap:10px; }
        .dsh-reader-config label { display:flex;flex-direction:column;gap:8px; }
        .dsh-reader-config input { box-sizing:border-box;width:100%;height:38px;padding:0 11px;border:1px solid var(--dsw-alias-border-l3,#ddd);border-radius:10px;background:var(--dsw-alias-bg-layer-1,#fff);color:inherit;font:inherit; }
        .dsh-reader-config-actions { display:flex;justify-content:flex-end;gap:8px; }
        .dsh-reader-config-actions button[type=submit] { background:#526dff;color:#fff; }
        .dsh-reader-config [role=alert] { color:#be4848;font-size:12px; }
        .dsh-reader-frame { position: relative; width: 100%; height: 100%; min-height: 0; background: #fff; }
        .dsh-reader-frame iframe { display: block; width: 100%; height: 100%; border: 0; }
        .dsh-reader-md { min-height: 320px; height: 100%; overflow: hidden; }
        .dsh-reader-collected { position:absolute;right:12px;bottom:12px;padding:8px 12px;border-radius:16px;background:#f0f1f6;color:#3f4659;font-size:12px;max-width:calc(100% - 24px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
        .dsh-reader-tab-title { display: inline-flex; align-items: center; gap: 7px; min-width: 0; }
        .dsh-reader-tab-title span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      `
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.setAttribute('width', '0')
      svg.setAttribute('height', '0')
      svg.setAttribute('aria-hidden', 'true')
      svg.style.position = 'absolute'
      svg.innerHTML = `<defs><filter id="${FILTER_ID}" x="-20%" y="-30%" width="140%" height="160%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur"/><feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0 0  0 0 0 12 -4"/></filter></defs>`
      document.head.appendChild(style)
      document.body.appendChild(svg)
      return () => { style.remove(); svg.remove() }
    }

    const inject = ['sidebarRightTabs', 'sidebarRight', 'shortcuts', 'documentPreviews', 'slots', 'remote', 'remote.workspaceFiles']
    function apply(ctx) {
      ctx.effect(() => {
        let stopped = false
        async function refresh() {
          try {
            const response = await fetch('api/reader-workspace/status', { cache: 'no-store' })
            if (!response.ok) throw Error(`Reader 服务状态不可用（HTTP ${response.status}）`)
            const status = await response.json()
            if (stopped) return
            managedState = status.state
            managedError = status.error || ''
            if (status.state === 'ready' && /^http:\/\/127\.0\.0\.1:\d+\/$/.test(status.url)) {
              if (managedUrl !== status.url) {
                managedUrl = status.url
                window.dispatchEvent(new CustomEvent(URL_EVENT, { detail: readerUrl() }))
              }
            } else if (managedUrl) {
              managedUrl = ''
              window.dispatchEvent(new CustomEvent(URL_EVENT, { detail: readerUrl() }))
            }
            window.dispatchEvent(new Event('dsh-reader-workspace:status'))
          } catch (error) { if (!stopped) { managedState = 'error'; managedError = error.message || '无法启动阅读器'; window.dispatchEvent(new Event('dsh-reader-workspace:status')) } }
        }
        refresh()
        const timer = setInterval(refresh, 2000)
        return () => { stopped = true; clearInterval(timer) }
      }, 'reader local service discovery')
      ctx.effect(installStyle, 'reader guide shape')
      ctx.effect(() => ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register(
        { name: 'plugins.bundle.config', key: 'dsh-reader-workspace' }, ReaderConnectionSettings
      )), 'reader connection settings')
      // The Reader entry is the essential part of this plugin. Register it
      // before optional Markdown integration so preview issues cannot hide it.
      ctx.effect(() => ctx.sidebarRightTabs.register({
        id: 'dsh-reader-workspace', kind: 'reader', title: () => '阅读器',
        guide: [{ id: 'reader', order: 35, title: () => '阅读器', description: () => '打开知识库', icon: ReaderIcon, commandId: 'reader.open' }]
      }), 'reader guide entry')
      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
        { name: 'sidebar.right.pane.tab', key: 'dsh-reader-workspace' }, createReaderView(ctx)
      )), 'reader guide body')
      ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register(
        { name: 'sidebar.right.pane.tab.title', key: 'dsh-reader-workspace' },
        ({ useTabInfo }) => {
          const { tab } = useTabInfo()
          return React.createElement('span', { className: 'dsh-reader-tab-title' },
            React.createElement(ReaderIcon, { size: 16, tone: 'neutral' }), React.createElement('span', null, tab.title || '阅读器'))
        }
      )), 'reader tab title')
      try {
      const MarkdownPreview = createReaderMarkdownPreview(ctx)
      function MarkdownPage(props) {
        const { tab } = props.useTabInfo()
        const [content, setContent] = React.useState(null)
        const [error, setError] = React.useState('')
        React.useEffect(() => {
          const controller = new AbortController()
          setContent(null); setError('')
          try {
            const parts = new URL(tab.contentId).pathname.split('/').filter(Boolean).map(decodeURIComponent)
            if (parts[0] !== 'session' || !parts[1]) throw Error('工作区地址无效')
            ctx.remote.workspaceFiles.read(parts[1], parts.slice(2).join('/'), { offset: 1 }, controller.signal).then(result => {
              if (!result.ok) throw Error(result.error?.message || '读取失败')
              if (!controller.signal.aborted) setContent({ kind: 'text', text: result.value.text, eof: result.value.eof, absolutePath: result.value.absolutePath })
            }).catch(error => { if (!controller.signal.aborted) setError(error.message) })
          } catch (error) { setError(error.message) }
          return () => controller.abort()
        }, [tab.contentId])
        if (error) return React.createElement('p', { role: 'alert', style: { padding: 24 } }, error)
        if (!content) return React.createElement('p', { style: { padding: 24 } }, '正在读取…')
        return React.createElement(MarkdownPreview, { ...props, resourceAddress: tab.contentId, content, useResource: () => ({ value: { absolutePath: content.absolutePath } }) })
      }
      const TabTitle = ({ useTabInfo }) => {
        const { tab } = useTabInfo()
        return React.createElement(React.Fragment, null, React.createElement(ReaderIcon, { size: 16, tone: 'neutral' }), tab.title || '阅读器')
      }
      ctx.effect(() => ctx.sidebarRightTabs.register({
        id: 'dsh-reader-markdown', kind: 'reader-markdown', patterns: ['*.md', '*.markdown'], priority: 'extension',
        canOpen: address => { try { return new URL(address).pathname.startsWith('/session/') } catch { return false } },
        title: address => { try { return decodeURIComponent(new URL(address).pathname.split('/').pop()) } catch { return 'Markdown' } }
      }), 'reader markdown document tab')
      for (const [slot, component] of [['sidebar.right.pane.tab', MarkdownPage], ['sidebar.right.pane.tab.title', TabTitle]]) {
        ctx.effect(() => ctx.slots.inject(slot, () => ctx.slots.register({ name: slot, key: 'dsh-reader-markdown' }, component)), slot)
      }
      ctx.effect(() => ctx.shortcuts.register({
        id: 'reader.open', label: () => '打开阅读器', aliases: ['reader'],
        defaults: Object.fromEntries(['desktop:macos', 'desktop:windows', 'desktop:linux', 'web:macos', 'web:windows'].map(platform => [platform, { code: 'KeyR', modifiers: ['primary', 'shift'] }])),
        regions: ['page', 'editable', 'terminal'], modals: [],
        resolve: () => {
          const target = ctx.sidebarRight.commandTarget(null)
          return target ? { status: 'handled', run: () => ctx.sidebarRight.openTabFromTarget('reader', target) } : { status: 'blocked', reason: '请先打开一个会话' }
        }
      }), 'reader shortcut')
      const preview = { id: 'dsh-reader-workspace-markdown', extensions: ['md', 'markdown'],
        priority: 'extension', title: () => '阅读器', loading: 'text-pages' }
      ctx.effect(() => ctx.documentPreviews.register(preview), 'reader markdown preview')
      ctx.effect(() => ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register(
        { name: 'sidebar.right.tab.document', key: preview.id }, createReaderMarkdownPreview(ctx)
      )), 'reader markdown body')
      } catch (error) {
        console.warn('Reader Markdown preview could not load:', error)
      }
    }
    return { apply, inject }
  }
})
