import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const NAME = 'dsh-mememio'
const ROUTE_PREFIX = '/api/dsh-mememio'
const SCENES = ['开心', '吐槽', '无语', '庆祝', '安慰', '打招呼', '拒绝', '其他']
const FREQUENCIES = ['subtle', 'natural', 'active']
const DEFAULT_SCENES = ['开心', '吐槽', '无语', '庆祝', '安慰']

const DEFAULT_CONFIG = {
  baseUrl: 'https://memes.example.com',
  token: '',
  auto: true,
  frequency: 'natural',
  scenes: [...DEFAULT_SCENES],
  allowSerious: false,
}

function dshHome() {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

function configPath() {
  return join(dshHome(), 'secrets', 'mememio.json')
}

function readConfig() {
  try {
    const parsed = JSON.parse(readFileSync(configPath(), 'utf8'))
    return normalizeConfig(parsed)
  } catch {
    return { ...DEFAULT_CONFIG, scenes: [...DEFAULT_SCENES] }
  }
}

function normalizeConfig(raw) {
  const baseUrl = typeof raw?.baseUrl === 'string' && raw.baseUrl.trim() !== ''
    ? raw.baseUrl.trim()
    : DEFAULT_CONFIG.baseUrl
  const token = typeof raw?.token === 'string' ? raw.token.trim() : ''
  const auto = raw?.auto !== false
  const frequency = FREQUENCIES.includes(raw?.frequency) ? raw.frequency : 'natural'
  const scenes = Array.isArray(raw?.scenes)
    ? [...new Set(raw.scenes.filter((scene) => SCENES.includes(scene)))]
    : [...DEFAULT_SCENES]
  const allowSerious = raw?.allowSerious === true
  return { baseUrl, token, auto, frequency, scenes, allowSerious }
}

function writeConfig(config) {
  const path = configPath()
  mkdirSync(join(dshHome(), 'secrets'), { recursive: true })
  writeFileSync(path, JSON.stringify(normalizeConfig(config), null, 2), { encoding: 'utf8', mode: 0o600 })
  try { chmodSync(path, 0o600) } catch {}
}

function normalizeMcpUrl(baseUrl) {
  const raw = String(baseUrl || '').trim()
  if (raw === '') throw new Error('服务地址不能为空')
  let url
  try { url = new URL(raw) } catch { throw new Error('服务地址不是合法 URL') }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('服务地址必须是 http 或 https')
  if (url.username !== '' || url.password !== '') throw new Error('服务地址不能包含用户名或密码')
  const loopback = ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname)
  if (!loopback && url.protocol !== 'https:') throw new Error('远程地址必须使用 HTTPS')
  url.hash = ''
  url.search = ''
  const pathname = url.pathname.replace(/\/+$/, '')
  url.pathname = pathname.endsWith('/mcp') ? pathname : `${pathname}/mcp`
  return url.toString()
}

function maskToken(token) {
  if (typeof token !== 'string' || token.length === 0) return ''
  return `${token.slice(0, 8)}…`
}

