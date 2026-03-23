const defaultState = {
  page: 'loading',
  selectedStageId: '1-1',
  selectedHeroId: 'hero_001',
  toast: '',
  battleResult: null,
  battleLogs: [],
  user: {
    nickname: '云游散修',
    level: 1,
    exp: 0
  },
  resources: {
    stamina: 20,
    gold: 1000,
    spiritStone: 36
  },
  progression: {
    tutorialDone: false,
    unlockedStages: ['1-1'],
    clearedStages: []
  },
  heroes: {},
  heroOrder: []
}

const SAVE_KEY = 'wenxin-xiuxing-save'

const BASE_URL = import.meta.env.BASE_URL || './'

function assetUrl(path) {
  return `${BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`
}

async function loadJson(path) {
  const url = assetUrl(path)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`load failed: ${url}`)
  return res.json()
}

function loadSave() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY) || 'null')
  } catch {
    return null
  }
}

function saveState(state) {
  localStorage.setItem(SAVE_KEY, JSON.stringify({
    user: state.user,
    resources: state.resources,
    progression: state.progression,
    heroes: state.heroes,
    heroOrder: state.heroOrder
  }))
}

function mergeState(base, saved) {
  if (!saved) return base
  return {
    ...base,
    user: { ...base.user, ...saved.user },
    resources: { ...base.resources, ...saved.resources },
    progression: { ...base.progression, ...saved.progression },
    heroes: { ...base.heroes, ...saved.heroes },
    heroOrder: saved.heroOrder || base.heroOrder
  }
}

function heroPower(hero) {
  return hero.basePower + (hero.level - 1) * 28
}

function totalPower(state) {
  return state.heroOrder.reduce((sum, id) => {
    const hero = state.heroes[id]
    return sum + (hero ? heroPower(hero) : 0)
  }, 0)
}

function getStage(stages, id) {
  return stages.find((s) => s.id === id) || stages[0]
}

function rewardText(rewards) {
  return `金币 ${rewards.gold} / 灵石 ${rewards.spiritStone} / 修为 ${rewards.exp}`
}

function chapterStatus(state) {
  return `${state.progression.clearedStages.length}/${state.progression.unlockedStages.length} 已勘破`
}

function battleSim(stage, state) {
  const power = totalPower(state)
  const ratio = Math.max(0.2, Math.min(0.95, power / (stage.recommendedPower * 1.08)))
  const win = Math.random() < ratio
  const logs = [
    `沈青岚先起一剑，直指${stage.name}。`,
    '白栀凝神回息，稳住阵脚。',
    '顾长风引灵火，逼退幻影。',
    win ? '你道心不乱，一举破关。' : '你心神微乱，此战失利。'
  ]
  return { win, logs }
}

function createButton(text, className, onClick) {
  return `<button class="btn ${className}" ${onClick ? `data-action="${onClick}"` : 'disabled style="opacity:.55;cursor:not-allowed;"'}>${text}</button>`
}

