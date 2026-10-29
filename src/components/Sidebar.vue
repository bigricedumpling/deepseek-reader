<template>
  <!--
    桌面端横向排知识库栏与文档树；手机端知识库列表改为弹窗。
  -->
  <div class="app-sidebar flex h-full flex-shrink-0">
    <!-- 手机端切换列表才用遮罩；桌面保留并排的知识库列表。 -->
    <transition name="lib-backdrop">
      <button
        v-if="libPanel.open && isMobileLibView()"
        class="lib-modal-backdrop"
        aria-label="关闭知识库弹窗"
        @click="closeLibPanel"
      />
    </transition>
    <!-- 快速切换列表，顺序由用户选择：挂到整窗最左列，位于顶栏之外。 -->
    <Teleport to="#app-lib-panel-slot">
    <transition name="lib-panel">
      <aside
        v-if="libPanel.open"
        class="lib-panel"
        :class="{ 'is-tree-collapsed': collapsed }"
        :style="{ '--lib-w': libWidth + 'px' }"
        aria-label="知识库列表"
        @click.stop="onLibPanelClick"
      >
        <div class="lib-panel-head">
          <span class="lib-panel-title">知识库</span>
          <span class="lib-panel-head-acts">
            <button class="icon-btn" :class="{ 'is-active': tree.menu.kind === 'lib-sort' }" title="排序知识库" aria-label="排序知识库" :aria-expanded="tree.menu.kind === 'lib-sort'" @click.stop="openLibSortMenu">
              <PhSortAscending :size="15" />
            </button>
            <button v-if="!isGuest" class="icon-btn lib-create-toggle" :class="{ 'is-open': libCreate.active }" title="新建知识库" aria-label="新建知识库" @mousedown.prevent @click.stop="createLib">
              <PhPlus :size="14" />
            </button>
            <button class="icon-btn" title="关闭知识库" aria-label="关闭知识库" @click="closeLibPanel">
              <PhCaretDoubleLeft :size="15" class="lib-close-desktop" />
              <PhX :size="15" class="lib-close-mobile" />
            </button>
          </span>
        </div>

        <input ref="libIconInput" type="file" accept="image/*" class="hidden" @change="onPickLibIcon" />

        <div class="lib-panel-resize" title="拖动调整知识库栏宽度" @pointerdown.stop="startLibResize" />

        <div ref="libListEl" class="lib-panel-list">
          <span class="lib-row-blob" :class="{ 'is-moving': libBlobMoving, 'is-draft': currentLib === '草稿' }" :style="libBlobStyle" aria-hidden="true" />
          <span class="lib-row-marker" :style="libMarkerStyle" aria-hidden="true" />
          <TransitionGroup name="lib-row" tag="div" class="lib-row-stack">
          <div v-if="libCreate.active" key="__create" class="lib-row lib-create-row">
            <PhFolderSimplePlus :size="16" class="lib-create-icon" />
            <input
              ref="libCreateInput"
              v-model="libCreate.value"
              data-esc-local
              class="lib-row-input"
              placeholder="新知识库名称"
              spellcheck="false"
              @keydown.enter.prevent.stop="commitCreateLib"
              @keydown.esc.stop.prevent="cancelCreateLib"
              @blur="commitCreateLib"
            />
          </div>
          <div
            v-for="lib in panelLibs"
            :key="lib.path"
            class="lib-row"
            :class="{ 'is-current': isCurrentLib(lib), 'is-draft': lib.name === '草稿', 'is-dragging': libDrag.name === lib.name, 'is-drop-target': libDrag.over === lib.name && libDrag.name !== lib.name }"
            role="button"
            tabindex="0"
            :draggable="libSort === 'manual' && !isGuest && !libDrag.hoverActions"
            :aria-current="isCurrentLib(lib) ? 'true' : undefined"
            :title="isGuest ? lib.name + '（' + (store.canEdit(lib) ? '可编辑' : '只读') + '）' : lib.name"
            @click="goLib(lib)"
            @keydown.enter.self.prevent="goLib(lib)"
            @keydown.space.self.prevent="goLib(lib)"
            @contextmenu="libContext($event,lib)"
            @pointerdown="onLibRowPointerDown"
            @dragstart.stop="startLibDrag(lib, $event)"
            @dragover.prevent="overLibDrag(lib, $event)"
            @drop.prevent="dropLib(lib)"
            @dragend="endLibDrag"
          >
            <button class="lib-icon-btn" :disabled="isGuest" title="更换图标" aria-label="更换知识库图标" @click.stop="pickLibIcon(lib, $event)"><ContentIcon v-if="lib.icon" class="lib-row-icon" :value="lib.icon" /><PhFolderSimple v-else class="lib-row-icon lib-icon-placeholder" :size="16" /></button>
            <div class="lib-row-body">
              <input
                v-if="!isGuest && renaming === lib.name"
                ref="renameInput"
                data-esc-local
                class="lib-row-input"
                :value="renameText"
                spellcheck="false"
                @click.stop
                @input="renameText = $event.target.value"
                @keydown.enter.prevent.stop="commitRename(lib)"
                @keydown.esc.stop.prevent="cancelRename"
                @blur="commitRename(lib)"
              />
              <template v-else>
                <span class="lib-row-text">{{ lib.name }}</span>
                <span class="lib-row-meta">{{ lib.docs }} 篇</span>
              </template>
            </div>
            <div v-if="!isGuest" class="lib-row-actions" @pointerenter="libDrag.hoverActions = true" @pointerleave="libDrag.hoverActions = false">
              <button class="icon-btn xs lib-more" :class="{ 'is-active': tree.menu.kind === 'lib' && tree.menu.node?.name === lib.name }" :aria-expanded="tree.menu.kind === 'lib' && tree.menu.node?.name === lib.name" title="更多操作" aria-label="更多操作" @click.stop="openLibMenu(lib, $event)"><PhDotsThree :size="16" weight="bold" /></button>
              <button class="icon-btn xs lib-expand" :class="{ 'is-hidden': !collapsed }" :tabindex="collapsed ? undefined : -1" :aria-hidden="!collapsed" title="展开目录" aria-label="展开目录" @click.stop="openLibTree(lib)"><PhCaretRight :size="13" /></button>
            </div>
          </div>
          </TransitionGroup>
        </div>
        <div class="lib-panel-footer">
          <button v-if="!isGuest" class="icon-btn xs" title="管理知识库" aria-label="管理知识库" @click.stop="openManager"><PhSquaresFour :size="16" weight="regular" /></button>
        </div>
      </aside>
    </transition>
    </Teleport>


    <Teleport to="body">
      <transition name="lib-backdrop"><button v-if="managerOpen" class="lib-manager-backdrop" aria-label="关闭知识库管理" @click="managerOpen=false" /></transition>
      <transition name="lib-manager">
        <section ref="managerDialog" tabindex="-1" v-if="managerOpen" class="lib-manager" role="dialog" aria-modal="true" :aria-label="isGuest ? '浏览知识库' : '管理知识库'">
          <header class="lib-manager-head"><span class="lib-manager-head-actions"><button v-if="!isGuest" class="icon-btn lib-create-toggle" :class="{ 'is-open': libCreate.active }" aria-label="新建知识库" @mousedown.prevent @click="createLib"><PhPlus :size="17" /></button><button class="icon-btn" aria-label="关闭知识库管理" @click="managerOpen=false"><PhX :size="17" /></button></span></header>
          <p v-if="!isGuest && libPanel.libs.every(lib => !lib.docs)" class="library-welcome">把值得保留的工作资料收进知识库，也可以直接新建文档。</p>
          <div class="lib-manager-tools">
            <input v-model.trim="libQuery" class="lib-manager-search" type="search" placeholder="搜索知识库" aria-label="搜索知识库" autofocus />
            <button class="icon-btn lib-manager-sort" :class="{ 'is-active': tree.menu.kind === 'lib-sort' }" title="排序知识库" aria-label="排序知识库" :aria-expanded="tree.menu.kind === 'lib-sort'" @click.stop="openLibSortMenu"><PhSortAscending :size="16" /></button>
          </div>
          <TransitionGroup name="manager-card" tag="div" class="lib-manager-list">
            <div v-if="libCreate.active" key="__create" class="lib-manager-card lib-manager-create">
              <PhFolderSimplePlus :size="20" class="lib-manager-create-icon" />
              <input
                ref="libCreateInput"
                v-model="libCreate.value"
                data-esc-local
                class="lib-manager-rename"
                placeholder="新知识库名称"
                spellcheck="false"
                @keydown.enter.prevent.stop="commitCreateLib"
                @keydown.esc.stop.prevent="cancelCreateLib"
                @blur="commitCreateLib"
              />
            </div>
            <div
              v-for="lib in managerLibs"
              :key="lib.path"
              class="lib-manager-card"
              :class="{ 'is-current': isCurrentLib(lib), 'is-draft': lib.name === '草稿' }"
              role="button"
              tabindex="0"
              :aria-current="isCurrentLib(lib) ? 'true' : undefined"
              :title="lib.name"
              @click="openManagerLib(lib)"
              @keydown.enter.self.prevent="openManagerLib(lib)"
              @keydown.space.self.prevent="openManagerLib(lib)"
              @contextmenu="libContext($event,lib)"
            >
              <button class="lib-icon-btn lib-manager-icon-btn" :disabled="isGuest" title="更换图标" aria-label="更换知识库图标" @click.stop="pickLibIcon(lib, $event)"><ContentIcon v-if="lib.icon" :value="lib.icon" class="lib-manager-icon" /><PhFolderSimple v-else :size="20" class="lib-manager-icon lib-icon-placeholder" /></button>
              <input
                v-if="!isGuest && renaming === lib.name"
                ref="renameInput"
                data-esc-local
                class="lib-manager-rename"
                :value="renameText"
                spellcheck="false"
                @click.stop
                @input="renameText = $event.target.value"
                @keydown.enter.prevent.stop="commitRename(lib)"
                @keydown.esc.stop.prevent="cancelRename"
                @blur="commitRename(lib)"
              />
              <strong v-else>{{ lib.name }}</strong>
              <span v-if="isCurrentLib(lib)" class="lib-manager-current" aria-label="当前知识库"><PhCheck :size="13" weight="bold" /></span>
              <span class="lib-card-meta">{{ lib.docs }} 篇</span>
              <button v-if="!isGuest" class="lib-manager-card-more icon-btn xs" :class="{ 'is-active': tree.menu.kind === 'lib' && tree.menu.node?.name === lib.name }" :aria-label="lib.name + '的更多操作'" @click.stop="openLibMenu(lib, $event)"><PhDotsThree :size="16" weight="bold" /></button>
            </div>
            <p v-if="!managerLibs.length" key="__empty" class="lib-empty">没有匹配的知识库</p>
          </TransitionGroup>
          <footer v-if="!isGuest" class="lib-manager-footer">
            <span class="lib-manager-count">{{ managerLibs.length }} 个知识库</span>
          </footer>
        </section>
      </transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="overlay" appear><div v-if="transfer.open" class="transfer-backdrop" @click.self="transfer.open=false">
        <section ref="transferDialog" tabindex="-1" class="transfer-dialog" role="dialog" aria-modal="true" :aria-label="transfer.mode === 'copy' ? '复制到知识库' : '移动到知识库'">
          <p class="transfer-source">{{ transfer.path }}</p>
          <div class="transfer-library-head"><span>目标知识库</span><input v-model.trim="transferSearch" type="search" placeholder="搜索知识库" aria-label="搜索目标知识库" /></div>
          <div class="transfer-library-grid" role="group" aria-label="选择目标知识库">
            <button v-for="lib in transferLibs" :key="lib.name" type="button" :class="{ 'is-on': transfer.lib === lib.name, 'is-draft': lib.name === '草稿' }" :aria-pressed="transfer.lib === lib.name" @click="onTransferLibSelect(lib.name)"><ContentIcon v-if="lib.icon" :value="lib.icon" :size="20" /><PhFolderSimple v-else :size="20" class="lib-icon-placeholder" /><span>{{ lib.name }}</span><small>{{ lib.docs }} 篇</small></button>
            <p v-if="!transferLibs.length" class="lib-empty">没有匹配的知识库</p>
          </div>
          <div v-if="transfer.lib && transfer.folders.length > 1" class="transfer-field"><span>目标位置</span><SelectMenu v-model="transfer.dir" :options="transfer.folders.map(folder => ({ value: folder.path, label: folder.label }))" label="目标位置" /></div>
          <p v-if="transfer.error" class="transfer-error" role="alert">{{ transfer.error }}</p>
          <div class="transfer-actions"><button @click="transfer.open=false">取消</button><button :disabled="transfer.busy || !transfer.dir" @click="confirmTransfer">{{ transfer.busy ? '处理中…' : '确定' }}</button></div>
        </section>
      </div></Transition>
    </Teleport>
    <Teleport to="body"><Transition name="pop"><div v-if="transferToast.message" class="transfer-toast" role="status"><span>{{ transferToast.message }}</span><button v-if="transferToast.file" @click="viewTransferResult">查看</button><button aria-label="关闭提示" @click="transferToast.message=''">×</button></div></Transition></Teleport>

    <aside
    class="h-full flex flex-col flex-shrink-0 bg-[var(--c-panel)] select-none z-30 relative overflow-hidden transition-[width] duration-[220ms] ease-out"
    :class="{ 'border-r border-[var(--c-line)]': !collapsed }"
    :style="{ width: (collapsed ? 0 : width) + 'px' }"
  >
    <!--
      展开时 header 是侧栏自己的第一行；收起时整行 Teleport 到窗口顶栏。
      disabled 让同一份 DOM 在两个位置之间切换，而不是复制两套按钮。
    -->
    <Teleport to="#app-topbar-left" :disabled="!chromeCollapsed">
      <div class="side-header" :class="{ 'is-topbar': chromeCollapsed, 'is-compact': chromeCompact, 'is-collapsing': collapsed && !chromeCompact, 'is-expanding': chromeExpanding, 'is-merged': !collapsed }" @click.self="onCompactHeaderClick">
        <div class="kb-identity" :class="{ 'is-compact': collapsed }">
          <button class="brand-logo sm" :tabindex="collapsed ? -1 : undefined" :title="collapsed ? '展开目录' : '打开知识库列表'" :aria-label="collapsed ? '展开目录' : '打开知识库列表'" @click.stop="onBrandLogoClick"><ContentIcon :value="currentLibIcon" :size="20" /></button>
          <div class="kb-title-wrap min-w-0">
            <!-- 两个标题叠在同一格交叉淡化：展开/收起时不会先消失再出现。 -->
            <button type="button" class="brand-line kb-title-compact" :class="{ 'is-hidden': !collapsed }" :tabindex="collapsed ? undefined : -1" :title="collapsed ? '展开目录' : (currentLib || '知识库')" @click.stop="onCompactTitleClick">
              <span class="kb-title-stack">
                <Transition name="lib-title">
                  <span :key="currentLib || '知识库'" class="kb-title-text">{{ currentLib || '知识库' }}</span>
                </Transition>
              </span>
            </button>
            <input v-model="brandTitle" class="brand-line brand-input is-title kb-title" :class="{ 'is-hidden': collapsed }" :tabindex="collapsed ? -1 : undefined" spellcheck="false" :readonly="isGuest || !currentLibEditable" :title="isGuest ? '' : '编辑知识库名称'" @keydown.enter.prevent="$event.target.blur()" @change="onBrandEdited($event.target.value)" />
          </div>
        </div>
        <div class="sidebar-actions" :class="{ 'is-compact': collapsed, 'is-revealed': compactActionsHover }" @pointerenter="onCompactActionsEnter" @pointerleave="onCompactActionsLeave">
          <button class="icon-btn kb-list-btn" :tabindex="collapsed ? -1 : undefined" :class="{ 'is-active': libPanel.open }" :title="'知识库：' + (currentLib || '未选择') + '（共 ' + libPanel.libs.length + ' 个）'" :aria-label="'知识库列表'" :aria-expanded="libPanel.open" @click.stop="libPanel.open ? (libPanel.open = false) : openLibPanel()"><PhStack :size="16" /></button>
          <button class="icon-btn sidebar-toggle" :title="collapsed ? '展开侧栏' : '收起侧栏'" :aria-label="collapsed ? '展开侧栏' : '收起侧栏'" :aria-expanded="!collapsed" @click.stop="toggleSidebar"><MorphIcon :icon="collapsed ? caretRight : caretLeft" :size="16" class="sidebar-chevron" spring="smooth" reduced-motion="user" /></button>
        </div>
      </div>
    </Teleport>

    <div class="sidebar-body flex flex-col flex-1 min-h-0" :class="{ 'has-topbar': chromeCollapsed }" :inert="collapsed">
    <!-- 一行操作：左侧新建动作只占内容宽度，空间不够时文字向左收进图标 -->
    <div class="px-3 pt-2 pb-2 flex items-center gap-1 shrink-0">
      <template v-if="currentLibEditable">
        <button
          class="create-action text-[var(--c-ink)]"
          :class="{ 'is-narrow': actionsNarrow }"
          title="在根目录新建文档"
          aria-label="新建文档"
          @click="tree.startCreate('doc', currentLib || '')"
        >
          <PhPlus :size="13" weight="bold" />
          <span class="create-label">新建文档</span>
        </button>
        <button class="create-action" :class="{ 'is-narrow': actionsNarrow }" title="在根目录新建文件夹" aria-label="新建文件夹" @click="tree.startCreate('folder', currentLib || '')">
          <PhFolderSimplePlus :size="16" />
          <span class="create-label">文件夹</span>
        </button>
      </template>
      <span class="ml-auto flex items-center gap-0.5">
        <button
          class="icon-btn"
          :class="{ 'is-active': searchOpen }"
          title="搜索当前知识库文档"
          @click="toggleSearch"
        >
          <PhMagnifyingGlass :size="15" />
        </button>
        <div class="relative">
          <button
            class="icon-btn"
            :class="{ 'is-active': menuOpen }"
            title="分组与排序"
            @click="menuOpen = !menuOpen"
          >
            <PhSlidersHorizontal :size="15" />
          </button>
          <transition name="pop">
            <div v-if="menuOpen" class="side-menu" @click.stop>
              <p class="side-menu-title">分组方式</p>
              <button
                v-for="g in GROUPS"
                :key="g.id"
                class="side-menu-item"
                :class="{ 'is-on': groupMode === g.id }"
                @click="setGroup(g.id)"
              >
                <span class="menu-label"><component :is="g.icon" :size="13" class="menu-icon" />{{ g.label }}</span>
                <PhCheck v-if="groupMode === g.id" :size="12" weight="bold" />
              </button>
              <div class="side-menu-sep" />
              <p class="side-menu-title">排序方式</p>
              <button
                v-for="s in SORTS"
                :key="s.id"
                class="side-menu-item"
                :class="{ 'is-on': sortMode === s.id }"
                @click="setSort(s.id)"
              >
                <span class="menu-label"><component :is="s.icon" :size="13" class="menu-icon" />{{ s.label }}</span>
                <PhCheck v-if="sortMode === s.id" :size="12" weight="bold" />
              </button>
            </div>
          </transition>
        </div>
      </span>
    </div>

    <!-- 筛选框 -->
    <transition name="slide-fade">
      <div v-if="searchOpen" class="px-3 pb-2 shrink-0">
        <input
          ref="searchEl"
          v-model="query"
          class="w-full h-7 px-2.5 ui-round-control bg-[var(--c-field)] border border-[var(--c-line)] text-[12.5px] outline-none focus:border-[var(--c-accent)]/50 transition-colors"
          placeholder="搜索文档名或路径"
          @keydown.esc="closeSearch"
        />
      </div>
    </transition>

    <div v-if="batch.mode" class="batch-bar px-3 pb-2" role="group" aria-label="批量删除">
      <span>已选 {{ batch.selected.size }} 项</span>
      <button @click="batch.cancel()">取消</button>
      <button class="batch-delete" :disabled="!batch.selected.size" @click="requestBatchDelete">删除</button>
    </div>

    <!-- 拖拽条：调整侧栏宽度 -->
    <div
      v-if="!collapsed"
      class="absolute inset-y-0 right-0 z-20 w-1.5 cursor-col-resize group"
      title="拖动调整侧栏宽度"
      @pointerdown="startResize"
    >
      <div class="absolute inset-y-0 right-0 w-px bg-transparent group-hover:bg-[var(--c-line)] transition-colors" />
    </div>

    <!-- 文档树 -->
    <!-- 落在空白处 = 挪到根目录；行和目录各自接住自己的落点 -->
    <nav
      ref="docNavEl"
      class="doc-tree-nav flex-1 min-h-0 overflow-y-auto no-scrollbar px-2.5 pb-4 pt-0.5"
      @dragover="tree.overRoot($event)"
      @drop.prevent="tree.drop()"
      @contextmenu="onBlankTreeContext"
    >
      <span class="doc-row-blob" :class="{ 'is-moving': docBlobMoving }" :style="docBlobStyle" aria-hidden="true" />
      <!-- 根目录就地新建：分组和单列表下都能用 -->
      <div v-if="tree.create && (tree.create.parent || '') === (currentLib || '')" class="tree-create-row">
        <component :is="tree.create.kind === 'doc' ? PhFilePlus : PhFolderSimplePlus" :size="14" />
        <input v-model="tree.create.value" class="tree-create-input" :placeholder="tree.create.kind === 'doc' ? '文档名称' : '文件夹名称'" @keydown.enter.prevent="tree.createCommit()" @keydown.esc.prevent="tree.createCancel()" @blur="tree.createCommit()" />
      </div>
      <template v-if="groupMode === 'tree'">
        <DocTree
          :nodes="nodes"
          :parent="currentLib || ''"
          :current-path="currentPath"
          :collapsed="collapsedCats"
          :query="query"
          :sort-mode="sortMode"
          @select="emit('select', $event)"
          @delete-doc="emit('delete-doc', $event)"
          @delete-category="emit('delete-category', $event)"
          @toggle="toggleCat"
        />
        <p v-if="!visibleCount" class="text-[12px] text-[var(--c-faint)] px-3 py-3 text-center">
          {{ query ? '没有匹配的文档' : '还没有文档' }}
        </p>
      </template>

      <template v-else>
        <div
          v-for="doc in flatDocs"
          :key="doc.file"
          class="doc-row group/doc"
          :data-file="doc.file"
          :class="{ 'is-on': doc.file === currentPath, 'is-batch-selected': batch.checked(doc) }"
          :draggable="!batch.mode && store.canEdit(doc)"
          @dragstart="tree.start(doc, $event)"
          @dragover="tree.overRow(doc, $event)"
          @drop.prevent="tree.drop()"
          @dragend="tree.end()"
          @click="batch.mode ? batch.toggle(doc) : emit('select', doc.file)"
          @contextmenu="onFlatDocContext($event, doc)"
        >
          <button v-if="batch.mode" class="batch-check" role="checkbox" :aria-label="'选择' + doc.name" :aria-checked="batch.checked(doc)" :disabled="!batch.canToggle(doc)" @click.stop="batch.toggle(doc)"><PhCheck v-if="batch.checked(doc)" :size="11" weight="bold" /></button>
          <button class="doc-title" :title="isGuest ? doc.name + '（' + (store.canEdit(doc) ? '可编辑' : '只读') + '）' : doc.file"><ContentIcon v-if="doc.meta?.icon" :value="doc.meta.icon" :size="14" />
            <span class="truncate">{{ doc.name }}</span>
            <span v-if="doc.dir" class="doc-dir">{{ doc.dir }}</span>
          </button>
          <button v-if="!isGuest && !batch.mode" class="icon-btn xs acts-btn" title="更多操作" @click.stop="tree.openMenu('file', doc, $event)"><PhDotsThree :size="16" /></button>
        </div>
        <p v-if="!visibleCount" class="text-[12px] text-[var(--c-faint)] px-3 py-3 text-center">
          {{ query ? '没有匹配的文档' : '还没有文档' }}
        </p>
      </template>

      </nav>
      <div v-if="!isGuest" class="workspace-tools-footer">
        <InstanceBadge />
        <div class="workspace-tools"><button class="btn-icon" ref="toolsTrigger" title="更多工具" aria-label="更多工具" :aria-expanded="footerTools" @click.stop="toggleFooterTools"><PhDotsThree :size="18" /></button><transition name="pop"><div v-if="footerTools" ref="toolsPanel" class="side-menu workspace-tools-menu"><button @click="openActivity"><PhGitDiff :size="16"/>Agent 改动<span v-if="activityUnread" class="activity-count">{{ activityUnread }}</span></button><button @click="openRecovery('trash')"><PhTrash :size="16"/>回收站</button><button @click="openRecovery('backup')"><PhArchive :size="16"/>备份与恢复</button></div></transition></div>
      </div>
    </div>
    </aside>

    <!-- 树里那个…的菜单：teleport 出去，免得被侧栏的滚动裁掉 -->
    <Teleport to="body">
      <Transition name="pop">
      <div v-if="tree.menu.open" class="tree-menu" :class="{ 'is-measuring': !tree.menu.ready }" role="menu" :aria-label="tree.menu.kind === 'root' ? '侧栏操作' : tree.menu.kind === 'lib-filter' ? '筛选知识库' : '条目操作'" :style="tree.menu.style" @keydown.esc.stop.prevent="tree.closeMenu()" @keydown.tab="tree.closeMenu()">
        <button
          v-for="it in menuItems"
          :key="it.id"
          class="tree-menu-item" role="menuitem"
          :disabled="it.disabled"
          :title="it.hint || it.label"
          :class="{ danger: it.danger }"
          @click="onMenuPick(it)"
        >
          <component :is="it.icon" :size="14" class="menu-icon" />
          <span class="tree-menu-label">{{ it.label }}</span>
        </button>
      </div>
      </Transition>
    </Teleport>

    <RailFiles :nodes="nodes" :current-path="currentPath" :visible="collapsed && !libPanel.open" @open="onRailFileOpen" />
    <RecoveryPanel :initial-tab="recoveryTab" :open="recoveryOpen" @close="closeRecovery" @restored="onRecovered" />
    <ActivityPanel :open="activityOpen" @close="closeActivity" @select="onActivitySelect" />
    <IconPicker v-if="iconPicking" :save="saveLibIcon" :anchor="libIconAnchor" :current="libIconTarget?.icon || ''" @close="iconPicking=false" />
    <!-- 新建 / 删除知识库的确认框：用站内统一那套，不用浏览器原生弹窗 -->
    <AppDialog
      :open="libDialog.open"
      :mode="libDialog.danger ? 'confirm' : 'prompt'"
      :title="libDialog.title"
      :message="libDialog.message"
      :placeholder="libDialog.placeholder"
      :initial="libDialog.initial"
      :confirm-text="libDialog.confirmText"
      :danger="libDialog.danger"
      @confirm="libDialog.onConfirm && libDialog.onConfirm($event)"
      @cancel="closeLibDialog"
    />
  </div>