function expressionPrompt(config) {
  // 没有令牌 = 未连接：不要注入“可以用表情包工具”的提示，否则模型会尝试调用不存在的工具
  if (!config.auto || config.token === '') return null
  const frequency = config.frequency === 'subtle'
    ? '只在情绪非常强烈、或用户先用了表情包时配图。'
    : config.frequency === 'active'
      ? (config.allowSerious
          ? '大多数轻松、或语气合适的回复都可以配一张图。'
          : '大多数轻松、非严肃的回复都可以配一张图。')
      : '当回复本身带有明显情绪、且配图能让表达更自然时配图。'
  const seriousRule = config.allowSerious
    ? '工作、技术讨论、代码、会议等严肃场景也允许配图，但只在能缓和语气、不影响信息表达时使用。'
    : '严肃、工作、技术讨论、代码、会议场景不发。'
  const scenes = config.scenes.length > 0 ? config.scenes.join('、') : '开心、吐槽、无语、庆祝、安慰'
  return [
    '## 表情包表达',
    '你可以使用 MeMeMio 的表情包工具。',
    `${frequency}适合配图的场景：${scenes}。`,
    '需要配图时，调用 mcp__mememio__pick_meme_for_reply：message 传 10–20 字的意图摘要'
      + '（例如“被需求折腾到无语”“庆祝一下”），并传 inline=false、limit=5。',
    '拿到结果后，先读 chosen 和 alternatives 的 description、ocrText、labels，'
      + '再从中选一张最贴合当前语境的；不要默认直接用 chosen。',
    '选中后，把该候选的 url 用 Markdown 图片语法放进回复（如 ![描述](url)）；'
      + '不要用 thumbUrl，也不要为了选图再调用 search_memes 或 random_meme。',
    '默认不要调用 get_meme_image。只有文字描述不足以判断时（例如两条候选难分、'
      + '或担心图文不符），才对最终选中的那一张调用 mcp__mememio__get_meme_image'
      + '（memeId 传该候选 id，inline=true）确认；确认后仍用该图的 url 发。'
      + '每轮最多取图 1 次，不要对多个候选逐张取图。',
    '规则：',
    '- 每轮最多 1 张；每轮只调用一次 pick_meme_for_reply；不要为了发而发；'
      + '不要用图片替代文字；如果所有候选都不贴合，就不发。',
    `- ${seriousRule}`,
    '- 用户明确说不要表情包时，不主动发。',
    '- 成人向内容不主动使用；是否可用由 MeMeMio 的内容范围设置决定。',
    '- 不需要用户先下“发个表情包”的指令。',
  ].join('\n')
}

function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  })
  res.end(JSON.stringify(body))
}

function isLoopbackAddress(address) {
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

function sameOrigin(req) {
  const host = req.headers.host
  if (typeof host !== 'string' || host.length === 0) return false
  if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(host)) return false
  const origin = req.headers.origin
  if (origin === undefined) return true
  return origin === `http://${host}` || origin === `https://${host}`
}

function guard(req, res) {
  if (!isLoopbackAddress(req.socket?.remoteAddress) || !sameOrigin(req)) {
    json(res, 403, { error: { code: 'FORBIDDEN', message: '仅允许本机同源访问' } })
    return false
  }
  return true
}

async function readJsonBody(req, maxBytes = 16 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > maxBytes) return undefined
    chunks.push(Buffer.from(chunk))
  }
  try {
    const text = Buffer.concat(chunks).toString('utf8')
    return text === '' ? {} : JSON.parse(text)
  } catch {
    return undefined
  }
}

