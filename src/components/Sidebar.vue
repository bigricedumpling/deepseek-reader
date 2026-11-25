<template>
  <!--
    桌面端横向排知识库栏与文档树；手机端知识库列表改为弹窗。
  -->
  <div class="app-sidebar flex h-full flex-shrink-0" :class="{ 'is-browsing-files': !collapsed }">
    <!-- 手机端切换列表才用遮罩；桌面保留并排的知识库列表。 -->
    <transition name="lib-backdrop">
      <button
        v-if="libPanel.open && !managerOpen && isMobileLibView()"
        class="lib-modal-backdrop"
        aria-label="关闭知识库列表"
        @click="closeLibPanel"
      />
    </transition>
    <!-- 快速切换列表，顺序由用户选择：挂到整窗最左列，位于顶栏之外。 -->
    <Teleport to="#app-lib-panel-slot">
    <transition name="lib-panel">
      <aside
        v-if="libPanel.open"
        class="lib-panel"
        :class="{ 'is-tree-collapsed': collapsed, 'is-gallery-nav': managerOpen }"
        :style="{ '--lib-w': libWidth + 'px' }"
        aria-label="知识库列表"
        @click.stop="onLibPanelClick"
      >
        <div class="lib-panel-head">
          <span class="lib-panel-title">知识库</span>
          <span v-if="!managerOpen" class="lib-panel-head-acts">
            <button class="icon-btn" :class="{ 'is-active': tree.menu.kind === 'lib-sort' }" title="知识库排序" aria-label="知识库排序" :aria-expanded="tree.menu.kind === 'lib-sort'" @click.stop="openLibSortMenu">
              <PhSortAscending :size="15" />
            </button>
            <button v-if="!isGuest" class="icon-btn lib-create-toggle" :class="{ 'is-open': libCreate.active }" title="新建知识库" aria-label="新建知识库" @mousedown.prevent @click.stop="createLib">
              <PhPlus :size="14" />
            </button>
            <button class="icon-btn" title="收起知识库列表" aria-label="收起知识库列表" @click="closeLibPanel">
              <PhCaretDoubleLeft :size="15" class="lib-close-desktop" />
              <PhX :size="15" class="lib-close-mobile" />
            </button>
          </span>
        </div>

        <input ref="libIconInput" type="file" accept="image/*" class="hidden" @change="onPickLibIcon" />

        <div class="lib-panel-resize" aria-label="调整知识库栏宽度" @pointerdown.stop="startLibResize" />

        <div ref="libViewport" class="lib-panel-list">
          <Teleport v-if="selectedLibRow" :to="selectedLibRow">
            <span ref="libIndicator" class="lib-row-blob" aria-hidden="true"><span class="lib-row-marker" /></span>
          </Teleport>
          <TransitionGroup name="lib-row" tag="div" class="lib-row-stack">
          <div v-if="libCreate.active && !managerOpen" key="__create" class="lib-row lib-create-row">
            <PhFolderSimplePlus :size="16" class="lib-create-icon" />
            <input
              ref="libCreateInput"
              v-model="libCreate.value"
              data-esc-local
              class="lib-row-input"
              placeholder="知识库名称"
              spellcheck="false"
              @keydown="nameFieldKey($event, commitCreateLib, cancelCreateLib)"
              @blur="commitCreateLib"
            />
          </div>
          <div
            v-for="lib in panelLibs"
            :key="lib.path"
            :data-path="lib.path"
            class="lib-row"
            :class="{ 'is-current': isRailCurrent(lib), 'is-draft': lib.name === '草稿', 'is-dragging': libDrag.name === lib.name, 'is-drop-target': libDrag.over === lib.name && libDrag.name !== lib.name }"
            role="button"
            tabindex="0"
            :draggable="libSort === 'manual' && !isGuest && !libDrag.hoverActions"
            :aria-current="isRailCurrent(lib) ? 'true' : undefined"
            :title="isGuest ? lib.name + '（' + (store.canEdit(lib) ? '可编辑' : '只读') + '）' : lib.name"
            @click="selectRailLibrary(lib)"
            @keydown.enter.self.prevent="selectRailLibrary(lib)"
            @keydown.space.self.prevent="selectRailLibrary(lib)"
            @contextmenu="libContext($event,lib)"
            @pointerdown="onLibRowPointerDown"
            @dragstart.stop="startLibDrag(lib, $event)"
            @dragover.prevent="overLibDrag(lib, $event)"
            @drop.prevent="dropLib(lib)"
            @dragend="endLibDrag"
          >
            <button class="lib-icon-btn" :disabled="isGuest" :title="isGuest ? undefined : '更换图标'" :aria-label="isGuest ? undefined : '更换知识库图标'" :aria-hidden="isGuest || undefined" @click.stop="pickLibIcon(lib, $event)"><ContentIcon v-if="lib.icon" class="lib-row-icon" :value="lib.icon" /><PhFolderSimple v-else class="lib-row-icon lib-icon-placeholder" :size="16" /></button>
            <div class="lib-row-body">
              <input
                v-if="!managerOpen && !isGuest && renaming === lib.name"
                ref="renameInput"
                data-esc-local
                class="lib-row-input"
                :value="renameText"
                spellcheck="false"
                @click.stop
                @input="renameText = $event.target.value"
                @keydown="nameFieldKey($event, () => commitRename(lib), cancelRename)"
                @blur="commitRename(lib)"
              />
              <template v-else>
                <span class="lib-row-text">{{ lib.name }}</span>
                <span class="lib-row-meta">{{ lib.docs }} 篇</span>
              </template>
            </div>
            <div v-if="!isGuest" class="lib-row-actions" @pointerenter="libDrag.hoverActions = true" @pointerleave="libDrag.hoverActions = false">
              <button class="icon-btn xs lib-more" :class="{ 'is-active': tree.menu.kind === 'lib' && tree.menu.node?.name === lib.name }" :aria-expanded="tree.menu.kind === 'lib' && tree.menu.node?.name === lib.name" title="更多操作" aria-label="更多操作" @click.stop="openLibMenu(lib, $event)"><PhDotsThree :size="16" weight="bold" /></button>
              <button v-if="!managerOpen" class="icon-btn xs lib-expand" :class="{ 'is-hidden': !collapsed }" :tabindex="collapsed ? undefined : -1" :aria-hidden="!collapsed" title="展开目录" aria-label="展开目录" @click.stop="openLibTree(lib)"><PhCaretRight :size="13" /></button>
            </div>
          </div>
          </TransitionGroup>
        </div>
        <div class="lib-panel-footer">
          <button v-if="!isGuest" type="button" class="icon-btn" ref="shelfTrigger" :data-tooltip="shelfTriggerLabel" :aria-label="shelfTriggerLabel" :aria-current="managerOpen && !shelfLevel.path ? 'page' : undefined" aria-controls="drawer-gallery-page" @click.stop="toggleManager"><PhSquaresFour :size="16" weight="regular" /></button>
        </div>
      </aside>
    </transition>
    </Teleport>


    <Teleport to="#workspace-gallery-slot">
        <section v-if="managerOpen || galleryPresent" id="drawer-gallery-page" ref="managerDialog" class="drawer-browser" :data-level="shelfLevel.path ? 'contents' : 'drawers'" aria-labelledby="drawer-browser-title" tabindex="-1">
          <header class="drawer-page-inner drawer-toolbar">
            <div class="drawer-location">
              <button type="button" class="drawer-close" aria-label="返回文档" title="返回文档" :disabled="shelfOpening" @click="closeManager"><PhArrowLeft :size="18" aria-hidden="true" /></button>
              <nav v-if="shelfLevel.path" class="drawer-breadcrumbs" aria-label="当前位置">
                <template v-for="(level, index) in shelfLevels.slice(0, -1)" :key="level.path">
                  <button type="button" :title="level.name" :disabled="shelfOpening" @click="shelfBack(index)">{{ level.name }}</button>
                  <PhCaretRight :size="12" aria-hidden="true" />
                </template>
                <h1 id="drawer-browser-title" ref="shelfHeading" class="drawer-heading" tabindex="-1" :title="shelfLevel.name">{{ shelfLevel.name }}</h1>
              </nav>
              <h1 v-else id="drawer-browser-title" ref="shelfHeading" class="drawer-heading" tabindex="-1">文档</h1>
            </div>
            <label class="drawer-search">
              <PhMagnifyingGlass :size="16" aria-hidden="true" />
              <input v-model="libQuery" type="search" :placeholder="shelfSearchLabel" :aria-label="shelfSearchLabel" />
            </label>
            <div v-if="!shelfLevel.path" class="drawer-head-actions">
              <button type="button" class="icon-btn drawer-sort" aria-label="知识库排序" title="排序" :aria-expanded="tree.menu.kind === 'lib-sort'" @click.stop="openLibSortMenu"><PhSortAscending :size="17" /></button>
              <button v-if="!isGuest" type="button" class="drawer-new" aria-label="新建知识库" @mousedown.prevent @click="createLib"><PhPlus :size="17" aria-hidden="true" /><span>新建知识库</span></button>
            </div>
          </header>
          <div ref="shelfScroll" class="drawer-scroll" :aria-busy="shelfLoading || !!pendingShelf">
            <div :key="shelfLevel.path" class="drawer-page-inner" :data-step="shelfStep">
              <div v-if="shelfError" class="drawer-status" role="alert">
                <p>{{ shelfError }}</p><button v-if="shelfLoadError" type="button" class="drawer-retry" @click="retryShelf">重试</button>
              </div>
              <p v-if="shelfLoading" class="drawer-status" role="status">正在读取…</p>
              <div v-else-if="!shelfLevel.path && !shelfLoadError" class="drawer-grid">
                <div v-if="libCreate.active" class="drawer-card is-creating">
                  <DrawerPocket :count="0" />
                  <input ref="libCreateInput" v-model="libCreate.value" data-esc-local class="drawer-name-input" placeholder="知识库名称" aria-label="知识库名称" spellcheck="false"
                    @keydown="nameFieldKey($event, commitCreateLib, cancelCreateLib)" @blur="commitCreateLib" />
                </div>
                <article v-for="lib in managerLibs" :key="lib.path" class="drawer-card" @contextmenu="libContext($event, lib)">
                  <button type="button" class="drawer-card-main" :data-path="lib.path" :aria-label="lib.name" :aria-description="[lib.docs + ' 篇', shelfPreviews[lib.path]?.title].filter(Boolean).join('，')" :aria-current="isCurrentLib(lib) ? 'true' : undefined" :disabled="renaming === lib.name" @click="browseDrawer(lib)">
                    <DrawerPocket :count="lib.docs" :preview="shelfPreviews[lib.path]" />
                    <span class="drawer-card-label">
                      <strong v-if="renaming !== lib.name" class="drawer-card-name"><ContentIcon v-if="lib.icon" :value="lib.icon" :size="16" /><span>{{ lib.name }}</span></strong>
                      <span class="drawer-card-meta">{{ lib.docs }} 篇</span>
                    </span>
                  </button>
                  <input v-if="renaming === lib.name" ref="renameInput" data-esc-local class="drawer-name-input" :value="renameText" :aria-label="'重命名' + lib.name" spellcheck="false"
                    @input="renameText = $event.target.value" @keydown="nameFieldKey($event, () => commitRename(lib), cancelRename)" @blur="commitRename(lib)" />
                  <button v-else-if="!isGuest" type="button" class="icon-btn drawer-card-more" :aria-label="lib.name + '的更多操作'" :aria-expanded="tree.menu.kind === 'lib' && tree.menu.node?.name === lib.name" @click.stop="openLibMenu(lib, $event)"><PhDotsThree :size="17" /></button>
                </article>
                <p v-if="!managerLibs.length && !libCreate.active" class="drawer-status" role="status">{{ libQuery.trim() ? '没有匹配的知识库' : '还没有知识库' }}</p>
              </div>
              <div v-else-if="shelfLevel.path && !shelfLoadError" class="drawer-entries">
                <button v-for="entry in shelfEntries" :key="entry.file || entry.path" type="button" class="drawer-entry" :data-path="entry.file || entry.path"
                  :aria-current="entry.file && entry.file === store.currentPath ? 'page' : undefined" :disabled="shelfOpening" @click="browseEntry(entry)">
                  <span class="drawer-entry-icon" aria-hidden="true">
                    <ContentIcon v-if="entry.meta?.icon" :value="entry.meta.icon" :size="19" />
                    <PhFolderSimple v-else-if="entry.type === 'folder'" :size="19" /><PhFilePdf v-else-if="entry.type === 'pdf'" :size="18" />
                    <PhFileHtml v-else-if="entry.type === 'h5'" :size="18" /><PhFileText v-else :size="18" />
                  </span>
                  <span class="drawer-entry-name">{{ entry.name }}</span>
                  <span v-if="entry.type !== 'doc'" class="drawer-entry-meta">{{ entry.type === 'folder' ? entry.children.length + ' 项' : entry.type === 'pdf' ? 'PDF' : 'HTML' }}</span>
                  <PhCaretRight v-if="entry.type === 'folder'" class="drawer-entry-chevron" :size="14" aria-hidden="true" />
                </button>
                <div v-if="!shelfEntries.length" class="drawer-status" role="status">
                  <p>{{ libQuery.trim() ? '没有匹配的文件或文件夹' : shelfLevels.length === 2 ? '这个知识库是空的' : '这个文件夹是空的' }}</p>
                  <button v-if="!libQuery.trim() && shelfLevels.length === 2 && !isGuest" type="button" class="drawer-retry" :disabled="shelfOpening" @click="openShelfDocument()">新建文档</button>
                </div>
              </div>
            </div>
          </div>
        </section>
    </Teleport>


    <Teleport to="body">
      <Transition name="overlay" appear><div v-if="transfer.open" class="transfer-backdrop" @click.self="closeTransfer">
        <section ref="transferDialog" tabindex="-1" class="transfer-dialog" role="dialog" aria-modal="true" aria-labelledby="transfer-heading" aria-describedby="transfer-source">
          <header>
            <h2 id="transfer-heading">{{ transferAction }}{{ transfer.kind === 'folder' ? '文件夹' : '文档' }}</h2>
            <p id="transfer-source" class="transfer-source" :title="transfer.path">
              <span>{{ transfer.path.split('/').at(-1) }}</span>
              <small>{{ transferSourceParent.split('/').join(' / ') }}</small>
            </p>
          </header>
          <label class="transfer-library-head">
            <PhMagnifyingGlass :size="16" aria-hidden="true" />
            <input v-model.trim="transferSearch" type="search" placeholder="搜索知识库" aria-label="搜索目标知识库" :disabled="transfer.busy" />
          </label>
          <LibraryDestinationList v-if="transferLibs.length" class="transfer-library-grid" :libraries="transferLibs" :model-value="transfer.lib" :disabled="transfer.busy" @update:model-value="onTransferLibSelect" />
          <p v-else class="transfer-empty" role="status">没有匹配的知识库</p>
          <div v-if="transfer.lib && transfer.folders.length > 1" class="transfer-field">
            <span>文件夹</span>
            <SelectMenu v-model="transfer.dir" :options="transfer.folders" label="目标文件夹" :disabled="transfer.busy" />
          </div>
          <p v-if="transfer.error" class="transfer-error" role="alert">{{ transfer.error }}</p>
          <div class="transfer-actions">
            <button type="button" :disabled="transfer.busy" @click="closeTransfer">取消</button>
            <button type="button" :disabled="!canTransfer" @click="confirmTransfer">{{ transfer.busy ? '正在' + transferAction + '…' : transferAction }}</button>
          </div>
        </section>
      </div></Transition>
    </Teleport>
    <Teleport to="body">
      <Transition name="pop"><div v-if="transferToast.message" class="transfer-toast" @pointerenter="pauseTransferToast" @pointerleave="resumeTransferToast" @focusin="pauseTransferToast" @focusout="nextTick(resumeTransferToast)">
        <span role="status">{{ transferToast.message }}</span>
        <button v-if="transferToast.undo" :disabled="transferToast.busy" @click="undoTransfer">撤销移动</button>
        <button v-else-if="transferToast.file" @click="viewTransferResult">查看</button>
        <button aria-label="关闭提示" :disabled="transferToast.busy" @click="dismissTransferToast"><PhX :size="14" /></button>
      </div></Transition>
    </Teleport>

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
      <div class="kb-header-rail">
        <span ref="compactReserve" class="kb-header-reserve" aria-hidden="true" inert>
          <span class="kb-reserve-title">{{ libraryNamesForWidth }}</span>
        </span>
        <div class="kb-header-row">
          <div class="side-header" :class="{ 'is-topbar': chromeCollapsed, 'is-compact': chromeCompact, 'is-collapsing': collapsed && !chromeCompact, 'is-expanding': chromeExpanding, 'is-merged': !collapsed }" @click.self="onCompactHeaderClick">
            <div class="kb-identity" :class="{ 'is-compact': collapsed }">
              <button class="brand-logo sm" :tabindex="collapsed ? -1 : undefined" :title="collapsed ? '展开目录' : '打开知识库列表'" :aria-label="collapsed ? '展开目录' : '打开知识库列表'" @click.stop="onBrandLogoClick">
                <span ref="glyphEl" class="kb-glyph-swap"><CollectedDrawerIcon :value="shownLibIcon" :file="store.currentPath" :doc-id="store.currentNode?.id" :loaded="store.currentLoaded" /></span>
              </button>
              <div ref="titleWrap" class="kb-title-wrap min-w-0">
                <!-- 同一个名称随侧栏改变可用宽度。只有聚焦改名时才由输入框绘制文字。 -->
                <button type="button" class="brand-line kb-title-label" :tabindex="collapsed ? undefined : -1" :title="currentLib || '知识库'" :aria-label="'展开侧栏，' + (currentLib || '知识库')" :aria-hidden="!collapsed" @click.stop="onCompactTitleClick">
                  <span class="kb-title-stack">
                    <span aria-hidden="true" class="kb-title-size">{{ currentLib || '知识库' }}</span>
                    <span ref="titleEl" aria-hidden="true" class="kb-title-text">{{ shownLib || '知识库' }}</span>
                  </span>
                </button>
                <input v-model="brandTitle" class="brand-line brand-input is-title kb-title" :disabled="collapsed" spellcheck="false" :readonly="isGuest || !currentLibEditable" :title="currentLib || '知识库'" :aria-label="isGuest || !currentLibEditable ? '当前知识库' : '编辑知识库名称'" :aria-hidden="collapsed" @keydown="onTitleKey" @change="onBrandEdited($event.target.value)" />
              </div>
            </div>
            <div class="sidebar-actions" :class="{ 'is-compact': collapsed, 'is-revealed': compactActionsHover }" @pointerenter="onCompactActionsEnter" @pointerleave="onCompactActionsLeave">
              <button class="icon-btn kb-list-btn" :class="{ 'is-active': libPanel.open }" title="切换知识库" aria-label="知识库列表" :aria-expanded="libPanel.open" @click.stop="libPanel.open ? (libPanel.open = false) : openLibPanel()"><PhStack :size="16" /></button>
              <button class="icon-btn sidebar-toggle" :title="collapsed ? '展开侧栏' : '收起侧栏'" :aria-label="collapsed ? '展开侧栏' : '收起侧栏'" :aria-expanded="!collapsed" @click.stop="toggleSidebar"><MorphIcon :icon="collapsed ? caretRight : caretLeft" :size="16" class="sidebar-chevron" spring="smooth" reduced-motion="user" /></button>
            </div>
          </div>
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
          ref="treeSearchTrigger" class="icon-btn tree-search-trigger"
          :aria-expanded="searchOpen" :class="{ 'is-active': searchOpen }"
          title="在当前知识库中搜索"
          @click="toggleSearch"
        >
          <PhMagnifyingGlass :size="15" />
        </button>
        <div class="relative tree-sort-control">
          <button
            ref="sortTrigger" class="icon-btn"
            :class="{ 'is-active': menuOpen }"
            title="文档列表选项" aria-label="文档列表选项"
            aria-haspopup="menu" :aria-expanded="menuOpen"
            @click="toggleSortMenu"
          >
            <PhSlidersHorizontal :size="15" />
          </button>
          <transition name="pop">
            <div v-if="menuOpen" ref="sortPanel" class="side-menu" role="menu" aria-label="文档列表选项" @click.stop @keydown="navigateMenu" @keydown.esc.stop.prevent="closeSortMenu" @keydown.tab="closeSortMenu">
              <p class="side-menu-title">分组方式</p>
              <button
                v-for="g in GROUPS"
                :key="g.id"
                class="side-menu-item" role="menuitemradio" :aria-checked="groupMode === g.id"
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
                class="side-menu-item" role="menuitemradio" :aria-checked="sortMode === s.id"
                :class="{ 'is-on': sortMode === s.id }"
                @click="setSort(s.id)"
              >
                <span class="menu-label"><component :is="s.icon" :size="13" class="menu-icon" />{{ s.label }}</span>
                <PhCheck v-if="sortMode === s.id" :size="12" weight="bold" />
              </button>
              <template v-if="!isGuest && currentLibEditable && !batch.mode && nodes.length">
                <div class="side-menu-sep" />
                <button class="side-menu-item batch-start" role="menuitem" @click="startBatch"><span class="menu-label"><PhCheckSquare :size="13" class="menu-icon" />选择多项</span></button>
              </template>
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
          :placeholder="searchBody ? '搜索全部知识库正文' : '搜索文档名或路径'"
          :aria-label="searchBody ? '搜索全部知识库正文' : '搜索文档名或路径'"
          maxlength="200"
          @keydown.esc="nameFieldKey($event, undefined, closeSearch)"
        />
        <div v-if="!isGuest && !batch.mode" class="search-scopes" role="group" aria-label="搜索范围">
          <button :aria-pressed="!searchBody" @click="searchBody=false; searchEl?.focus()">本库文件名</button>
          <button :aria-pressed="searchBody" @click="searchBody=true; searchEl?.focus()">跨库正文</button>
        </div>
      </div>
    </transition>

    <div v-if="batch.mode" class="batch-bar px-3 pb-2" role="group" aria-label="批量删除">
      <span role="status">已选 {{ batch.selected.size }} 项</span>
      <button ref="batchCancel" @click="endBatch">取消</button>
      <button class="batch-delete" :disabled="!batch.selected.size" @click="requestBatchDelete">移入回收站</button>
    </div>

    <!-- 拖拽条：调整侧栏宽度 -->
    <div
      v-if="!collapsed"
      class="file-nav-resize absolute inset-y-0 right-0 z-20 w-1.5 cursor-col-resize group"
      title="拖动调整侧栏宽度"
      @pointerdown="startResize"
    >
      <div class="absolute inset-y-0 right-0 w-px bg-transparent group-hover:bg-[var(--c-line)] transition-colors" />
    </div>

    <!-- 文档树 -->
    <!-- 落在空白处 = 挪到根目录；行和目录各自接住自己的落点 -->
    <LibrarySearchResults v-if="searchOpen && searchBody && !isGuest && !batch.mode" :query="query" @pick="emit('find-result', $event)" />
    <nav v-else
      ref="docNavEl"
      class="doc-tree-nav flex-1 min-h-0 overflow-y-auto no-scrollbar px-2.5 pb-4 pt-0.5"
      @dragover="tree.overRoot($event)"
      @dragleave="tree.leaveNav($event)"
      @drop.prevent="tree.drop()"
      @contextmenu="onBlankTreeContext"
      @keydown="navigateRows"
    >
      <Teleport v-if="selectedDocRow" :to="selectedDocRow">
        <span ref="docIndicator" class="doc-row-blob" aria-hidden="true" />
      </Teleport>
      <!-- 根目录就地新建：分组和单列表下都能用 -->
      <div v-if="tree.create && (tree.create.parent || '') === (currentLib || '')" class="tree-create-row">
        <component :is="tree.create.kind === 'doc' ? PhFilePlus : PhFolderSimplePlus" :size="14" />
        <input v-model="tree.create.value" class="tree-create-input" :placeholder="tree.create.kind === 'doc' ? '文档名称' : '文件夹名称'" @keydown="tree.createKey($event)" @blur="tree.createCommit()" />
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
          <input v-if="tree.edit?.kind === 'doc' && tree.edit.node.file === doc.file" v-select-name v-model="tree.edit.value" class="doc-title doc-edit" :aria-label="'重命名' + doc.name" @click.stop @keydown="tree.editKey($event)" @blur="tree.editCommit()" />
          <button v-else class="doc-title" :title="isGuest ? doc.name + '（' + (store.canEdit(doc) ? '可编辑' : '只读') + '）' : doc.file"><ContentIcon v-if="doc.meta?.icon" :value="doc.meta.icon" :size="14" />
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
        <div class="workspace-tools"><button class="btn-icon" ref="toolsTrigger" title="更多工具" aria-label="更多工具" aria-haspopup="menu" :aria-expanded="footerTools" @click.stop="toggleFooterTools"><PhDotsThree :size="18" /></button><transition name="pop"><div v-if="footerTools" ref="toolsPanel" class="side-menu workspace-tools-menu" role="menu" aria-label="更多工具" @keydown="navigateMenu" @keydown.tab="footerTools = false; toolsTrigger?.focus()"><button role="menuitem" @click="openActivity"><PhGitDiff :size="16"/>Agent 改动<span v-if="activityUnread" class="activity-count">{{ activityUnread }}</span></button><button role="menuitem" @click="openRecovery('trash')"><PhTrash :size="16"/>回收站</button><button role="menuitem" @click="openRecovery('backup')"><PhArchive :size="16"/>备份与恢复</button></div></transition></div>
      </div>
    </div>
    </aside>

    <!-- 树里那个…的菜单：teleport 出去，免得被侧栏的滚动裁掉 -->
    <Teleport to="body">
      <Transition name="pop">
      <div v-if="tree.menu.open" class="tree-menu" :class="{ 'is-measuring': !tree.menu.ready }" role="menu" :aria-label="tree.menu.kind === 'root' ? '侧栏操作' : tree.menu.kind === 'lib-sort' ? '知识库排序' : '条目操作'" :style="tree.menu.style" @keydown="navigateMenu" @keydown.esc.stop.prevent="tree.closeMenu()" @keydown.tab="tree.closeMenu()">
        <button
          v-for="it in menuItems"
          :key="it.id"
          class="tree-menu-item" role="menuitem"
          :disabled="it.disabled"
          :title="it.hint || undefined"
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
    <Teleport to="body">
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
    </Teleport>
  </div>