</template>

<script setup>
import { BRAND_NAME } from '../../brand.mjs'
import SelectMenu from './SelectMenu.vue'
import {setFavicon} from '../utils/favicon'

import RecoveryPanel from './RecoveryPanel.vue'
import ActivityPanel from './ActivityPanel.vue'
import InstanceBadge from './InstanceBadge.vue'
import ContentIcon from './ContentIcon.vue'
import IconPicker from './IconPicker.vue'
import { resizePanel } from '../utils/panel-resize'
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, reactive, provide } from 'vue'
// 菜单里的图标：树的操作、分组与排序
import {
  PhPlus, PhMagnifyingGlass, PhSlidersHorizontal, PhFolderSimple,
  PhSquaresFour, PhCaretDoubleRight, PhCheck, PhFolderSimplePlus, PhArrowClockwise,
  PhArchive, PhFilePlus, PhPencilSimple, PhTrash, PhListDashes, PhSortAscending, PhClockCounterClockwise, PhGitDiff,
  PhStack,
  PhCaretDown, PhCaretRight, PhCaretDoubleLeft, PhX, PhHandGrabbing, PhDotsThree, PhPushPin, PhCopy, PhArrowRight
} from '../icons/remix'
import { MorphIcon } from 'morphicons/vue'

/* Remix 的左右小箭头，作为 Morphicons 的填充图标数据。 */
const caretLeft = [['path', { d: 'M10.8284 12.0007L15.7782 16.9504L14.364 18.3646L8 12.0007L14.364 5.63672L15.7782 7.05093L10.8284 12.0007Z', fill: 'currentColor', stroke: 'none' }]]
const caretRight = [['path', { d: 'M13.1717 12.0007L8.22192 7.05093L9.63614 5.63672L16.0001 12.0007L9.63614 18.3646L8.22192 16.9504L13.1717 12.0007Z', fill: 'currentColor', stroke: 'none' }]]
import {useDialogFocus} from '../composables/useDialogFocus'
import { useDocsStore } from '../stores/docs'
import DocTree from './DocTree.vue'
import RailFiles from './RailFiles.vue'
import AppDialog from './AppDialog.vue'
import { API_BASE } from '../utils/api'
import { normalizeLibraryName } from '../utils/legacy-paths'
import { storageGet, storageJSON, storageSet } from '../utils/storage'
import { useFileManager } from '../composables/useFileManager'
const props = defineProps({
  nodes: { type: Array, required: true },
  currentPath: { type: String, default: '' },
  width: { type: Number, default: 236 },
  collapsed: { type: Boolean, default: false },
  /** header + 文档标签此刻是否在顶栏；展开动画结束前会短暂保持 true */
  chromeCollapsed: { type: Boolean, default: false },
  /** 收起静止态：header 按内容宽度排，不占满侧栏宽度 */
  chromeCompact: { type: Boolean, default: false },
  chromeExpanding: { type: Boolean, default: false }
})
const emit = defineEmits([
  'select', 'delete-doc', 'delete-category', 'toggle-collapse', 'update:width'
])

/* ---------- 品牌：标题与图标 ---------- */

const store = useDocsStore()
/** 访客（旧只读链接进来的人）：新建、改名、删除这些入口一律不显示 */
const isGuest = computed(() => store.isGuest)
const { canReveal: canRevealInFinder, reveal, label: fileManagerLabel } = useFileManager()
function revealLibInFinder(lib) {
  return reveal(lib.path || lib.name)
}
async function openLibTree(lib) {
  const changing = !isCurrentLib(lib)
  // 展开侧栏要立刻发生；切库转场可以并行进行，不要让用户等完整个 fade。
  if (props.collapsed) emit('toggle-collapse')
  if (changing) await goLib(lib)
  if (isMobileLibView()) closeLibPanel()
}
/**
 * 左侧文件脊只负责“带路”：文件直接阅读，目录只展开侧栏并定位，
 * 不擅自把正在读的文章换成目录里的第一篇。
 */
async function onRailFileOpen(item) {
  if (!item) return
  if (query.value) query.value = ''
  if (item.kind === 'more') {
    if (props.collapsed) emit('toggle-collapse')
    return
  }
  if (item.kind === 'folder') {
    if (groupMode.value !== 'tree') groupMode.value = 'tree'
    expandTreePath(item.path, true)
    await revealTreeRow('folder', item.path)
    return
  }
  if (item.kind === 'file' && item.file) {
    expandTreePath(item.file, false)
    emit('select', item.file)
    await revealTreeRow('file', item.file)
  }
}

/** 展开这条路径上的所有目录；目录本身也展开，文件只展开父级。 */
function expandTreePath(path, includeSelf) {
  const parts = String(path || '').split('/').filter(Boolean)
  if (!parts.length) return
  const next = new Set(collapsedCats.value)
  const end = includeSelf ? parts.length : parts.length - 1
  for (let i = 1; i <= end; i++) next.delete(parts.slice(0, i).join('/'))
  collapsedCats.value = next
}

/**
 * 等侧栏宽度动画结束后再滚动，否则量到的还是收起态的零宽布局。
 * 找不到就重试几次，给树展开和搜索清空留出渲染时间。
 */
async function revealTreeRow(kind, path) {
  if (props.collapsed) emit('toggle-collapse')
  await nextTick()
  await new Promise(resolve => setTimeout(resolve, 270))
  const nav = docNavEl.value
  if (!nav) return
  const attrs = kind === 'folder' ? 'path' : 'file'
  let row = null
  for (let attempt = 0; attempt < 4 && !row; attempt++) {
    row = [...nav.querySelectorAll(kind === 'folder' ? '.cat-row' : '.doc-row')]
      .find(el => el.dataset[attrs] === path)
    if (!row) await new Promise(resolve => setTimeout(resolve, 120))
  }
  if (!row) return
  const navRect = nav.getBoundingClientRect()
  const rowRect = row.getBoundingClientRect()
  const top = nav.scrollTop + rowRect.top - navRect.top - nav.clientHeight / 2 + rowRect.height / 2
  nav.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  row.classList.add('is-rail-target')
  setTimeout(() => row.classList.remove('is-rail-target'), 900)
}
const currentLibEditable = computed(() => store.canEdit(libPanel.libs.find(l => l.name === currentLib.value)))

/*
 * 左上角的名字与图标 —— 从服务端读，不存 localStorage。
 *
 * 两个站点在同一域名下（/deepseek/reader/ 与 /deepseek/demo/），localStorage 按域名共享：
 * 前端一写回就互相串味，打开过示例库、主站的名字也被顶掉。
 * 而且以前写回用的键是写死的，注入的独立键根本读不到，
 * 所以按实例分开键名也解决不了。改成服务端按实例给：品牌从哪来由服务端决定，
 * 前端只负责显示；本地改只改当前这次会话，不落盘。
 */
/*
 * 标题不是一份独立数据 —— 它就是"当前知识库的名字"，真源在服务端的注册表里
 * （.知识库.json）。这里只是一份显示副本，改它等于改库名（改名会同步重命名文件夹）。
 * 旧数据里的 sub 字段不再读取：一个知识库只保留一个标题。
 */
const brandTitle = ref('')
const actionsNarrow = computed(() => props.width < 232)

const libIconInput = ref(null)

/* ---------- 知识库面板：列出所有库，可切换 / 改名 / 换图标 / 管可见性 ---------- */

const libPanel = reactive({ open: false, libs: [], busy: '' })
function onCompactHeaderClick() {
  if (props.collapsed) emit('toggle-collapse')
}
/** 收起态先展开文档侧栏；展开后同一个图标才进入知识库列表。 */
function onBrandLogoClick() {
  if (props.collapsed) emit('toggle-collapse')
  else openLibPanel()
}
/** 收起态标题只负责展开目录，不再直接打开知识库。 */
function onCompactTitleClick() {
  if (props.collapsed) emit('toggle-collapse')
}
const libCreate = reactive({ active: false, value: '' })
const libCreateInput = ref(null)
const libDrag = reactive({ name: '', over: '', blocked: false, hoverActions: false })
const managerOpen = ref(false)
const libQuery = ref('')

const transferSearch = ref('')
const transfer = reactive({ open: false, mode: 'copy', kind: 'doc', path: '', lib: '', dir: '', folders: [], busy: false, error: '' })
const managerDialog = ref(null), transferDialog = ref(null)
useDialogFocus(managerOpen, managerDialog, () => { managerOpen.value=false })
useDialogFocus(() => transfer.open, transferDialog, () => { if(!transfer.busy) transfer.open=false })
const transferToast = reactive({ message: '', lib: '', file: '' })
async function viewTransferResult() {
  const lib = transferToast.lib, file = transferToast.file
  transferToast.message = ''
  await goLib({ name: lib, path: lib })
  if (file) await store.select(file)
}
let transferRequest = 0
function onTransferLibSelect(value) { transfer.lib = value; loadTransferFolders() }
async function loadTransferFolders() {
  const request = ++transferRequest
  const lib = transfer.lib
  transfer.folders = [{ path: lib, label: lib + '（根目录）' }]
  transfer.dir = lib
  if (!lib) return
  try {
    const response = await fetch(API_BASE + '/api/tree?lib=' + encodeURIComponent(lib), { cache: 'no-store' })
    const json = await response.json()
    if (!json.ok) throw Error(json.error || '目录读取失败')
    if (request !== transferRequest) return
    const walk = nodes => { for (const node of nodes || []) if (node.type === 'folder') { transfer.folders.push({ path: node.path, label: node.path.replaceAll('/', ' / ') }); walk(node.children) } }
    walk(json.data.nodes)
  } catch (error) { if (request === transferRequest) transfer.error = String(error.message || error) }
}
async function openTransfer(mode, kind, source) {
  window.dispatchEvent(new Event('reader-overlay-open'))
  transfer.mode = mode
  transfer.kind = kind
  transfer.path = source
  transfer.error = ''
  transferSearch.value = ''
  if (!libPanel.libs.length) await loadLibs()
  if (!libPanel.libs.length) { store.setError('知识库读取失败，请稍后重试'); return }
  transfer.lib = ''
  transfer.dir = ''
  transfer.folders = []
  managerOpen.value = false
  libPanel.open = false
  transfer.open = true
}
async function confirmTransfer() {
  if (transfer.busy || !transfer.dir) return
  const { mode, kind, path: source, dir } = transfer
  if (mode === 'move' && (dir === source || dir.startsWith(source + '/'))) { transfer.error = '不能移动到自身目录内'; return }
  transfer.busy = true
  transfer.error = ''
  try {
    let result
    if (kind === 'folder') {
      result = mode === 'copy' ? await store.copyCategory(source, dir) : await store.moveCategory(source, dir)
    } else result = mode === 'copy' ? await store.copyDoc(source, dir) : await store.moveDoc(source, dir)
    transfer.open = false
    await loadLibs()
    const targetLib = dir.split('/')[0]
    if (mode === 'move' && targetLib !== currentLib.value) {
      await goLib({ name: targetLib, path: targetLib })
      await store.loadTree()
      if (result?.file) await store.select(result.file)
      if (isMobileLibView() && !props.collapsed) emit('toggle-collapse')
    } else {
      transferToast.message = mode === 'copy' ? '已复制到 ' + dir : '已移动到 ' + dir
      transferToast.lib = targetLib
      transferToast.file = result?.file || ''
    }
  } catch (error) { transfer.error = String(error.message || error) }
  finally { transfer.busy = false }
}
const footerTools=ref(false),recoveryTab=ref('trash'),toolsTrigger=ref(null),toolsPanel=ref(null)