async function probeMcp(baseUrl, token) {
  const url = normalizeMcpUrl(baseUrl)
  if (typeof token !== 'string' || !/^mcp_[A-Za-z0-9_-]+$/.test(token)) {
    const error = new Error('访问令牌格式不对，应以 mcp_ 开头')
    error.code = 'BAD_TOKEN'
    throw error
  }
  const started = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        'mcp-protocol-version': '2026-07-28',
        'mcp-method': 'tools/list',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '2026-07-28',
            'io.modelcontextprotocol/clientInfo': { name: 'dsh-mememio', version: '0.1.0' },
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      }),
    })
  } catch (error) {
    const wrapped = new Error(controller.signal.aborted ? '连接超时（8 秒）' : '连不上服务，检查地址与网络')
    wrapped.code = controller.signal.aborted ? 'TIMEOUT' : 'NETWORK'
    wrapped.cause = error
    throw wrapped
  } finally {
    clearTimeout(timer)
  }

  const text = await response.text()
  if (response.status === 401) {
    const error = new Error('令牌无效、已被撤销或已过期（HTTP 401）')
    error.code = 'UNAUTHORIZED'
    error.httpStatus = 401
    throw error
  }
  if (response.status === 404) {
    const error = new Error('地址不对（HTTP 404），确认是站点地址，插件会自动补 /mcp')
    error.code = 'NOT_FOUND'
    error.httpStatus = 404
    throw error
  }
  if (response.status === 429) {
    const error = new Error('被 MeMeMio 限流（HTTP 429），稍后重试')
    error.code = 'RATE_LIMITED'
    error.httpStatus = 429
    throw error
  }
  if (!response.ok) {
    const error = new Error(`MeMeMio 返回 HTTP ${response.status}`)
    error.code = 'HTTP_ERROR'
    error.httpStatus = response.status
    throw error
  }

  const dataLine = text.split('\n').find((line) => line.startsWith('data: '))
  let body
  try {
    body = JSON.parse(dataLine === undefined ? text : dataLine.slice(6))
  } catch {
    const error = new Error('响应不是合法 JSON-RPC（可能是地址写错或反向代理拦截）')
    error.code = 'BAD_RESPONSE'
    throw error
  }
  if (body?.error) {
    const error = new Error(`MCP 错误：${body.error.message || '未知错误'}`)
    error.code = 'MCP_ERROR'
    throw error
  }
  const tools = Array.isArray(body?.result?.tools) ? body.result.tools : []
  if (tools.length === 0) {
    const error = new Error('连接成功但没有发现工具；确认该令牌可以访问 MeMeMio MCP')
    error.code = 'NO_TOOLS'
    throw error
  }
  return {
    ok: true,
    url,
    latencyMs: Date.now() - started,
    tools: tools.map((tool) => ({ name: tool.name, description: tool.description ?? '' })),
  }
}

function stateOf(ctx, config) {
  let tools = []
  try {
    tools = ctx.tools.schemas()
      .map((schema) => schema.name)
      .filter((schemaName) => schemaName.startsWith('mcp__mememio__'))
  } catch {
    // profile reload / MCP row swap 的瞬间工具表可能正在重建；状态接口退化为空列表
  }
  return {
    baseUrl: config.baseUrl,
    tokenMasked: maskToken(config.token),
    hasToken: config.token !== '',
    auto: config.auto,
    frequency: config.frequency,
    scenes: config.scenes,
    allowSerious: config.allowSerious,
    tools,
    connected: tools.length > 0,
  }
}

async function findMcpRow(ctx) {
  try {
    const plugins = await ctx.pluginManager.listPlugins()
    return plugins.find((plugin) => plugin.patchId === 'mememio-mcp')
      ?? plugins.find((plugin) => plugin.moduleName === '@deepseek-ai/dsh-mcp-client')
      ?? null
  } catch {
    return null
  }
}

async function setMcpEnabled(ctx, enabled, options = {}) {
  const row = await findMcpRow(ctx)
  if (row === null) return { restartRequired: true }
  if (row.enabled === enabled && options.reload !== true) return { restartRequired: false }
  if (enabled && row.enabled === true && options.reload === true) {
    await ctx.pluginManager.setPluginEnabled(row.entryId, false)
  }
  const result = await ctx.pluginManager.setPluginEnabled(row.entryId, enabled)
  return { restartRequired: result.application === 'restart-required', result }
}

export const name = NAME
export const inject = ['tools', 'systemPrompt', 'webServer', 'pluginManager']

