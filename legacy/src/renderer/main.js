import { h, reactive } from 'vue'

export default async function setup(ctx) {
  if (ctx.app !== 'renderer') return
  const ui = ctx.desktopApi?.ui?.settings
  if (!ui) return

  const P = '@examaware-plugins/auto-player'
  const s = reactive({ lp: 31235, clp: 31235, av: 5, dv: 30, ca: 5, cd: 30, ct: '暂无排程', state: 'idle', ok: false, echoIn: '', echoOut: '', echoTime: '' })
  const toast = reactive({ show: false, msg: '', ok: true })
  let t1, t2

  const fmt = ms => { const m = Math.floor(ms/6e4), ss = Math.floor((ms%6e4)/1e3); return String(m).padStart(2,'0')+':'+String(ss).padStart(2,'0') }
  const show = (m, o) => { clearTimeout(t2); toast.msg = m; toast.ok = o; toast.show = true; t2 = setTimeout(() => toast.show = false, 3000) }
  const rlog = async m => { try { await window.api.ipc.invoke('auto-player:log', { level: 'info', msg: m }) } catch {} }

  // Init: load config ONCE to populate input fields + current display
  const init = async () => {
    try {
      const c = await window.api.plugins.getConfig(P)
      if (c) {
        s.clp = c.listenPort ?? 31235
        s.lp = s.clp
        s.ca = c.advanceMinutes ?? 5
        s.cd = c.exitDelaySeconds ?? 30
        s.av = s.ca
        s.dv = s.cd
      }
    } catch {}
  }

  // Poll: only update current config display + countdown, NEVER overwrite user input
  const load = async () => {
    try {
      const c = await window.api.plugins.getConfig(P)
      if (c) {
        s.clp = c.listenPort ?? 31235
        s.ca = c.advanceMinutes ?? 5
        s.cd = c.exitDelaySeconds ?? 30
      }
    } catch {}
    try {
      const st = await window.api.ipc.invoke('auto-player:status')
      s.ok = true
      s.state = st?.state || 'idle'
      const at = st?.nextOpenAt
        if (s.state === 'active') {
          s.ct = '正在放映'
        } else if (s.state === 'opening') {
          s.ct = '正在加载考试档案'
        } else if (s.state === 'error') {
          s.ct = '放映启动失败'
        } else if (s.state === 'disconnected') {
          s.ct = '服务未连接'
        } else if (at) {
          const remain = at - Date.now()
          s.ct = remain > 0 ? '倒计时 ' + fmt(remain) : '即将开始'
        } else {
          s.ct = '暂无排程'
      }
    } catch { s.ok = false; s.state = 'disconnected'; s.ct = '服务未连接' }
  }

  const save = async () => {
    try {
      const updated = await window.api.plugins.patchConfig(P, { listenPort: s.lp, advanceMinutes: s.av, exitDelaySeconds: s.dv })
      if (updated) {
        s.clp = updated.listenPort ?? 31235
        s.lp = s.clp
        s.ca = updated.advanceMinutes ?? 5
        s.cd = updated.exitDelaySeconds ?? 30
        s.av = s.ca
        s.dv = s.cd
      }
      await load()
      rlog('saved port='+s.lp+' '+s.av+'m/'+s.dv+'s'); show('已保存', true)
    } catch (e) { show('失败: '+(e?.message||e), false) }
  }

  const echo = async () => {
    if (!s.echoIn.trim()) return
    try { const r = await window.api.ipc.invoke('auto-player:echo', { text: s.echoIn }); s.echoOut = r?.received || ''; s.echoTime = r?.time || '' }
    catch (e) { s.echoOut = '错误: ' + (e?.message || e); s.echoTime = '' }
  }

  rlog('mounted'); init(); load(); t1 = setInterval(load, 1000)

  const page = {
    render() {
      return h('div', { style: 'padding:20px 24px;max-width:420px' }, [
        h('div', { style: 'display:flex;align-items:center;gap:10px;margin-bottom:10px' }, [
          h('h3', { style: 'margin:0;font-size:18px;font-weight:600' }, '自动放映'),
          h('span', { style: 'color:'+(s.ok?'#6ee7b7':'#f87171')+';font-size:11px;display:inline-flex;align-items:center;gap:5px' }, [
            h('span', { style: 'width:7px;height:7px;border-radius:50%;display:inline-block;background:'+(s.ok?'#6ee7b7':'#f87171') }), s.ok ? '已连接' : '未连接'
          ])
        ]),

        // Port/IP reminder
        h('div', { style: 'margin-bottom:14px;padding:10px 12px;border:1px solid rgba(220,38,38,.3);border-radius:8px;background:rgba(127,29,29,.15)' }, [
          h('div', { style: 'font-size:13px;font-weight:600;color:#fca5a5;margin-bottom:3px' }, 'CI 与 EA 的 IP / 端口必须完全一致'),
          h('div', { style: 'font-size:12px;color:#fca5a5;opacity:.8' }, 'CI 端地址与端口需和这里的监听端口一致，否则无法连接')
        ]),

        h('div', { style: 'margin-bottom:18px;padding:12px 14px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:rgba(255,255,255,.03)' }, [
          h('div', { style: 'font-size:11px;color:#666;margin-bottom:6px;text-transform:uppercase;letter-spacing:.5px' }, '当前配置'),
          h('div', { style: 'display:flex;gap:32px' }, [
            h('div', null, [h('span', { style: 'font-size:12px;color:#888' }, '监听端口 '), h('span', { style: 'font-size:14px;font-weight:600' }, String(s.clp))]),
            h('div', null, [h('span', { style: 'font-size:12px;color:#888' }, '提前启动 '), h('span', { style: 'font-size:14px;font-weight:600' }, s.ca + ' 分钟')]),
            h('div', null, [h('span', { style: 'font-size:12px;color:#888' }, '延迟退出 '), h('span', { style: 'font-size:14px;font-weight:600' }, s.cd + ' 秒')])
          ])
        ]),
        h('div', { style: 'margin-bottom:16px' }, [
          h('label', { style: 'display:block;font-size:14px;margin-bottom:5px' }, '监听端口'),
          h('input', { type: 'number', min: 1, max: 65535, value: s.lp, onInput: e => s.lp = Number(e.target.value), style: 'padding:7px 10px;border:1px solid rgba(255,255,255,.15);border-radius:6px;background:rgba(255,255,255,.05);color:inherit;font-size:13px;outline:none;width:110px' })
        ]),
        h('div', { style: 'margin-bottom:18px;padding:10px 14px;border:1px solid rgba(91,140,255,.25);border-radius:8px;background:rgba(91,140,255,.06)' }, [
          h('span', { style: 'font-size:12px;color:#888' }, '距离下一次自动放映：'),
          h('span', { style: 'font-size:16px;font-weight:700;color:#5b8cff;margin-left:8px;font-family:monospace' }, s.ct)
        ]),
        h('div', { style: 'margin-bottom:16px' }, [
          h('label', { style: 'display:block;font-size:14px;margin-bottom:5px' }, '提前启动（分钟）'),
          h('input', { type: 'number', min: 0, max: 60, value: s.av, onInput: e => s.av = Number(e.target.value), style: 'padding:7px 10px;border:1px solid rgba(255,255,255,.15);border-radius:6px;background:rgba(255,255,255,.05);color:inherit;font-size:13px;outline:none;width:90px' })
        ]),
        h('div', { style: 'margin-bottom:20px' }, [
          h('label', { style: 'display:block;font-size:14px;margin-bottom:5px' }, '延迟退出（秒）'),
          h('input', { type: 'number', min: 0, max: 300, value: s.dv, onInput: e => s.dv = Number(e.target.value), style: 'padding:7px 10px;border:1px solid rgba(255,255,255,.15);border-radius:6px;background:rgba(255,255,255,.05);color:inherit;font-size:13px;outline:none;width:90px' })
        ]),
        h('button', { onClick: save, style: 'padding:7px 20px;border:none;border-radius:6px;background:#5b8cff;color:#fff;font-size:13px;cursor:pointer' }, '保存设置'),

        // IPC Echo Test
        h('div', { style: 'margin-top:24px;padding-top:18px;border-top:1px solid rgba(255,255,255,.08)' }, [
          h('div', { style: 'font-size:11px;color:#666;margin-bottom:10px;text-transform:uppercase;letter-spacing:.5px' }, 'IPC TEST (DEV)'),
          h('div', { style: 'display:flex;gap:8px;margin-bottom:10px' }, [
            h('input', { type: 'text', value: s.echoIn, placeholder: '输入测试消息...', onInput: e => s.echoIn = e.target.value, style: 'flex:1;padding:7px 10px;border:1px solid rgba(255,255,255,.15);border-radius:6px;background:rgba(255,255,255,.05);color:inherit;font-size:13px;outline:none' }),
            h('button', { onClick: echo, style: 'padding:7px 14px;border:1px solid rgba(255,255,255,.2);border-radius:6px;background:transparent;color:inherit;font-size:13px;cursor:pointer;white-space:nowrap' }, '发送')
          ]),
          s.echoOut ? h('div', { style: 'padding:8px 12px;border-radius:6px;background:rgba(91,140,255,.06);border:1px solid rgba(91,140,255,.15);font-size:13px' }, [
            h('div', { style: 'color:#888;margin-bottom:4px' }, '收到回显：'),
            h('div', { style: 'color:#5b8cff;font-family:monospace' }, s.echoOut),
            s.echoTime ? h('div', { style: 'color:#666;font-size:11px;margin-top:4px' }, s.echoTime) : null
          ]) : null
        ]),
        toast.show ? h('div', { style: 'position:fixed;top:24px;right:24px;padding:10px 18px;border-radius:6px;font-size:13px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,.3);background:'+(toast.ok?'#065f46':'#7f1d1d')+';color:'+(toast.ok?'#6ee7b7':'#fca5a5')+';border:1px solid '+(toast.ok?'#059669':'#dc2626') }, toast.msg) : null
      ])
    }
  }

  ctx.effect(() => () => clearInterval(t1))
  const hnd = await ui.registerPage({ id: 'examaware-auto-player-settings', label: '自动放映', icon: 'play-circle', order: 50, component: () => Promise.resolve(page) })
  if (hnd) ctx.effect(() => () => hnd.dispose())
}