async function toggleFooterTools(){footerTools.value=!footerTools.value;if(footerTools.value){await nextTick();toolsPanel.value?.querySelector('button')?.focus();loadActivityUnread()}}
async function closeRecovery(){recoveryOpen.value=false;await nextTick();toolsTrigger.value?.focus()}
function openRecovery(tab){recoveryTab.value=tab;footerTools.value=false;recoveryOpen.value=true}
const libSortOptions = [
  { value: 'manual', label: '手动排序' },
  { value: 'recent', label: '最近打开' },
  { value: 'name', label: '名称' },
  { value: 'modified', label: '最近修改' }
]
/* 默认手动：选中一个库不应该把它挪到顶部。 */
const libSort = ref('manual')
const libWidth = ref(236)
// 访客浏览记录不能改变管理者下次打开阅读器时的落点。
const LIB_PREFS_KEY = 'reader.library-switcher:' + API_BASE + (isGuest.value ? ':guest' : '')
function readLibPrefs() {
  try { return JSON.parse(localStorage.getItem(LIB_PREFS_KEY) || '{}') } catch { return {} }
}
const recentNames = ref(Array.isArray(readLibPrefs().recent) ? readLibPrefs().recent : [])
const pinnedLibs = ref(Array.isArray(readLibPrefs().pinned) ? readLibPrefs().pinned : [])
const libOrder = ref(Array.isArray(readLibPrefs().order) ? readLibPrefs().order.filter(x => typeof x === 'string') : [])
const storedLibSort = readLibPrefs().sort
if (['manual', 'name', 'modified'].includes(storedLibSort)) libSort.value = storedLibSort
function saveLibPrefs() {
  storageSet(LIB_PREFS_KEY, JSON.stringify({
    recent: recentNames.value.slice(0, 30),
    pinned: pinnedLibs.value,
    order: libOrder.value,
    sort: libSort.value
  }))
}
watch(libSort, saveLibPrefs)
function rememberLib(name) {
  recentNames.value = [name, ...recentNames.value.filter(n => n !== name)].slice(0, 30)
  saveLibPrefs()
}
function togglePin(name) {
  pinnedLibs.value = pinnedLibs.value.includes(name) ? pinnedLibs.value.filter(n => n !== name) : [...pinnedLibs.value, name]
  saveLibPrefs()
}
function libPinned(lib) { return pinnedLibs.value.includes(lib.name) }
/** 手动顺序只存名字；新库、改名、删除后按当前库列表补齐。 */
function normalizedLibOrder() {
  const names = libPanel.libs.map(l => l.name)
  const order = libOrder.value.filter(name => names.includes(name))
  for (const name of names) if (!order.includes(name)) order.push(name)
  return order
}
function sortLibs(list) {
  const order = normalizedLibOrder()
  return [...list].sort((a, b) => {
    const pin = Number(libPinned(b)) - Number(libPinned(a))
    if (pin) return pin
    if (libSort.value === 'manual') return order.indexOf(a.name) - order.indexOf(b.name)
    if (libSort.value === 'modified') return (b.mtime || 0) - (a.mtime || 0) || a.name.localeCompare(b.name, 'zh-CN')
    if (libSort.value === 'recent') {
      const ai = recentNames.value.indexOf(a.name), bi = recentNames.value.indexOf(b.name)
      return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi) || a.name.localeCompare(b.name, 'zh-CN')
    }
    return a.name.localeCompare(b.name, 'zh-CN')
  })
}
const panelLibs = computed(() => sortLibs(libPanel.libs))
const displayedLibs = computed(() => panelLibs.value)

/*
 * 知识库切换时用一块共享的底块滑过去，而不是两行各自淡入淡出。
 * 它和标签条用的是同一套弹性：移动时先纵向拉长一点，再落回原尺寸。
 */
const libListEl = ref(null)
const libBlobStyle = ref({ opacity: 0 })
const libMarkerStyle = ref({ opacity: 0 })
const libBlobMoving = ref(false)
let libBlobTimer = 0
let libResizeObserver = null
function observeLibList() {
  libResizeObserver?.disconnect()
  if (!libListEl.value) return
  libResizeObserver = new ResizeObserver(() => measureLibBlob())
  libResizeObserver.observe(libListEl.value)
  const stack = libListEl.value.querySelector('.lib-row-stack')
  if (stack) libResizeObserver.observe(stack)
}
watch(libListEl, observeLibList, { flush: 'post' })
async function measureLibBlob() {
  await nextTick()
  const host = libListEl.value
  if (!host) { libBlobStyle.value = { opacity: 0 }; libMarkerStyle.value = { opacity: 0 }; return }
  const row = host.querySelector('.lib-row.is-current')
  if (!row) { libBlobStyle.value = { opacity: 0 }; libMarkerStyle.value = { opacity: 0 }; return }
  const next = {
    left: row.offsetLeft + 'px',
    top: row.offsetTop + 'px',
    width: row.offsetWidth + 'px',
    height: row.offsetHeight + 'px',
    opacity: 1
  }
  const prev = libBlobStyle.value
  if (prev.opacity === 1 && (prev.left !== next.left || prev.top !== next.top)) {
    libBlobMoving.value = true
    clearTimeout(libBlobTimer)
    libBlobTimer = setTimeout(() => { libBlobMoving.value = false }, 300)
  }
  libBlobStyle.value = next
  libMarkerStyle.value = {
    left: row.offsetLeft + 4 + 'px',
    top: row.offsetTop + Math.round((row.offsetHeight - 18) / 2) + 'px',
    opacity: 1
  }
}
const transferLibs = computed(() => {
  const q = transferSearch.value.trim().toLocaleLowerCase()
  return displayedLibs.value.filter(lib => !q || lib.name.toLocaleLowerCase().includes(q))
})
const managerLibs = computed(() => {
  const q = libQuery.value.trim().toLocaleLowerCase()
  return displayedLibs.value.filter(l =>
    !q || l.name.toLocaleLowerCase().includes(q) || String(l.desc || '').toLocaleLowerCase().includes(q)
  )
})

/** 当前所在的知识库：文档根的名字（每个实例一个根，所以直接问服务端） */
const currentLib = ref(
  (() => {
    try {
      const lib = String(new URLSearchParams(location.search).get('lib') || '').trim()
      return normalizeLibraryName(lib)
    } catch {
      return ''
    }
  })()
)

watch(
  () => [currentLib.value, libPanel.libs.map(l => l.path + ':' + l.docs).join('|'), libWidth.value, libCreate.active],
  () => measureLibBlob(),
  { flush: 'post', immediate: true }
)
watch(() => libPanel.open, (isOpen) => {
  if (isOpen) setTimeout(measureLibBlob, 260)
  else libBlobStyle.value = { opacity: 0 }
}, { flush: 'post' })

async function loadLibs() {
  try {
    const res = await fetch(API_BASE + '/api/libs', { cache: 'no-store' })
    const data = await res.json()
    libPanel.libs = (data?.data?.libs || []).filter((l) => l && l.name)
    if (typeof data?.data?.config?.panelWidth === 'number') libWidth.value = data.data.config.panelWidth
    applyCurrentLib()
    if (currentLib.value) rememberLib(currentLib.value)
  } catch {
    libPanel.libs = []
  }
}

/**
 * 把"当前库"的信息摊到各处显示：标题第一行、侧栏图标。
 *
 * 全部从同一份数据派生，所以改任何一处（标题、库列表、图标）之后
 * 只要重新调一次它，三处就一致了 —— 不需要两两之间接同步线。
 */
function applyCurrentLib() {
  const lib = libPanel.libs.find((l) => l.name === currentLib.value)
  if (!lib) return
  brandTitle.value = lib.name
  /*
   * 浏览器标签页也跟着走：标题换成当前知识库名，图标换成它的 icon。
   * 切库之后标签页还挂着上一个库的名字，等于对外显示错了身份。
   */
  document.title = lib.name ? `${lib.name} | ${BRAND_NAME}` : BRAND_NAME

}

/*
 * 新建知识库：建目录 + 写注册表一步到位（服务端做），
 * 名字先用 prompt 问 —— 建完立刻切过去，看到的就是刚建的那个空库。
 */
/*
 * 新建知识库的弹窗状态。
 *
 * 以前用 window.prompt —— 浏览器原生框，样式和站内完全不搭，
 * 而且不能带说明文字。站内有 AppDialog（支持 prompt 模式），直接用它。
 */
const libDialog = reactive({
  open: false,
  title: '',
  message: '',
  placeholder: '',
  initial: '',
  confirmText: '确定',
  danger: false,
  onConfirm: null
})

function closeLibDialog() {
  libDialog.open = false
  libDialog.onConfirm = null
}

function askLibDialog(opts) {
  Object.assign(libDialog, {
    open: true,
    title: '', message: '', placeholder: '', initial: '',
    confirmText: '确定', danger: false, onConfirm: null
  }, opts)
}

function createLib() {
  if (isGuest.value) return
  if (libCreate.active) { cancelCreateLib(); return }
  libCreate.value = ''
  libCreate.active = true
  if (!managerOpen.value) libPanel.open = true
  nextTick(() => {
    const el = Array.isArray(libCreateInput.value) ? libCreateInput.value[0] : libCreateInput.value
    el?.focus()
  })
}
function cancelCreateLib() {
  libCreate.active = false
  libCreate.value = ''
}
async function commitCreateLib() {
  if (!libCreate.active) return
  const name = String(libCreate.value || '').trim()
  if (!name) { cancelCreateLib(); return }
  libCreate.active = false
  libCreate.value = ''
  await doCreateLib(name)
}

const creatingLib = ref(false)
async function doCreateLib(value) {
  const to = String(value || '').trim()
  if (!to || creatingLib.value) return
  creatingLib.value = true
  try {
    const res = await fetch(API_BASE + '/api/lib', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: to })
    })
    const data = await res.json()
    if (!data.ok) throw new Error(data.error || '新建失败')
    libPanel.libs = data.data.libs || []
    libOrder.value = [to, ...libOrder.value.filter(name => name !== to)]
    saveLibPrefs()
    const made = libPanel.libs.find((l) => l.name === to)
    if (made) { await goLib(made); managerOpen.value=false }
  } catch (e) {
    store.setError(e.message || e)
  } finally {
    creatingLib.value = false
  }
}

/*
 * 收起态点图标只展开文档侧栏；展开态的品牌图标才打开知识库栏。
 */
/**
 * 只收/开文档侧栏。知识库列表现在在整窗最外层，有自己的关闭按钮，
 * 不再跟着侧栏一起收，否则展开侧栏时整条顶栏会被列表的宽度带着滑。
 */
function toggleSidebar() {
  /* 点击瞬间先压住 compact 的滑出图标，避免状态切换那一帧闪一下。 */
  compactActionsHover.value = false
  compactRevealSuppressed = compactPointerInside
  emit('toggle-collapse')
}

const isMobileLibView = () => window.matchMedia('(max-width: 820px)').matches

function closeLibPanel() {
  libPanel.open = false
  cancelCreateLib()
  if (tree.menu.open) tree.closeMenu()
}

function openLibPanel() {
  libPanel.open = true
  loadLibs()
}
function openManager() {
  window.dispatchEvent(new Event('reader-overlay-open'))
  cancelCreateLib()
  // 桌面端保留知识库栏：管理弹窗是盖在它上面，不是把它收起来。
  if (isMobileLibView()) libPanel.open = false
  tree.closeMenu()
  managerOpen.value = true
  libQuery.value = ''
  loadLibs()
}
function openManagerLib(lib) {
  managerOpen.value = false
  goLib(lib)
}
function startLibResize(e) {
  const startX = e.clientX, startWidth = libWidth.value
  resizePanel(e, ev => { libWidth.value = Math.max(180, Math.min(420, startWidth + ev.clientX - startX)) }, async () => {
    try { await fetch(API_BASE + '/api/lib/config', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ panelWidth: libWidth.value }) }) } catch { /* 本次宽度仍有效 */ }
  })
}

function isCurrentLib(lib) {
  if (!currentLib.value) {
    /* 还没问出来时，用标题第一行兜底比一下，至少不闪 */
    return lib.name === brandTitle.value
  }
  return lib.name === currentLib.value
}

/*
 * 切换知识库：只换地址栏里的 ?lib=<库名>，然后重新拉树。
 *
 * 不换实例、不换根目录 —— 一个知识库就是根下的一个文件夹，
 * 选了它侧边栏就只显示它（服务端按 ?lib= 裁剪），路径仍然相对文档根，
 * 所以文档读取、保存那一整套不用改。
 */
let titleWidthTimer = 0
/** 展开/收起会接管宽度，先停掉切库动画，避免它的定时器稍后清掉展开/收起中的宽度。 */
function resetCompactWidthAnimation(clearWrapWidth = false) {
  clearTimeout(titleWidthTimer)
  const header = document.querySelector('.side-header')
  const wrap = document.querySelector('#app-topbar-left')
  /* header 的内联宽度必须清掉，才能跟着外壳一起展开/收起。 */
  if (header?.style.width) { header.style.transition = ''; header.style.width = '' }
  /* 外壳宽度交给 App 的 chromeWidth；这里只还原本地过渡，别把动画起点清成 auto。 */
  if (wrap?.style.transition) wrap.style.transition = ''
  if (clearWrapWidth && wrap?.style.width) wrap.style.width = ''
}
watch(() => [props.collapsed, props.chromeCompact], ([collapsed, compact]) => {
  if (!collapsed || !compact) resetCompactWidthAnimation()
})
function animateCompactTitleWidth(nextName) {
  if (!props.collapsed || !props.chromeCompact || props.chromeExpanding) return
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const header = document.querySelector('.side-header')
  const wrap = document.querySelector('#app-topbar-left')
  if (!header || !wrap) return
  const startHeader = header.getBoundingClientRect().width
  const startWrap = wrap.getBoundingClientRect().width
  const targetWrap = compactHeaderWidth(nextName)
  if (!targetWrap) return
  const targetHeader = Math.max(0, targetWrap - 10)
  if (Math.abs(targetHeader - startHeader) < 1 && Math.abs(targetWrap - startWrap) < 1) return
  header.style.transition = 'none'
  wrap.style.transition = 'none'
  header.style.width = startHeader + 'px'
  wrap.style.width = startWrap + 'px'
  void header.offsetWidth
  const ease = 'width 220ms cubic-bezier(.22,1,.36,1)'
  header.style.transition = ease
  wrap.style.transition = ease
  header.style.width = targetHeader + 'px'
  wrap.style.width = targetWrap + 'px'
  clearTimeout(titleWidthTimer)
  titleWidthTimer = window.setTimeout(() => {
    header.style.transition = ''
    header.style.width = ''
    wrap.style.transition = ''
    wrap.style.width = ''
  }, 250)
}

async function goLib(lib) {
  if (!lib || store.libSwitch.active) return
  const name = lib.path || lib.name
  if (isCurrentLib(lib)) {
    rememberLib(name)
    if (isMobileLibView()) closeLibPanel()
    return
  }
  // 切库会清空当前文档缓存，必须先等最新内容落盘。
  if (store.currentPath && (store.isDirty || store.saving) && !(await store.save())) return
  /*
   * 桌面保持知识库栏，便于连续切换；手机在完成切换后关闭弹窗。
   */
  const url = new URL(location.href)
  url.searchParams.set('lib', name)
  /* 换库之后当前这篇多半不属于新库，交给 ensureCurrent 重新挑一篇 */
  history.replaceState(null, '', url.toString())
  animateCompactTitleWidth(name)
  currentLib.value = name
  rememberLib(name)
  applyCurrentLib()
  /*
   * 用 switchLib 而不是 loadAll：它会先把"当前这篇"清掉再拉新库的树。
   * 不清的话地址栏会出现"路径属于 A 库、?lib= 指向 B 库"的自相矛盾状态。
   */
  await store.switchLib()
  if (isMobileLibView()) closeLibPanel()
}

/*
 * 知识库的…菜单：复用侧边栏那一套浮层（tree.menu），
 * 所以位置、样式、点别处关掉的行为都一样，不用另造一个。
 */
function libContext(e,lib){if(isGuest.value||e.target.closest('input,textarea'))return;e.preventDefault();e.stopPropagation();openLibMenu(lib,e)}
function openLibMenu(lib, ev) {
  tree.openMenu('lib', { name: lib.name, path: lib.path, docs: lib.docs }, ev)
}
function openLibSortMenu(ev) {
  tree.openMenu('lib-sort', null, ev)
}

function onLibRowPointerDown(event) {
  // 操作按钮上的轻微移动不应该把整行拖起来，否则会吞掉按钮的 click。
  libDrag.blocked = !!event.target.closest('.lib-row-actions, .lib-icon-btn')
}
function startLibDrag(lib, event) {
  if (libDrag.blocked || libSort.value !== 'manual' || isGuest.value) { event.preventDefault(); libDrag.blocked = false; return }
  libDrag.name = lib.name
  libDrag.over = ''
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', lib.name)
}
function overLibDrag(lib) {
  if (libSort.value !== 'manual' || !libDrag.name || libDrag.name === lib.name) return
  libDrag.over = lib.name
}
function dropLib(target) {
  if (libSort.value !== 'manual' || !libDrag.name || libDrag.name === target.name) { endLibDrag(); return }
  const order = normalizedLibOrder()
  const from = order.indexOf(libDrag.name), to = order.indexOf(target.name)
  if (from < 0 || to < 0) { endLibDrag(); return }
  order.splice(to, 0, order.splice(from, 1)[0])
  libOrder.value = order
  saveLibPrefs()
  endLibDrag()
}
function endLibDrag() {
  libDrag.name = ''
  libDrag.over = ''
  libDrag.blocked = false
}

/*
 * 面板上的点击也要能把…菜单收起来。
 *
 * 菜单的关闭靠"文档上的下一次点击"，而面板容器带 @click.stop ——
 * 点击在面板范围内根本到不了 document，于是点了别处菜单还挂着。
 * 这里在面板自己这一层补一次关闭。
 */
function onLibPanelClick() {
  if (tree.menu.open) tree.closeMenu()
}

/*
 * 就地改名：点铅笔那一行变成输入框，回车或失焦提交，Esc 取消。
 * 不用弹窗 —— 改名是个高频小动作，弹一层窗打断节奏。
 */
const renaming = ref('')
const renameText = ref('')
const renameInput = ref(null)

function startRename(lib) {
  renaming.value = lib.name
  renameText.value = lib.name
  nextTick(() => {
    const el = Array.isArray(renameInput.value) ? renameInput.value[0] : renameInput.value
    el?.focus?.()
    el?.select?.()
  })
}

function cancelRename() {
  renaming.value = ''
  renameText.value = ''
}

/** 两个改名入口共用这一条流程；当前库改名会使所有文档路径失效。 */
async function renameLib(from, to) {
  if (!from || !to || to === from) return
  if (to.includes('/') || to.startsWith('.')) throw new Error('知识库名不能带斜杠或以点开头')
  const active = from === currentLib.value
  if (active && (store.isDirty || store.saving) && !(await store.save())) {
    throw new Error(store.error || '重命名失败')
  }
  libPanel.busy = from
  try {
    const data=await store.renameLibrary(from,to)
    libPanel.libs=data.libs||[]
    libOrder.value = libOrder.value.map(name => name === from ? to : name)
    saveLibPrefs()
    if(active)currentLib.value=to
    applyCurrentLib()
  } finally {
    libPanel.busy = ''
  }
}

/** 提交改名：服务端重命名文件夹，并同步稳定标识与图标表 */
async function commitRename(lib) {
  const to = String(renameText.value || '').trim()
  const from = lib.name
  if (renaming.value !== from) return
  renaming.value = ''
  if (!to || to === from) return
  try {
    await renameLib(from, to)
  } catch (e) {
    store.setError(e.message || e)
  }
}