function createApp() {
  const app = document.querySelector('#app')
  const state = structuredClone(defaultState)
  let stages = []

  Promise.all([
    loadJson('/mock/stages.json'),
    loadJson('/mock/heroes.json')
  ]).then(([stageData, heroData]) => {
    stages = stageData
    heroData.forEach((hero) => {
      state.heroes[hero.id] = { ...hero }
      state.heroOrder.push(hero.id)
    })
    Object.assign(state, mergeState(state, loadSave()))
    render()
    setTimeout(() => {
      state.page = 'login'
      render()
    }, 1000)
  }).catch((err) => {
    app.innerHTML = `<div class="shell"><div class="result-card"><h2>加载失败</h2><p>${err.message}</p></div></div>`
  })

  function setToast(text) {
    state.toast = text
    render()
    window.clearTimeout(setToast.timer)
    setToast.timer = window.setTimeout(() => {
      state.toast = ''
      render()
    }, 1800)
  }

  function startGame() {
    state.page = 'home'
    render()
    if (!state.progression.tutorialDone) {
      setTimeout(() => {
        state.page = 'tutorial'
        render()
      }, 150)
    }
  }

  function handleAction(action) {
    if (!action) return
    const stage = getStage(stages, state.selectedStageId)
    if (action === 'start-game') return startGame()
    if (action === 'finish-tutorial') {
      state.progression.tutorialDone = true
      saveState(state)
      state.page = 'home'
      return render()
    }
    if (action.startsWith('go:')) {
      state.page = action.replace('go:', '')
      return render()
    }
    if (action.startsWith('stage:')) {
      state.selectedStageId = action.replace('stage:', '')
      state.page = 'prepare'
      return render()
    }
    if (action === 'start-battle') {
      if (state.resources.stamina < stage.staminaCost) return setToast('体力不足，且先歇息')
      state.resources.stamina -= stage.staminaCost
      const result = battleSim(stage, state)
      state.battleLogs = result.logs
      state.battleResult = result.win ? 'win' : 'lose'
      if (result.win) {
        state.resources.gold += stage.rewards.gold
        state.resources.spiritStone += stage.rewards.spiritStone
        state.user.exp += stage.rewards.exp
        if (!state.progression.clearedStages.includes(stage.id)) {
          state.progression.clearedStages.push(stage.id)
          const next = stages[stages.findIndex((s) => s.id === stage.id) + 1]
          if (next && !state.progression.unlockedStages.includes(next.id)) {
            state.progression.unlockedStages.push(next.id)
            setToast('新试炼已开')
          }
        }
      }
      if (state.user.exp >= 100) {
        state.user.level += 1
        state.user.exp -= 100
        setToast('心境突破，修为精进')
      }
      saveState(state)
      state.page = 'battle'
      return render()
    }
    if (action === 'finish-battle') {
      state.page = 'result'
      return render()
    }
    if (action === 'train-hero') {
      const hero = state.heroes[state.selectedHeroId]
      const cost = hero.level * 120
      if (state.resources.gold < cost) return setToast('金币不足，暂不能修行')
      state.resources.gold -= cost
      hero.level += 1
      saveState(state)
      setToast(`${hero.name} 修为已至 Lv.${hero.level}`)
      return render()
    }
    if (action.startsWith('hero:')) {
      state.selectedHeroId = action.replace('hero:', '')
      return render()
    }
    if (action === 'reset-save') {
      localStorage.removeItem(SAVE_KEY)
      location.reload()
    }
  }

  function renderLoading() {
    return `
      <div class="shell center" style="display:flex;align-items:center;justify-content:center;">
        <div>
          <div class="pill" style="display:inline-flex;margin-bottom:12px;">山门将启</div>
          <h1 style="font-size:34px;margin:0 0 8px;letter-spacing:6px;">问心修行录</h1>
          <p class="small">先问本心，再破诸关。</p>
          <div class="battle-arena" style="margin-top:18px;">灵脉汇聚中</div>
        </div>
      </div>`
  }

  function renderLogin() {
    return `
      <div class="shell" style="display:flex;flex-direction:column;justify-content:center;min-height:100vh;">
        <div class="hero-card center">
          <div class="pill" style="display:inline-flex;margin-bottom:12px;">仙门已启</div>
          <div class="hero-name">问心修行录</div>
          <p class="hero-sub">一卷轻修行，且入此山门</p>
          <div class="battle-arena center">
            <div>以散修之身入门，历试炼，问道心。</div>
            <div class="ink-divider"></div>
            <div class="small">当前为试玩版，进度仅保存在本机。</div>
          </div>
          <div class="hero-actions">
            ${createButton('入山问道', 'btn-primary', 'start-game')}
          </div>
        </div>
      </div>`
  }

  function renderTop() {
    return `
      <div class="topbar">
        <div class="brand">
          <h1>问心修行录</h1>
          <p>${state.user.nickname} · 炼气 ${state.user.level} 层</p>
        </div>
        <div class="pill">总战力 ${totalPower(state)}</div>
      </div>
      <div class="resource-bar">
        <div class="resource-item"><div class="label">体力</div><div class="value">${state.resources.stamina}</div></div>
        <div class="resource-item"><div class="label">金币</div><div class="value">${state.resources.gold}</div></div>
        <div class="resource-item"><div class="label">灵石</div><div class="value">${state.resources.spiritStone}</div></div>
        <div class="resource-item"><div class="label">修为</div><div class="value">${state.user.exp}/100</div></div>
      </div>`
  }

  function renderHome() {
    const leadHero = state.heroes[state.heroOrder[0]]
    return `
      <div class="shell">
        ${renderTop()}
        <div class="hero-card">
          <div class="hero-header">
            <div>
              <div class="hero-name">${leadHero.name}</div>
              <div class="hero-sub">${leadHero.title} · ${leadHero.role}</div>
            </div>
            <div class="power">主队战力 ${totalPower(state)}</div>
          </div>
          <div class="battle-arena">
            <div>宗门有令：先历三试，再谈破境。</div>
            <div class="ink-divider"></div>
            <div class="kv-grid">
              <div class="kv-item"><div class="k">当前境界</div><div class="v">炼气 ${state.user.level} 层</div></div>
              <div class="kv-item"><div class="k">心关进度</div><div class="v">${chapterStatus(state)}</div></div>
            </div>
          </div>
          <div class="hero-actions">
            ${createButton('前往试炼', 'btn-primary', 'go:stage')}
            ${createButton('弟子修行', 'btn-secondary', 'go:hero')}
          </div>
        </div>
        <div class="section-title"><h2>今日修行</h2><span>道途初开</span></div>
        <div class="stage-list">
          <div class="stage-card"><div class="tag">主线</div><h3>山门试炼</h3><div class="small">破幻境、拿资源、推进章节。每次挑战都会消耗体力。</div></div>
          <div class="stage-card"><div class="tag">养成</div><h3>弟子修行</h3><div class="small">闭关养成，战力将左右胜负。</div></div>
        </div>
        ${renderNav('home')}
      </div>`
  }

  function renderStages() {
    return `
      <div class="shell">
        ${renderTop()}
        <div class="section-title"><h2>山门试炼</h2><span>第一章 · 初入山门</span></div>
        <div class="stage-list">
          ${stages.map((stage) => {
            const unlocked = state.progression.unlockedStages.includes(stage.id)
            const cleared = state.progression.clearedStages.includes(stage.id)
            return `
              <div class="stage-card">
                <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">
                  <div>
                    <div class="tag">${cleared ? '已破关' : unlocked ? '可试炼' : '未开启'}</div>
                    <h3 style="margin:10px 0 4px;">${stage.id} · ${stage.name}</h3>
                  </div>
                  <div class="power">荐战 ${stage.recommendedPower}</div>
                </div>
                <div class="stage-meta">
                  <span>体力 ${stage.staminaCost}</span>
                  <span>${rewardText(stage.rewards)}</span>
                </div>
                <div class="action-row">
                  ${createButton(unlocked ? '前往破关' : '暂未开启', unlocked ? 'btn-primary' : 'btn-secondary', unlocked ? `stage:${stage.id}` : '')}
                </div>
              </div>`
          }).join('')}
        </div>
        ${renderNav('stage')}
      </div>`
  }

  function renderPrepare() {
    const stage = getStage(stages, state.selectedStageId)
    return `
      <div class="shell">
        ${renderTop()}
        <div class="hero-card">
          <div class="tag">临阵整备</div>
          <div class="hero-name" style="margin-top:10px;">${stage.name}</div>
          <div class="hero-sub">推荐战力 ${stage.recommendedPower} · 消耗体力 ${stage.staminaCost}</div>
          <div class="battle-arena">
            <div>可得：${rewardText(stage.rewards)}</div>
            <div class="ink-divider"></div>
            <div>当前战力：${totalPower(state)}</div>
          </div>
          <div class="hero-actions">
            ${createButton('踏入试炼', 'btn-primary', 'start-battle')}
            ${createButton('返回关卡', 'btn-secondary', 'go:stage')}
          </div>
        </div>
        ${renderNav('stage')}
      </div>`
  }

  function renderBattle() {
    const stage = getStage(stages, state.selectedStageId)
    const win = state.battleResult === 'win'
    const powerRatio = Math.min(100, Math.round(totalPower(state) / stage.recommendedPower * 100))
    return `
      <div class="shell">
        ${renderTop()}
        <div class="section-title"><h2>试炼之中</h2><span>${stage.name}</span></div>
        <div class="battle-arena">
          <div class="hp-row">
            <div class="hp-box"><div>我方灵息</div><div class="hp-bar"><div class="hp-fill" style="width:${Math.max(42, powerRatio)}%"></div></div></div>
            <div class="hp-box enemy"><div>心魔幻影</div><div class="hp-bar"><div class="hp-fill" style="width:${win ? 8 : 35}%"></div></div></div>
          </div>
          <div class="pill">${win ? '心关已破' : '灵势稍弱'}</div>
        </div>
        <div class="battle-log">
          <strong>斗法记录</strong>
          <div class="log-list">
            ${state.battleLogs.map((log) => `<div class="log-item">${log}</div>`).join('')}
          </div>
          <div class="hero-actions">
            ${createButton('查看结果', 'btn-primary', 'finish-battle')}
          </div>
        </div>
      </div>`
  }

  function renderResult() {
    const stage = getStage(stages, state.selectedStageId)
    const win = state.battleResult === 'win'
    return `
      <div class="shell">
        ${renderTop()}
        <div class="result-card center">
          <div class="pill" style="display:inline-flex;margin-bottom:12px;">${win ? '破关成功' : '道心未定'}</div>
          <div class="hero-name">${win ? '已破此关' : '暂且收势'}</div>
          <p class="hero-sub">${win ? '你稳住心神，携修行资源而归。' : '此番尚欠火候，养成之后再来。'}</p>
          <div class="battle-arena">
            ${win ? `所得：${rewardText(stage.rewards)}` : '不妨先修行弟子，再来破关。'}
          </div>
          <div class="result-actions">
            ${createButton('返回山门', 'btn-primary', 'go:home')}
            ${createButton('前往修行', 'btn-secondary', 'go:hero')}
          </div>
        </div>
      </div>`
  }

  function renderHero() {
    const hero = state.heroes[state.selectedHeroId]
    const upgradeCost = hero.level * 120
    return `
      <div class="shell">
        ${renderTop()}
        <div class="section-title"><h2>弟子修行</h2><span>养成越深，战力越盛</span></div>
        <div class="stage-list">
          ${state.heroOrder.map((id) => {
            const item = state.heroes[id]
            const active = id === state.selectedHeroId
            return `
              <div class="stage-card" style="border-color:${active ? 'rgba(226,194,135,.45)' : 'var(--border)'};">
                <div style="display:flex;justify-content:space-between;gap:10px;align-items:center;">
                  <div>
                    <h3 style="margin:0 0 4px;">${item.name}</h3>
                    <div class="small">${item.title} · ${item.role}</div>
                  </div>
                  <div class="power">战力 ${heroPower(item)}</div>
                </div>
                <div class="stage-meta"><span>Lv.${item.level}</span><span>${'★'.repeat(item.rarity)}</span></div>
                <div class="action-row">${createButton(active ? '当前所选' : '选为主修', active ? 'btn-secondary' : 'btn-primary', active ? '' : `hero:${id}`)}</div>
              </div>`
          }).join('')}
        </div>
        <div class="hero-card" style="margin-top:16px;">
          <div class="hero-header">
            <div>
              <div class="hero-name">${hero.name}</div>
              <div class="hero-sub">${hero.title}</div>
            </div>
            <div class="power">Lv.${hero.level}</div>
          </div>
          <div class="battle-arena">
            修行消耗：${upgradeCost} 金币 · 战力：${heroPower(hero)}
          </div>
          <div class="hero-actions">
            ${createButton('闭关修行', 'btn-primary', 'train-hero')}
            ${createButton('返回山门', 'btn-secondary', 'go:home')}
          </div>
        </div>
        ${renderNav('hero')}
      </div>`
  }

  function renderTutorial() {
    return `
      <div class="overlay">
        <div class="modal-card">
          <div class="pill">入门引导</div>
          <h2>你的修行路径</h2>
          <ol class="small" style="line-height:1.8;padding-left:18px;">
            <li>先去山门试炼，消耗体力挑战关卡。</li>
            <li>斗法结果会依据当前总战力决定。</li>
            <li>带回资源后，闭关修行，再破后续心关。</li>
          </ol>
          <div class="hero-actions">
            ${createButton('明白了，入山', 'btn-primary', 'finish-tutorial')}
          </div>
        </div>
      </div>`
  }

  function renderNav(active) {
    const items = [
      ['home', '山门'],
      ['stage', '试炼'],
      ['hero', '修行'],
      ['reset-save', '重置']
    ]
    return `
      <div class="nav">
        ${items.map(([page, label]) => `<button class="${active === page ? 'active' : ''}" data-action="${page === 'reset-save' ? 'reset-save' : `go:${page}`}">${label}</button>`).join('')}
      </div>`
  }

  function renderBasePage() {
    if (state.page === 'loading') return renderLoading()
    if (state.page === 'login') return renderLogin()
    if (state.page === 'home') return renderHome()
    if (state.page === 'stage') return renderStages()
    if (state.page === 'prepare') return renderPrepare()
    if (state.page === 'battle') return renderBattle()
    if (state.page === 'result') return renderResult()
    if (state.page === 'hero') return renderHero()
    if (state.page === 'tutorial') return renderHome()
    return renderHome()
  }

  function bindActions() {
    app.querySelectorAll('[data-action]').forEach((el) => {
      el.addEventListener('click', () => handleAction(el.dataset.action))
    })
  }

  function render() {
    app.innerHTML = renderBasePage() + (state.page === 'tutorial' ? renderTutorial() : '') + (state.toast ? `<div class="toast">${state.toast}</div>` : '')
    bindActions()
  }
}

export { createApp }