</template>

<script setup>
import { scrollBehavior } from '../utils/scroll-target.js'
import { BRAND_NAME } from '../../brand.mjs'
import SelectMenu from './SelectMenu.vue'
import {setFavicon} from '../utils/favicon'

import RecoveryPanel from './RecoveryPanel.vue'
import ActivityPanel from './ActivityPanel.vue'
import InstanceBadge from './InstanceBadge.vue'
import ContentIcon from './ContentIcon.vue'
import LibraryDestinationList from './LibraryDestinationList.vue'
import CollectedDrawerIcon from './CollectedDrawerIcon.vue'
import DrawerPocket from './DrawerPocket.vue'
import IconPicker from './IconPicker.vue'
import { resizePanel } from '../utils/panel-resize'
import { ref, shallowRef, computed, watch, onMounted, onBeforeUnmount, nextTick, reactive, provide } from 'vue'
// 菜单里的图标：树的操作、分组与排序
import {
  PhPlus, PhMagnifyingGlass, PhSlidersHorizontal, PhFolderSimple, PhFileText, PhFilePdf, PhFileHtml, PhSmiley,
  PhSquaresFour, PhCaretDoubleRight, PhCheck, PhFolderSimplePlus, PhArrowClockwise,
  PhArrowLeft, PhArchive, PhFilePlus, PhPencilSimple, PhTrash, PhListDashes, PhSortAscending, PhClockCounterClockwise, PhGitDiff,
  PhStack,
  PhCheckSquare, PhCaretDown, PhCaretRight, PhCaretDoubleLeft, PhX, PhHandGrabbing, PhDotsThree, PhPushPin, PhCopy, PhArrowRight
} from '../icons/remix'
import { MorphIcon } from 'morphicons/vue'