/** 标题就是库名；改名会同步重命名目录。 */
async function onBrandEdited(value) {
  const v = String(value || '').trim()
  if (!v || v === currentLib.value) {
    brandTitle.value = currentLib.value
    return
  }
  try {
    await renameLib(currentLib.value, v)
  } catch (e) {
    brandTitle.value = currentLib.value
    store.setError(e.message || e)
  }
}

/** 换某个知识库的图标 */
const recoveryOpen=ref(false)
async function onRecovered(){await loadLibs();await store.loadTree()}
const activityOpen=ref(false), activityUnread=ref(0)
async function loadActivityUnread(){
  if(isGuest.value) return
  try {
    const response=await fetch(API_BASE+'/api/activity?limit=1')
    const result=await response.json()
    if(result.ok) activityUnread.value=result.data.unread||0
  } catch { /* 收件箱读不到不影响主界面 */ }
}
function openActivity(){footerTools.value=false;activityOpen.value=true}
async function closeActivity(){activityOpen.value=false;await nextTick();toolsTrigger.value?.focus();await loadActivityUnread()}
async function onActivitySelect(path){await closeActivity();emit('select',path)}
const iconPicking=ref(false)
const libIconTarget = ref(null), libIconAnchor=ref(null)
function pickLibIcon(lib,event) { libIconAnchor.value=event?.currentTarget;libIconTarget.value=lib;iconPicking.value=true }
async function saveLibIcon(icon) {
  const res=await fetch(API_BASE+'/api/lib/meta',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:libIconTarget.value.name,icon})})
  const result=await res.json();if(!result.ok)throw new Error(result.error)
  libPanel.libs=result.data.libs||[];applyCurrentLib()
}

async function onPickLibIcon(e) {
  const file = e.target.files?.[0]
  const lib = libIconTarget.value
  e.target.value = ''
  if (!file || !lib) return
  const dataUrl = await readAsDataUrl(file)
  try {
    const res = await fetch(API_BASE + '/api/lib/meta', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: lib.name, icon: dataUrl })
    })
    const data = await res.json()
    if (data.ok) {
      libPanel.libs = data.data.libs || []
      applyCurrentLib()
    }
  } catch {
    /* 换不成就算了 */
  }
}

function readAsDataUrl(file) {
  return new Promise((resolve) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result || ''))
    fr.onerror = () => resolve('')
    fr.readAsDataURL(file)
  })
}

/*
 * 删除知识库 = 把那个文件夹移到回收站（不真删）。
 * 一次操作就是几百个文件，所以确认框里把篇数写清楚。
 */
async function deleteLib(lib) {
  askLibDialog({
    title: '删除知识库《' + lib.name + '》',
    message: '它的 ' + (lib.docs || 0) + ' 篇文档会被移到回收站，可以再捞回来。',
    confirmText: '移到回收站',
    danger: true,
    onConfirm: () => { closeLibDialog(); doDeleteLib(lib) }
  })
}

async function doDeleteLib(lib) {
  libPanel.busy = lib.name
  try {
    if (lib.name === currentLib.value && (store.isDirty || store.saving) && !(await store.save())) {
      throw new Error(store.error || '删除失败')
    }
    const res = await fetch(API_BASE + '/api/lib', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: lib.name })
    })
    const data = await res.json()
    if (!data.ok) throw new Error(data.error || '删除失败')
    libPanel.libs = data.data.libs || []
    libOrder.value = libOrder.value.filter(name => name !== lib.name)
    saveLibPrefs()
    /* 删的是当前库：换到第一个剩下的库 */
    if (lib.name === currentLib.value) {
      const first = libPanel.libs[0]
      if (first) await goLib(first)
    }
  } catch (e) {
    store.setError(e.message || e)
  } finally {
    libPanel.busy = ''
  }
}

/*
 * 面板不随"点别处"收起。
 *
 * 两栏各有各的开合：面板由它自己的收起按钮（和左上角那个提示）控制，
 * 侧边栏由它自己的收起按钮与拖宽控制。原先面板会在任何一次文档区点击时收掉，
 * 于是拖侧边栏宽度、点一下正文，面板也跟着没了 —— 看着就像两者联动。
 */
onMounted(() => {
  if (new URLSearchParams(location.search).has('choose') && !isGuest.value) {
    openManager()
    const url = new URL(location.href)
    url.searchParams.delete('choose')
    history.replaceState(null, '', url)
  }
  /*
   * 没指定 ?lib= 时选默认库。
   *
   * 顺序：先拉库列表，再等树到手 —— 因为旧链接要靠树才能认出"它想进哪个库"
   * （老链接是 /onlyread/笔试题/xxx，没有 ?lib=，而"笔试题"现在是
   *  Agent（设计方向）库里的东西）。树还没到就只能退回第一个库。
   */
  loadLibs().then(() => {
    if (currentLib.value) return
    const pick = () => {
      const byLegacy = store.legacyLib()
      const hit = libPanel.libs.find((l) => l.name === byLegacy)
      const lib = hit || libPanel.libs[0]
      if (!lib) return
      currentLib.value = lib.name
      applyCurrentLib()
      const url = new URL(location.href)
      url.searchParams.set('lib', lib.name)
      history.replaceState(null, '', url.toString())
      /*
       * 补上 lib 之后必须重新拉树。
       *
       * 最初那次 /api/tree 是不带 lib 拉的（进来时地址栏里还没有），拿到的是整棵树 ——
       * 于是 /onlyread 这种不带 lib 的地址会显示出根下的几个知识库目录，
       * 看着就像"知识库和它内部文件夹的关系乱了"。
       */
      store.switchLib({ animate: false })
    }
    if (store.allFiles.length) pick()
    else {
      const stop = watch(
        () => store.allFiles.length,
        (n) => { if (n) { stop(); pick() } }
      )
      /* 树迟迟不来也不能卡住：一秒后退回第一个库 */
      setTimeout(() => { stop(); if (!currentLib.value) pick() }, 1200)
    }
  })
})
/*
 * 默认知识库图标，同时暂作产品 logo / favicon 的占位。
 * 真正的产品图标定下来后，只替换 logo 这一处，知识库默认图标保持独立。
 */
const siteIcon = '📁'
/*
 * 产品标识与知识库图标分开：
 * 顶栏 logo / favicon 是产品自己的身份，不随当前知识库切换。
 * 知识库图标只出现在知识库行和管理列表里。
 */
const logo = computed(() => import.meta.env.VITE_LOGO || siteIcon)
watch(logo, setFavicon, {immediate:true})
/** 文档区左上角的库图标跟当前知识库走；产品 favicon 仍保持独立。 */
const currentLibIcon = computed(() => libPanel.libs.find(l => l.name === currentLib.value)?.icon || 'icon:folder')

/** 顶层目录：收起态那一列图标用 */
const topFolders = computed(() => props.nodes.filter((n) => n.type === 'folder'))

function folderHasCurrent(folder) {
  if (!props.currentPath) return false
  const walk = (n) => (n.type !== 'folder' ? n.file === props.currentPath : (n.children || []).some(walk))
  return (folder.children || []).some(walk)
}

/* ---------- 拖拽：把文档挪进某个目录 ---------- */

/**
 * 拖拽状态住在这里，递归的 DocTree 用 inject 直接读写。
 * 落点是目录（拖到某一行上就落在它所在的那个目录），根目录 = 空白处。
 */
/**
 * 树里的拖拽、改名、菜单状态。
 *
 * 拖拽只有一套：**每个层级、每个位置都能放**。
 *   - 落在行的中间带（目录行才有）= 挪进那个目录
 *   - 落在行的上下边 = 插到这个位置（同层排序；跨层就是先挪过去再排）
 * 文档和目录用同一套手势，文档用文件路径、目录用目录路径，靠 kind 区分。
 */
const tree = reactive({
  /** 正在拖的条目：{ kind: 'doc'|'folder', path, parent, key }，空表示没在拖 */
  drag: null,
  /** 落进某个目录 */
  dropInto: null,
  /** 插到某一层的某个位置：{ parent, index } */
  dropAt: null,
  /** 原位改名：{ kind: 'doc'|'cat', node, value }，为空表示没有在改名 */
  edit: null,
  /** 内联新建：{ kind: 'doc'|'folder', parent, value } */
  create: null,
  /** …菜单：浮在 body 上，不被侧栏的滚动裁掉 */
  menu: { open: false, ready: false, kind: '', node: null, style: {} },

  /* ---------- 拖拽 ---------- */

  entryOf(node) {
    return node.type === 'folder' ? node.name : node.file.slice(node.file.lastIndexOf('/') + 1)
  },
  parentOfNode(node) {
    if (node.type === 'folder') {
      const i = node.path.lastIndexOf('/')
      return i < 0 ? '' : node.path.slice(0, i)
    }
    const i = node.file.lastIndexOf('/')
    return i < 0 ? '' : node.file.slice(0, i)
  },
  start(node, e) {
    if (!store.canEdit(node)) return
    this.drag = {
      kind: node.type === 'folder' ? 'folder' : 'doc',
      path: node.type === 'folder' ? node.path : node.file,
      parent: this.parentOfNode(node),
      key: this.entryOf(node)
    }
    this.dropInto = null
    this.dropAt = null
    e.dataTransfer.effectAllowed = 'move'
    // Firefox 不设 data 就不触发拖拽
    e.dataTransfer.setData('text/plain', this.drag.path)
  },
  /** 悬停在某一行上：中间带进目录，上下边插位置 */
  overRow(node, e) {
    if (!this.drag) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const r = e.currentTarget.getBoundingClientRect()
    const y = (e.clientY - r.top) / r.height
    if (node.type === 'folder' && y > 0.3 && y < 0.7) {
      if (this.drag.path === node.path) return
      this.dropInto = node.path
      this.dropAt = null
      return
    }
    this.dropInto = null
    const parent = this.parentOfNode(node)
    if (parent !== this.drag.parent && node.type === 'folder' && node.path === this.drag.path) return
    // 插到这一行前面还是后面，看鼠标在行的上半还是下半
    const list = entriesOf(parent)
    const key = this.entryOf(node)
    const i = list.indexOf(key)
    if (i < 0) return
    this.dropAt = { parent, index: i + (y > 0.5 ? 1 : 0) }
  },
  /** 落在空白处：挪到当前知识库根目录末尾。 */
  overRoot(e) {
    if (!this.drag || e.defaultPrevented) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    this.dropInto = currentLib.value || ''
    this.dropAt = null
  },
  async drop() {
    if (!this.drag) return
    const d = this.drag
    const into = this.dropInto
    const at = this.dropAt
    this.end()
    if (!d) return
    const visibleMode = sortMode.value
    try {
      if (into !== null && into !== undefined) {
        if (into === d.parent) return
        // 拖过就切手动排序，否则列表会按按名称立刻重排，白拖
        sortMode.value = 'manual'
        if (d.kind === 'doc') await store.moveDoc(d.path, into)
        else await store.moveCategory(d.path, into)
        return
      }
      if (!at) return
      // 拖过就切手动排序，否则列表会按按名称立刻重排，白拖
      sortMode.value = 'manual'
      let path = d.path
      // 跨层插入：先挪进那一层，再排序
      if (at.parent !== d.parent) {
        if (d.kind === 'doc') {
          if (into === null && at.parent === d.parent) return
          path = (await store.moveDoc(d.path, at.parent)).file
        } else {
          path = (await store.moveCategory(d.path, at.parent)).path
        }
      }
      const key = path.slice(path.lastIndexOf('/') + 1)
      const names = entriesOf(at.parent, visibleMode)
      const from = names.indexOf(key)
      if (from < 0) return
      names.splice(from, 1)
      let to = at.index
      if (from < to) to--
      to = Math.max(0, Math.min(to, names.length))
      names.splice(to, 0, key)
      await store.reorderEntries(at.parent, names)
    } catch (e) {
      store.setError(e.message || e)
    }
  },
  end() {
    this.drag = null
    this.dropInto = null
    this.dropAt = null
  },

  /* ---------- 原位改名 ---------- */

  editStart(kind, node) {
    if (!store.canEdit(node)) return
    this.edit = { kind, node, value: node.name }
  },
  editCancel() {
    this.edit = null
  },
  /** 提交改名：先清状态再比对，回车紧跟着的 blur 不会重复提交一次 */
  async editCommit() {
    const e = this.edit
    if (!e) return
    this.edit = null
    const next = String(e.value || '').trim()
    if (!next || next === e.node.name) return
    try {
      if (e.kind === 'doc') await store.renameDoc(e.node.file, next)
      else await store.renameCategory(e.node.path, next)
    } catch (err) {
      store.setError(err.message || err)
    }
  },

  /* ---------- 内联新建 ---------- */

  expand(path) {
    if (!path || !collapsedCats.value.has(path)) return
    const next = new Set(collapsedCats.value)
    next.delete(path)
    collapsedCats.value = next
  },
  startCreate(kind, parent = '') {
    if (isGuest.value) return
    // 单列表看不到目录，建目录时切回目录视图，否则建完像没反应
    if (kind === 'folder') groupMode.value = 'tree'
    if (parent) this.expand(parent)
    this.create = { kind, parent: parent || '', value: '' }
    nextTick(() => document.querySelector('.tree-create-input')?.focus())
  },
  createCancel() {
    this.create = null
  },
  /** 名称为空就是取消；确认前不落盘，避免留下空文件/空文件夹。 */
  async createCommit() {
    const c = this.create
    if (!c) return
    this.create = null
    const name = String(c.value || '').trim()
    if (!name) return
    try {
      if (store.isDirty && !(await store.save())) return
      if (c.kind === 'doc') await store.createDoc(c.parent, name)
      else await store.createCategory(c.parent, name)
    } catch (error) {
      store.setError(error.message || error)
    }
  },

  /* ---------- …菜单 ---------- */

  openMenu(kind, node, ev) {
    const context = ev.type === 'contextmenu'
    const trigger = kind === 'root' ? null : (ev.currentTarget.matches('button, [tabindex]')
      ? ev.currentTarget : ev.currentTarget.querySelector('button, [tabindex]'))
    // 再点同一个触发器 = 收起，而不是先关再开。
    if (!context && this.menu.open && this.menuTrigger === trigger && this.menu.kind === kind) {
      this.closeMenu()
      return
    }
    this.closeMenu()
    this.menuTrigger = trigger
    const r = ev.currentTarget.getBoundingClientRect()
    const w = 148
    this.menu = {
      open: true,
      // 先按预计算锚点显示，下一 tick 再量宽高微调；不要因为测量失败把菜单留在隐藏态。
      ready: true,
      kind,
      node,
      style: {
        width: w + 'px',
        left: Math.max(8, Math.min(context ? ev.clientX : r.right - w, window.innerWidth - w - 8)) + 'px',
        top: Math.max(8, Math.min(context ? ev.clientY : r.bottom + 4, window.innerHeight - 8)) + 'px'
      }
    }
    /*
     * 关闭条件：点了菜单外面，或者按了 Esc。
     *
     * 以前是"下一次点击就关，不管点在哪" —— 那样在文档区随便点一下，
     * 甚至点右侧的目录栏、顶栏，菜单都会被收掉，像是被别处的操作打断。
     * 现在只在点到菜单范围之外时才关；点到菜单自己是走菜单项的动作。
     */
    nextTick(()=>{
      const panel=document.querySelector('.tree-menu')
      if(!panel){
        /* Teleport / transition hasn't committed yet. Show at the precomputed
           anchor instead of leaving the menu stuck at is-measuring. */
        this.menu.ready = true
        return
      }
      const rect=panel.getBoundingClientRect()
      let top = context ? ev.clientY : r.bottom + 4
      if (top + rect.height > window.innerHeight - 8) top = context ? ev.clientY - rect.height : r.top - rect.height - 4
      top = Math.max(8, Math.min(top, window.innerHeight - rect.height - 8))
      let left = context ? ev.clientX : r.right - rect.width
      left = Math.max(8, Math.min(left, window.innerWidth - rect.width - 8))
      this.menu.style = { width: rect.width + 'px', left: left + 'px', top: top + 'px' }
      this.menu.ready = true
      panel.querySelector('button:not(:disabled)')?.focus()
    })
    const close = () => this.closeMenu()
    this.onKey = (e) => { if (e.key === 'Escape') close() }
    this.onClick = (e) => {
      const el = document.querySelector('.tree-menu')
      if (el && el.contains(e.target)) return
      close()
    }
    document.addEventListener('keydown', this.onKey)
    setTimeout(() => document.addEventListener('click', this.onClick), 0)
  },
  closeMenu() {
    if (!this.menu.open) return
    const trigger = this.menuTrigger
    this.menu.open = false
    this.menu.kind = ''
    this.menu.node = null
    this.menuTrigger = null
    trigger?.focus?.()
    document.removeEventListener('keydown', this.onKey)
    if (this.onClick) {
      document.removeEventListener('click', this.onClick)
      this.onClick = null
    }
  }
})
provide('tree', tree)

const batch = reactive({
  mode: false,
  selected: new Map(),
  path(node) { return node.type === 'folder' ? node.path : node.file },
  covered(node) {
    const path = this.path(node)
    return [...this.selected.values()].some(item => item.type === 'folder' && path.startsWith(item.path + '/'))
  },
  checked(node) { return this.selected.has(this.path(node)) || this.covered(node) },
  canToggle(node) { return store.canEdit(node) && !this.covered(node) },
  toggle(node) {
    if (!this.mode || !this.canToggle(node)) return
    const path = this.path(node)
    if (this.selected.has(path)) { this.selected.delete(path); return }
    if (node.type === 'folder') {
      for (const key of this.selected.keys()) if (key.startsWith(path + '/')) this.selected.delete(key)
    }
    this.selected.set(path, { path, name: node.name, type: node.type })
  },
  cancel() { this.mode = false; this.selected.clear() }
})
provide('batch', batch)
watch(currentLib, () => batch.cancel())

function requestBatchDelete() {
  if (!batch.selected.size) return
  const current = new Map()
  const visit = nodes => { for (const node of nodes) { current.set(batch.path(node), node); if (node.children) visit(node.children) } }
  visit(props.nodes)
  const selected = [...batch.selected.values()].map(item => current.get(item.path))
  if (selected.some(node => !node || !store.canEdit(node))) {
    store.setError('文档列表已变化，请重新选择')
    batch.cancel()
    return
  }
  const summary = selected.slice(0, 5).map(node => batch.path(node)).join('、')
  const rest = selected.length > 5 ? `，还有 ${selected.length - 5} 项` : ''
  askLibDialog({
    title: `删除选中的 ${selected.length} 项？`,
    message: `${summary}${rest}。将移入回收站${selected.some(node => node.type === 'folder') ? '，文件夹内的内容也会一并移入' : ''}。`,
    confirmText: '移入回收站',
    danger: true,
    onConfirm: async () => {
      closeLibDialog()
      const currentPath = store.currentPath
      const deletesCurrent = selected.some(node => currentPath === batch.path(node) || node.type === 'folder' && currentPath.startsWith(node.path + '/'))
      if (deletesCurrent && store.isDirty && !(await store.save())) {
        store.setError('当前文档未保存，未执行删除')
        return
      }
      let done = 0
      for (const node of selected) {
        const path = batch.path(node)
        try {
          if (node.type === 'folder') await store.deleteCategory(path)
          else await store.deleteDoc(path)
          batch.selected.delete(path)
          done++
        } catch (error) {
          store.setError(`已移入回收站 ${done} 项；${path} 未删除：${String(error.message || error)}`)
          return
        }
      }
      batch.cancel()
    }
  })
}