export function apply(ctx) {
  let config = readConfig()
  let promptDispose = null
  const disposers = []

  function syncPrompt() {
    if (promptDispose !== null) {
      promptDispose()
      promptDispose = null
    }
    const text = expressionPrompt(config)
    if (text !== null) {
      promptDispose = ctx.systemPrompt.section({ name: 'mememio-expression', order: 90, text })
    }
  }

  function route(method, path, handler) {
    const disposable = ctx.webServer.register({
      kind: 'exact',
      path: `${ROUTE_PREFIX}/${path}`,
      handler: async (req, res) => {
        if (req.method !== method) {
          json(res, 405, { error: { code: 'METHOD_NOT_ALLOWED', message: `只支持 ${method}` } })
          return
        }
        if (!guard(req, res)) return
        try {
          await handler(req, res)
        } catch (error) {
          json(res, 500, { error: { code: 'INTERNAL', message: String(error?.message || error) } })
        }
      },
    })
    disposers.push(disposable)
  }

  route('GET', 'state', async (_req, res) => {
    config = readConfig()
    json(res, 200, stateOf(ctx, config))
  })

  route('POST', 'test', async (req, res) => {
    const body = await readJsonBody(req)
    if (body === undefined) {
      json(res, 400, { error: { code: 'BAD_BODY', message: '请求体不合法' } })
      return
    }
    try {
      // 已连接时 UI 只回传地址；token 在 Host 侧读取，避免浏览器再持有完整值
      const token = typeof body.token === 'string' && body.token.trim() !== ''
        ? body.token.trim()
        : config.token
      const baseUrl = typeof body.baseUrl === 'string' && body.baseUrl.trim() !== ''
        ? body.baseUrl
        : config.baseUrl
      const result = await probeMcp(baseUrl, token)
      json(res, 200, { ok: true, ...result })
    } catch (error) {
      json(res, 200, {
        ok: false,
        error: { code: error.code || 'ERROR', message: error.message, httpStatus: error.httpStatus },
      })
    }
  })

  route('POST', 'connect', async (req, res) => {
    const body = await readJsonBody(req)
    if (body === undefined) {
      json(res, 400, { error: { code: 'BAD_BODY', message: '请求体不合法' } })
      return
    }
    try {
      const probe = await probeMcp(body.baseUrl, body.token)
      config = normalizeConfig({
        ...config,
        baseUrl: body.baseUrl,
        token: body.token,
      })
      writeConfig(config)
      // 先注册提示（此时当前上下文仍然 active），再切换 MCP 行；
      // 切换可能让上下文短暂 inactive，不能把 systemPrompt 放在它后面。
      syncPrompt()
      let warning
      try {
        await setMcpEnabled(ctx, true, { reload: true })
      } catch (error) {
        warning = `配置已保存，但 MCP 行重载失败：${String(error?.message || error)}`
      }
      await new Promise((resolve) => setTimeout(resolve, 700))
      json(res, 200, {
        ok: true,
        restartRequired: false,
        warning,
        latencyMs: probe.latencyMs,
        state: stateOf(ctx, config),
      })
    } catch (error) {
      json(res, 200, {
        ok: false,
        error: { code: error.code || 'ERROR', message: error.message, httpStatus: error.httpStatus },
      })
    }
  })

  route('POST', 'disconnect', async (_req, res) => {
    config = normalizeConfig({ ...config, token: '' })
    writeConfig(config)
    // 先移除“表情包表达”提示（token 为空后 expressionPrompt 返回 null），再关 MCP 行；
    // 避免断开后模型仍看到“你有表情包工具”的提示。
    syncPrompt()
    let warning
    try {
      await setMcpEnabled(ctx, false)
    } catch (error) {
      warning = `令牌已删除，但 MCP 行关闭失败：${String(error?.message || error)}`
    }
    json(res, 200, { ok: true, warning, state: stateOf(ctx, config) })
  })

  route('POST', 'prefs', async (req, res) => {
    const body = await readJsonBody(req)
    if (body === undefined) {
      json(res, 400, { error: { code: 'BAD_BODY', message: '请求体不合法' } })
      return
    }
    config = normalizeConfig({ ...config, auto: body.auto, frequency: body.frequency, scenes: body.scenes, allowSerious: body.allowSerious })
    writeConfig(config)
    syncPrompt()
    json(res, 200, { ok: true, state: stateOf(ctx, config) })
  })

  syncPrompt()
  ctx.effect(() => () => {
    if (promptDispose !== null) promptDispose()
    for (const dispose of disposers) dispose()
  })
}