/* Remix 的左右小箭头，作为 Morphicons 的填充图标数据。 */
const caretLeft = [['path', { d: 'M10.8284 12.0007L15.7782 16.9504L14.364 18.3646L8 12.0007L14.364 5.63672L15.7782 7.05093L10.8284 12.0007Z', fill: 'currentColor', stroke: 'none' }]]
const caretRight = [['path', { d: 'M13.1717 12.0007L8.22192 7.05093L9.63614 5.63672L16.0001 12.0007L9.63614 18.3646L8.22192 16.9504L13.1717 12.0007Z', fill: 'currentColor', stroke: 'none' }]]
import {useDialogFocus} from '../composables/useDialogFocus'
import { navigateMenu } from '../utils/navigate-menu'
import { findRoutedDocument } from '../utils/routes.js'
import { useDocsStore } from '../stores/docs'
import DocTree from './DocTree.vue'
import RailFiles from './RailFiles.vue'
import LibrarySearchResults from './LibrarySearchResults.vue'
import AppDialog from './AppDialog.vue'
import { API_BASE } from '../utils/api'
import { storageGet, storageJSON, storageSet } from '../utils/storage'
import { useFileManager } from '../composables/useFileManager'
import { useRowSelection } from '../composables/useRowSelection'
const props = defineProps({
  nodes: { type: Array, required: true },
  currentPath: { type: String, default: '' },
  width: { type: Number, default: 236 },
  collapsed: { type: Boolean, default: false },
  /** header + 文档标签此刻是否在顶栏；展开动画结束前会短暂保持 true */
  chromeCollapsed: { type: Boolean, default: false },
  /** 收起静止态：header 按内容宽度排，不占满侧栏宽度 */
  chromeCompact: { type: Boolean, default: false },
  chromeExpanding: { type: Boolean, default: false },
  galleryPresent: { type: Boolean, default: false }
})
const emit = defineEmits([
  'select', 'find-result', 'delete-doc', 'delete-category', 'toggle-collapse', 'update:width', 'update:dragging', 'gallery-change', 'return-to-reading'
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
  nav.scrollTo({ top: Math.max(0, top), behavior: scrollBehavior() })
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
const transferAction = computed(() => transfer.mode === 'copy' ? '复制' : '移动')
const transferSourceParent = computed(() => transfer.path.split('/').slice(0, -1).join('/'))
const canTransfer = computed(() => Boolean(transfer.dir) && !transfer.busy && (transfer.mode === 'copy' || transfer.dir !== transferSourceParent.value))
function closeTransfer() { if (!transfer.busy) transfer.open = false }
useDialogFocus(() => transfer.open, transferDialog, closeTransfer)
const transferToast = reactive({ message: '', lib: '', file: '', undo: null, busy: false })
let transferToastTimer
function pauseTransferToast() { clearTimeout(transferToastTimer) }
function dismissTransferToast() {
  pauseTransferToast()
  Object.assign(transferToast, { message: '', lib: '', file: '', undo: null, busy: false })
}
function resumeTransferToast() {
  pauseTransferToast()
  const notice = document.querySelector('.transfer-toast')
  if (transferToast.busy || notice?.matches(':hover, :focus-within')) return
  transferToastTimer = setTimeout(dismissTransferToast, 12000)
}
function showTransferReceipt(kind, original, dir, result) {
  const moved = kind === 'folder' ? result.path : result.file
  if (!moved || original === moved) return
  dismissTransferToast()
  transferToast.message = '已移动到 ' + dir
  if (result.id && !isGuest.value) transferToast.undo = { kind, original, moved, id: result.id }
  resumeTransferToast()
}
async function undoTransfer() {
  const undo = transferToast.undo
  if (!undo || transferToast.busy) return
  pauseTransferToast()
  transferToast.busy = true
  const dir = undo.original.slice(0, undo.original.lastIndexOf('/'))
  try {
    const receipt = { id: undo.id, original: undo.original }
    if (undo.kind === 'folder') await store.moveCategory(undo.moved, dir, receipt)
    else await store.moveDoc(undo.moved, dir, receipt)
    if (transferToast.undo !== undo) return
    transferToast.undo = null
    transferToast.message = '已撤销移动'
    await loadLibs()
  } catch (error) {
    if (transferToast.undo === undo) transferToast.message = error.message || '撤销失败'
  } finally {
    if (transferToast.undo === undo || !transferToast.undo) {
      transferToast.busy = false
      resumeTransferToast()
    }
  }
}
onBeforeUnmount(pauseTransferToast)
async function viewTransferResult() {
  const lib = transferToast.lib, file = transferToast.file
  dismissTransferToast()
  await goLib({ name: lib, path: lib }, file)
}
let transferRequest = 0
function onTransferLibSelect(value) { transfer.lib = value; loadTransferFolders() }
async function loadTransferFolders() {
  const request = ++transferRequest
  const lib = transfer.lib
  transfer.folders = lib ? [{ value: lib, label: '根目录' }] : []
  transfer.dir = lib
  transfer.error = ''
  if (!lib) return
  try {
    const response = await fetch(API_BASE + '/api/tree?lib=' + encodeURIComponent(lib), { cache: 'no-store' })
    const json = await response.json()
    if (!json.ok) throw Error(json.error || '目录读取失败')
    if (request !== transferRequest) return
    const walk = nodes => {
      for (const node of nodes || []) {
        if (node.type !== 'folder' || (transfer.kind === 'folder' && node.path === transfer.path)) continue
        transfer.folders.push({ value: node.path, label: node.path.slice(lib.length + 1).split('/').join(' / ') })
        walk(node.children)
      }
    }
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
  if (!canTransfer.value) return
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
    if (mode === 'move') {
      showTransferReceipt(kind, source, dir, result)
    } else {
      dismissTransferToast()
      transferToast.message = '已复制到 ' + dir
      transferToast.lib = targetLib
      transferToast.file = result?.file || ''
      resumeTransferToast()
    }
  } catch (error) { transfer.error = String(error.message || error) }
  finally { transfer.busy = false }
}
const footerTools=ref(false),recoveryTab=ref('trash'),toolsTrigger=ref(null),toolsPanel=ref(null)

async function toggleFooterTools(){menuOpen.value=false;footerTools.value=!footerTools.value;if(footerTools.value){await nextTick();toolsPanel.value?.querySelector('button')?.focus();loadActivityUnread()}}
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

const transferLibs = computed(() => {
  const q = transferSearch.value.trim().toLocaleLowerCase()
  return displayedLibs.value.filter(lib => !q || lib.name.toLocaleLowerCase().includes(q))
})
watch(transferSearch, () => {
  if (transfer.lib && !transferLibs.value.some(lib => lib.name === transfer.lib)) onTransferLibSelect('')
})
const managerLibs = computed(() => {
  const q = libQuery.value.trim().toLocaleLowerCase()
  return displayedLibs.value.filter(l =>
    !q || l.name.toLocaleLowerCase().includes(q) || String(l.desc || '').toLocaleLowerCase().includes(q)
  )
})

/** 当前所在的知识库：文档根的名字（每个实例一个根，所以直接问服务端） */
const currentLib = computed(() => store.activeLibrary)
// The compact slot fits the widest available library up to its responsive cap.
// Switching and closing documents can then leave every tab's hit area in place.
const compactReserve = ref(null)
const libraryNamesForWidth = computed(() => [...libPanel.libs.map(lib => lib.name), currentLib.value || '知识库'].join('\n'))
watch(currentLib, name => {
  if (name) rememberLib(name)
  applyCurrentLib()
})

let libRequest = 0
async function loadLibs() {
  const request = ++libRequest
  const preview = managerOpen.value && !isGuest.value
  if (preview && !shelfLevel.value.path) {
    shelfLoading.value = !libPanel.libs.length || !!shelfLoadError.value
    shelfLoadError.value = ''
  }
  try {
    const res = await fetch(API_BASE + '/api/libs' + (preview ? '?preview=1' : ''), { cache: 'no-store' })
    const data = await res.json()
    if (request !== libRequest) return
    if (!data.ok) throw Error(data.error || '读取知识库失败')
    libPanel.libs = data.data.libs.filter(l => l && l.name)
    if (preview && managerOpen.value) {
      shelfPreviews.value = Object.fromEntries(libPanel.libs.map(lib => [lib.path, lib.preview]))
    }
    if (typeof data.data.config?.panelWidth === 'number') libWidth.value = data.data.config.panelWidth
    applyCurrentLib()
    if (currentLib.value) rememberLib(currentLib.value)
  } catch (error) {
    if (request === libRequest && preview && managerOpen.value && !shelfLevel.value.path) shelfLoadError.value = error.message || '读取知识库失败'
  } finally {
    if (request === libRequest && preview && managerOpen.value && !shelfLevel.value.path) shelfLoading.value = false
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
  if (managerOpen.value) shelfOpenError.value = ''
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
  const fromOverview = managerOpen.value
  if (fromOverview) shelfOpenError.value = ''
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
    if (made && fromOverview) {
      if (managerOpen.value) {
        await loadLibs()
        if (managerOpen.value && !shelfLevel.value.path) browseDrawer(made)
      }
    } else if (made) await goLib(made)
  } catch (e) {
    if (fromOverview && managerOpen.value) shelfOpenError.value = e.message || '新建知识库失败'
    else store.setError(e.message || e)
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
const shelfLevels = shallowRef([{ path: '', name: '文档' }])
const shelfLevel = computed(() => shelfLevels.value.at(-1))
const shelfPreviews = shallowRef({})
const shelfHeading = ref(null)
const shelfScroll = ref(null)
const shelfTrigger = ref(null)
const shelfTriggerLabel = computed(() => {
  if (!managerOpen.value) return '文档总览'
  return shelfLevel.value.path ? '返回文档总览' : '返回当前文档'
})
const shelfLoading = ref(false)
const shelfLoadError = ref('')
const shelfOpenError = ref('')
const pendingShelf = ref('')
const shelfStep = ref('')
const shelfOpening = ref(false)
let shelfRequest
const shelfError = computed(() => shelfLoadError.value || shelfOpenError.value)
const shelfSearchLabel = computed(() => !shelfLevel.value.path ? '搜索知识库' : '筛选当前目录')
const shelfEntries = computed(() => {
  const items = shelfLevel.value.nodes || []
  const q = libQuery.value.trim().toLocaleLowerCase()
  return q ? items.filter(node => (node.file?.split('/').pop() || node.name).toLocaleLowerCase().includes(q)) : items
})

let previousRailOpen = false

function closeManager() {
  if (shelfOpening.value) return
  managerOpen.value = false
  emit('return-to-reading')
  nextTick(() => {
    if (managerOpen.value) return
    const trigger = libPanel.open && shelfTrigger.value?.getClientRects().length
      ? shelfTrigger.value
      : document.querySelector('.doc-tab.is-active .doc-tab-main') || document.querySelector('.sidebar-toggle')
    trigger?.focus({ preventScroll: true })
  })
}

function toggleManager() {
  if (!managerOpen.value) return openManager()
  if (shelfLevel.value.path) return shelfBack(0)
  closeManager()
}

function openManager() {
  previousRailOpen = libPanel.open
  libPanel.open = true
  window.dispatchEvent(new Event('reader-overlay-open'))
  cancelCreateLib()
  tree.closeMenu()
  shelfLevels.value = [{ path: '', name: '文档' }]
  shelfLoadError.value = ''
  shelfOpenError.value = ''
  libQuery.value = ''
  shelfStep.value = ''
  managerOpen.value = true
  nextTick(() => shelfHeading.value?.focus({ preventScroll: true }))
  return loadLibs()
}

function cancelShelfRequest() {
  shelfRequest?.abort()
  shelfRequest = undefined
  pendingShelf.value = ''
}
watch(isGuest, guest => { if (guest) managerOpen.value = false })
watch(managerOpen, open => {
  emit('gallery-change', open)
  if (open) return
  libPanel.open = previousRailOpen && !isMobileLibView()
  cancelShelfRequest()
})
watch(() => props.galleryPresent, present => {
  if (present || managerOpen.value) return
  cancelCreateLib()
  cancelRename()
  shelfPreviews.value = {}
  shelfLevels.value = [{ path: '', name: '文档' }]
})
onBeforeUnmount(cancelShelfRequest)

function isRailCurrent(lib) {
  return managerOpen.value ? shelfLevels.value[1]?.path === lib.path : isCurrentLib(lib)
}

function selectRailLibrary(lib) {
  if (!managerOpen.value) return goLib(lib)
  if (shelfOpening.value) return
  if (shelfLevels.value.length === 2 && shelfLevel.value.path === lib.path) {
    cancelShelfRequest()
    return
  }
  browseDrawer(lib, Boolean(shelfLevel.value.path))
}

function pushShelfLevel(level, replaceDrawer = false) {
  shelfStep.value = 'forward'
  if (replaceDrawer) {
    // Rail navigation changes siblings. Preserve the grid's original filter and scroll position.
    shelfLevels.value = [shelfLevels.value[0], level]
  } else {
    shelfLevel.value.query = libQuery.value
    shelfLevel.value.scroll = shelfScroll.value?.scrollTop || 0
    shelfLevels.value = [...shelfLevels.value, level]
  }
  shelfLoadError.value = ''
  shelfOpenError.value = ''
  libQuery.value = ''
  if (shelfScroll.value) shelfScroll.value.scrollTop = 0
  nextTick(() => {
    shelfHeading.value?.focus({ preventScroll: true })
    const crumbs = managerDialog.value?.querySelector('.drawer-breadcrumbs')
    if (crumbs) crumbs.scrollLeft = crumbs.scrollWidth
  })
}

async function browseDrawer(lib, replaceDrawer = false) {
  if (pendingShelf.value === lib.path) return
  cancelShelfRequest()
  const controller = new AbortController()
  shelfRequest = controller
  pendingShelf.value = lib.path
  const level = { path: lib.path, name: lib.name, nodes: [] }
  let failure = ''
  try {
    const result = await fetch(API_BASE + '/api/tree?lib=' + encodeURIComponent(lib.path), {
      cache: 'no-store', signal: controller.signal
    }).then(response => response.json())
    if (!result.ok || result.data?.lib !== lib.path || !Array.isArray(result.data.nodes)) throw Error(result.error || '读取知识库失败')
    level.nodes = result.data.nodes
  } catch (error) {
    failure = error.message || '读取知识库失败'
  }
  if (controller.signal.aborted || !managerOpen.value) return
  shelfRequest = undefined
  pendingShelf.value = ''
  shelfLoading.value = false
  pushShelfLevel(level, replaceDrawer)
  shelfLoadError.value = failure
}

async function shelfBack(index) {
  if (shelfOpening.value) return
  shelfStep.value = 'back'
  const previousPath = shelfLevels.value[index + 1].path
  cancelShelfRequest()
  shelfLevels.value = shelfLevels.value.slice(0, index + 1)
  shelfLoading.value = false
  shelfLoadError.value = ''
  shelfOpenError.value = ''
  libQuery.value = shelfLevel.value.query || ''
  await nextTick()
  if (shelfScroll.value) shelfScroll.value.scrollTop = shelfLevel.value.scroll || 0
  const row = Array.from(shelfScroll.value?.querySelectorAll('[data-path]') || []).find(button => button.dataset.path === previousPath)
  const focusTarget = row || shelfHeading.value
  focusTarget?.focus({ preventScroll: true })
}

function browseEntry(entry) {
  cancelShelfRequest()
  if (entry.type === 'folder') pushShelfLevel({ path: entry.path, name: entry.name, nodes: entry.children })
  else openShelfDocument(entry.file)
}

async function openShelfDocument(file) {
  if (shelfOpening.value) return
  shelfOpenError.value = ''
  shelfOpening.value = true
  try {
    if (!file && (store.isDirty || store.saving) && !(await store.save())) {
      shelfOpenError.value = store.error || '未能保存当前文档'
      return
    }
    if (!(await goLib(shelfLevels.value[1], file))) {
      shelfOpenError.value = store.error || '未能打开文档，请重新选择'
      return
    }
    managerOpen.value = false
    await nextTick()
    if (file) {
      emit('return-to-reading')
      await nextTick()
      document.querySelector('.doc-tab.is-active .doc-tab-main')?.focus({ preventScroll: true })
    }
    else await startCreate('doc')
  } catch (error) {
    shelfOpenError.value = error.message || '未能打开文档'
  } finally {
    shelfOpening.value = false
  }
}

function retryShelf() {
  if (shelfLevel.value.path) browseDrawer(shelfLevels.value[1], true)
  else loadLibs()
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
async function goLib(lib, file = '') {
  if (!lib) return false
  const name = lib.path || lib.name
  let opened = true
  if (file) opened = await store.select(file)
  else if (name !== currentLib.value || store.switchingLibrary) opened = await store.switchLib(name)
  if (opened && isMobileLibView()) closeLibPanel()
  return opened
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
  event.dataTransfer.setData('application/x-typocket-drawer', '1')
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

async function startRename(lib) {
  if (managerOpen.value && shelfLevel.value.path) await shelfBack(0)
  if (managerOpen.value && !managerLibs.value.some(item => item.path === lib.path)) libQuery.value = ''
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
  if (to.includes('/') || to.startsWith('.')) throw new Error('知识库名称不能包含斜杠或以点开头')
  const active = from === currentLib.value
  if (active && (store.isDirty || store.saving) && !(await store.save())) {
    throw new Error(store.error || '重命名失败')
  }
  libPanel.busy = from
  try {
    const data=await store.renameLibrary(from,to)
    libPanel.libs=data.libs||[]
    if (managerOpen.value) await loadLibs()
    libOrder.value = libOrder.value.map(name => name === from ? to : name)
    saveLibPrefs()
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
    if (managerOpen.value) shelfOpenError.value = ''
  } catch (e) {
    if (managerOpen.value) shelfOpenError.value = e.message || '重命名失败'
    else store.setError(e.message || e)
  }
}

/** 标题就是库名；改名会同步重命名目录。 */
function nameFieldKey(event, confirm, cancel) {
  if (event.isComposing || event.keyCode === 229) return
  if (event.key !== 'Enter' && event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  if (event.key === 'Enter') confirm()
  else cancel()
}
function onTitleKey(event) {
  const input = event.currentTarget
  nameFieldKey(event, () => input.blur(), () => {
    brandTitle.value = currentLib.value
    input.value = currentLib.value
    input.blur()
  })
}
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
async function onActivitySelect(path) {
  closeActivity()
  if (await store.refreshActivityDocument(path)) emit('select', path)
}
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
    title: '将「' + lib.name + '」移到回收站？',
    message: lib.docs ? '知识库中的 ' + lib.docs + ' 篇文档将一并移入回收站。' : '可在回收站恢复这个知识库。',
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
    store.forgetLibrary(lib.name)
    if (managerOpen.value && shelfLevels.value[1]?.path === lib.path) await shelfBack(0)
    /* 删的是当前库：换到第一个剩下的库 */
    if (lib.name === currentLib.value) {
      const first = libPanel.libs[0]
      await store.switchLib(first?.name || '')
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
  let initialLibraries
  if (new URLSearchParams(location.search).has('choose') && !isGuest.value) {
    initialLibraries = openManager()
    const url = new URL(location.href)
    url.searchParams.delete('choose')
    history.replaceState(null, '', url)
  }
  /*
   * 没指定 ?lib= 时选默认库。
   *
   * 先取知识库列表，再从树里匹配旧书签所属的知识库。
   */
  const readyLibraries = initialLibraries || loadLibs()
  readyLibraries.then(() => {
    if (currentLib.value) return
    const pick = () => {
      if (currentLib.value || store.switchingLibrary) return
      const route = location.pathname.match(/\/(?:doc|edit|onlyread)\/(.+)$/)
      let target = ''
      try { target = decodeURIComponent(route?.[1] || '').replace(/\/+$/, '') } catch { /* skip malformed bookmark */ }
      const routedFile = findRoutedDocument(store.allFiles, target)
      const byLegacy = store.legacyLib()
      const lib = libPanel.libs.find(l => l.name === (routedFile?.file.split('/')[0] || byLegacy)) || libPanel.libs[0]
      if (lib) store.switchLib(lib.name, routedFile?.file || '')
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
 * 产品 favicon 统一走构建后的 /favicon.svg；知识库图标仍按各自设置显示。
 */
const siteIcon = '__SITE_ICON__'
/*
 * 产品 favicon 是产品自己的身份，不随当前知识库切换。
 * 顶栏左上角仍显示当前知识库图标；它跟着库走。
 */
const logo = computed(() => import.meta.env.VITE_LOGO || siteIcon)
watch(logo, setFavicon, {immediate:true})
/** 文档区左上角的库图标跟当前知识库走；产品 favicon 仍保持独立。 */
const currentLibIcon = computed(() => libPanel.libs.find(l => l.name === currentLib.value)?.icon || 'icon:folder')

const titleEl = ref(null), glyphEl = ref(null), titleWrap = ref(null)
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
const reducedIdentityMotion = ref(motionPreference.matches)
function syncIdentityMotion() { reducedIdentityMotion.value = motionPreference.matches }
onMounted(() => motionPreference.addEventListener('change', syncIdentityMotion))
onBeforeUnmount(() => motionPreference.removeEventListener('change', syncIdentityMotion))
const identityCanMove = computed(() => !reducedIdentityMotion.value &&
  props.collapsed === props.chromeCompact && !props.chromeExpanding)

// Each mark has one readable layer. An interrupted fade continues from the
// opacity on screen and only the latest destination can replace its content.
function useIdentitySwap(source, element) {
  const shown = ref(source.value)
  let motion
  function stop() { motion?.cancel(); motion = null }
  watch([source, identityCanMove], async ([next, enabled], [previous, wasEnabled]) => {
    const el = element.value
    let opacity = motion && el ? Number(getComputedStyle(el).opacity) : 1
    stop()
    if (!el?.animate || !enabled || !wasEnabled || !previous || !next) {
      shown.value = next
      return
    }
    if (next !== shown.value) {
      const fade = el.animate([{ opacity }, { opacity: .12 }], {
        duration: 75 * opacity, easing: 'ease-in', fill: 'forwards'
      })
      motion = fade
      await fade.finished.catch(() => {})
      if (motion !== fade) return
      shown.value = next
      await nextTick()
      if (motion !== fade) return
      stop()
      opacity = .12
    }
    if (opacity < 1) motion = el.animate([{ opacity }, { opacity: 1 }], {
      duration: 135, easing: 'ease-out'
    })
  })
  onBeforeUnmount(stop)
  return shown
}
const shownLib = useIdentitySwap(currentLib, titleEl)
const shownLibIcon = useIdentitySwap(currentLibIcon, glyphEl)

// Only the compact button follows the text width. Its reserve and the tab
// strip stay still, including when an in-flight size change reverses.
let widthMotion
watch([currentLib, identityCanMove], async ([next, enabled], [previous, wasEnabled], onCleanup) => {
  const el = titleWrap.value
  const start = el?.getBoundingClientRect().width
  widthMotion?.cancel()
  widthMotion = null
  if (!start || !el.animate || !enabled || !wasEnabled || !props.chromeCompact || !previous || !next) return
  let current = true
  onCleanup(() => { current = false })
  await nextTick()
  if (!current) return
  const end = el.getBoundingClientRect().width
  if (end && Math.abs(end - start) > 1) widthMotion = el.animate(
    [{ width: start + 'px' }, { width: end + 'px' }],
    { duration: 210, easing: 'cubic-bezier(.24,.76,.26,1)' }
  )
})
onBeforeUnmount(() => widthMotion?.cancel())

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
let folderDwellTimer
onBeforeUnmount(() => clearTimeout(folderDwellTimer))

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
    this.setDropFolder(null)
    e.dataTransfer.effectAllowed = 'move'
    // Nonempty data starts the native drag without offering editable fields text to insert.
    e.dataTransfer.setData('application/x-typocket-tree-item', '1')
  },
  setDropFolder(path, expandable = false) {
    this.dropAt = null
    if (this.dropInto === path) return
    clearTimeout(folderDwellTimer)
    this.dropInto = path
    // Accept the drop immediately. Only opening the folder requires a short dwell.
    if (expandable && !query.value && isCollapsed(path)) {
      folderDwellTimer = setTimeout(() => this.expand(path), 450)
    }
  },
  /** 悬停在某一行上：中间带进目录，上下边插位置 */
  overRow(node, e) {
    if (!this.drag) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const r = e.currentTarget.getBoundingClientRect()
    const y = (e.clientY - r.top) / r.height
    const target = node.type === 'folder' ? node.path : node.file
    if (target === this.drag.path || (this.drag.kind === 'folder' && target.startsWith(this.drag.path + '/'))) {
      this.setDropFolder(null)
      e.dataTransfer.dropEffect = 'none'
      return
    }
    if (node.type === 'folder' && y > 0.3 && y < 0.7) {
      this.setDropFolder(node.path, Boolean(node.children?.length))
      return
    }
    this.setDropFolder(null)
    const parent = this.parentOfNode(node)
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
    this.setDropFolder(currentLib.value || '')
  },
  leaveNav(e) {
    if (this.drag && !e.currentTarget.contains(e.relatedTarget)) this.setDropFolder(null)
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
        const result = d.kind === 'doc' ? await store.moveDoc(d.path, into) : await store.moveCategory(d.path, into)
        showTransferReceipt(d.kind, d.path, into, result)
        return
      }
      if (!at) return
      // 拖过就切手动排序，否则列表会按按名称立刻重排，白拖
      sortMode.value = 'manual'
      let path = d.path
      // 跨层插入：先挪进那一层，再排序
      if (at.parent !== d.parent) {
        const result = d.kind === 'doc' ? await store.moveDoc(d.path, at.parent) : await store.moveCategory(d.path, at.parent)
        path = result.file || result.path
        showTransferReceipt(d.kind, d.path, at.parent, result)
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
    this.setDropFolder(null)
  },

  /* ---------- 原位改名 ---------- */

  editKey(event) {
    nameFieldKey(event, () => this.editCommit(), () => this.editCancel())
  },
  createKey(event) {
    nameFieldKey(event, () => this.createCommit(), () => this.createCancel())
  },
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
      if (c.kind === 'doc') {
        await store.createDoc(c.parent, name)
        emit('return-to-reading')
      } else await store.createCategory(c.parent, name)
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
      this.closeMenu(false)
    }
    document.addEventListener('keydown', this.onKey)
    setTimeout(() => document.addEventListener('click', this.onClick), 0)
  },
  closeMenu(returnFocus = true) {
    if (!this.menu.open) return
    const trigger = this.menuTrigger
    this.menu.open = false
    this.menu.kind = ''
    this.menu.node = null
    this.menuTrigger = null
    if (returnFocus) trigger?.focus?.({ preventScroll:true })
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
const batchCancel = ref(null)
async function startBatch() {
  if (isGuest.value || !currentLibEditable.value || !props.nodes.length) return
  menuOpen.value = false
  batch.selected.clear()
  batch.mode = true
  await nextTick()
  const first = [...docNavEl.value.querySelectorAll('.batch-check:not(:disabled)')].find(item => !item.closest('[inert]'))
  const target = first || batchCancel.value
  target?.focus()
}
async function endBatch() {
  batch.cancel()
  await nextTick()
  sortTrigger.value?.focus({ preventScroll:true })
}

function requestBatchDelete() {
  if (!batch.selected.size) return
  const current = new Map()
  const visit = nodes => { for (const node of nodes) { current.set(batch.path(node), node); if (node.children) visit(node.children) } }
  visit(props.nodes)
  const selected = [...batch.selected.values()].map(item => current.get(item.path))
  if (selected.some(node => !node || !store.canEdit(node))) {
    store.setError('文档列表已变化，请重新选择')
    endBatch()
    return
  }
  const summary = selected.slice(0, 5).map(node => batch.path(node)).join('、')
  const rest = selected.length > 5 ? `，还有 ${selected.length - 5} 项` : ''
  askLibDialog({
    title: `将选中的 ${selected.length} 项移入回收站？`,
    message: summary + rest + (selected.some(node => node.type === 'folder') ? '\n\n包含文件夹内的内容。' : ''),
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
      endBatch()
    }
  })
}

// Rows keep native button activation. Arrow keys follow only the visible hierarchy.
function navigateRows(event) {
  const selector = event.target.matches('.batch-check')
    ? '.batch-check:not(:disabled)'
    : 'button.folder-toggle, button.doc-title, button.pdf-title'
  const current = event.target
  if (!current.matches(selector) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
  const rows = [...event.currentTarget.querySelectorAll(selector)].filter(button => !button.closest('[inert]'))
  const index = rows.indexOf(current)
  if (index === -1) return
  const folder = current.matches('.folder-toggle')
  const expanded = folder && current.getAttribute('aria-expanded') === 'true'
  let target
  switch (event.key) {
    case 'Home': target = rows[0]; break
    case 'End': target = rows.at(-1); break
    case 'ArrowUp': target = rows[index - 1]; break
    case 'ArrowDown': target = rows[index + 1]; break
    case 'ArrowRight':
      if (!folder) return
      if (expanded) target = current.closest('.tree-folder').querySelector('.tree-children :is(' + selector + ')')
      else current.click()
      break
    case 'ArrowLeft':
      if (expanded && !query.value) current.click()
      else target = current.closest('.tree-children')?.parentElement.querySelector(':scope > .cat-row .folder-toggle')
      break
    default: return
  }
  event.preventDefault()
  target?.focus()
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
      ...(managerOpen.value ? [{ id: 'lib-icon', label: '更换图标', icon: PhSmiley }] : []),
      { id:'lib-pin', label: libPinned(node) ? '取消置顶' : '置顶', icon: PhPushPin },
      { id:'lib-rename',label:'重命名',icon:PhPencilSimple },
      { id:'lib-delete',label:'删除知识库',icon:PhTrash,danger:true }
    )
  } else {
    if (kind === 'folder') items.push({id:'new-doc',label:'新建文档',icon:PhFilePlus},{id:'new-folder',label:'新建文件夹',icon:PhFolderSimplePlus})
    items.push({id:'copy-to',label:'复制到…',icon:PhCopy},{id:'move-to',label:'移动到…',icon:PhArrowRight})
    items.push({id:'rename',label:'重命名',icon:PhPencilSimple},{id:'delete',label:'移入回收站',icon:PhTrash,danger:true})
  }
  return items
})

function onMenuPick(item) {
  const kind = tree.menu.kind
  const node = tree.menu.node
  const trigger = tree.menuTrigger
  tree.closeMenu()
  if (kind === 'lib-sort') {
    libSort.value = item.id.slice(5)
    return
  }
  if (kind === 'root') {
    if (item.id === 'new-doc' && currentLibEditable.value) tree.startCreate('doc', currentLib.value || '')
    else if (item.id === 'new-folder' && currentLibEditable.value) tree.startCreate('folder', currentLib.value || '')
    else if (item.id === 'rescan') rescan()
    else if (item.id === 'batch-delete') startBatch()
    return
  }
  if (!node || item.disabled) return
  if (item.id === 'reveal') {
    showInFinder(node.path || node.file)
    return
  }
  /* 知识库那几个动作：名字就是文件夹名，所以改名 = 重命名文件夹 */
  if (kind === 'lib') {
    const lib = libPanel.libs.find(item => item.name === node.name) || node
    if (item.id === 'lib-icon') pickLibIcon(lib, { currentTarget: trigger })
    else if (item.id === 'lib-reveal') revealLibInFinder(lib)
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

const vSelectName = { mounted(input) { input.focus(); input.select() } }
const menuOpen = ref(false)
const sortPanel = ref(null), sortTrigger = ref(null)
async function toggleSortMenu() {
  menuOpen.value = !menuOpen.value
  if (!menuOpen.value) return
  footerTools.value = false
  await nextTick()
  sortPanel.value?.querySelector('[aria-checked="true"]')?.focus()
}
function closeSortMenu() {
  menuOpen.value = false
  sortTrigger.value?.focus({ preventScroll:true })
}
const searchOpen = ref(false), searchBody = ref(false)
watch(searchOpen, open => { if (!open) searchBody.value = false })
const query = ref('')

const docNavEl = ref(null)
const { row: selectedDocRow, marker: docIndicator } = useRowSelection({
  viewport: docNavEl,
  selector: '.doc-row.is-on',
  selection: () => props.currentPath,
  scope: () => currentLib.value,
  visible: () => !props.collapsed && !managerOpen.value,
  layout: [() => props.nodes, groupMode, sortMode, query, collapsedCats]
})
const libViewport = ref(null)
const { row: selectedLibRow, marker: libIndicator } = useRowSelection({
  viewport: libViewport,
  selector: '.lib-row.is-current',
  selection: () => managerOpen.value ? shelfLevels.value[1]?.path : currentLib.value || brandTitle.value,
  scope: () => managerOpen.value,
  visible: () => libPanel.open,
  layout: [panelLibs]
})
const searchEl = ref(null), treeSearchTrigger = ref(null)

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
  const startX = e.clientX, startWidth = props.width
  const finish = resizePanel(e, ev => {
    emit('update:width', Math.max(180, Math.min(420, startWidth + ev.clientX - startX)))
  }, () => emit('update:dragging', false))
  if (finish) emit('update:dragging', true)
}

function setGroup(id) {
  groupMode.value = id
  closeSortMenu()
}
function setSort(id) {
  sortMode.value = id
  closeSortMenu()
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
  treeSearchTrigger.value?.focus({ preventScroll:true })
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
  if (!target?.closest('.tree-sort-control')) menuOpen.value = false
}
function onLibEscape(e) {
  if (e.key !== 'Escape' || e.defaultPrevented || e.isComposing || e.keyCode === 229) return
  if(footerTools.value){footerTools.value=false;toolsTrigger.value?.focus();return}
  if (transfer.open) { closeTransfer(); return }
  if (managerOpen.value) {
    if (tree.menu.open || libDialog.open || iconPicking.value || e.target?.closest?.('[data-esc-local]')) return
    closeManager()
    return
  }
  if (batch.mode && !libDialog.open) { endBatch(); return }
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

function onCompactActionsEnter(event) {
  if (event.pointerType === 'touch') return
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

function compactHeaderWidth() {
  return compactReserve.value?.getBoundingClientRect().width || props.width
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
onBeforeUnmount(() => document.removeEventListener('keydown', onLibEscape))
onMounted(() => window.addEventListener('reader-access-updated', loadLibs))
onBeforeUnmount(() => window.removeEventListener('reader-access-updated', loadLibs))
onMounted(loadActivityUnread)
</script>

<style scoped>

.search-scopes{display:flex;gap:3px;margin-top:5px}.search-scopes button{padding:3px 6px;border-radius:var(--radius-control);font-size:11px;color:var(--c-sub)}.search-scopes button[aria-pressed=true]{background:var(--c-field);color:var(--c-ink)}
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
.doc-tree-nav { position: relative; container-type:inline-size; }
:deep(.cat-row.is-rail-target), :deep(.doc-row.is-rail-target) {
  outline: 1.5px solid color-mix(in srgb, var(--c-accent) 36%, transparent);
  outline-offset: -1px;
  border-radius: var(--radius-row);
}
.doc-row-blob, .lib-row-blob {
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: var(--radius-row);
  background: color-mix(in srgb, var(--c-accent) 10%, transparent);
  pointer-events: none;
}
.lib-row-blob { background: color-mix(in srgb, var(--c-accent) 9%, transparent); }
.lib-row-marker {
  position: absolute;
  left: 4px;
  top: calc(50% - 9px);
  width: 3px;
  height: 18px;
  border-radius: 999px;
  background: var(--c-accent);
}
@property --row-waist {
  syntax: '<length>';
  inherits: false;
  initial-value: 0px;
}
.row-selection-stretching {
  clip-path: shape(from 0 0, hline to 100%, vline to 10%,
    curve to calc(100% - var(--row-waist)) 50% with 100% 27% / calc(100% - var(--row-waist)) 33%,
    curve to 100% 90% with calc(100% - var(--row-waist)) 67% / 100% 73%,
    vline to 100%, hline to 0, vline to 90%,
    curve to var(--row-waist) 50% with 0 73% / var(--row-waist) 67%,
    curve to 0 10% with var(--row-waist) 33% / 0 27%, close);
}
.lib-row.is-draft .lib-row-blob { background: color-mix(in srgb, var(--c-accent) 10%, transparent); }
.lib-panel-footer { display:flex;flex-direction:column;margin:5px 8px 12px;gap:2px; }
.lib-empty { color: var(--c-faint); font-size: 12px; text-align: center; padding: 24px 0; }

.lib-preview-entry { display:flex;align-items:center;gap:13px;width:100%;min-height:44px;margin-bottom:5px;padding:8px 12px;border-radius:var(--radius-control);color:var(--c-sub);font-size:12px;text-align:left; }.lib-preview-entry:hover { background:var(--c-hover);color:var(--c-ink); }.lib-preview-detail { margin:0 24px 24px;padding:16px;background:var(--c-field);border-radius:22px;corner-shape:var(--corner-ui); }.lib-preview-detail-head { display:flex;justify-content:space-between;gap:12px;font-size:12px; }.lib-preview-detail-head span,.lib-preview-source { color:var(--c-faint);font-size:11px; }.lib-preview-source { overflow-wrap:anywhere;margin:8px 0; }.lib-preview-body { max-height:300px;overflow:auto;padding:12px 0;font-size:12px;line-height:1.7;overflow-wrap:anywhere; }.lib-preview-body img { max-width:100%; }.lib-preview-body pre { overflow:auto; }.lib-preview-actions { display:flex;justify-content:flex-end;gap:8px; }.lib-preview-actions button { padding:8px 12px;border-radius:var(--radius-control);background:var(--c-pop);font-size:12px; }.lib-preview-actions button:disabled { opacity:.45;cursor:default; }
.lib-preview-body :is(h1,h2,h3) { margin:1.3em 0 .55em;line-height:1.4;font-weight:600; }.lib-preview-body h1 { font-size:1.45em; }.lib-preview-body h2 { font-size:1.25em; }.lib-preview-body h3 { font-size:1.1em; }.lib-preview-body p,.lib-preview-body ul,.lib-preview-body ol { margin:0 0 1em; }.lib-preview-body :is(ul,ol) { padding-left:1.7em; }.lib-preview-body code { font-family:ui-monospace,monospace;font-size:.9em; }.lib-preview-body pre { padding:10px;background:var(--c-pop);border-radius:12px; }.lib-preview-body table { display:block;max-width:100%;overflow:auto;border-collapse:collapse; }.lib-preview-body :is(td,th) { border:1px solid var(--c-line);padding:4px 7px; }.lib-preview-body a { color:var(--c-accent); }.lib-preview-body a[href="#"] { cursor:help;text-decoration-style:dotted; }
.transfer-toast { position:fixed;right:22px;bottom:24px;z-index:95;display:flex;align-items:center;gap:12px;max-width:min(430px,calc(100vw - 28px));padding:10px 14px;border:1px solid var(--c-line);border-radius:20px;corner-shape:var(--corner-ui);background:var(--c-pop);box-shadow:var(--c-pop-shadow);color:var(--c-ink);font-size:12px; }.transfer-toast span { overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }.transfer-toast button { color:var(--c-accent);white-space:nowrap; }
@media (max-width: 520px) {.lib-preview-detail { margin-inline:14px; } }
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
.lib-row.is-draft .lib-row-icon { color: var(--c-accent); }
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
/* The rail reserves tab space independently of the visible button. The actual
   header can grow into the panel and shrink back to the current name. */
.kb-header-rail {
  --kb-start:10px;
  --kb-end:2px;
  --kb-logo:22px;
  --kb-pad:4px;
  --kb-gap:2px;
  --kb-actions:32px;
  --kb-title-limit:140px;
  display:grid;
  grid-template-columns:minmax(0,1fr);
  align-items:center;
  flex:1 1 auto;
  min-width:0;
  pointer-events:none;
}
.kb-header-row, .kb-header-reserve { grid-area:1 / 1; min-width:0; }
.kb-header-row { display:flex; align-items:center; }
.kb-header-reserve {
  justify-self:start;
  display:flex;
  height:0;
  overflow:hidden;
  visibility:hidden;
  padding-left:calc(var(--kb-start) + var(--kb-pad) + var(--kb-logo) + var(--kb-pad));
  padding-right:calc(var(--kb-actions) + var(--kb-end));
}
.kb-reserve-title {
  margin-left:var(--kb-gap);
  max-width:var(--kb-title-limit);
  overflow:hidden;
  white-space:pre;
}
/* 左上角展开知识库的提示 */
.brand-line.is-title { font-size: 17px; }
.side-header { position:relative; isolation:isolate; display:flex; align-items:center; gap:4px; height:40px; padding:0 var(--kb-end) 0 var(--kb-start); min-width:0; flex:1 1 auto; pointer-events:auto; }
.side-header .brand-logo { width:var(--kb-logo); margin-top:0; }
.side-header .icon-btn { flex-shrink: 0; }
.side-header .kb-identity,
.side-header .sidebar-actions { position:relative; isolation:isolate; display:flex; align-items:center; min-width:0; height:32px; padding:2px var(--kb-pad); border-radius:18px; corner-shape:var(--corner-ui); }
.side-header .kb-identity::before,
.side-header .sidebar-actions::before { content:''; position:absolute; inset:0; z-index:0; border-radius:inherit; corner-shape:inherit; background-color:var(--topbar-chip-bg); -webkit-backdrop-filter:var(--topbar-glass-filter); backdrop-filter:var(--topbar-glass-filter); box-shadow:var(--topbar-glass-shadow); pointer-events:none; transition:background-color 160ms ease,box-shadow 160ms ease; }
.side-header .kb-identity > *,
.side-header .sidebar-actions > * { position:relative; z-index:1; }
.side-header .kb-identity { gap:var(--kb-gap); flex:1 1 0; }
.side-header.is-compact .kb-identity { flex:0 1 auto; }
.side-header .sidebar-actions { gap:0; flex:none; margin-left:auto; width:var(--kb-actions); padding:2px var(--kb-pad); display:flex; align-items:center; justify-content:flex-end; }
.side-header.is-merged .sidebar-actions { width:56px; }
.side-header { transition:gap 220ms cubic-bezier(0,0,.2,1), flex-grow 220ms cubic-bezier(0,0,.2,1); }
.side-header .sidebar-actions { transition:width 220ms cubic-bezier(0,0,.2,1); }
.side-header.is-collapsing { gap:0; flex-grow:0; }
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
.side-header.is-merged .sidebar-actions::before { background-color:transparent; box-shadow:none; -webkit-backdrop-filter:blur(0) saturate(1); backdrop-filter:blur(0) saturate(1); transition:background-color 180ms cubic-bezier(.4,0,.2,1) 40ms,box-shadow 180ms cubic-bezier(.4,0,.2,1) 40ms; }
.side-header .kb-title-wrap { position:relative; flex:1 1 auto; min-width:0; }
.side-header .kb-title-label,
.side-header .kb-title,
.kb-reserve-title {
  display:block;
  box-sizing:border-box;
  min-width:0;
  padding:1px 3px;
  border:0;
  font-size:15px;
  font-weight:500;
  line-height:1.3;
  letter-spacing:-0.01em;
  text-align:left;
}
.side-header .kb-title-label, .side-header .kb-title { width:100%; margin:0; }
.side-header .kb-title-label { overflow:hidden; }
.side-header .kb-title {
  position:absolute;
  inset:0;
  height:100%;
  opacity:0;
}
.side-header .kb-title:disabled { display:none; }
.side-header .kb-title:focus { opacity:1; outline:1px solid var(--c-focus); }
.side-header .kb-title-wrap:has(> .kb-title:focus) .kb-title-label { visibility:hidden; }
.side-header.is-topbar { width:auto; }
/* 展开时知识库图标从紧凑态的滑出位置收进 header，给一小段出现动效。 */
.side-header:not(.is-expanding):not(.is-compact) .kb-list-btn { animation:kb-icon-in 300ms var(--motion-pop); }
@keyframes kb-icon-in {
  from { opacity:0; transform:translateX(-8px) scale(.96); filter:blur(1.6px); }
  to   { opacity:1; transform:translateX(0) scale(1); filter:blur(0); }
}
/* 收起静止态：知识库标识和侧栏开关是两个组块；hover 开关时盒子图标从下方滑出。 */
.side-header.is-compact {
  flex-grow:0;
  height:40px;
  margin:0 0 0 var(--kb-start);
  padding:0 var(--kb-end) 0 0;
  gap:0;
  border:0;
  background:transparent;
  box-shadow:none;
}
/* The library and document controls occupy sibling slots over the same cover. */
.app-topbar:has(.doc-topbar.over-cover) .side-header.is-topbar:not(.is-merged) {
  --c-ink: var(--nav-cover-ink);
  --c-faint: color-mix(in srgb, var(--c-ink) 81%, transparent);
  --topbar-chip-bg: color-mix(in srgb, var(--nav-cover-paper) var(--topbar-chip-opacity), transparent);
  --topbar-chip-bg-hover: color-mix(in srgb, var(--nav-cover-paper) var(--topbar-chip-opacity-hover), transparent);
  color: var(--c-ink);
}
@media (prefers-contrast: more) {
  .app-topbar:has(.doc-topbar.over-cover) .side-header.is-topbar:not(.is-merged) { --c-faint: var(--c-ink); }
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
  corner-shape:var(--corner-ui);
  background-color:transparent;
  box-shadow:none;
  pointer-events:none;
  transition:background-color 200ms cubic-bezier(.4,0,.2,1),box-shadow 200ms cubic-bezier(.4,0,.2,1);
}
/* 磨砂单独淡入淡出，收起时玻璃始终贴着按钮。 */
.side-header::after {
  content:'';
  position:absolute;
  left:0;
  right:0;
  top:4px;
  bottom:4px;
  z-index:-1;
  border-radius:18px;
  corner-shape:var(--corner-ui);
  -webkit-backdrop-filter:var(--topbar-glass-filter);
  backdrop-filter:var(--topbar-glass-filter);
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
  gap:var(--kb-gap);
  height:32px;
  padding:2px var(--kb-pad);
  border-radius:18px;
  corner-shape:var(--corner-ui);
}
.side-header:is(.is-compact,.is-collapsing) .kb-title-wrap { flex:0 1 auto; max-width:var(--kb-title-limit); }
.side-header.is-compact .kb-title-label:hover { color:var(--nav-cover-ink, var(--c-accent)); }
.kb-title-stack { position:relative; display:grid; grid-template-columns:minmax(0,1fr); min-width:0; max-width:100%; vertical-align:top; }
.kb-title-size { visibility:hidden; white-space:nowrap; overflow:hidden; }
.kb-title-text { position:absolute; inset:0; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.kb-glyph-swap { display:grid; place-items:center; }
.side-header .brand-logo:hover { box-shadow:none; background:transparent; }
.side-header :is(.brand-logo,.kb-title-label,.icon-btn):focus-visible { outline:2px solid var(--c-focus); outline-offset:-2px; }
.sidebar-actions.is-compact {
  position:relative;
  display:flex;
  align-items:center;
  justify-content:flex-end;
  flex:none;
  width:var(--kb-actions);
  height:32px;
  border-radius:18px;
  corner-shape:var(--corner-ui);
}
.sidebar-actions.is-compact:hover::before,
.sidebar-actions.is-compact.is-revealed::before { background-color:var(--topbar-chip-bg-hover); }
.sidebar-actions.is-compact .sidebar-toggle { width:24px; height:24px; border-radius:var(--radius-item); }
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
  corner-shape:var(--corner-ui);
  background:transparent;
  box-shadow:none;
  color:var(--c-ink);
  opacity:0;
  visibility:hidden;
  pointer-events:none;
  transform-origin:top center;
  transform:translateY(-8px) scale(.96);
  transition:opacity 180ms ease-in-out,transform 300ms var(--motion-pop),visibility 0s linear 180ms,width 200ms cubic-bezier(0,0,.2,1),background 140ms ease,color 140ms ease;
}
.sidebar-actions.is-compact .kb-list-btn::before {
  content:'';
  position:absolute;
  inset:4px 0 0;
  border-radius:18px;
  corner-shape:var(--corner-ui);
  background:var(--topbar-chip-bg-hover);
  -webkit-backdrop-filter:var(--topbar-glass-filter);
  backdrop-filter:var(--topbar-glass-filter);
  box-shadow:var(--topbar-glass-shadow);
}
.sidebar-actions.is-compact .kb-list-btn svg { position:relative; z-index:1; }
.sidebar-actions.is-compact.is-revealed .kb-list-btn,
.side-header.is-compact:has(:focus-visible) .kb-list-btn {
  opacity:1;
  visibility:visible;
  pointer-events:auto;
  transform:translateY(0) scale(1);
  transition:opacity 180ms ease-in-out,transform 300ms var(--motion-pop),visibility 0s,width 200ms cubic-bezier(0,0,.2,1),background 140ms ease,color 140ms ease;
}
.sidebar-actions.is-compact.is-revealed .kb-list-btn:hover {
  transform:translateY(-1px) scale(1);
  transition:opacity 180ms ease-in-out,transform 120ms ease,visibility 0s,width 200ms cubic-bezier(0,0,.2,1),background 140ms ease,color 140ms ease;
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
.batch-bar .batch-delete{color:var(--c-danger,#c8403b)}
@media (hover:none), (pointer:coarse) {
  .batch-bar button,.tree-search-trigger,.tree-sort-control > button,.tree-sort-control .side-menu-item,.tree-menu-item { min-height:44px; }
  .tree-menu { max-height:calc(100dvh - 16px); overflow-y:auto; overscroll-behavior:contain; }
  .batch-bar button,.tree-search-trigger,.tree-sort-control > button { min-width:44px; }
}
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
.tree-sort-control .side-menu { top:calc(100% + 4px); max-height:calc(100dvh - 132px); overflow-y:auto; overscroll-behavior:contain; }
.side-menu-item:is(:hover,:focus-visible) {
  background: var(--c-hover);
  color: var(--c-ink);
}
.side-menu-item.is-on {
  color: var(--c-accent);
}
.side-menu-sep {
  height: 8px;
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
.lib-card-status{display:inline-flex;align-items:center;gap:4px;color:var(--c-sub);white-space:nowrap}
.lib-card-status svg{flex:none;opacity:.85}
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
.transfer-backdrop { position:fixed; inset:0; z-index:90; display:grid; place-items:center; padding:12px; }
.transfer-dialog { width:min(440px,100%); max-height:calc(100dvh - 24px); display:flex; flex-direction:column; gap:12px; overflow:auto; padding:22px; border-radius:var(--radius-surface); background:var(--c-pop); color:var(--c-ink); }
.transfer-dialog header { min-width:0; }
.transfer-dialog h2 { margin:0; font-size:17px; font-weight:600; line-height:1.4; }
.transfer-source { display:flex; flex-direction:column; align-items:start; gap:2px; margin:6px 0 2px; overflow-wrap:anywhere; color:var(--c-text); font-size:13px; line-height:1.45; }
.transfer-source small { font-size:11px; color:var(--c-sub); }
.transfer-library-head { display:flex; align-items:center; flex:none; gap:8px; background:var(--c-field); border-radius:var(--radius-control); padding:0 11px; color:var(--c-sub); }
.transfer-library-head input { min-width:0; width:100%; min-height:36px; background:transparent; outline:0; color:var(--c-ink); font-size:13px; }
.transfer-library-head:focus-within { outline:2px solid var(--c-focus); outline-offset:1px; }
.transfer-library-grid { min-height:44px; }
.transfer-field { display:grid; gap:5px; }
.transfer-field > span { color:var(--c-sub); font-size:12px; }
.transfer-field :deep(.select-menu-trigger) { width:100%; min-height:36px; border:0; gap:8px; }
.transfer-error, .transfer-empty { margin:0; font-size:12px; line-height:1.5; }
.transfer-empty { padding:10px; text-align:center; color:var(--c-sub); }
.transfer-error { color:var(--c-danger); }
.transfer-actions { display:flex; flex:none; align-items:center; justify-content:flex-end; gap:6px; }
.transfer-actions button { min-width:64px; min-height:36px; padding:6px 12px; border-radius:var(--radius-control); font-size:13px; }
.transfer-actions button:first-child:hover { background:var(--c-hover); }
.transfer-actions button:last-child { color:var(--c-on-accent); background:var(--c-accent); }
.transfer-actions button:disabled { opacity:.45; cursor:default; }
@media (pointer:coarse) {
  .transfer-library-head input, .transfer-field :deep(.select-menu-trigger), .transfer-actions button { min-height:44px; }
}
.transfer-backdrop.overlay-enter-active .transfer-dialog,.transfer-backdrop.overlay-leave-active .transfer-dialog{transition:transform var(--motion-enter) var(--motion-ease),opacity var(--motion-enter) ease}
.transfer-backdrop.overlay-enter-from .transfer-dialog,.transfer-backdrop.overlay-leave-to .transfer-dialog{transform:translateY(5px) scale(.975);opacity:0}
@media(max-width:520px){.transfer-dialog{padding:18px}}
@media(max-width:520px){.lib-preview-detail{max-height:calc(100dvh - 130px);margin:0 14px 14px;padding:14px}.lib-preview-actions{flex-wrap:wrap}.lib-preview-actions button{flex:1;white-space:nowrap}}
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
.lib-icon-btn:disabled { pointer-events: none; }
.lib-row-icon { width: 18px; height: 18px; }
.lib-row-body { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; padding-right: 0; transition: padding-right 160ms var(--motion-snap); }
.lib-icon-placeholder { color: var(--c-faint); transition: color 140ms ease; }
.lib-icon-btn:is(:hover,:focus-visible) .lib-icon-placeholder { color: var(--c-ink); }
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
.lib-row-meta { margin-left: auto; flex: none; font-size: 11px; color: var(--c-sub); font-variant-numeric: tabular-nums; }
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
.lib-panel-footer .icon-btn { width:32px; height:32px; color:var(--c-sub); }
@media (pointer:coarse) {
  .lib-panel-footer .icon-btn { width:44px; height:44px; }
}
.lib-panel-footer .icon-btn:hover, .lib-panel-footer .icon-btn[aria-current="page"] { opacity: 1; }
.lib-panel-footer .icon-btn[aria-current="page"] { background: var(--c-active); }
@media (max-width:820px) { .lib-panel.is-gallery-nav { display:none; } }
.lib-create-toggle svg { transition: transform 180ms var(--motion-pop); }
.lib-create-toggle.is-open svg { transform: rotate(45deg); }
.sidebar-chevron { display:block; flex-shrink:0; }
:is(.lib-panel-head .icon-btn,.lib-panel-footer .icon-btn,.lib-row-actions .icon-btn,.lib-manager-card-more):focus-visible {
  outline: none;
  background: var(--c-hover);
  color: var(--c-ink);
}
@media (max-width: 820px) and (hover: none) {
  .lib-row-body { padding-right: var(--lib-row-actions-pad, 44px); }
  .lib-row-actions { opacity: 1; pointer-events: auto; transform: translateY(-50%); }
}
</style>

<style scoped>
@media screen and (max-width:520px) {
  .app-sidebar > aside { transition:none; }
  .app-sidebar.is-browsing-files, .app-sidebar.is-browsing-files > aside { width:100% !important; }
  .app-sidebar.is-browsing-files > aside { border-right:0; }
  .file-nav-resize { display:none; }
  .side-header:not(.is-compact) .sidebar-actions { width:auto !important; }
  .side-header:not(.is-compact) .sidebar-actions .icon-btn { width:44px; height:44px; }
  .side-header.is-compact .sidebar-toggle::after { content:''; position:absolute; inset:-10px -4px; }
}
@media screen and (max-width:720px) {
  .kb-header-rail { --kb-title-limit:clamp(32px,calc(100vw - 326px),140px); }
}
@media screen and (max-width:380px) {
  .side-header:is(.is-compact,.is-collapsing) .kb-title-wrap, .kb-reserve-title { display:none; }
  .side-header.is-compact .sidebar-actions:not(.is-revealed) .kb-list-btn { visibility:hidden; opacity:0; pointer-events:none; }
}
</style>
<style scoped src="../styles/drawer-browser.css"></style>