function onBlankTreeContext(event) {
  if (isGuest.value || event.target.closest('.cat-row, .doc-row, button, input, textarea, [contenteditable="true"]')) return
  event.preventDefault()
  if (batch.mode) return
  tree.openMenu('root', null, event)
}

function onFlatDocContext(event, doc) {
  if (isGuest.value || event.target.closest('input, textarea, [contenteditable="true"]')) return
  event.preventDefault()
  event.stopPropagation()
  if (batch.mode) return
  tree.openMenu('file', doc, event)
}

/** 菜单里列什么：目录多两项新建 */
const menuItems = computed(() => {
  if (!tree.menu.open || isGuest.value) return []
  const node = tree.menu.node
  const kind = tree.menu.kind
  if (kind === 'lib-sort') {
    return libSortOptions.map(option => ({
      id: 'sort-' + option.value,
      label: option.label,
      icon: libSort.value === option.value ? PhCheck : PhListDashes
    }))
  }
  if (kind === 'root') {
    const items = currentLibEditable.value ? [
      { id: 'new-doc', label: '新建文档', icon: PhFilePlus },
      { id: 'new-folder', label: '新建文件夹', icon: PhFolderSimplePlus }
    ] : []
    items.push({ id: 'rescan', label: '刷新', icon: PhArrowClockwise })
    if (currentLibEditable.value) items.push({ id: 'batch-delete', label: '批量删除', icon: PhTrash })
    return items
  }
  const items = []
  if (kind !== 'lib' && canRevealInFinder.value) items.push({ id: 'reveal', label: fileManagerLabel(kind !== 'file'), icon: PhFolderSimple })
  if (!store.canEdit(node)) return items
  if (kind === 'lib') {
    if (!isGuest.value) items.push(
      ...(canRevealInFinder.value ? [{ id:'lib-reveal', label: fileManagerLabel(true), icon: PhFolderSimple }] : []),
      { id:'lib-pin', label: libPinned(node) ? '取消置顶' : '置顶知识库', icon: PhPushPin },
      { id:'lib-rename',label:'重命名',icon:PhPencilSimple },
      { id:'lib-delete',label:'删除知识库',icon:PhTrash,danger:true }
    )
  } else {
    if (kind === 'folder') items.push({id:'new-doc',label:'新建文档',icon:PhFilePlus},{id:'new-folder',label:'新建文件夹',icon:PhFolderSimplePlus})
    items.push({id:'copy-to',label:'复制到知识库',icon:PhCopy},{id:'move-to',label:'移动到知识库',icon:PhArrowRight})
    items.push({id:'rename',label:'重命名',icon:PhPencilSimple},{id:'delete',label:kind==='folder'?'删除目录':'删除',icon:PhTrash,danger:true})
  }
  return items
})

function onMenuPick(item) {
  const kind = tree.menu.kind
  const node = tree.menu.node
  tree.closeMenu()
  if (kind === 'lib-sort') {
    libSort.value = item.id.slice(5)
    return
  }
  if (kind === 'root') {
    if (item.id === 'new-doc' && currentLibEditable.value) tree.startCreate('doc', currentLib.value || '')
    else if (item.id === 'new-folder' && currentLibEditable.value) tree.startCreate('folder', currentLib.value || '')
    else if (item.id === 'rescan') rescan()
    else if (item.id === 'batch-delete' && currentLibEditable.value) { batch.selected.clear(); batch.mode = true }
    return
  }
  if (!node || item.disabled) return
  if (item.id === 'reveal') {
    showInFinder(node.path || node.file)
    return
  }
  /* 知识库那几个动作：名字就是文件夹名，所以改名 = 重命名文件夹 */
  if (kind === 'lib') {
    const lib = { name: node.name, path: node.path, docs: node.docs }
    if (item.id === 'lib-reveal') revealLibInFinder(lib)
    else if (item.id === 'lib-pin') togglePin(lib.name)
    else if (item.id === 'lib-rename') startRename(lib)
    else if (item.id === 'lib-delete') deleteLib(lib)
    return
  }
  if (item.id === 'new-doc') tree.startCreate('doc', node.path)
  else if (item.id === 'new-folder') tree.startCreate('folder', node.path)
  else if (item.id === 'copy-to' || item.id === 'move-to') openTransfer(item.id === 'copy-to' ? 'copy' : 'move', kind, node.path || node.file)
  // 菜单里用 folder/file 区分，改名状态里用 cat/doc（跟输入框的判断一致）
  else if (item.id === 'rename') tree.editStart(kind === 'folder' ? 'cat' : 'doc', node)
  else if (item.id === 'delete') emit(kind === 'folder' ? 'delete-category' : 'delete-doc', node)
}

async function showInFinder(path) {
  try {
    await revealInFileManager(path)
  } catch (error) {
    store.setError(String(error.message || error))
  }
}

/** 用用户眼前的顺序算拖拽落点；不然名称/时间视图下会落到另一行。 */
function entriesOf(parent, mode = sortMode.value) {
  let nodes = [...(nodesOf(parent) || [])]
  if (mode !== 'manual' || groupMode.value === 'flat') {
    const files = nodes.filter((n) => n.type !== 'folder')
    const folders = nodes.filter((n) => n.type === 'folder')
    if (mode === 'recent') files.sort((a, b) => (b.mtime || 0) - (a.mtime || 0))
    else if (mode === 'name') files.sort((a, b) => byName(a, b))
    if (mode !== 'manual') folders.sort((a, b) => byName(a, b))
    nodes = [...files, ...folders]
  }
  return nodes.map((n) => (n.type === 'folder' ? n.name : n.file.slice(n.file.lastIndexOf('/') + 1)))
}

/** 从子节点列表里找一个目录，给拖拽算顺序用 */
function parentOf(p) {
  const i = String(p).lastIndexOf('/')
  return i < 0 ? '' : p.slice(0, i)
}

function nodesOf(parent) {
  let list = props.nodes
  const root = currentLib.value || ''
  if (!parent || parent === root) return list
  const relative = root && String(parent).startsWith(root + '/')
    ? String(parent).slice(root.length + 1)
    : String(parent)
  for (const seg of relative.split('/')) {
    const hit = (list || []).find((n) => n.type === 'folder' && n.name === seg)
    if (!hit) return []
    list = hit.children
  }
  return list
}


const GROUPS = [
  { id: 'tree', label: '按目录', icon: PhFolderSimple },
  { id: 'flat', label: '单列表', icon: PhListDashes }
]
const SORTS = [
  { id: 'manual', label: '手动排序', icon: PhHandGrabbing },
  { id: 'name', label: '按名称', icon: PhSortAscending },
  { id: 'recent', label: '最近更新', icon: PhClockCounterClockwise }
]

const LS = { group: 'reader.group', sort: 'reader.sort', cats: 'reader.cats' }

const groupMode = ref(storageGet(LS.group) === 'flat' ? 'flat' : 'tree')
// 默认手动：没拖过时它就是接口给的顺序（文档在前、目录在后，各自按名字）
const sortMode = ref(storageGet(LS.sort) || 'manual')
/**
 * 目录收起状态。
 *
 * 没有存过偏好（第一次用，或者清了 localStorage）时，把目录都收起来，
 * 只展开当前这篇所在的那条路径 —— 存档下面是三层、十几篇文档，
 * 全展开会把侧栏撑得很长，想找的东西反而看不见。
 */
const storedCats = storageJSON(LS.cats, [])
const collapsedCats = ref(new Set(
  Array.isArray(storedCats) ? storedCats.filter((name) => typeof name === 'string') : []
))
let catsInitialized = storageGet(LS.cats) !== null
watch(
  () => props.nodes,
  (nodes) => {
    if (catsInitialized || !nodes.length) return
    catsInitialized = true
    const keep = new Set()
    if (props.currentPath) {
      const parts = props.currentPath.split('/')
      for (let i = 1; i < parts.length; i++) keep.add(parts.slice(0, i).join('/'))
    }
    const next = new Set()
    const walk = (list) => {
      for (const n of list) {
        if (n.type !== 'folder') continue
        if (!keep.has(n.path)) next.add(n.path)
        walk(n.children || [])
      }
    }
    walk(nodes)
    collapsedCats.value = next
  },
  { immediate: true }
)

/*
 * 换库后重置折叠状态 —— 但必须等**新库的树到手**再重置。
 *
 * 这里踩过一次：libEpoch 一变就重置，而那一刻 props.nodes 还是旧库的树，
 * 于是拿旧路径建了折叠集合；等新树到了，里面一个路径都对不上，
 * 表现就是"一换库（或一改代码）所有文件夹全展开"。
 *
 * 所以只先记一个待办，等树真的换了（且内容确实不同）再按新树重置。
 */
let libJustSwitched = false
watch(
  () => store.libEpoch,
  () => { libJustSwitched = true }
)
watch(
  () => props.nodes,
  (nodes) => {
    if (!libJustSwitched || !nodes.length) return
    libJustSwitched = false
    collapseAll(nodes)
  }
)

/** 把这棵树里的目录全部收起 */
function collapseAll(nodes) {
  const next = new Set()
  const walk = (list) => {
    for (const n of list) {
      if (n.type !== 'folder') continue
      next.add(n.path)
      walk(n.children || [])
    }
  }
  walk(nodes)
  collapsedCats.value = next
  catsInitialized = true
}

const menuOpen = ref(false)
const searchOpen = ref(false)
const query = ref('')

/*
 * 文档树也用同一块共享高亮。
 * 目录是递归组件，没法在每一层各放一块再拼起来；这里从外层 nav 直接量
 * 当前行的屏幕坐标，换算成滚动容器里的坐标，所以层级再深也只有一块。
 */
const docNavEl = ref(null)
const docBlobStyle = ref({ opacity: 0 })
const docBlobMoving = ref(false)
let docBlobTimer = 0
let docResizeObserver = null
function observeDocNav() {
  docResizeObserver?.disconnect()
  if (!docNavEl.value) return
  docResizeObserver = new ResizeObserver(() => measureDocBlob())
  docResizeObserver.observe(docNavEl.value)
}
watch(docNavEl, observeDocNav, { flush: 'post' })
async function measureDocBlob(attempt = 0) {
  await nextTick()
  const host = docNavEl.value
  if (!host) { docBlobStyle.value = { opacity: 0 }; return }
  const row = host.querySelector('.doc-row.is-on')
  // 当前文档被收起的目录藏起来时，行还在 DOM 里，但不能再留一块高亮浮在外面。
  if (!row) {
    docBlobStyle.value = { opacity: 0 }
    // 首屏数据比组件晚一帧到时，等树渲染出来再量一次。
    if (attempt < 3 && props.currentPath) setTimeout(() => measureDocBlob(attempt + 1), 100)
    return
  }
  if (row.closest('.tree-children.is-collapsed')) { docBlobStyle.value = { opacity: 0 }; return }
  const h = host.getBoundingClientRect(), r = row.getBoundingClientRect()
  const next = {
    left: r.left - h.left + host.scrollLeft + 'px',
    top: r.top - h.top + host.scrollTop + 'px',
    width: r.width + 'px',
    height: r.height + 'px',
    opacity: 1
  }
  const prev = docBlobStyle.value
  if (prev.opacity === 1 && (prev.left !== next.left || prev.top !== next.top)) {
    docBlobMoving.value = true
    clearTimeout(docBlobTimer)
    docBlobTimer = setTimeout(() => { docBlobMoving.value = false }, 300)
  }
  docBlobStyle.value = next
}
watch(
  () => [props.currentPath, props.nodes, groupMode.value, sortMode.value, query.value, props.collapsed, props.width],
  () => measureDocBlob(),
  { flush: 'post', immediate: true }
)
watch(collapsedCats, () => {
  measureDocBlob()
  setTimeout(measureDocBlob, 380)
}, { flush: 'post' })
// 侧栏展开是 220ms 的宽度动画：动画开始时量到的是 0 宽，结束后必须再量一次。
watch(() => props.collapsed, () => {
  measureDocBlob()
  setTimeout(measureDocBlob, 280)
}, { flush: 'post' })
// 新建行插在选中文档上面时，选中底块要跟着下移，不能停在新建行的位置。
watch(() => [tree.create?.kind, tree.create?.parent], () => {
  measureDocBlob()
  setTimeout(measureDocBlob, 120)
}, { flush: 'post' })
onBeforeUnmount(() => {
  clearTimeout(docBlobTimer)
  docResizeObserver?.disconnect()
})
const searchEl = ref(null)

watch([groupMode, sortMode], () => {
  storageSet(LS.group, groupMode.value)
  storageSet(LS.sort, sortMode.value)
})
watch(
  collapsedCats,
  (v) => storageSet(LS.cats, JSON.stringify([...v])),
  { deep: true }
)

function toggleCat(name) {
  const next = new Set(collapsedCats.value)
  next.has(name) ? next.delete(name) : next.add(name)
  collapsedCats.value = next
}
function isCollapsed(name) {
  return collapsedCats.value.has(name)
}
function expandTo(name) {
  const next = new Set(collapsedCats.value)
  next.delete(name)
  collapsedCats.value = next
  emit('toggle-collapse')
}

/**
 * 重新扫描磁盘。
 *
 * 树本来就是每次扫盘生成的，所以在 app 外面改名、挪目录、新建、删除之后，
 * 从侧栏空白处右键刷新（或者刷新页面）就一致了，不需要文件监听。
 * 当前这篇没改过的话顺便把正文也重新读一遍，外面改过内容也能看到。
 */
