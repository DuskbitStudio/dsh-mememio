import test from 'node:test'
import assert from 'node:assert/strict'

import {
  expressionPrompt,
  normalizeConfig,
  normalizeMcpUrl,
  maskToken,
} from '../index.js'

const connected = {
  baseUrl: 'https://memes.example.com',
  token: 'mcp_test_token',
  auto: true,
  frequency: 'natural',
  scenes: ['开心', '吐槽'],
  allowSerious: false,
}

test('expressionPrompt 只在已连接且开启自动表达时返回提示', () => {
  assert.equal(expressionPrompt({ ...connected, auto: false }), null)
  assert.equal(expressionPrompt({ ...connected, token: '' }), null)
  assert.match(expressionPrompt(connected), /## 表情包表达/)
})

test('expressionPrompt 固化了候选文字复核和最终取图边界', () => {
  const text = expressionPrompt(connected)

  assert.match(text, /inline=false/)
  assert.match(text, /limit=5/)
  assert.match(text, /chosen/)
  assert.match(text, /alternatives/)
  assert.match(text, /description、ocrText、labels/)
  assert.match(text, /不要默认直接用 chosen/)
  assert.match(text, /Markdown 图片语法/)
  assert.match(text, /不要用 thumbUrl/)
  assert.match(text, /get_meme_image/)
  assert.match(text, /每轮最多取图 1 次/)
  assert.match(text, /每轮只调用一次 pick_meme_for_reply/)
  assert.match(text, /如果所有候选都不贴合，就不发/)
  assert.doesNotMatch(text, /把返回的图片放进回复里/)
})

test('expressionPrompt 应用频率和严肃场景规则', () => {
  assert.match(expressionPrompt({ ...connected, frequency: 'subtle' }), /情绪非常强烈/)
  assert.match(expressionPrompt({ ...connected, frequency: 'active', allowSerious: false }), /非严肃/)
  assert.match(expressionPrompt({ ...connected, frequency: 'active', allowSerious: true }), /语气合适/)
  assert.match(expressionPrompt(connected), /明显情绪/)

  assert.match(expressionPrompt({ ...connected, allowSerious: true }), /也允许配图/)
  assert.doesNotMatch(expressionPrompt({ ...connected, allowSerious: false }), /也允许配图/)
})

test('expressionPrompt 使用配置的场景，空场景回退默认值', () => {
  assert.match(
    expressionPrompt({ ...connected, scenes: ['加班', '摆烂'] }),
    /适合配图的场景：加班、摆烂。/,
  )
  assert.match(
    expressionPrompt({ ...connected, scenes: [] }),
    /适合配图的场景：开心、吐槽、无语、庆祝、安慰。/,
  )
})

test('normalizeConfig 归一化地址、令牌、频率、场景和开关', () => {
  assert.deepEqual(
    normalizeConfig({
      baseUrl: '  https://memes.example.com  ',
      token: '  mcp_test_token  ',
      auto: false,
      frequency: 'invalid',
      scenes: ['开心', '不存在', '开心'],
      allowSerious: true,
    }),
    {
      baseUrl: 'https://memes.example.com',
      token: 'mcp_test_token',
      auto: false,
      frequency: 'natural',
      scenes: ['开心'],
      allowSerious: true,
    },
  )
})

test('normalizeConfig 对缺失字段使用默认值，空场景保持为空', () => {
  assert.deepEqual(normalizeConfig({}), {
    baseUrl: 'https://memes.example.com',
    token: '',
    auto: true,
    frequency: 'natural',
    scenes: ['开心', '吐槽', '无语', '庆祝', '安慰'],
    allowSerious: false,
  })
  assert.deepEqual(normalizeConfig({ scenes: [] }).scenes, [])
  assert.equal(normalizeConfig({ allowSerious: 'true' }).allowSerious, false)
})

test('normalizeMcpUrl 补全 /mcp 并清理查询串和 hash', () => {
  assert.equal(normalizeMcpUrl('https://memes.example.com'), 'https://memes.example.com/mcp')
  assert.equal(normalizeMcpUrl('https://memes.example.com/'), 'https://memes.example.com/mcp')
  assert.equal(normalizeMcpUrl('https://memes.example.com/mcp'), 'https://memes.example.com/mcp')
  assert.equal(
    normalizeMcpUrl('https://memes.example.com/api/?x=1#h'),
    'https://memes.example.com/api/mcp',
  )
  assert.equal(normalizeMcpUrl('http://127.0.0.1:3000'), 'http://127.0.0.1:3000/mcp')
  assert.equal(normalizeMcpUrl('http://localhost:3000/mcp/'), 'http://localhost:3000/mcp')
})

test('normalizeMcpUrl 拒绝空地址、非法协议、凭据和非 HTTPS 远程地址', () => {
  assert.throws(() => normalizeMcpUrl(''), /服务地址不能为空/)
  assert.throws(() => normalizeMcpUrl('not a url'), /不是合法 URL/)
  assert.throws(() => normalizeMcpUrl('ftp://memes.example.com'), /http 或 https/)
  assert.throws(
    () => normalizeMcpUrl('https://user:pass@memes.example.com'),
    /不能包含用户名或密码/,
  )
  assert.throws(() => normalizeMcpUrl('http://memes.example.com'), /远程地址必须使用 HTTPS/)
})

test('maskToken 只返回前缀和省略号', () => {
  assert.equal(maskToken(''), '')
  assert.equal(maskToken(undefined), '')
  assert.equal(maskToken('mcp_1234567890'), 'mcp_1234…')
})