async function rescan() {
  try {
    if(!isGuest.value){
      const result=await (await fetch(API_BASE+'/api/reconcile')).json()
      if(!result.ok)throw Error(result.error)
      if(result.data.length){const move=result.data[0];askLibDialog({title:'确认外部改名',message:move.from+' → '+move.to+'。确认后会保留原来的权限、图标和历史。',confirmText:'保留设置并继续',onConfirm:async()=>{try{const out=await(await fetch(API_BASE+'/api/reconcile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(move)})).json();if(!out.ok)throw Error(out.error);closeLibDialog();await rescan()}catch(e){store.setError(e.message);closeLibDialog()}}});return}
    }
    await store.loadTree()
    if (store.currentPath && !store.isDirty) await store.reload()
  } catch (e) {
    store.setError(e.message || e)
  }
}

/* ---------- 拖拽调宽 ---------- */

function startResize(e) {

  const startX=e.clientX, startW=props.width
  resizePanel(e, ev => emit('update:width', Math.max(180,Math.min(420,startW + (ev.clientX-startX)))), () => {})
}

function setGroup(id) {
  groupMode.value = id
  menuOpen.value = false
}
function setSort(id) {
  sortMode.value = id
  menuOpen.value = false
}

async function toggleSearch() {
  searchOpen.value = !searchOpen.value
  if (searchOpen.value) {
    await nextTick()
    searchEl.value?.focus()
  } else {
    query.value = ''
  }
}
function closeSearch() {
  searchOpen.value = false
  query.value = ''
}
async function expandAndSearch() {
  /* 侧栏收起时先展开；已经展开就不要再切一次，否则 Cmd+K 会把侧栏关掉 */
  if (props.collapsed) {
    emit('toggle-collapse')
    await nextTick()
  }
  searchOpen.value = true
  await nextTick()
  searchEl.value?.focus()
  searchEl.value?.select?.()
}

/* ---------- 过滤与排序 ---------- */

/** 把嵌套的树摊平成文档列表（单列表视图用） */
function flatten(nodes, dir, out) {
  for (const n of nodes || []) {
    if (n.type === 'folder') flatten(n.children, n.path, out)
    else out.push({ ...n, dir })
  }
  return out
}

const byName = (a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' })

const flatDocs = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = flatten(props.nodes, '', []).filter((d) => !q || d.name.toLowerCase().includes(q) || String(d.file || '').toLowerCase().includes(q))
  if (sortMode.value === 'recent') list.sort((a, b) => (b.mtime || 0) - (a.mtime || 0))
  else if (sortMode.value === 'name') list.sort(byName)
  return list
})

/** 有命中的文档数：搜索要看整棵树（含嵌套目录） */
function countMatches(nodes, q) {
  let n = 0
  for (const x of nodes || []) {
    if (x.type !== 'folder') { if (!q || x.name.toLowerCase().includes(q) || String(x.file || '').toLowerCase().includes(q)) n++ }
    else n += countMatches(x.children, q)
  }
  return n
}

const visibleCount = computed(() => {
  const q = query.value.trim().toLowerCase()
  return groupMode.value === 'tree' ? countMatches(props.nodes, q) : flatDocs.value.length
})

/* ---------- 相对时间 ---------- */

function relTime(ms) {
  if (!ms) return ''
  const diff = Date.now() - ms
  const min = 60000
  if (diff < min) return '刚刚'
  if (diff < 60 * min) return Math.floor(diff / min) + '分钟'
  if (diff < 24 * 60 * min) return Math.floor(diff / (60 * min)) + '小时'
  if (diff < 30 * 24 * 60 * min) return Math.floor(diff / (24 * 60 * min)) + '天'
  const d = new Date(ms)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

/* ---------- 点外面关菜单 ---------- */

function onDocClick(e) {
  const target = e.target instanceof Element ? e.target : null
  if (!target?.closest('.workspace-tools-footer')) footerTools.value = false
  if (!target?.closest('.side-menu, .icon-btn')) menuOpen.value = false
}
function onLibEscape(e) {
  if (e.key !== 'Escape' || e.defaultPrevented) return
  if(footerTools.value){footerTools.value=false;toolsTrigger.value?.focus();return}
  if (transfer.open) { transfer.open = false; return }
  if (managerOpen.value) { managerOpen.value = false; return }
  if (batch.mode) { batch.cancel(); return }
  if (!libPanel.open || !isMobileLibView()) return
  if (tree.menu.open) {
    tree.closeMenu()
    return
  }
  closeLibPanel()
}
/* Cmd+K 从外壳调进来：展开侧栏并聚焦文档搜索 */
/**
 * 收起态 header 的自然宽度：给外壳做“展开时宽度从 compact 长到侧栏宽”的动画用。
 * 标题宽度用 canvas 按当前字体量，其他宽度都从真实 DOM 上取，避免写死。
 */
const compactActionsHover = ref(false)
let compactPointerInside = false
let compactRevealSuppressed = false

function onCompactActionsEnter() {
  compactPointerInside = true
  if (!compactRevealSuppressed) compactActionsHover.value = true
}

function onCompactActionsLeave(event) {
  const next = event?.relatedTarget
  if (next instanceof Node && event.currentTarget.contains(next)) return
  compactPointerInside = false
  compactActionsHover.value = false
  compactRevealSuppressed = false
}

watch(() => props.chromeCompact, (compact) => {
  compactActionsHover.value = false
  /* 收起完成时鼠标往往还停在 > 上：这时先压住，等真正移出再 hover 才出现。 */
  compactRevealSuppressed = compact && compactPointerInside
})

watch(() => props.collapsed, (compact) => {
  compactActionsHover.value = false
  compactRevealSuppressed = compact && compactPointerInside
})

function compactHeaderWidth(title) {
  const header = document.querySelector('.side-header')
  if (!header) return props.width
  /* 复制一份到屏幕外，套上 compact 样式量真实宽度：比按字体估算可靠，也不会闪 */
  const clone = header.cloneNode(true)
  clone.classList.add('is-compact')
  clone.querySelector('.kb-identity')?.classList.add('is-compact')
  clone.querySelector('.sidebar-actions')?.classList.add('is-compact')
  /* 克隆时 header 可能还是展开态，标题也要切回 compact 的那个按钮，否则量宽会偏大。 */
  clone.querySelector('.kb-title')?.classList.add('is-hidden')
  clone.querySelector('.kb-title-compact')?.classList.remove('is-hidden')
  if (title !== undefined) {
    const stack = clone.querySelector('.kb-title-stack')
    if (stack) {
      const span = stack.querySelector('.kb-title-text')
      if (span) {
        span.className = 'kb-title-text'
        span.textContent = title || '知识库'
        for (const extra of [...stack.querySelectorAll('.kb-title-text')].slice(1)) extra.remove()
      }
    }
  }
  clone.style.position = 'fixed'
  clone.style.left = '-9999px'
  clone.style.top = '0'
  clone.style.width = 'max-content'
  clone.style.visibility = 'hidden'
  clone.style.pointerEvents = 'none'
  const sourceTitle = header.querySelector('.kb-title')
  const cloneTitle = clone.querySelector('.kb-title')
  if (sourceTitle && cloneTitle) cloneTitle.value = sourceTitle.value
  document.body.appendChild(clone)
  let width = 0
  try {
    const cs = getComputedStyle(clone)
    width = clone.getBoundingClientRect().width + (parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.marginRight) || 0)
  } finally {
    clone.remove()
  }
  return width
}

async function startCreate(kind = 'doc') {
  if (props.collapsed) {
    emit('toggle-collapse')
    await nextTick()
  }
  tree.startCreate(kind, currentLib.value || '')
}
defineExpose({ expandAndSearch, startCreate, compactHeaderWidth })

onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
onMounted(() => document.addEventListener('keydown', onLibEscape))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onLibEscape)
  resetCompactWidthAnimation(true)
})
onMounted(() => window.addEventListener('reader-access-updated', loadLibs))
onBeforeUnmount(() => window.removeEventListener('reader-access-updated', loadLibs))
onMounted(loadActivityUnread)
</script>

<style scoped>
.library-welcome{margin:0;padding:0 24px 18px;font-size:13px;line-height:1.65;color:var(--c-sub)}
/* 侧边列表和管理弹窗各有明确职责。 */
.lib-modal-backdrop { display: none; }
.lib-backdrop-enter-active, .lib-backdrop-leave-active { transition: opacity 0.2s ease; }
.lib-backdrop-enter-from, .lib-backdrop-leave-to { opacity: 0; }
.lib-panel {
  --lib-row-actions-pad: 27px;
  position: relative; width: var(--lib-w, 236px); flex-shrink: 0;
  display: flex; flex-direction: column; background: var(--c-panel);
  border-right: 1px solid var(--c-line); overflow: hidden;
}
.lib-panel.is-tree-collapsed { --lib-row-actions-pad: 48px; }
.lib-panel-enter-active, .lib-panel-leave-active {
  transition: width 220ms var(--motion-snap), opacity 180ms ease;
}
.lib-panel-enter-from, .lib-panel-leave-to {
  width: 0; opacity: 0;
}
.lib-panel-head {
  display: flex; align-items: center; justify-content: space-between; height: 58px; padding: 0 16px 0 20px;
}
.lib-panel-title { font-size: 12.5px; color: var(--c-sub); }
.lib-panel-head-acts { display: flex; align-items: center; gap: 6px; }
.lib-panel-sort { display:flex;align-items:center;gap:6px;padding:0 12px 10px; }.lib-panel-sort select { width: 100%; padding: 6px 9px; border: 0; border-radius: var(--radius-control); background: var(--c-field); color: var(--c-sub); font: inherit; font-size: 11px; }
.lib-browse-entry { margin-left:auto;display:flex;align-items:center;justify-content:center;gap:6px;flex:none;min-height:32px;padding:5px 9px;border-radius:var(--radius-control);color:var(--c-sub);font-size:11px;white-space:nowrap;transition:background var(--motion-enter) ease,color var(--motion-enter) ease; }.lib-browse-entry:hover { background:var(--c-field);color:var(--c-ink); }
.lib-panel-list { position: relative; flex: 1; overflow-y: auto; overflow-x: hidden; padding: 4px 8px; }
.lib-row-stack { display: block; }
.lib-row.lib-row-enter-active, .lib-row.lib-row-leave-active { transition: opacity 180ms ease, transform 240ms var(--motion-pop); }
.lib-row.lib-row-enter-from, .lib-row.lib-row-leave-to { opacity: 0; transform: translateY(-5px) scale(.985); }
.lib-row.lib-row-move { transition: transform 260ms var(--motion-pop); }
.lib-create-row { max-height: 52px; min-height: 40px; overflow: hidden; transition: max-height 240ms var(--motion-pop), min-height 240ms var(--motion-pop), opacity 180ms ease, transform 240ms var(--motion-pop), padding 240ms var(--motion-pop); }
.lib-create-row.lib-row-enter-from, .lib-create-row.lib-row-leave-to { max-height: 0; min-height: 0; opacity: 0; transform: translateY(-4px); padding-top: 0; padding-bottom: 0; }
.lib-create-row.lib-row-enter-active, .lib-create-row.lib-row-leave-active { transition: max-height 240ms var(--motion-pop), min-height 240ms var(--motion-pop), opacity 180ms ease, transform 240ms var(--motion-pop), padding 240ms var(--motion-pop); }
.doc-tree-nav { position: relative; }
:deep(.cat-row.is-rail-target), :deep(.doc-row.is-rail-target) {
  outline: 1.5px solid color-mix(in srgb, var(--c-accent) 36%, transparent);
  outline-offset: -1px;
  border-radius: var(--radius-row);
}
.doc-row-blob {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 0;
  border-radius: var(--radius-row);
  background: color-mix(in srgb, var(--c-accent) 10%, var(--c-panel));
  border-radius: var(--radius-row);
  pointer-events: none;
  transform-origin: center;
  transition:
    left 340ms var(--motion-pop),
    top 340ms var(--motion-pop),
    width 260ms var(--motion-pop),
    height 260ms var(--motion-pop),
    opacity 180ms ease,
    scale 200ms var(--motion-snap);
}
.doc-row-blob.is-moving { scale: .98 1.12; }
.lib-row-blob {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 0;
  border-radius: var(--radius-row);
  background: color-mix(in srgb, var(--c-accent) 9%, var(--c-panel));
  pointer-events: none;
  transform-origin: center;
  transition:
    left 340ms var(--motion-pop),
    top 340ms var(--motion-pop),
    width 260ms var(--motion-pop),
    height 260ms var(--motion-pop),
    opacity 180ms ease,
    scale 200ms var(--motion-snap);
}
.lib-row-blob.is-moving { scale: .98 1.12; }
.lib-row-marker {
  position: absolute;
  z-index: 2;
  left: 0;
  top: 0;
  width: 3px;
  height: 18px;
  border-radius: 999px;
  background: var(--c-accent);
  opacity: .72;
  pointer-events: none;
  transition: left 200ms var(--motion-snap), top 340ms var(--motion-pop), opacity 160ms ease;
}
.lib-row-blob.is-draft { background: color-mix(in srgb, var(--c-accent) 10%, var(--c-panel)); }
.lib-panel-footer { display:flex;flex-direction:column;margin:5px 8px 12px;gap:2px; }
.lib-manager-entry { display: flex; align-items: center; gap: 9px; width:100%; padding: 10px 12px; border-radius: var(--radius-control); color: var(--c-sub); text-align: left; font-size: 12px; }.lib-manager-entry:hover { background: var(--c-hover); color: var(--c-ink); }
.lib-empty { color: var(--c-faint); font-size: 12px; text-align: center; padding: 24px 0; }
.lib-manager-backdrop { position: fixed; inset: 0; z-index: 59; width: 100%; height: 100%; background: var(--c-overlay); }
.lib-manager { position: fixed; left: 50%; top: 50%; z-index: 60; transform: translate(-50%, -50%); width: min(720px, calc(100vw - 32px)); max-height: min(680px, 84dvh); display: flex; flex-direction: column; background: var(--c-pop); border: 1px solid var(--c-line); border-radius: 40px; corner-shape: superellipse(2); box-shadow: var(--c-pop-shadow); overflow: hidden; }
.lib-manager-head { display: flex; align-items: center; justify-content: flex-end; gap:16px; padding: 18px 24px 8px; }.lib-manager-head p { margin: 5px 0 0; color: var(--c-sub); font-size: 12px; }
.lib-manager-tools { display: flex; gap: 8px; padding: 0 24px 17px; }.lib-manager-tools input, .lib-manager-tools select { min-width: 0; padding: 9px 11px; border: 1px solid var(--c-line); border-radius: var(--radius-control); background: var(--c-field); color: var(--c-ink); font: inherit; font-size: 12px; }.lib-manager-tools input { flex: 1; }.lib-manager-tools select { width: 108px; }
.lib-manager-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(145px, 1fr)); gap: 10px; padding: 0 24px 24px; overflow-y: auto; }.lib-manager-grid .lib-empty { grid-column: 1 / -1; }
.lib-manager-card { position:relative; display: flex; min-height: 110px; padding: 15px; border-radius: 22px; corner-shape: superellipse(2); background: var(--c-field); text-align: left; }.lib-manager-card:hover, .lib-manager-card.is-current { background: var(--c-hover); }.lib-manager-card-main { display:flex;flex-direction:column;align-items:flex-start;gap:8px;width:100%;text-align:left; }.lib-manager-card strong { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--c-ink); font-size: 12px; font-weight: 500; }.lib-manager-card span { color: var(--c-faint); font-size: 11px; }.lib-manager-icon { width: 21px; height: 21px; }.lib-manager-card-more { position:absolute;right:8px;top:8px;opacity:0; }.lib-manager-card:hover .lib-manager-card-more,.lib-manager-card:focus-within .lib-manager-card-more { opacity:1; }
.lib-preview-entry { display:flex;align-items:center;gap:13px;width:100%;min-height:44px;margin-bottom:5px;padding:8px 12px;border-radius:var(--radius-control);color:var(--c-sub);font-size:12px;text-align:left; }.lib-preview-entry:hover { background:var(--c-hover);color:var(--c-ink); }.lib-manager-head-actions { display:flex;align-items:center;gap:9px; }.lib-manager-head-actions>button:not(.icon-btn) { padding:7px 10px;border-radius:var(--radius-control);background:var(--c-field);color:var(--c-sub);font-size:12px; }.lib-manager-previews { min-height:0;overflow-y:auto; }.lib-manager-previews .lib-manager-grid { overflow:visible; }.lib-preview-detail { margin:0 24px 24px;padding:16px;background:var(--c-field);border-radius:22px;corner-shape:superellipse(2); }.lib-preview-detail-head { display:flex;justify-content:space-between;gap:12px;font-size:12px; }.lib-preview-detail-head span,.lib-preview-source { color:var(--c-faint);font-size:11px; }.lib-preview-source { overflow-wrap:anywhere;margin:8px 0; }.lib-preview-body { max-height:300px;overflow:auto;padding:12px 0;font-size:12px;line-height:1.7;overflow-wrap:anywhere; }.lib-preview-body img { max-width:100%; }.lib-preview-body pre { overflow:auto; }.lib-preview-actions { display:flex;justify-content:flex-end;gap:8px; }.lib-preview-actions button { padding:8px 12px;border-radius:var(--radius-control);background:var(--c-pop);font-size:12px; }.lib-preview-actions button:disabled { opacity:.45;cursor:default; }
.lib-preview-body :is(h1,h2,h3) { margin:1.3em 0 .55em;line-height:1.4;font-weight:600; }.lib-preview-body h1 { font-size:1.45em; }.lib-preview-body h2 { font-size:1.25em; }.lib-preview-body h3 { font-size:1.1em; }.lib-preview-body p,.lib-preview-body ul,.lib-preview-body ol { margin:0 0 1em; }.lib-preview-body :is(ul,ol) { padding-left:1.7em; }.lib-preview-body code { font-family:ui-monospace,monospace;font-size:.9em; }.lib-preview-body pre { padding:10px;background:var(--c-pop);border-radius:12px; }.lib-preview-body table { display:block;max-width:100%;overflow:auto;border-collapse:collapse; }.lib-preview-body :is(td,th) { border:1px solid var(--c-line);padding:4px 7px; }.lib-preview-body a { color:var(--c-accent); }.lib-preview-body a[href="#"] { cursor:help;text-decoration-style:dotted; }
.transfer-backdrop { position:fixed;inset:0;z-index:90;display:grid;place-items:center;padding:18px;background:var(--c-overlay); }.transfer-dialog { width:min(410px,100%);max-height:85dvh;overflow:auto;padding:24px;background:var(--c-pop);border:1px solid var(--c-line);border-radius:34px;corner-shape:superellipse(2);box-shadow:var(--c-pop-shadow);color:var(--c-ink); }.transfer-dialog h2 { margin:0;font-size:17px;font-weight:600; }.transfer-dialog p { margin:8px 0 16px;font-size:12px;color:var(--c-sub);overflow-wrap:anywhere; }.transfer-dialog label { display:block;margin:13px 0;font-size:12px;color:var(--c-sub); }.transfer-dialog select { display:block;width:100%;margin-top:7px;padding:9px 11px;border:1px solid var(--c-line);border-radius:var(--radius-control);background:var(--c-field);color:var(--c-ink);font:inherit; }.transfer-dialog .transfer-hint { margin-top:18px;line-height:1.6; }.transfer-dialog .transfer-error { color:#bd4545; }.transfer-actions { display:flex;justify-content:flex-end;gap:8px;margin-top:20px; }.transfer-actions button { padding:8px 15px;border-radius:var(--radius-control);background:var(--c-field);font-size:12px; }.transfer-actions button:last-child { background:var(--c-hover); }.transfer-actions button:disabled { opacity:.45;cursor:default; }
.transfer-dialog input { display:block;width:100%;margin-top:7px;padding:9px 11px;border:1px solid var(--c-line);border-radius:var(--radius-control);background:var(--c-field);color:var(--c-ink);font:inherit; }
.transfer-toast { position:fixed;right:22px;bottom:24px;z-index:95;display:flex;align-items:center;gap:12px;max-width:min(430px,calc(100vw - 28px));padding:10px 14px;border:1px solid var(--c-line);border-radius:20px;corner-shape:superellipse(2);background:var(--c-pop);box-shadow:var(--c-pop-shadow);color:var(--c-ink);font-size:12px; }.transfer-toast span { overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }.transfer-toast button { color:var(--c-accent);white-space:nowrap; }
@media (max-width: 520px) { .lib-manager-head { padding:26px 25px 17px; }.lib-preview-detail { margin-inline:14px; } }
.lib-manager-enter-active { transition: transform 320ms var(--motion-pop), opacity 200ms ease, filter 220ms ease; }
.lib-manager-leave-active { transition: transform 200ms var(--motion-snap), opacity 170ms ease, filter 160ms ease; }
.lib-manager-enter-from, .lib-manager-leave-to { transform: translate(-50%, -43%) scale(.94); opacity: 0; filter: blur(3px); }
/* 拖拽条：贴在面板右缘，与文档栏那条一个做法 */
.lib-panel-resize {
  position: absolute;
  top: 0; bottom: 0; right: 0;
  width: 6px;
  cursor: col-resize;
  z-index: 5;
}
/* 手机端侧边列表弹出；管理弹窗保持网格但缩小列数。 */
@media (max-width: 820px) {
  .lib-modal-backdrop { display: block; position: fixed; inset: 0; z-index: 59; width: 100%; height: 100%; background: var(--c-overlay); }
  .lib-close-desktop { display: none; }
  .lib-panel {
    position: fixed; left: 50%; top: 50%; z-index: 60; transform: translate(-50%, -50%);
    width: min(420px, calc(100vw - 32px)); max-height: min(560px, 76dvh);
    border: 1px solid var(--c-line); border-radius: var(--radius-surface); background: var(--c-pop); box-shadow: var(--c-pop-shadow);
  }
  .lib-panel-head { height:68px;padding:8px 23px 0 25px; }
  .lib-panel-sort { padding:0 19px 13px; }
  .lib-panel-list { padding:4px 16px 10px; }
  .lib-panel-enter-from, .lib-panel-leave-to { transform: translate(-50%, -46%) scale(.97); opacity: 0; }
  .lib-panel-enter-active, .lib-panel-leave-active { transition: transform .2s ease, opacity .2s ease; }
  .lib-panel-resize { display: none; }
  .lib-panel-list { padding-bottom: 8px; }
  .lib-manager-tools { flex-wrap: wrap; }.lib-manager-tools input { flex-basis: 100%; }.lib-manager-tools select { flex: 1; }
  .lib-manager-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (min-width: 821px) { .lib-close-mobile { display: none; } }

/* 相邻两行之间留一点缝：不然悬停高亮挨在一起，看着像连成一块 */
.lib-row + .lib-row { margin-top: 4px; }
.lib-row {
  z-index: 1;
  display: flex; align-items: center; gap: 10px;
  min-height: 46px;
  padding: 8px 10px;
  border-radius: var(--radius-row);
  transition: background 0.15s ease;
}
.lib-row.is-dragging { opacity: 0.45; }
.lib-row:hover { background: var(--c-hover); }
.lib-panel-sort .select-menu-trigger{width:auto;min-width:114px;flex:none}
.lib-row.is-current { background: transparent !important; --row-fill: transparent; }
.lib-row.is-draft { background: color-mix(in srgb, var(--c-accent) 5%, var(--c-panel)); }
.lib-row.is-draft:hover { background: color-mix(in srgb, var(--c-accent) 9%, var(--c-panel)); }
.lib-row.is-draft.is-current { background: transparent !important; --row-fill: transparent; }
.lib-row.is-draft .lib-row-icon, .lib-manager-card.is-draft .lib-manager-icon { color: var(--c-accent); }
.lib-manager-card.is-draft { background: color-mix(in srgb, var(--c-accent) 5%, var(--c-pop)); }
/* 图标：与侧边栏的文档图标同尺寸（13px），行内不再单独占位 */
.lib-row-icon { width: 17px; height: 17px; flex-shrink: 0; object-fit: contain; }
.lib-row-name {
  flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: flex-start;
  text-align: left; padding: 0;
}
.lib-row-text {
  font-size: 12.5px; color: var(--c-ink); min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
/* 篇数做成和侧边栏时间戳一样的浅色小字，靠右 */
.lib-row-meta { font-size: 11px; color: var(--c-faint); margin-top: 1px; }
/* 就地改名的输入框：同一行同一字号 */
.lib-row-input {
  flex: 1; min-width: 0;
  font-size: 12.5px;
  color: var(--c-ink);
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: var(--radius-control);
  padding: 2px 6px;
  outline: none;
}
.lib-row-input:focus { border-color: var(--c-line); }
/* 行内操作：19px，与侧边栏的 .icon-btn.xs 一致；悬停才出现 */
.lib-row-act {
  flex-shrink: 0; width: 19px; height: 19px; border-radius: var(--radius-control);
  display: flex; align-items: center; justify-content: center;
  color: var(--c-faint); opacity: 0;
  transition: opacity 0.15s ease, background 0.15s ease, color 0.15s ease;
}
/*
 * 面板行的操作按钮显隐。
 *
 * .acts-btn 自带的规则只认 .cat-row / .doc-row（见 style.css），
 * 面板的行是 .lib-row，不在那两个选择器里 —— 按钮会一直停在 opacity:0，
 * 看着就是"知识库里没有三个点"。这里补上自己那一条。
 */
.lib-row:hover .acts-btn,
.lib-row:focus-within .acts-btn { opacity: 1; }
.lib-row-act:hover { background: var(--c-line); color: var(--c-ink); }
/* 左上角展开知识库的提示 */
.brand-line.is-title { font-size: 17px; }
.side-header { position:relative; isolation:isolate; display:flex; align-items:center; gap:4px; height:40px; padding:0 2px 0 10px; min-width:0; flex-shrink:0; width:100%; }
.side-header .brand-logo { margin-top: 0; }
.side-header .icon-btn { flex-shrink: 0; }
.side-header .kb-identity,
.side-header .sidebar-actions { position:relative; isolation:isolate; display:flex; align-items:center; min-width:0; height:32px; padding:2px 4px; border-radius:18px; corner-shape:superellipse(2); }
.side-header .kb-identity::before,
.side-header .sidebar-actions::before { content:''; position:absolute; inset:0; z-index:0; border-radius:inherit; corner-shape:inherit; background-color:var(--topbar-chip-bg); -webkit-backdrop-filter:blur(12px) saturate(1.04); backdrop-filter:blur(12px) saturate(1.04); box-shadow:var(--topbar-glass-shadow); pointer-events:none; transition:background-color 160ms ease,box-shadow 160ms ease; }
.side-header .kb-identity > *,
.side-header .sidebar-actions > * { position:relative; z-index:1; }
.side-header .kb-identity { gap:2px; flex:0 1 auto; }
.side-header .sidebar-actions { gap:0; flex:none; margin-left:auto; width:32px; padding:2px 4px; display:flex; align-items:center; justify-content:flex-end; }
.side-header:not(.is-compact):not(.is-collapsing):not(.is-expanding) .sidebar-actions { width:56px; padding:2px 4px; display:flex; }
.side-header.is-topbar.is-collapsing,
.side-header.is-topbar.is-expanding { gap:0; }
.side-header.is-collapsing .sidebar-actions,
.side-header.is-expanding .sidebar-actions { width:32px !important; padding:2px 4px !important; }
/* 收起时立即换成紧凑内容，避免隐藏的编辑框把 header 撑在整栏宽度。 */
.side-header.is-collapsing .kb-title { display:none; }
.side-header.is-collapsing .sidebar-actions .kb-list-btn,
.side-header.is-expanding .sidebar-actions .kb-list-btn { width:0!important; padding:0!important; margin:0!important; opacity:0!important; visibility:hidden; overflow:hidden; pointer-events:none; transition:none!important; animation:none!important; }
.side-header .sidebar-actions .icon-btn:hover { background:transparent; color:var(--c-ink); }
.side-header .sidebar-actions .kb-list-btn { transition:width 200ms cubic-bezier(0,0,.2,1),opacity 160ms ease,transform 120ms ease,background 140ms ease,color 140ms ease; }
.side-header .kb-identity:hover::before,
.side-header .sidebar-actions:hover::before { background-color:var(--topbar-chip-bg-hover); }
/* 融合态只给鼠标下的那颗按钮一点淡底，不复活整块玻璃。 */
.side-header.is-merged .sidebar-actions .icon-btn:hover { background:color-mix(in srgb,var(--c-ink) 5%,transparent); color:var(--c-ink); }
/*
 * 展开成面板后，玻璃外壳整层溶掉；收起时先回壳再变窄。
 * 这里淡的是底色/阴影/模糊本身，不动 opacity，
 * 避免合成层在起止瞬间重新栅格化，外框看起来像抖了一下。
 */
.side-header.is-merged .kb-identity::before,
.side-header.is-merged .sidebar-actions::before { background-color:transparent; box-shadow:0 2px 8px rgb(0 0 0 / 0),0 1px 2px rgb(0 0 0 / 0),inset 0 1px 0 rgb(255 255 255 / 0),inset 0 -1px 0 rgb(0 0 0 / 0); -webkit-backdrop-filter:blur(0) saturate(1); backdrop-filter:blur(0) saturate(1); transition:background-color 180ms cubic-bezier(.4,0,.2,1) 40ms,box-shadow 180ms cubic-bezier(.4,0,.2,1) 40ms; }
.side-header .kb-title-wrap { flex:0 0 auto; display:grid; align-items:center; min-width:0; }
.side-header .kb-title-wrap > * { grid-area:1 / 1; min-width:0; }
.side-header .kb-title { field-sizing:content; width:auto; min-width:3ch; max-width:180px; margin-left:-1px; padding-left:3px; font-size:15px; line-height:1.3; font-weight:500; }
.side-header .kb-title:hover:not(:focus) { background:transparent; border-color:transparent; }
.side-header .kb-title-compact { font-size:15px; font-weight:500; line-height:1.3; letter-spacing:-0.01em; padding:1px 3px; text-align:left; }
.side-header .kb-title.is-hidden,
.side-header .kb-title-compact.is-hidden { opacity:0; pointer-events:none; }
.side-header.is-topbar { width:100%; }
.side-header .kb-title-compact { transition:opacity 140ms ease; }
.side-header .kb-title { transition:opacity 140ms ease; }
/* 展开时知识库图标从紧凑态的滑出位置收进 header，给一小段出现动效。 */
.side-header:not(.is-expanding):not(.is-compact) .kb-list-btn { animation:kb-icon-in 300ms var(--motion-pop); }
@keyframes kb-icon-in {
  from { opacity:0; transform:translateX(-8px) scale(.96); filter:blur(1.6px); }
  to   { opacity:1; transform:translateX(0) scale(1); filter:blur(0); }
}
/* 收起静止态：知识库标识和侧栏开关是两个组块；hover 开关时盒子图标从下方滑出。 */
.side-header.is-compact {
  width:auto;
  height:40px;
  margin:0 0 0 10px;
  padding:0 2px 0 0;
  gap:0;
  border:0;
  background:transparent;
  box-shadow:none;
}
/* 视觉上是一整块，实际仍是标题按钮 + 箭头按钮两个目标。 */
.side-header::before {
  content:'';
  position:absolute;
  left:0;
  right:0;
  top:4px;
  bottom:4px;
  z-index:0;
  border-radius:18px;
  corner-shape:superellipse(2);
  background-color:transparent;
  box-shadow:none;
  pointer-events:none;
  /* 与 Aa/… 的 220ms 延迟淡出对齐。 */
  transition:background-color 200ms cubic-bezier(.4,0,.2,1),box-shadow 200ms cubic-bezier(.4,0,.2,1);
}
/* 模糊单独一层：和 Aa/… 一样只淡 opacity，避免收起时整块背景突然变清晰。 */
.side-header::after {
  content:'';
  position:absolute;
  left:0;
  right:0;
  top:4px;
  bottom:4px;
  z-index:-1;
  border-radius:18px;
  corner-shape:superellipse(2);
  -webkit-backdrop-filter:blur(12px) saturate(1.04);
  backdrop-filter:blur(12px) saturate(1.04);
  opacity:0;
  pointer-events:none;
  transition:opacity 200ms cubic-bezier(.4,0,.2,1);
}
.side-header.is-compact::after,
.side-header.is-collapsing::after { opacity:1; }
.side-header.is-collapsing::after,
.side-header.is-expanding::after { left:10px; }
.side-header.is-compact::before,
.side-header.is-collapsing::before {
  background-color:var(--topbar-chip-bg);
  box-shadow:var(--topbar-glass-shadow);
}
.side-header.is-collapsing::before,
.side-header.is-expanding::before { left:10px; }
.side-header.is-compact:hover::before { background-color:var(--topbar-chip-bg-hover); }
.side-header.is-compact .kb-identity,
.side-header.is-compact .sidebar-actions { z-index:1; }
.side-header.is-compact .kb-identity::before,
.side-header.is-compact .sidebar-actions::before,
.side-header.is-collapsing .kb-identity::before,
.side-header.is-collapsing .sidebar-actions::before,
.side-header.is-expanding .kb-identity::before,
.side-header.is-expanding .sidebar-actions::before,
.side-header.is-compact .kb-identity:hover::before,
.side-header.is-compact .sidebar-actions.is-compact:hover::before,
.side-header.is-compact .sidebar-actions.is-compact.is-revealed::before,
.side-header.is-collapsing .kb-identity:hover::before,
.side-header.is-collapsing .sidebar-actions.is-compact:hover::before,
.side-header.is-expanding .kb-identity:hover::before,
.side-header.is-expanding .sidebar-actions.is-compact:hover::before {
  background:transparent !important;
  box-shadow:none !important;
  -webkit-backdrop-filter:none !important;
  backdrop-filter:none !important;
}
.kb-identity.is-compact {
  display:flex;
  align-items:center;
  gap:2px;
  height:32px;
  padding:2px 4px;
  border-radius:18px;
  corner-shape:superellipse(2);
}
.side-header.is-compact .kb-title-wrap { flex:0 1 auto; max-width:140px; }
.side-header.is-compact .kb-title-compact {
  max-width:140px;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  padding:1px 3px;
  border:0;
  background:transparent;
  color:var(--c-ink);
  font-size:15px;
  font-weight:500;
  cursor:pointer;
}
.side-header.is-compact .kb-title-compact:hover { color:var(--c-accent); }
/* 隐藏的编辑框不能继续参与紧凑标题的宽度计算。 */
.side-header.is-compact .kb-title,
.side-header.is-expanding .kb-title { display:none; }
.side-header.is-expanding .kb-title-compact { opacity:1; pointer-events:none; }
/* 收起第一帧就显示紧凑标题，避免输入框先消失、标题再淡入造成闪空。 */
.side-header.is-collapsing .kb-title-compact { opacity:1; transition:none; }
.kb-title-stack { position:relative; display:inline-grid; min-width:0; max-width:100%; vertical-align:top; }
.kb-title-text { grid-area:1 / 1; justify-self:start; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.lib-title-enter-active,.lib-title-leave-active { transition:opacity 160ms ease; }
.lib-title-enter-from,.lib-title-leave-to { opacity:0; }
.side-header .brand-logo:hover,.side-header .brand-logo:focus-visible{box-shadow:none;background:transparent;outline:none}
.sidebar-actions.is-compact {
  position:relative;
  display:flex;
  align-items:center;
  justify-content:flex-end;
  flex:none;
  width:32px;
  height:32px;
  border-radius:18px;
  corner-shape:superellipse(2);
}
.sidebar-actions.is-compact:hover::before,
.sidebar-actions.is-compact.is-revealed::before { background-color:var(--topbar-chip-bg-hover); }
.sidebar-actions.is-compact .sidebar-toggle { width:24px; height:24px; border-radius:8px; }
.sidebar-actions.is-compact .sidebar-toggle:hover { background:transparent; color:var(--c-ink); }
.sidebar-actions.is-compact .kb-list-btn {
  position:absolute;
  right:0;
  /* 盒子本身贴着上面的组，真正的 32×32 玻璃底用 ::before 往下缩 2px。 */
  top:100%;
  z-index:80;
  width:32px;
  height:36px;
  padding:4px 0 0;
  border:0;
  border-radius:18px;
  corner-shape:superellipse(2);
  background:transparent;
  box-shadow:none;
  color:var(--c-ink);
  opacity:1;
  visibility:hidden;
  pointer-events:none;
  transform-origin:top center;
  transform:translateY(-8px) scale(.96);
  /* 玻璃层始终不透明，只做位移动画；opacity 过渡会让 backdrop-filter 延迟上屏。 */
  transition:transform 300ms var(--motion-pop),visibility 0s linear 300ms,width 200ms cubic-bezier(0,0,.2,1),background 140ms ease,color 140ms ease;
}
.sidebar-actions.is-compact .kb-list-btn::before {
  content:'';
  position:absolute;
  inset:4px 0 0;
  border-radius:18px;
  corner-shape:superellipse(2);
  background:var(--topbar-chip-bg-hover);
  -webkit-backdrop-filter:blur(12px) saturate(1.04);
  backdrop-filter:blur(12px) saturate(1.04);
  box-shadow:var(--topbar-glass-shadow);
}
.sidebar-actions.is-compact .kb-list-btn svg { position:relative; z-index:1; }
.sidebar-actions.is-compact.is-revealed .kb-list-btn {
  opacity:1;
  visibility:visible;
  pointer-events:auto;
  transform:translateY(0) scale(1);
  transition:transform 300ms var(--motion-pop),visibility 0s,width 200ms cubic-bezier(0,0,.2,1),background 140ms ease,color 140ms ease;
}
.sidebar-actions.is-compact.is-revealed .kb-list-btn:hover {
  transform:translateY(-1px) scale(1);
  transition:transform 120ms ease,visibility 0s,width 200ms cubic-bezier(0,0,.2,1),background 140ms ease,color 140ms ease;
}
.sidebar-actions.is-compact:hover .icon-btn,
.sidebar-actions.is-compact.is-revealed .icon-btn { color:var(--c-ink); }
.side-header:not(.is-compact) .kb-list-btn { margin-left:0; }
.sidebar-body.has-topbar { padding-top:40px; }
.home-link {
  display: none;
}

.brand-line {
  font-size: 17px;
  line-height: 1.3;
  letter-spacing: -0.01em;
  color: var(--c-ink);
  white-space: nowrap;
}
/* 品牌标题直接改：平时看着是标题，悬停给一点底色，聚焦才有描边 */
.brand-input {
  display: block;
  width: 100%;
  text-overflow: ellipsis;
  padding: 1px 4px;
  margin-left: -4px;
  border-radius: var(--radius-control);
  background: transparent;
  border: 1px solid transparent;
  outline: none;
  transition: background 0.14s ease, border-color 0.14s ease;
}
.brand-input:hover {
  background: var(--c-hover);
}
.brand-input:focus {
  background: var(--c-field);
  border-color: var(--c-accent);
}

/* 图标：点一下换图 */
.brand-logo {
  width: 22px;
  height: 22px;
  margin-top: 3px;
  flex-shrink: 0;
  border-radius: var(--radius-control);
  overflow: hidden;
  transition: box-shadow 0.14s ease;
}
.brand-logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
.brand-logo:hover {
  box-shadow: 0 0 0 2px var(--c-active);
}
.brand-logo.sm {
  margin-top: 0;
  display: grid;
  place-items: center;
}
/* 左侧两个新建动作只占内容宽度；窄栏时文字向左收，图标贴左。 */
.tree-create-row{display:flex;align-items:center;gap:8px;min-height:30px;padding:0 10px;color:var(--c-sub);font-size:12.5px}.tree-create-row svg{flex:none;color:var(--c-faint)}.tree-create-input{min-width:0;flex:1;height:24px;padding:0 4px;border:0;border-radius:5px;background:var(--c-field);color:var(--c-ink);font:12.5px var(--font-sans);outline:1px solid var(--c-accent)}
.create-action { display:inline-flex;align-items:center;justify-content:flex-start;flex:none;gap:6px;height:32px;padding:0 4px;border:0;border-radius:var(--radius-control);background:transparent;color:var(--c-sub);font-size:13px;white-space:nowrap;transition:background .14s ease,color .14s ease,gap .18s ease; }
.create-action:hover { background:var(--c-hover);color:var(--c-ink); }
.create-action.is-narrow { gap:0; }
.create-label { display:inline-block;max-width:160px;overflow:hidden;opacity:1;transform:translateX(0);transition:max-width .18s ease,opacity .16s ease,transform .18s ease; }
.create-action.is-narrow .create-label { max-width:0;opacity:0;transform:translateX(-4px); }
.batch-bar{display:flex;align-items:center;gap:5px;color:var(--c-sub);font-size:12px}
.batch-bar span{flex:1;min-width:0}
.batch-bar button{padding:5px 7px;border-radius:var(--radius-control);white-space:nowrap}
.batch-bar button:hover{background:var(--c-hover)}
.batch-bar .batch-delete{color:#c8403b}
.batch-bar .batch-delete:disabled{opacity:.4;cursor:default}
/* 分组排序菜单 */
.side-menu {
  position: absolute;
  right: 0;
  top: 28px;
  z-index: 50;
  width: 148px;
  padding: 5px;
  background: var(--c-pop);
  border-radius: var(--radius-surface);
  box-shadow: var(--c-pop-shadow);
}
.side-menu-title {
  font-size: 10.5px;
  color: var(--c-faint);
  padding: 6px 8px 4px;
  letter-spacing: 0.04em;
}
.side-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 6px 8px;
  border-radius: var(--radius-control);
  font-size: 12.5px;
  color: var(--c-text);
  text-align: left;
  transition: background 0.12s ease, color 0.12s ease;
}
.side-menu-item:hover {
  background: var(--c-hover);
  color: var(--c-ink);
}
.side-menu-item.is-on {
  color: var(--c-accent);
}
.side-menu-sep {
  height: 1px;
  background: var(--c-line-soft);
  margin: 4px 0;
}

.slide-fade-enter-active,
.slide-fade-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>

<style scoped>
.manage-entry { margin:0 12px 10px; padding:8px 10px; display:flex; align-items:center; gap:8px; border:1px solid var(--c-line); border-radius:var(--radius-control); color:var(--c-sub); font-size:12px; text-align:left; cursor:pointer; background:var(--c-surface) }
.manage-entry:hover { background:var(--c-field); color:var(--c-text) }
.manage-entry:focus-visible { outline:2px solid var(--c-ink); outline-offset:2px }
.entry-chevron { margin-left:auto }
.tree-menu-item:disabled { opacity:.45; cursor:default }
.tree-menu-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lib-panel-sort .select-menu-trigger{min-height:30px;padding:5px 11px;background:var(--c-field);border-color:var(--c-line)}
.lib-panel-sort .select-menu-trigger:hover{background:var(--c-field)}
.lib-panel-sort :deep(.select-menu-trigger){min-height:34px;width:auto;min-width:114px;flex:none;padding:6px 11px;background:var(--c-field);border-color:var(--c-line)}
.lib-panel-sort :deep(.select-menu-trigger:hover){background:var(--c-field)}
.lib-manager-tools{display:flex;flex-direction:column;gap:12px;padding-bottom:18px}
.lib-manager-search-row{display:flex;align-items:center;gap:10px;min-width:0}
.lib-manager-search-row>input{flex:1;min-width:0;padding:11px 14px;font-size:13px}
.lib-manager-filter-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.lib-manager-filters{display:flex;align-items:center;gap:4px;min-width:0;overflow:auto}
.lib-manager-filters button{flex:none;padding:7px 11px;border-radius:var(--radius-control);corner-shape:superellipse(2);color:var(--c-sub);font-size:12px}
.lib-manager-filters button:hover{background:var(--c-hover)}
.lib-manager-filters button.is-on{background:var(--c-field);color:var(--c-ink)}
.lib-manager-search-row :deep(.select-menu-trigger){flex:none;width:125px;min-height:39px;padding:8px 12px;background:var(--c-field);white-space:nowrap}
.lib-manager-search-row :deep(.select-menu-trigger:hover){background:var(--c-hover)}
.lib-manager-grid{grid-template-columns:repeat(auto-fit,minmax(180px,1fr))}
.lib-manager-card{min-height:120px;padding:17px;border-radius:26px;transition:background .16s ease,transform .16s ease}
.lib-manager-card:hover{transform:translateY(-1px)}
.lib-manager-card strong{font-size:13px;font-weight:400}
.lib-card-meta{display:flex;align-items:center;flex-wrap:wrap;gap:7px 12px;color:var(--c-faint);font-size:11px}
.lib-card-status{display:inline-flex;align-items:center;gap:4px;color:var(--c-sub);white-space:nowrap}
.lib-card-status svg{flex:none;opacity:.85}
.lib-manager-head h2,.transfer-dialog h2{font-weight:400}
.lib-manager-head{padding:38px 36px 18px}
.lib-manager-navigation{display:flex;align-items:center;min-width:0;gap:10px}
.lib-manager-navigation h2{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lib-manager-back{display:grid;place-items:center;flex:none;width:30px;height:30px;border-radius:var(--radius-control);color:var(--c-sub)}
.lib-manager-back:hover{background:var(--c-hover);color:var(--c-ink)}
.lib-manager-previews{flex:1;min-height:0;overflow:auto}
.preview-list{display:flex;flex-direction:column;gap:7px;padding:0 30px 24px}
.preview-list-row{display:flex;align-items:center;gap:14px;min-height:65px;padding:8px 10px 8px 13px;border-radius:var(--radius-control);background:var(--c-field)}
.preview-list-main{display:flex;align-items:center;gap:12px;flex:1;min-width:0;text-align:left}
.preview-list-main>svg{flex:none;color:var(--c-sub)}
.preview-list-main>span{display:flex;flex-direction:column;gap:3px;min-width:0}
.preview-list-main strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:500;color:var(--c-ink)}
.preview-list-main small{font-size:11px;color:var(--c-faint)}
.preview-list-actions{display:flex;align-items:center;gap:4px;flex:none}
.preview-list-actions button{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:32px;padding:6px 9px;border-radius:var(--radius-control);background:var(--c-pop);font-size:12px;color:var(--c-sub);white-space:nowrap}
.preview-list-actions button:hover:not(:disabled){background:var(--c-hover);color:var(--c-ink)}
.preview-list-actions button:disabled{opacity:.45;cursor:default}
.preview-list>.transfer-error{padding:2px 8px;font-size:11px;color:#bd4545}
.lib-preview-detail{display:flex;flex-direction:column;min-height:0;max-height:calc(84dvh - 100px);margin:0 24px 24px}
.lib-preview-body{flex:1;min-height:140px;max-height:none}
.lib-preview-actions{flex:none;padding-top:12px}
.lib-preview-actions button{display:inline-flex;align-items:center;justify-content:center;gap:5px}
.lib-manager-tools{padding-inline:30px}
.lib-manager-grid{padding-inline:30px}
.lib-manager-footer{padding-inline:30px}
.lib-manager-icon{width:23px;height:23px}
.lib-manager-footer{display:flex;align-items:center;gap:7px;padding:16px 24px 18px}
.lib-manager-footer button{display:flex;align-items:center;gap:8px;padding:8px 11px;border-radius:var(--radius-control);corner-shape:superellipse(2);color:var(--c-sub);font-size:12px}
.lib-manager-footer button:hover{background:var(--c-field);color:var(--c-ink)}
.transfer-field{display:flex;flex-direction:column;gap:7px;margin:14px 0;color:var(--c-sub);font-size:12px}
.transfer-field :deep(.select-menu-trigger){width:100%;min-width:0;min-height:39px;background:var(--c-field);color:var(--c-ink)}
.transfer-dialog{width:min(630px,calc(100vw - 32px));padding:26px}
.transfer-source{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.transfer-library-head{display:flex;align-items:center;gap:16px;margin:18px 0 10px;color:var(--c-sub);font-size:12px}
.transfer-library-head span{flex:none}
.transfer-library-head input{margin:0;min-width:0;flex:1;padding:8px 11px}
.transfer-library-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;max-height:290px;overflow:auto}
.transfer-library-grid button{display:flex;flex-direction:column;align-items:flex-start;gap:5px;min-width:0;min-height:85px;padding:11px 13px;border:1px solid transparent;border-radius:22px;corner-shape:superellipse(2);background:var(--c-field);text-align:left}
.transfer-library-grid button:hover{background:var(--c-hover)}
.transfer-library-grid button.is-on{border-color:var(--c-accent);background:var(--c-active)}
.transfer-library-grid button.is-draft{background:color-mix(in srgb,var(--c-accent) 5%,var(--c-pop))}
.transfer-library-grid button.is-draft:hover{background:color-mix(in srgb,var(--c-accent) 9%,var(--c-pop))}
.transfer-library-grid button.is-draft.is-on{border-color:var(--c-accent);background:var(--c-active)}
.transfer-library-grid button span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--c-ink);font-size:12px}
.transfer-library-grid button small{color:var(--c-faint);font-size:10px}
.transfer-backdrop.overlay-enter-active .transfer-dialog,.transfer-backdrop.overlay-leave-active .transfer-dialog{transition:transform var(--motion-enter) var(--motion-ease),opacity var(--motion-enter) ease}
.transfer-backdrop.overlay-enter-from .transfer-dialog,.transfer-backdrop.overlay-leave-to .transfer-dialog{transform:translateY(5px) scale(.975);opacity:0}
@media(max-width:520px){.transfer-dialog{padding:20px}.transfer-library-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.transfer-library-head{display:block}.transfer-library-head input{margin-top:8px}}
@media(max-width:520px){.lib-manager{width:calc(100vw - 16px);max-height:calc(100dvh - 24px);border-radius:28px}.lib-manager-head{padding:20px 20px 14px}.lib-manager-grid{grid-template-columns:repeat(2,minmax(0,1fr));padding-inline:20px}.lib-manager-tools{padding-inline:20px}.lib-manager-search-row :deep(.select-menu-trigger){width:105px}.lib-manager-filters button{padding-inline:8px}.lib-manager-footer{padding-inline:20px}.lib-preview-detail{max-height:calc(100dvh - 130px);margin:0 14px 14px;padding:14px}.lib-preview-actions{flex-wrap:wrap}.lib-preview-actions button{flex:1;white-space:nowrap}}
@media(max-width:520px){.preview-list{padding-inline:20px}.preview-list-row{align-items:stretch;flex-direction:column;gap:7px}.preview-list-actions{justify-content:flex-end;flex-wrap:wrap}}
.workspace-tools-footer{flex:none;padding:7px 10px 12px;border:0}
</style>

<style scoped>
.workspace-footer{position:relative;flex-shrink:0;padding-top:8px;border-top:0}.workspace-footer .manage-entry{width:calc(100% - 24px);border:0;background:transparent;margin-bottom:12px}.workspace-footer .manage-entry span{flex:1}.identity-menu{position:absolute;bottom:60px;left:12px;right:12px;padding:6px;background:var(--c-pop);box-shadow:var(--c-pop-shadow);border:0;border-radius:var(--radius-surface);z-index:50}.identity-menu button{display:block;width:100%;padding:9px;text-align:left;font-size:12px;border-radius:var(--radius-control)}.identity-menu button:hover{background:var(--c-hover)}
</style>
<style scoped>.lib-icon-edit{display:grid;place-items:center;padding:5px;border-radius:var(--radius-control);margin-left:-5px}.lib-icon-edit:not(:disabled):hover{background:var(--c-hover)}.lib-icon-edit:disabled{cursor:default}.workspace-footer .manage-entry{gap:10px;padding:10px 8px}.workspace-footer .manage-entry:hover{background:var(--c-hover)}</style>

<style scoped>
.workspace-tools-footer{display:flex;align-items:center;justify-content:flex-start;gap:8px;padding:16px 12px 12px;border:0}.workspace-tools{position:relative;margin-left:auto}.workspace-tools-menu{position:absolute;top:auto;bottom:40px;right:0;width:160px;padding:6px}.workspace-tools-menu button{display:flex;gap:9px;align-items:center;width:100%;padding:10px;border-radius:8px;text-align:left;font-size:12px}.workspace-tools-menu button:hover{background:var(--c-hover)}.workspace-tools-menu .activity-count{margin-left:auto;font-size:11px;color:var(--c-faint);font-variant-numeric:tabular-nums}
</style>

<style scoped>
.history-panel{width:min(660px,calc(100vw - 32px))}.history-panel .lib-manager-head{padding:24px 24px 18px}.history-panel .lib-manager-tools{padding:0 24px 16px}.history-panel .lib-manager-search-row{gap:10px}.history-panel .lib-manager-search-row input{min-width:0;flex:1}.history-panel .lib-manager-search-row :deep(.select-menu-trigger){width:112px;flex:none}.history-panel .preview-list{padding:0 16px 20px;gap:2px}.history-panel .preview-list-row{background:transparent;min-height:60px;border-radius:8px;gap:10px}.history-panel .preview-list-row:hover{background:var(--c-field)}.history-panel .preview-list-actions button{background:transparent}.history-panel .preview-list-main small{font-variant-numeric:tabular-nums}.history-panel .lib-preview-detail{background:transparent;margin:0 20px 20px;padding:0;box-shadow:none}.history-panel .lib-preview-actions{gap:8px;padding-top:16px}
@media(max-width:520px){.history-panel{width:calc(100vw - 16px)}.history-panel .lib-manager-head{padding:20px 18px 16px}.history-panel .lib-manager-tools{padding-inline:18px}.history-panel .preview-list{padding-inline:10px}.history-panel .preview-list-row{gap:3px}.history-panel .preview-list-actions{padding-left:30px;justify-content:flex-start}.history-panel .lib-preview-actions button{flex:initial}}
</style>
<style scoped>
/*
 * 知识库切换面板：只负责切换。
 * 管理弹窗：只负责管理。
 * 两个界面共用行高、图标尺寸和浮层规范，但信息层级各自独立。
 */

/* ---------- 切换面板 ---------- */
@media (min-width: 821px) {
  .lib-panel-head, .lib-panel-sort, .lib-panel-list, .lib-panel-footer { min-width: var(--lib-w, 236px); }
}
.lib-panel-head { height: 44px; padding: 0 12px; }
.lib-panel-title { font-size: 12px; color: var(--c-sub); white-space: nowrap; flex: none; }
.lib-panel-head-acts { gap: 2px; flex: none; }
.lib-panel-list { padding: 2px 8px 6px; }
.lib-row + .lib-row { margin-top: 4px; }
.lib-row {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 40px;
  padding: 0 8px 0 16px;
  border-radius: var(--radius-row);
  cursor: pointer;
}
.lib-row[draggable="true"] { cursor: grab; }
.lib-row.is-dragging { opacity: .45; }
.lib-row.is-drop-target { box-shadow: inset 0 2px 0 var(--c-sub); }
.lib-row { transition: background 160ms var(--motion-snap), box-shadow 160ms var(--motion-snap); }
.lib-row:hover { background: var(--c-hover); }
.lib-row.is-current,
.lib-row.is-current:hover { background: transparent !important; --row-fill: transparent; }
.lib-icon-btn {
  display: grid;
  place-items: center;
  flex: none;
  width: 26px;
  height: 26px;
  margin-left: -2px;
  border-radius: 7px;
  color: inherit;
}
.lib-icon-btn:not(:disabled):hover { background: var(--c-line); }
.lib-icon-btn:disabled { cursor: default; }
.lib-row-icon { width: 18px; height: 18px; }
.lib-row-body { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; padding-right: 0; transition: padding-right 160ms var(--motion-snap); }
.lib-icon-placeholder { opacity: .3; color: var(--c-faint); transition: opacity 140ms ease, color 140ms ease; }
.lib-icon-btn:hover .lib-icon-placeholder, .lib-manager-card:hover .lib-icon-placeholder { opacity: .65; color: var(--c-ink); }
.lib-row:hover .lib-row-body, .lib-row:focus-within .lib-row-body, .lib-row.is-current .lib-row-body { padding-right: var(--lib-row-actions-pad, 68px); }
.lib-row-actions {
  position: absolute;
  right: 8px;
  top: 50%;
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  pointer-events: none;
  transform: translateY(-50%) translateX(4px);
  transition: opacity 140ms ease, transform 160ms var(--motion-snap);
}
.lib-row:hover .lib-row-actions, .lib-row:focus-within .lib-row-actions, .lib-row.is-current .lib-row-actions { opacity: 1; pointer-events: auto; transform: translateY(-50%) translateX(0); }
.lib-row-actions .lib-more { opacity: 1; color: var(--c-sub); }
.lib-more.is-active { background: var(--c-line); }
.lib-expand { flex:none; width:19px; height:20px; padding:0; margin-left:0; border-radius:7px; color:var(--c-faint); overflow:hidden; opacity:1; transform:translateX(0); transition:width 180ms var(--motion-snap),margin-left 180ms var(--motion-snap),opacity 160ms ease,transform 180ms var(--motion-snap),color 140ms ease; }
.lib-expand:hover { color:var(--c-ink); }
.lib-expand.is-hidden { width:0; margin-left:-2px; opacity:0; transform:translateX(4px); pointer-events:none; }
.lib-row-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  color: var(--c-ink);
}
.lib-row-meta { margin-left: auto; flex: none; font-size: 10.5px; color: var(--c-faint); font-variant-numeric: tabular-nums; }
.lib-more { flex: none; opacity: .32; transition: opacity .12s ease, background .12s ease; }
.lib-row:hover .lib-more, .lib-row:focus-within .lib-more, .lib-more:focus-visible { opacity: 1; }
.lib-row-input {
  flex: 1;
  min-width: 0;
  height: 26px;
  padding: 0 6px;
  border: 1px solid var(--c-line);
  border-radius: 7px;
  background: var(--c-surface);
  color: var(--c-ink);
  font: inherit;
  font-size: 12.5px;
  outline: none;
}
.lib-create-row { cursor: text; background: var(--c-field); }
.lib-create-icon { flex: none; color: var(--c-sub); }
.lib-panel-footer {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  padding: 4px 12px 10px;
  border: 0;
}
.lib-panel-footer .icon-btn { opacity: .55; }
.lib-panel-footer .icon-btn:hover { opacity: 1; }
.lib-create-toggle svg { transition: transform 180ms var(--motion-pop); }
.lib-create-toggle.is-open svg { transform: rotate(45deg); }
.sidebar-chevron { display:block; flex-shrink:0; }
:is(.lib-panel-head .icon-btn,.lib-panel-footer .icon-btn,.lib-row-actions .icon-btn,.lib-manager-card-more):focus-visible {
  outline: none;
  background: var(--c-hover);
  color: var(--c-ink);
}

/* ---------- 管理弹窗 ---------- */
.lib-manager { width: min(640px, calc(100vw - 32px)); border-radius: var(--radius-dialog); }
.lib-manager-head { padding: 18px 24px 8px; justify-content: flex-end; }
.lib-manager-head-actions { gap: 2px; }
.library-welcome { margin: 0; padding: 0 24px 12px; font-size: 12px; line-height: 1.6; }
.lib-manager-tools {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  padding: 0 24px 14px;
  flex-wrap: wrap;
}
.lib-manager-search {
  flex: 1 1 190px;
  min-width: 0;
  height: 34px;
  padding: 0 11px;
  border: 1px solid var(--c-line);
  border-radius: 9px;
  background: var(--c-field);
  color: var(--c-ink);
  font: inherit;
  font-size: 12px;
  outline: none;
}
.lib-manager-search:focus { border-color: color-mix(in srgb, var(--c-ink) 22%, transparent); }
.lib-manager-tools :deep(.select-menu-trigger) {
  width: 112px;
  min-height: 34px;
  padding: 0 9px;
  border-color: var(--c-line);
  background: var(--c-field);
  font-size: 11.5px;
}
@media (max-width: 520px) {
  .lib-manager-search { flex-basis: 100%; }
  .lib-manager-sort { flex: none; }
  .lib-manager-list { padding: 0 14px 10px; }
  .lib-manager-footer { padding: 10px 18px 12px; }
}
@media (max-width: 820px) and (hover: none) {
  .lib-row-body { padding-right: var(--lib-row-actions-pad, 44px); }
  .lib-row-actions { opacity: 1; pointer-events: auto; transform: translateY(-50%); }
}
@media (max-width: 360px) {
}
</style>

<style scoped>
/* 管理知识库：紧凑的一行卡片，过滤只改列表内容，不改窗口高度。 */
.lib-manager { width: min(640px, calc(100vw - 32px)); border-radius: var(--radius-dialog); }
.lib-manager-head { padding: 18px 24px 8px; justify-content: flex-end; }
.lib-manager-head-actions { gap: 2px; }
.library-welcome { margin: 0; padding: 0 24px 12px; font-size: 12px; line-height: 1.6; }
.lib-manager-tools { display: flex; flex-direction: row; align-items: center; gap: 8px; padding: 0 24px 14px; flex-wrap: wrap; }
.lib-manager-search { flex: 1 1 190px; min-width: 0; height: 34px; padding: 0 11px; border: 1px solid var(--c-line); border-radius: 9px; background: var(--c-field); color: var(--c-ink); font: inherit; font-size: 12px; outline: none; }
.lib-manager-search:focus { border-color: color-mix(in srgb, var(--c-ink) 22%, transparent); }
.lib-manager-sort { flex: none; width: 34px; height: 34px; border-radius: 9px; color: var(--c-sub); }
.lib-manager-sort:hover { background: var(--c-hover); color: var(--c-ink); }
.lib-manager-sort.is-active { background: var(--c-hover); color: var(--c-ink); }
.lib-manager-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 8px; align-content: start; flex: 1; min-height: 160px; padding: 0 24px 12px; overflow-y: auto; }
.lib-manager-card { position: relative; display: flex; align-items: center; gap: 8px; min-height: 52px; padding: 0 8px 0 10px; border-radius: 12px; background: var(--c-field); cursor: pointer; transition: background 160ms var(--motion-snap), box-shadow 160ms var(--motion-snap); }
.lib-manager-card:hover { background: var(--c-hover); transform: none; }
.lib-manager-card.is-current { background: color-mix(in srgb, var(--c-accent) 7%, var(--c-field)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c-accent) 16%, transparent); }
.lib-manager-current { flex: none; color: var(--c-accent); }
.lib-manager-icon-btn { flex: none; width: 26px; height: 26px; margin-left: -3px; }
.lib-manager-icon { width: 22px; height: 22px; flex: none; }
.lib-manager-card strong { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--c-ink); font-size: 13px; font-weight: 500; }
.lib-card-meta { flex: none; color: var(--c-faint); font-size: 10.5px; font-variant-numeric: tabular-nums; }
.lib-manager-rename { flex: 1; width: auto; min-width: 0; height: 28px; padding: 0 7px; border: 1px solid var(--c-line); border-radius: 7px; background: var(--c-surface); color: var(--c-ink); font: inherit; font-size: 13px; outline: none; }
.lib-manager-create { grid-column: 1 / -1; display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 10px 12px; background: var(--c-field); cursor: text; }
.lib-manager-create-icon { flex: none; color: var(--c-sub); }
.lib-manager-create .lib-manager-rename { flex: 1; width: auto; }
.lib-manager-card-more { position: static; flex: none; margin-left: 2px; opacity: .4; transition: opacity .12s ease, background .12s ease; }
.lib-manager-card-more.is-active { opacity: 1; background: var(--c-line); }
.lib-manager-card:hover .lib-manager-card-more, .lib-manager-card:focus-within .lib-manager-card-more, .lib-manager-card-more:focus-visible { opacity: 1; }
.lib-manager-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 24px 14px; border: 0; }
.lib-manager-count { color: var(--c-faint); font-size: 11px; font-variant-numeric: tabular-nums; }
@media (max-width: 520px) {
  .lib-manager-head { padding: 16px 18px 8px; }
  .lib-manager-tools { padding: 0 18px 12px; }
  .lib-manager-list { padding: 0 14px 10px; }
  .lib-manager-footer { padding: 10px 18px 12px; }
}
</style>

<style scoped>
</style>
