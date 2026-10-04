<template>
  <!--
    桌面端横向排知识库栏与文档树；手机端知识库列表改为弹窗。
  -->
  <div class="flex h-screen flex-shrink-0">
    <!-- 手机端切换列表才用遮罩；桌面保留并排的知识库列表。 -->
    <transition name="lib-backdrop">
      <button
        v-if="libPanel.open && isMobileLibView()"
        class="lib-modal-backdrop"
        aria-label="关闭知识库弹窗"
        @click="closeLibPanel"
      />
    </transition>
    <!-- 快速切换列表，顺序由用户选择。 -->
    <transition name="lib-panel">
      <aside
        v-if="libPanel.open"
        class="lib-panel"
        :style="{ '--lib-w': libWidth + 'px' }"
        aria-label="知识库列表"
        @click.stop="onLibPanelClick"
      >
        <div class="lib-panel-head">
          <span class="lib-panel-title">知识库</span>
          <span class="lib-panel-head-acts">
            <button v-if="!isGuest" class="icon-btn" title="新建知识库" @click.stop="createLib">
              <PhPlus :size="14" />
            </button>
            <button class="icon-btn" title="关闭知识库" aria-label="关闭知识库" @click="closeLibPanel">
              <PhCaretDoubleLeft :size="15" class="lib-close-desktop" />
              <PhX :size="15" class="lib-close-mobile" />
            </button>
          </span>
        </div>

        <input ref="libIconInput" type="file" accept="image/*" class="hidden" @change="onPickLibIcon" />

        <div class="lib-panel-sort">
          <SelectMenu v-model="libSort" :options="libSortOptions" label="知识库排序" />
          <button class="lib-browse-entry" :title="isGuest ? '浏览知识库' : '管理知识库'" @click="openManager"><PhSquaresFour :size="16" weight="fill" /><span>浏览全部</span></button>
        </div>

        <div class="lib-panel-resize" title="拖动调整知识库栏宽度" @pointerdown.stop="startLibResize" />

        <div class="lib-panel-list">
          <div
            v-for="lib in displayedLibs"
            :key="lib.path"
            class="lib-row"
            :class="{ 'is-current': isCurrentLib(lib), 'is-draft': lib.name === '草稿' }"
          >
            <!-- 每个知识库用自己的图标 -->
            <button class="lib-icon-edit" :disabled="isGuest" title="更换知识库图标" @click.stop="pickLibIcon(lib, $event)"><ContentIcon class="lib-row-icon" :value="lib.icon || siteIcon" /></button>


            <button class="lib-row-name" :title="isGuest ? lib.name + '（' + (store.canEdit(lib) ? '可编辑' : '只读') + '）' : lib.name" @click="goLib(lib)">
              <input
                v-if="!isGuest && renaming === lib.name"
                ref="renameInput"
                class="lib-row-input"
                :value="renameText"
                spellcheck="false"
                @click.stop
                @input="renameText = $event.target.value"
                @keydown.enter.prevent="commitRename(lib)"
                @keydown.esc.stop.prevent="cancelRename"
                @blur="commitRename(lib)"
              />
              <template v-else>
                <span class="lib-row-text">{{ lib.name }}</span>
                <span class="lib-row-meta">{{ lib.docs }} 篇</span>
              </template>
            </button>
            <button v-if="!isGuest" class="icon-btn xs lib-pin" :title="pinnedLibs.includes(lib.name) ? '取消置顶' : '置顶知识库'" :aria-label="pinnedLibs.includes(lib.name) ? '取消置顶' : '置顶知识库'" @click.stop="togglePin(lib.name)"><PhPushPin :size="15" :weight="pinnedLibs.includes(lib.name) ? 'fill' : 'regular'" /></button>

            <!-- 与侧边栏一致：悬停出现三个点，操作收进菜单 -->
            <button
              v-if="!isGuest && lib.name !== '草稿'"
              class="icon-btn xs acts-btn"
              title="更多操作"
              @click.stop="openLibMenu(lib, $event)"
            >
              <PhDotsThree :size="16" weight="bold" />
            </button>
          </div>
        </div>
        <div class="lib-panel-footer">
          <button v-if="!isGuest" class="lib-manager-entry" @click="openPublicPreview"><PhEye :size="17" weight="fill" />查看访客视角</button>
        </div>
      </aside>
    </transition>

    <PublicSharing v-if="publicSharingOpen && !isGuest" @close="publicSharingOpen=false" />
    <Teleport to="body">
      <transition name="lib-backdrop"><button v-if="managerOpen" class="lib-manager-backdrop" :aria-label="managerSection === 'previews' ? '关闭工作区浏览记录' : '关闭知识库管理'" @click="managerOpen=false" /></transition>
      <transition name="lib-manager">
        <section ref="managerDialog" tabindex="-1" v-if="managerOpen" class="lib-manager" role="dialog" aria-modal="true" :aria-label="managerSection === 'previews' ? '工作区浏览记录' : isGuest ? '浏览知识库' : '管理知识库'">
          <header class="lib-manager-head"><div class="lib-manager-navigation"><button v-if="managerSection === 'previews' && selectedPreview" class="lib-manager-back" title="返回工作区浏览记录" aria-label="返回工作区浏览记录" @click="selectedPreview=null"><PhArrowLeft :size="18" /></button><h2>{{ selectedPreview ? selectedPreview.title : managerSection === 'previews' ? previewArchived ? '已归档' : '工作区浏览记录' : '知识库' }}</h2></div><span class="lib-manager-head-actions"><button v-if="managerSection==='libs' && !isGuest" class="icon-btn" aria-label="新建知识库" @click="createLib"><PhPlus :size="18" /></button><button v-if="managerSection === 'previews' && !selectedPreview" @click="togglePreviewArchive">{{ previewArchived ? '浏览记录' : '已归档' }}</button><button class="icon-btn" :aria-label="managerSection === 'previews' ? '关闭工作区浏览记录' : '关闭知识库管理'" @click="managerOpen=false"><PhX :size="18" /></button></span></header>
          <p v-if="managerSection === 'libs' && !isGuest && libPanel.libs.every(lib => !lib.docs)" class="library-welcome">把值得保留的工作资料收录到知识库，也可以直接新建文档。</p>
          <div v-if="managerSection === 'libs' || managerSection === 'previews' && !selectedPreview" class="lib-manager-tools">
            <div class="lib-manager-search-row">
              <input v-if="managerSection === 'libs'" v-model.trim="libQuery" type="search" placeholder="搜索知识库" aria-label="搜索知识库" autofocus />
              <input v-else v-model.trim="previewQuery" type="search" placeholder="搜索浏览记录" aria-label="搜索工作区浏览记录" />
              <SelectMenu v-if="managerSection === 'libs'" v-model="libSort" :options="libSortOptions" label="知识库排序" />
            </div>
            <div v-if="managerSection === 'libs' && !isGuest" class="lib-manager-filter-row">
              <div class="lib-manager-filters" role="group" aria-label="筛选知识库">
                <button v-for="filter in [{value:'all',label:'全部'},{value:'public',label:'公开'},{value:'private',label:'未公开'},{value:'locked',label:'访客只读'}]" :key="filter.value" :class="{ 'is-on': managerFilter === filter.value }" :aria-pressed="managerFilter === filter.value" @click="managerFilter=filter.value">{{ filter.label }}</button>
              </div>
            </div>
          </div>
          <div v-if="managerSection === 'libs'" class="lib-manager-grid">
            <div v-for="lib in managerLibs" :key="lib.path" class="lib-manager-card" :class="{ 'is-current': isCurrentLib(lib), 'is-draft': lib.name === '草稿' }">
              <button class="lib-manager-card-main" @click="goLib(lib); managerOpen=false"><ContentIcon :value="lib.icon || siteIcon" class="lib-manager-icon" /><strong>{{ lib.name }}</strong><span class="lib-card-meta"><span>{{ lib.docs }} 篇</span><span class="lib-card-status"><component :is="isGuest ? store.canEdit(lib) ? PhPencilSimple : PhLock : lib.shared ? lib.locked ? PhLock : PhPencilSimple : PhEyeSlash" :size="13" weight="regular" />{{ isGuest ? store.canEdit(lib) ? '可编辑' : '只读' : lib.shared ? lib.locked ? '公开只读' : '公开可编辑' : '未公开' }}</span></span></button>
              <button v-if="!isGuest && lib.name !== '草稿'" class="lib-manager-card-more icon-btn xs" :aria-label="lib.name + '的更多操作'" @click.stop="openLibMenu(lib, $event)"><PhDotsThree :size="17" weight="bold" /></button>
            </div>
            <p v-if="!managerLibs.length" class="lib-empty">没有匹配的知识库</p>
          </div>
          <footer v-if="managerSection === 'libs' && !isGuest" class="lib-manager-footer"><button @click="managerOpen=false;publicSharingOpen=true"><PhEye :size="16" weight="fill" />分享只读副本</button><button title="允许 Agent 访问指定知识库" @click="managerOpen=false;agentSettings=true"><PhUserCircle :size="16" weight="fill" />Agent 访问</button></footer>
          <div v-if="managerSection === 'previews'" class="lib-manager-previews">
            <div v-if="!selectedPreview" class="preview-list">
              <div v-for="item in filteredPreviews" :key="item.id" class="preview-list-row">
                <button class="preview-list-main" @click="selectPreview(item.id)"><PhFileText :size="19" weight="fill" /><span><strong>{{ item.title }}</strong><small>{{ item.sourceState === 'missing' ? '来源已失效' : item.sourceState === 'changed' ? '源文件已更新' : new Date(item.updated).toLocaleString('zh-CN') }}</small></span></button>
                <div class="preview-list-actions">
                  <button v-if="fileManagerAvailable()" :disabled="!canRevealItem(item)" :title="canRevealItem(item) ? fileManagerLabel() : '原文件位置尚未记录，请在 DSH 中重新打开'" @click="showPreviewInFileManager(item)"><PhFolderSimple :size="15" />{{ fileManagerLabel() }}</button>
                  <button v-else-if="canResolvePreviewInDsh(item)" @click="openPreviewInDsh(item)"><PhFolderSimple :size="15" />在 DSH 打开</button>
                  <button :disabled="item.incomplete" :title="item.incomplete ? '部分图片未加载，请在 DSH 中重新打开' : '收录副本'" @click="collectPreviewFromList(item)">收录副本</button>
                </div>
              </div>
              <p v-if="previewActionError" class="transfer-error" role="alert">{{ previewActionError }}</p>
              <p v-if="!filteredPreviews.length" class="lib-empty">{{ previewQuery ? '没有匹配的记录' : previewArchived ? '没有归档记录' : '还没有浏览记录' }}</p>
            </div>
            <div v-if="selectedPreview" class="lib-preview-detail"><div class="lib-preview-detail-head"><span>{{ selectedPreview.incomplete ? '部分图片未加载' : selectedPreview.sourceState === 'missing' ? '来源已失效' : selectedPreview.sourceState === 'changed' ? '源文件已更新' : '来自工作区' }}</span></div><p class="lib-preview-source" :title="selectedPreview.reference">{{ previewSourceLabel(selectedPreview.reference) }}</p><div class="lib-preview-body" v-html="selectedPreviewHtml" @click="onPreviewLink" /><p v-if="previewActionError" class="transfer-error" role="alert">{{ previewActionError }}</p><div class="lib-preview-actions"><button v-if="fileManagerAvailable()" :disabled="!canRevealPreview" :title="canRevealPreview ? fileManagerLabel() : '原文件位置尚未记录，请在 DSH 中重新打开'" @click="showPreviewInFileManager()"><PhFolderSimple :size="14" />{{ fileManagerLabel() }}</button><button v-else-if="canOpenPreviewInDsh" @click="openPreviewInDsh()"><PhFolderSimple :size="14" />在 DSH 打开原文件</button><button @click="archivePreview(selectedPreview.id, !previewArchived)">{{ previewArchived ? '移回记录' : '归档' }}</button><button :disabled="selectedPreview.incomplete" @click="openTransfer('collect','preview',selectedPreview.id)">收录副本</button></div></div>
          </div>
        </section>
      </transition>
    </Teleport>

    <Teleport to="body">
      <Transition name="overlay" appear><div v-if="transfer.open" class="transfer-backdrop" @click.self="transfer.open=false">
        <section ref="transferDialog" tabindex="-1" class="transfer-dialog" role="dialog" aria-modal="true" :aria-label="transfer.mode === 'collect' ? '收录副本' : transfer.mode === 'copy' ? '复制到知识库' : '移动到知识库'">
          <h2>{{ transfer.mode === 'collect' ? '收录副本' : transfer.mode === 'copy' ? '复制到知识库' : '移动到知识库' }}</h2>
          <p class="transfer-source">{{ transfer.mode === 'collect' ? selectedPreview?.title : transfer.path }}</p>
          <label v-if="transfer.mode === 'collect'">文档名称<input v-model="transfer.name" maxlength="160" /></label>
          <div class="transfer-library-head"><span>目标知识库</span><input v-model.trim="transferSearch" type="search" placeholder="搜索知识库" aria-label="搜索目标知识库" /></div>
          <div class="transfer-library-grid" role="group" aria-label="选择目标知识库">
            <button v-for="lib in transferLibs" :key="lib.name" type="button" :class="{ 'is-on': transfer.lib === lib.name, 'is-draft': lib.name === '草稿' }" :aria-pressed="transfer.lib === lib.name" @click="onTransferLibSelect(lib.name)"><ContentIcon :value="lib.icon || siteIcon" :size="20" /><span>{{ lib.name }}</span><small>{{ lib.docs }} 篇</small></button>
            <p v-if="!transferLibs.length" class="lib-empty">没有匹配的知识库</p>
          </div>
          <div v-if="transfer.lib && transfer.folders.length > 1" class="transfer-field"><span>目标位置</span><SelectMenu v-model="transfer.dir" :options="transfer.folders.map(folder => ({ value: folder.path, label: folder.label }))" label="目标位置" /></div>
          <p v-if="transfer.error" class="transfer-error" role="alert">{{ transfer.error }}</p>
          <div class="transfer-actions"><button @click="transfer.open=false">{{ transfer.mode === 'collect' ? '返回预览' : '取消' }}</button><button :disabled="transfer.busy || !transfer.dir" @click="confirmTransfer">{{ transfer.busy ? '处理中…' : transfer.mode === 'collect' ? '收录副本' : '确定' }}</button></div>
        </section>
      </div></Transition>
    </Teleport>
    <Teleport to="body"><Transition name="pop"><div v-if="transferToast.message" class="transfer-toast" role="status"><span>{{ transferToast.message }}</span><button @click="viewTransferResult">查看</button><button aria-label="关闭提示" @click="transferToast.message=''">×</button></div></Transition></Teleport>

    <!--
      收起与展开是同一个 aside，宽度做过渡。
      原来是 v-if / v-else 两个 aside，切换时整个节点被替换，宽度是硬跳的，
      跟右边目录的 transition: width 也不一致。
    -->
    <aside
    class="h-screen flex flex-col flex-shrink-0 bg-[var(--c-panel)] border-r border-[var(--c-line)] select-none z-30 relative overflow-hidden transition-[width] duration-[220ms] ease-out"
    :class="{ 'is-reader-rail': collapsed }"
    :style="{ width: (collapsed ? 44 : width) + 'px' }"
  >
    <!--
      收起态：只留图标本身，不再另给一条竖向工具条。
      展开入口不靠专门的按钮 —— 点图标、点检索、点下面任一目录都能展开并进入，
      所以那条竖着的展开/收起图标是多余的。
      也不放"新建文档"：收起时本来就不是干活的状态。
    -->
    <div v-if="collapsed" class="reader-rail">
      <button class="brand-logo sm" title="展开侧栏" @click.stop="onRailLogo"><ContentIcon :value="logo" /></button>
      <RailToc />
    </div>

    <!-- 展开态 -->
    <template v-else>
      <!--
        品牌：标题两行可以直接改，图标点一下换。
        图标缩到 96px 存成 data URL 放 localStorage——原图动辄几百 KB，
        整个塞进去会撑爆配额，而且侧栏里只显示 22px，没必要留原图。
      -->
      <div class="px-4 pt-5 pb-3 flex items-start gap-2.5 shrink-0">
        <button class="brand-logo" title="打开知识库" @click.stop="openLibPanel">
          <ContentIcon :value="logo" />
        </button>
        <div class="min-w-0 flex-1">
          <input
            v-for="(line, i) in brandLines"
            :key="i"
            v-model="brandLines[i]"
            class="brand-line brand-input"
            :class="i === 0 ? 'is-title' : 'is-sub'"
            spellcheck="false"
            :readonly="isGuest || !currentLibEditable"
            :title="isGuest ? '' : '编辑阅读器名称'"
            @keydown.enter.prevent="$event.target.blur()"
            @change="onBrandEdited(i, $event.target.value)"
          />
        </div>
        <!--
          展开知识库：放在收起按钮左边，与它同尺寸同排。
          当前是哪个库、共有几个，走 tooltip 提示，不占版面。
        -->
        <button
          class="icon-btn"
          :title="'知识库：' + (currentLib || '未选择') + '（共 ' + libPanel.libs.length + ' 个）'"
          @click.stop="libPanel.open ? (libPanel.open = false) : openLibPanel()"
        >
          <PhStack :size="16" :weight="libPanel.open ? 'fill' : 'regular'" />
        </button>
        <!--
          收起侧栏时把知识库面板一起收掉。
          两栏各管各的开合是一开始的想法，但收起了侧栏、左边却还杵着一个面板，
          看着就是没收干净 —— 收起是"把这块收掉"的意思，范围该覆盖整块。
        -->
        <button class="icon-btn -mr-1" title="收起侧栏" @click.stop="collapseAllUI">
          <PhSidebarSimple :size="16" />
        </button>
      </div>

    <!-- 新建文档（新建目录在下面工具条那一排的文件夹按钮，不重复放） -->
    <div v-if="currentLibEditable" class="px-3 pt-2 pb-3">
      <button
        class="newdoc-btn w-full h-9 flex items-center justify-center gap-1.5 ui-round-control text-[13px] text-[var(--c-ink)]"
        title="在根目录新建文档"
        @click="emit('create-doc', currentLib || '')"
      >
        <PhPlus :size="13" weight="bold" />
        新建文档
      </button>
    </div>

    <!-- 工具条 -->
    <div class="px-3 pb-2 flex items-center gap-0.5 shrink-0">
      <span class="toolbar-label">文档</span>
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
        <button v-if="!isGuest" class="icon-btn" title="重新读取文件" @click="rescan">
          <PhArrowClockwise :size="15" />
        </button>
        <button v-if="currentLibEditable" class="icon-btn" title="新建分类" @click="emit('create-category', currentLib || '')">
          <PhFolderSimplePlus :size="16" />
        </button>
      </span>
    </div>

    <!-- 筛选框 -->
    <transition name="slide-fade">
      <div v-if="searchOpen" class="px-3 pb-2 shrink-0">
        <input
          ref="searchEl"
          v-model="query"
          class="w-full h-7 px-2.5 ui-round-control bg-[var(--c-field)] border border-[var(--c-line)] text-[12.5px] outline-none focus:border-[var(--color-ds)]/50 transition-colors"
          placeholder="搜索文档名或路径"
          @keydown.esc="closeSearch"
        />
      </div>
    </transition>

    <!-- 树里那个…的菜单：teleport 出去，免得被侧栏的滚动裁掉 -->
    <Teleport to="body">
      <Transition name="pop">
      <div v-if="tree.menu.open" class="tree-menu" :style="tree.menu.style">
        <button
          v-for="it in menuItems"
          :key="it.id"
          class="tree-menu-item"
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
      class="flex-1 min-h-0 overflow-y-auto no-scrollbar px-2.5 pb-4 pt-0.5"
      @dragover="tree.overRoot($event)"
      @drop.prevent="tree.drop()"
    >
      <template v-if="groupMode === 'tree'">
        <DocTree
          :nodes="nodes"
          :parent="currentLib || ''"
          :current-path="currentPath"
          :collapsed="collapsedCats"
          :query="query"
          :sort-mode="sortMode"
          @select="emit('select', $event)"
          @create-doc="emit('create-doc', $event)"
          @create-category="emit('create-category', $event)"
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
          :class="{ 'is-on': doc.file === currentPath }"
          :draggable="store.canEdit(doc)"
          @dragstart="tree.start(doc, $event)"
          @dragover="tree.overRow(doc, $event)"
          @drop.prevent="tree.drop()"
          @dragend="tree.end()"
          @click="emit('select', doc.file)"
        >
          <button class="doc-title" :title="isGuest ? doc.name + '（' + (store.canEdit(doc) ? '可编辑' : '只读') + '）' : doc.file"><ContentIcon v-if="doc.meta?.icon" :value="doc.meta.icon" :size="14" />
            <span class="truncate">{{ doc.name }}</span>
            <span v-if="doc.dir" class="doc-dir">{{ doc.dir }}</span>
          </button>
          <button v-if="!isGuest" class="icon-btn xs acts-btn" title="更多操作" @click.stop="tree.openMenu('file', doc, $event)"><PhDotsThree :size="16" /></button>
        </div>
        <p v-if="!visibleCount" class="text-[12px] text-[var(--c-faint)] px-3 py-3 text-center">
          {{ query ? '没有匹配的文档' : '还没有文档' }}
        </p>
      </template>

      </nav>
      <div v-if="!isGuest" class="workspace-history-footer">
        <button class="workspace-history-link" title="在 DSH 用阅读器打开过的 Markdown" @click="openPreviews"><PhClockCounterClockwise :size="17" /><span>工作区浏览记录</span></button>
        <button class="workspace-history-link" @click="recoveryOpen=true"><PhTrash :size="17"/><span>恢复与备份</span></button>
      </div>
    </template>
    </aside>

    <RecoveryPanel :open="recoveryOpen" @close="recoveryOpen=false" @restored="onRecovered" />
    <AgentSettings v-if="agentSettings" :library="currentLib" @close="agentSettings=false" />
    <IconPicker v-if="iconPicking" :save="saveLibIcon" :anchor="libIconAnchor" @close="iconPicking=false" />
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
import SelectMenu from './SelectMenu.vue'
import PublicSharing from './PublicSharing.vue'
import {setFavicon} from '../utils/favicon'

import AgentSettings from './AgentSettings.vue'
import RecoveryPanel from './RecoveryPanel.vue'
import ContentIcon from './ContentIcon.vue'
import IconPicker from './IconPicker.vue'
import { resizePanel } from '../utils/panel-resize'
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, reactive, provide } from 'vue'
// 菜单里的图标：树的操作、分组与排序
import {
  PhSidebarSimple, PhPlus, PhMagnifyingGlass, PhSlidersHorizontal, PhFolderSimple,
  PhSquaresFour, PhUserCircle, PhCaretDoubleRight, PhCheck, PhFolderSimplePlus, PhArrowClockwise,
  PhFilePlus, PhPencilSimple, PhTrash, PhListDashes, PhSortAscending, PhClockCounterClockwise,
  PhLock, PhLockOpen, PhEye, PhEyeSlash, PhImage, PhStack, PhCaretLeft, PhCaretRight,
  PhCaretDown, PhCaretDoubleLeft, PhX, PhHandGrabbing, PhDotsThree, PhPushPin, PhCopy, PhArrowRight, PhArrowLeft, PhFileText
} from '@phosphor-icons/vue'
import {useDialogFocus} from '../composables/useDialogFocus'
import {useWorkspaceHistory} from '../composables/useWorkspaceHistory'
import RailToc from './RailToc.vue'
import { useDocsStore } from '../stores/docs'
import DocTree from './DocTree.vue'
import AppDialog from './AppDialog.vue'
import { API_BASE } from '../utils/api'
import { fileManagerAvailable, fileManagerLabel, revealInFileManager } from '../utils/reveal'
const props = defineProps({
  nodes: { type: Array, required: true },
  currentPath: { type: String, default: '' },
  width: { type: Number, default: 236 },
  collapsed: { type: Boolean, default: false }
})
const emit = defineEmits([
  'select', 'create-doc', 'delete-doc',
  'create-category', 'delete-category', 'toggle-collapse', 'update:width'
])

/* ---------- 品牌：标题与图标 ---------- */

const store = useDocsStore()
/** 访客（分享链接进来的人）：新建、改名、删除这些入口一律不显示 */
const isGuest = computed(() => store.isGuest)
const canRevealInFinder = computed(() => !isGuest.value && fileManagerAvailable())
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
 * 品牌来自构建时注入的 VITE_BRAND（形如第一行|第二行），
 * 与 VITE_BASE 一个机制 —— 每个实例构建自己的那一份，不依赖运行时环境变量，
 * 也不经过 localStorage（同域名下两个站点共用一个存储，写回就会串味）。
 */
/*
 * 标题两行。
 *
 * 第一行不是一份独立数据 —— 它就是"当前知识库的名字"，真源在服务端的注册表里
 * （.知识库.json）。这里只是一份显示副本，改它等于改库名（改名会同步重命名文件夹）。
 * 第二行是副标题，纯粹给人看的，不参与任何同步。
 *
 * 以前这两行存在 localStorage 里，和目录名、注册表各存一份，
 * 于是"改了标题目录不动、改了目录标题不动"——那才是根子上的病。
 */
/* 副标题的兜底：某个库没写 sub 时用它 */
const FALLBACK_SUB = String(import.meta.env.VITE_BRAND || '').split('|')[1] || ''
const brandLines = ref(['', FALLBACK_SUB])

const libIconInput = ref(null)

/* ---------- 知识库面板：列出所有库，可切换 / 改名 / 换图标 / 管可见性 ---------- */

const libPanel = reactive({ open: false, libs: [], busy: '' })
const managerOpen = ref(false)
const managerSection = ref('libs')
const {tempPreviews,previewQuery,filteredPreviews,selectedPreview,previewActionError,previewArchived,canResolvePreviewInDsh,canRevealItem,canRevealPreview,canOpenPreviewInDsh,selectedPreviewHtml,previewSourceLabel,onPreviewLink,loadPreviews,openPreviews,togglePreviewArchive,selectPreview,collectPreviewFromList,showPreviewInFileManager,openPreviewInDsh,archivePreview}=useWorkspaceHistory({store,libPanel,managerOpen,managerSection,openTransfer})
const libQuery = ref('')
const managerFilter = ref('all')
const transferSearch = ref('')
const transfer = reactive({ open: false, mode: 'copy', kind: 'doc', path: '', name: '', lib: '', dir: '', folders: [], busy: false, error: '' })
const managerDialog = ref(null), transferDialog = ref(null)
useDialogFocus(managerOpen, managerDialog, () => { if(selectedPreview.value) selectedPreview.value=null; else managerOpen.value=false })
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
  transfer.name = mode === 'collect' ? selectedPreview.value?.title.replace(/\.(md|markdown)$/i, '') || '' : ''
  transfer.error = ''
  transferSearch.value = ''
  if (!libPanel.libs.length) await loadLibs()
  if (!libPanel.libs.length) { store.error = '知识库读取失败，请稍后重试'; return }
  transfer.lib = ''
  transfer.dir = ''
  transfer.folders = []
  if (mode !== 'collect') managerOpen.value = false
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
    if (mode === 'collect') {
      const response = await fetch(API_BASE + '/api/collect-workspace-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: source, dir, name: transfer.name }) })
      const json = await response.json()
      if (!json.ok) throw Error(json.error || '收录失败')
      result = json.data
      selectedPreview.value = null
      await loadPreviews()
    } else if (kind === 'folder') {
      result = mode === 'copy' ? await store.copyCategory(source, dir) : await store.moveCategory(source, dir)
    } else result = mode === 'copy' ? await store.copyDoc(source, dir) : await store.moveDoc(source, dir)
    transfer.open = false
    await loadLibs()
    const targetLib = dir.split('/')[0]
    if (mode === 'collect') {
      managerOpen.value = false
      await goLib({ name: targetLib, path: targetLib })
      await store.loadTree()
      if (result?.file) await store.select(result.file)
      if (isMobileLibView() && !props.collapsed) emit('toggle-collapse')
    } else if (mode === 'move' && targetLib !== currentLib.value) {
      await goLib({ name: targetLib, path: targetLib })
      await store.loadTree()
      if (result?.file) await store.select(result.file)
      if (isMobileLibView() && !props.collapsed) emit('toggle-collapse')
    } else {
      transferToast.message = mode === 'collect' ? '已收录到 ' + dir : mode === 'copy' ? '已复制到 ' + dir : '已移动到 ' + dir
      transferToast.lib = targetLib
      transferToast.file = result?.file || ''
    }
  } catch (error) { transfer.error = String(error.message || error) }
  finally { transfer.busy = false }
}
const publicSharingOpen = ref(false)
const libSortOptions = [{value:'recent',label:'最近打开'},{value:'name',label:'名称'},{value:'modified',label:'最近修改'}]
const libSort = ref('recent')
const libWidth = ref(236)
// 访客浏览记录不能改变管理者下次打开阅读器时的落点。
const LIB_PREFS_KEY = 'reader.library-switcher:' + API_BASE + (isGuest.value ? ':guest' : '')
function readLibPrefs() {
  try { return JSON.parse(localStorage.getItem(LIB_PREFS_KEY) || '{}') } catch { return {} }
}
const recentNames = ref(Array.isArray(readLibPrefs().recent) ? readLibPrefs().recent : [])
const pinnedLibs = ref(Array.isArray(readLibPrefs().pinned) ? readLibPrefs().pinned : [])
if (['recent', 'name', 'modified'].includes(readLibPrefs().sort)) libSort.value = readLibPrefs().sort
function saveLibPrefs() {
  localStorage.setItem(LIB_PREFS_KEY, JSON.stringify({ recent: recentNames.value.slice(0, 30), pinned: pinnedLibs.value, sort: libSort.value }))
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
const displayedLibs = computed(() => {
  const list = [...libPanel.libs]
  list.sort((a, b) => {
    if (a.name === '草稿' || b.name === '草稿') return a.name === '草稿' ? -1 : 1
    const pin = Number(pinnedLibs.value.includes(b.name)) - Number(pinnedLibs.value.includes(a.name))
    if (pin) return pin
    if (libSort.value === 'modified') return (b.mtime || 0) - (a.mtime || 0) || a.name.localeCompare(b.name, 'zh-CN')
    if (libSort.value === 'recent') return (recentNames.value.indexOf(a.name) < 0 ? 999 : recentNames.value.indexOf(a.name)) - (recentNames.value.indexOf(b.name) < 0 ? 999 : recentNames.value.indexOf(b.name)) || a.name.localeCompare(b.name, 'zh-CN')
    return a.name.localeCompare(b.name, 'zh-CN')
  })
  return list
})
const transferLibs = computed(() => {
  const q = transferSearch.value.trim().toLocaleLowerCase()
  return displayedLibs.value.filter(lib => !q || lib.name.toLocaleLowerCase().includes(q))
})
const managerLibs = computed(() => {
  const q = libQuery.value.trim().toLocaleLowerCase()
  return displayedLibs.value.filter(l =>
    (!q || l.name.toLocaleLowerCase().includes(q) || String(l.desc || '').toLocaleLowerCase().includes(q)) &&
    (managerFilter.value === 'all' || managerFilter.value === 'public' && l.shared !== false || managerFilter.value === 'private' && l.shared === false || managerFilter.value === 'locked' && l.locked)
  )
})

/** 当前所在的知识库：文档根的名字（每个实例一个根，所以直接问服务端） */
/** 当前库的完整信息（图标、说明），从注册表同步过来 */
const currentLibIcon = ref('')

const currentLib = ref(
  (() => {
    try {
      const lib = String(new URLSearchParams(location.search).get('lib') || '').trim()
      return lib === '业务面' ? '面试准备' : lib
    } catch {
      return ''
    }
  })()
)

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
  brandLines.value[0] = lib.name
  /* 副标题也按库走：每个知识库各说各的，不再共用主库那一句 */
  brandLines.value[1] = lib.sub || FALLBACK_SUB
  currentLibIcon.value = lib.icon || ''
  /*
   * 浏览器标签页也跟着走：标题换成当前知识库名，图标换成它的 icon。
   * 切库之后标签页还挂着上一个库的名字，等于对外显示错了身份。
   */
  document.title = lib.name

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

async function createLib() {
  askLibDialog({
    title: '新建知识库',
    message: '',
    placeholder: '知识库名字',
    confirmText: '新建',
    onConfirm: (value) => { closeLibDialog(); doCreateLib(value) }
  })
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
    const made = libPanel.libs.find((l) => l.name === to)
    if (made) { await goLib(made); managerOpen.value=false }
  } catch (e) {
    window.alert(String(e.message || e))
  } finally {
    creatingLib.value = false
  }
}

/*
 * 收起态点图标只展开文档侧栏；展开态的品牌图标才打开知识库栏。
 */
/** 收起整个左区：知识库面板 + 文档栏 */
function collapseAllUI() {
  libPanel.open = false
  emit('toggle-collapse')
}

function onRailLogo() {
  if (props.collapsed) emit('toggle-collapse')
}

const isMobileLibView = () => window.matchMedia('(max-width: 820px)').matches

function closeLibPanel() {
  libPanel.open = false
  if (tree.menu.open) tree.closeMenu()
}

function openLibPanel() {
  libPanel.open = true
  loadLibs()
}
function openManager() {
  window.dispatchEvent(new Event('reader-overlay-open'))
  libPanel.open = false
  managerSection.value = 'libs'
  managerOpen.value = true
  libQuery.value = ''
  managerFilter.value = 'all'
  loadLibs()
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
    return lib.name === brandLines.value[0]
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
async function goLib(lib) {
  if (!lib) return
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
function openLibMenu(lib, ev) {
  tree.openMenu('lib', { name: lib.name, path: lib.path, docs: lib.docs, shared: lib.shared, locked: lib.locked, lockedAt: lib.lockedAt }, ev)
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
    throw new Error(store.error || '保存失败，未改名知识库')
  }
  libPanel.busy = from
  try {
    const data=await store.renameLibrary(from,to)
    libPanel.libs=data.libs||[]
    if(active)currentLib.value=to
    applyCurrentLib()
  } finally {
    libPanel.busy = ''
  }
}

/** 提交改名：服务端重命名文件夹，并把分享状态与图标表一起搬走 */
async function commitRename(lib) {
  const to = String(renameText.value || '').trim()
  const from = lib.name
  if (renaming.value !== from) return
  renaming.value = ''
  if (!to || to === from) return
  try {
    await renameLib(from, to)
  } catch (e) {
    window.alert(String(e.message || e))
  }
}

/** 标题第一行改库名，第二行保存为该库的副标题。 */
async function onBrandEdited(i, value) {
  const v = String(value || '').trim()
  if (i === 1) {
    if (!currentLib.value) return
    try {
      const res = await fetch(API_BASE + '/api/lib/meta', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: currentLib.value, sub: v })
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || '副标题保存失败')
      libPanel.libs = data.data.libs || []
      applyCurrentLib()
    } catch (e) {
      applyCurrentLib()
      window.alert(String(e.message || e))
    }
    return
  }
  if (i !== 0) return
  if (!v || v === currentLib.value) {
    brandLines.value[0] = currentLib.value
    return
  }
  try {
    await renameLib(currentLib.value, v)
  } catch (e) {
    brandLines.value[0] = currentLib.value
    window.alert(String(e.message || e))
  }
}

/** 换某个知识库的图标 */
const recoveryOpen=ref(false)
async function onRecovered(){await loadLibs();await store.loadTree()}
const agentSettings=ref(false), iconPicking=ref(false)
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
      throw new Error(store.error || '保存失败，未删除知识库')
    }
    const res = await fetch(API_BASE + '/api/lib', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: lib.name })
    })
    const data = await res.json()
    if (!data.ok) throw new Error(data.error || '删除失败')
    libPanel.libs = data.data.libs || []
    /* 删的是当前库：换到第一个剩下的库 */
    if (lib.name === currentLib.value) {
      const first = libPanel.libs[0]
      if (first) await goLib(first)
    }
  } catch (e) {
    window.alert(String(e.message || e))
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
      store.switchLib()
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
 * 自己换过的图标。
 *
 * 键名按实例分开：两个站点同域名、localStorage 共享 ——
 * 共用一个键的话，主站存了虎鲸，示例库也会读出来那只虎鲸，把示例库自己的图标压掉。
 * 键名与品牌一样用构建时注入，不依赖运行时环境变量。
 */
const LOGO_STORE = String(import.meta.env.VITE_LOGO_KEY || 'reader.logo')
const customLogo = ref(localStorage.getItem(LOGO_STORE) || '')
/*
 * 图标的优先级：自己换过的 > 服务端按实例给的 > 站内默认。
 * 绝对路径：深链（/edit/某目录/某文档）之后，'./favicon.svg' 会被解析到那一层去，图就裂了。
 */
/*
 * 站内默认图标。
 *
 * 必须按实例给站点路径，不能写 '/favicon.svg' —— 那是站点根路径，
 * 主站在 /deepseek/reader/、示例库在 /deepseek/demo/，
 * 根路径那个图标不属于它们，示例库会因此显示出一张裂图。
 * 同时它要是绝对路径：深链（/edit/某目录/某文档）之后相对路径会被解析到那一层去。
 */
const siteIcon = '__SITE_ICON__'
/*
 * 图标也只有一个真源：当前知识库的 icon 字段（注册表里）。
 * customLogo 是"这个实例自己的图标"，没有库图标时兜底。
 */
const logo = computed(
  () => currentLibIcon.value || customLogo.value || import.meta.env.VITE_LOGO || siteIcon
)
watch(logo, setFavicon, {immediate:true})

/** 顶层目录：收起态那一列图标用 */
const topFolders = computed(() => props.nodes.filter((n) => n.type === 'folder'))

function folderHasCurrent(folder) {
  if (!props.currentPath) return false
  const walk = (n) => (n.type === 'doc' ? n.file === props.currentPath : (n.children || []).some(walk))
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
  /** …菜单：浮在 body 上，不被侧栏的滚动裁掉 */
  menu: { open: false, kind: '', node: null, style: {} },

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
    // 拖过就切手动排序，否则列表会按按名称立刻重排，白拖
    sortMode.value = 'manual'
    try {
      if (into !== null && into !== undefined) {
        if (into === d.parent) return
        if (d.kind === 'doc') await store.moveDoc(d.path, into)
        else await store.moveCategory(d.path, into)
        return
      }
      if (!at) return
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
      store.error = String(e.message || e)
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
      store.error = String(err.message || err)
    }
  },

  /* ---------- …菜单 ---------- */

  openMenu(kind, node, ev) {
    const r = ev.currentTarget.getBoundingClientRect()
    const w = 148
    this.menu = {
      open: true,
      kind,
      node,
      style: {
        width: w + 'px',
        left: Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)) + 'px',
        top: r.bottom + 4 + 'px'
      }
    }
    /*
     * 关闭条件：点了菜单外面，或者按了 Esc。
     *
     * 以前是"下一次点击就关，不管点在哪" —— 那样在文档区随便点一下，
     * 甚至点右侧的目录栏、顶栏，菜单都会被收掉，像是被别处的操作打断。
     * 现在只在点到菜单范围之外时才关；点到菜单自己是走菜单项的动作。
     */
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
    this.menu.open = false
    document.removeEventListener('keydown', this.onKey)
    if (this.onClick) {
      document.removeEventListener('click', this.onClick)
      this.onClick = null
    }
  }
})
provide('tree', tree)

/** 菜单里列什么：目录多两项新建 */
/** 改分享状态：失败了把错误显示出来（store.error 会在主区顶上提示） */
async function guardShare(fn) {
  try {
    await fn()
  } catch (e) {
    store.error = String(e.message || e)
  }
}

const menuItems = computed(() => {
  if (!tree.menu.open || isGuest.value) return []
  const node = tree.menu.node
  const kind = tree.menu.kind
  const path = node?.path || node?.file
  if (kind === 'lib' && path === '草稿') return []
  const inherited = node?.lockedAt && node.lockedAt !== path
  const items = [
    { id: 'access-lock', label: inherited ? '由上级设为只读' : node?.locked ? '允许访客编辑' : '设为访客只读', hint: inherited ? '请在上级目录修改访客权限' : '', icon: node?.locked || inherited ? PhLockOpen : PhLock, disabled: !!inherited },
    { id: 'access-share', label: node?.shared === false ? '对外展示' : '不对外展示', icon: node?.shared === false ? PhEye : PhEyeSlash }
  ]
  if (canRevealInFinder.value) items.push({ id: 'reveal', label: fileManagerLabel(kind !== 'file'), icon: PhFolderSimple })
  if (!store.canEdit(node)) return items
  if (kind === 'lib') {
    if (!isGuest.value) items.push({ id:'lib-icon',label:'更换图标',icon:PhImage },{ id:'lib-rename',label:'重命名',icon:PhPencilSimple },{ id:'lib-delete',label:'删除知识库',icon:PhTrash,danger:true })
  } else {
    if (kind === 'folder') items.push({id:'new-doc',label:'新建文档',icon:PhFilePlus},{id:'new-folder',label:'新建目录',icon:PhFolderSimplePlus})
    items.push({id:'copy-to',label:'复制到知识库',icon:PhCopy},{id:'move-to',label:'移动到知识库',icon:PhArrowRight})
    items.push({id:'rename',label:'重命名',icon:PhPencilSimple},{id:'delete',label:kind==='folder'?'删除目录':'删除',icon:PhTrash,danger:true})
  }
  return items
})

async function openPublicPreview() {
  if ((store.isDirty || store.saving) && !(await store.save())) return
  const path = store.currentPath
  const current = libPanel.libs.find(lib => lib.name === currentLib.value)
  const withinPublicLibrary = current?.shared !== false
  const destination = withinPublicLibrary && path && store.currentNode?.shared
    ? '/onlyread/' + path.replace(/\.(?:md|pdf|html?)$/i, '').split('/').map(encodeURIComponent).join('/') + '?lib=' + encodeURIComponent(currentLib.value)
    : '/onlyread/'
  window.open(API_BASE + destination, '_blank', 'noopener,noreferrer')
}

function onMenuPick(item) {
  const kind = tree.menu.kind
  const node = tree.menu.node
  tree.closeMenu()
  if (!node || item.disabled) return
  if (item.id === 'reveal') {
    showInFinder(node.path || node.file)
    return
  }
  if (item.id.startsWith('access-')) {
    store.requestAccess(node.path || node.file, item.id === 'access-lock' ? { locked: !node.locked } : { shared: node.shared === false }, item.label)
    return
  }
  /* 知识库那几个动作：名字就是文件夹名，所以改名 = 重命名文件夹 */
  if (kind === 'lib') {
    const lib = { name: node.name, path: node.path, docs: node.docs, shared: node.shared }
    if (item.id === 'lib-icon') pickLibIcon(lib)
    else if (item.id === 'lib-rename') startRename(lib)
    else if (item.id === 'lib-delete') deleteLib(lib)
    return
  }
  if (item.id === 'new-doc') emit('create-doc', node.path)
  else if (item.id === 'new-folder') emit('create-category', node.path)
  else if (item.id === 'copy-to' || item.id === 'move-to') openTransfer(item.id === 'copy-to' ? 'copy' : 'move', kind, node.path || node.file)
  // 菜单里用 folder/file 区分，改名状态里用 cat/doc（跟输入框的判断一致）
  else if (item.id === 'rename') tree.editStart(kind === 'folder' ? 'cat' : 'doc', node)
  else if (item.id === 'delete') emit(kind === 'folder' ? 'delete-category' : 'delete-doc', node)
}

async function showInFinder(path) {
  try {
    await revealInFileManager(path)
  } catch (error) {
    store.error = String(error.message || error)
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

const groupMode = ref(localStorage.getItem(LS.group) === 'flat' ? 'flat' : 'tree')
// 默认手动：没拖过时它就是接口给的顺序（文档在前、目录在后，各自按名字）
const sortMode = ref(localStorage.getItem(LS.sort) || 'manual')
/**
 * 目录收起状态。
 *
 * 没有存过偏好（第一次用，或者清了 localStorage）时，把目录都收起来，
 * 只展开当前这篇所在的那条路径 —— 存档下面是三层、十几篇文档，
 * 全展开会把侧栏撑得很长，想找的东西反而看不见。
 */
const storedCats = localStorage.getItem(LS.cats)
const collapsedCats = ref(new Set(storedCats ? JSON.parse(storedCats) : []))
let catsInitialized = !!storedCats
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
const searchEl = ref(null)

watch([groupMode, sortMode], () => {
  localStorage.setItem(LS.group, groupMode.value)
  localStorage.setItem(LS.sort, sortMode.value)
})
watch(
  collapsedCats,
  (v) => localStorage.setItem(LS.cats, JSON.stringify([...v])),
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
 * 点一下这个按钮（或者刷新页面）就一致了，不需要文件监听。
 * 当前这篇没改过的话顺便把正文也重新读一遍，外面改过内容也能看到。
 */
async function rescan() {
  try {
    if(!isGuest.value){
      const result=await (await fetch(API_BASE+'/api/reconcile')).json()
      if(!result.ok)throw Error(result.error)
      if(result.data.length){const move=result.data[0];askLibDialog({title:'确认外部改名',message:move.from+' → '+move.to+'。确认后会保留原来的权限、图标和历史。',confirmText:'保留设置并继续',onConfirm:async()=>{try{const out=await(await fetch(API_BASE+'/api/reconcile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(move)})).json();if(!out.ok)throw Error(out.error);closeLibDialog();await rescan()}catch(e){store.error=e.message;closeLibDialog()}}});return}
    }
    await store.loadTree()
    if (store.currentPath && !store.isDirty) await store.reload()
  } catch (e) {
    store.error = String(e.message || e)
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
  emit('toggle-collapse')
  await nextTick()
  searchOpen.value = true
  await nextTick()
  searchEl.value?.focus()
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
  const list = flatten(props.nodes, '', []).filter((d) => !q || d.name.toLowerCase().includes(q))
  if (sortMode.value === 'recent') list.sort((a, b) => (b.mtime || 0) - (a.mtime || 0))
  else if (sortMode.value === 'name') list.sort(byName)
  return list
})

/** 有命中的文档数：搜索要看整棵树（含嵌套目录） */
function countMatches(nodes, q) {
  let n = 0
  for (const x of nodes || []) {
    if (x.type === 'doc') { if (!q || x.name.toLowerCase().includes(q)) n++ }
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
  if (!e.target.closest('.side-menu, .icon-btn')) menuOpen.value = false
}
function onLibEscape(e) {
  if (e.key !== 'Escape') return
  if (transfer.open) { transfer.open = false; return }
  if (managerOpen.value) { managerOpen.value = false; return }
  if (!libPanel.open || !isMobileLibView()) return
  if (tree.menu.open) {
    tree.closeMenu()
    return
  }
  closeLibPanel()
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
onMounted(() => document.addEventListener('keydown', onLibEscape))
onBeforeUnmount(() => document.removeEventListener('keydown', onLibEscape))
onMounted(() => window.addEventListener('reader-access-updated', loadLibs))
onBeforeUnmount(() => window.removeEventListener('reader-access-updated', loadLibs))
</script>

<style scoped>
.library-welcome{margin:0;padding:0 24px 18px;font-size:13px;line-height:1.65;color:var(--c-sub)}
/* 侧边列表和管理弹窗各有明确职责。 */
.lib-modal-backdrop { display: none; }
.lib-backdrop-enter-active, .lib-backdrop-leave-active { transition: opacity 0.2s ease; }
.lib-backdrop-enter-from, .lib-backdrop-leave-to { opacity: 0; }
.lib-panel {
  position: relative; width: var(--lib-w, 236px); flex-shrink: 0;
  display: flex; flex-direction: column; background: var(--c-panel);
  border-right: 1px solid var(--c-line); overflow: hidden;
}
.lib-panel-enter-active, .lib-panel-leave-active {
  transition: width 0.22s ease, opacity 0.22s ease;
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
.lib-browse-entry { display:flex;align-items:center;justify-content:center;gap:6px;flex:none;min-height:32px;padding:5px 9px;border-radius:var(--radius-control);color:var(--c-sub);font-size:11px;white-space:nowrap;transition:background var(--motion-enter) ease,color var(--motion-enter) ease; }.lib-browse-entry:hover { background:var(--c-field);color:var(--c-ink); }
.lib-panel-list { flex: 1; overflow-y: auto; padding: 4px 8px; }
.lib-panel-footer { display:flex;flex-direction:column;margin:5px 8px 12px;gap:2px; }
.lib-manager-entry { display: flex; align-items: center; gap: 9px; width:100%; padding: 10px 12px; border-radius: var(--radius-control); color: var(--c-sub); text-align: left; font-size: 12px; }.lib-manager-entry:hover { background: var(--c-hover); color: var(--c-ink); }
.lib-empty { color: var(--c-faint); font-size: 12px; text-align: center; padding: 24px 0; }
.lib-pin { opacity: 0; }.lib-row:hover .lib-pin, .lib-row:focus-within .lib-pin { opacity: 1; }
.lib-manager-backdrop { position: fixed; inset: 0; z-index: 59; width: 100%; height: 100%; background: var(--c-overlay); }
.lib-manager { position: fixed; left: 50%; top: 50%; z-index: 60; transform: translate(-50%, -50%); width: min(720px, calc(100vw - 32px)); max-height: min(680px, 84dvh); display: flex; flex-direction: column; background: var(--c-pop); border: 1px solid var(--c-line); border-radius: 40px; corner-shape: superellipse(2); box-shadow: var(--c-pop-shadow); overflow: hidden; }
.lib-manager-head { display: flex; align-items: center; justify-content: space-between; gap:16px; padding: 30px 30px 20px; }.lib-manager-head h2 { margin: 0; color: var(--c-ink); font-size: 19px; font-weight: 600; }.lib-manager-head p { margin: 5px 0 0; color: var(--c-sub); font-size: 12px; }
.lib-manager-tools { display: flex; gap: 8px; padding: 0 24px 17px; }.lib-manager-tools input, .lib-manager-tools select { min-width: 0; padding: 9px 11px; border: 1px solid var(--c-line); border-radius: var(--radius-control); background: var(--c-field); color: var(--c-ink); font: inherit; font-size: 12px; }.lib-manager-tools input { flex: 1; }.lib-manager-tools select { width: 108px; }
.lib-manager-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(145px, 1fr)); gap: 10px; padding: 0 24px 24px; overflow-y: auto; }.lib-manager-grid .lib-empty { grid-column: 1 / -1; }
.lib-manager-card { position:relative; display: flex; min-height: 110px; padding: 15px; border-radius: 22px; corner-shape: superellipse(2); background: var(--c-field); text-align: left; }.lib-manager-card:hover, .lib-manager-card.is-current { background: var(--c-hover); }.lib-manager-card-main { display:flex;flex-direction:column;align-items:flex-start;gap:8px;width:100%;text-align:left; }.lib-manager-card strong { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--c-ink); font-size: 12px; font-weight: 500; }.lib-manager-card span { color: var(--c-faint); font-size: 11px; }.lib-manager-icon { width: 21px; height: 21px; }.lib-manager-card-more { position:absolute;right:8px;top:8px;opacity:0; }.lib-manager-card:hover .lib-manager-card-more,.lib-manager-card:focus-within .lib-manager-card-more { opacity:1; }
.lib-preview-entry { display:flex;align-items:center;gap:13px;width:100%;min-height:44px;margin-bottom:5px;padding:8px 12px;border-radius:var(--radius-control);color:var(--c-sub);font-size:12px;text-align:left; }.lib-preview-entry:hover { background:var(--c-hover);color:var(--c-ink); }.lib-manager-head-actions { display:flex;align-items:center;gap:9px; }.lib-manager-head-actions>button:not(.icon-btn) { padding:7px 10px;border-radius:var(--radius-control);background:var(--c-field);color:var(--c-sub);font-size:12px; }.lib-manager-previews { min-height:0;overflow-y:auto; }.lib-manager-previews .lib-manager-grid { overflow:visible; }.lib-preview-detail { margin:0 24px 24px;padding:16px;background:var(--c-field);border-radius:22px;corner-shape:superellipse(2); }.lib-preview-detail-head { display:flex;justify-content:space-between;gap:12px;font-size:12px; }.lib-preview-detail-head span,.lib-preview-source { color:var(--c-faint);font-size:11px; }.lib-preview-source { overflow-wrap:anywhere;margin:8px 0; }.lib-preview-body { max-height:300px;overflow:auto;padding:12px 0;font-size:12px;line-height:1.7;overflow-wrap:anywhere; }.lib-preview-body img { max-width:100%; }.lib-preview-body pre { overflow:auto; }.lib-preview-actions { display:flex;justify-content:flex-end;gap:8px; }.lib-preview-actions button { padding:8px 12px;border-radius:var(--radius-control);background:var(--c-pop);font-size:12px; }.lib-preview-actions button:disabled { opacity:.45;cursor:default; }
.lib-preview-body :is(h1,h2,h3) { margin:1.3em 0 .55em;line-height:1.4;font-weight:600; }.lib-preview-body h1 { font-size:1.45em; }.lib-preview-body h2 { font-size:1.25em; }.lib-preview-body h3 { font-size:1.1em; }.lib-preview-body p,.lib-preview-body ul,.lib-preview-body ol { margin:0 0 1em; }.lib-preview-body :is(ul,ol) { padding-left:1.7em; }.lib-preview-body code { font-family:ui-monospace,monospace;font-size:.9em; }.lib-preview-body pre { padding:10px;background:var(--c-pop);border-radius:12px; }.lib-preview-body table { display:block;max-width:100%;overflow:auto;border-collapse:collapse; }.lib-preview-body :is(td,th) { border:1px solid var(--c-line);padding:4px 7px; }.lib-preview-body a { color:var(--color-ds); }.lib-preview-body a[href="#"] { cursor:help;text-decoration-style:dotted; }
.transfer-backdrop { position:fixed;inset:0;z-index:90;display:grid;place-items:center;padding:18px;background:var(--c-overlay); }.transfer-dialog { width:min(410px,100%);max-height:85dvh;overflow:auto;padding:24px;background:var(--c-pop);border:1px solid var(--c-line);border-radius:34px;corner-shape:superellipse(2);box-shadow:var(--c-pop-shadow);color:var(--c-ink); }.transfer-dialog h2 { margin:0;font-size:17px;font-weight:600; }.transfer-dialog p { margin:8px 0 16px;font-size:12px;color:var(--c-sub);overflow-wrap:anywhere; }.transfer-dialog label { display:block;margin:13px 0;font-size:12px;color:var(--c-sub); }.transfer-dialog select { display:block;width:100%;margin-top:7px;padding:9px 11px;border:1px solid var(--c-line);border-radius:var(--radius-control);background:var(--c-field);color:var(--c-ink);font:inherit; }.transfer-dialog .transfer-hint { margin-top:18px;line-height:1.6; }.transfer-dialog .transfer-error { color:#bd4545; }.transfer-actions { display:flex;justify-content:flex-end;gap:8px;margin-top:20px; }.transfer-actions button { padding:8px 15px;border-radius:var(--radius-control);background:var(--c-field);font-size:12px; }.transfer-actions button:last-child { background:var(--c-hover); }.transfer-actions button:disabled { opacity:.45;cursor:default; }
.transfer-dialog input { display:block;width:100%;margin-top:7px;padding:9px 11px;border:1px solid var(--c-line);border-radius:var(--radius-control);background:var(--c-field);color:var(--c-ink);font:inherit; }
.transfer-toast { position:fixed;right:22px;bottom:24px;z-index:95;display:flex;align-items:center;gap:12px;max-width:min(430px,calc(100vw - 28px));padding:10px 14px;border:1px solid var(--c-line);border-radius:20px;corner-shape:superellipse(2);background:var(--c-pop);box-shadow:var(--c-pop-shadow);color:var(--c-ink);font-size:12px; }.transfer-toast span { overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }.transfer-toast button { color:var(--color-ds);white-space:nowrap; }
@media (max-width: 520px) { .lib-manager-head { padding:26px 25px 17px; }.lib-preview-detail { margin-inline:14px; } }
.lib-manager-enter-active, .lib-manager-leave-active { transition: transform .2s ease, opacity .2s ease; }.lib-manager-enter-from, .lib-manager-leave-to { transform: translate(-50%, -46%) scale(.97); opacity: 0; }
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
.lib-row + .lib-row { margin-top: 2px; }
.lib-row {
  display: flex; align-items: center; gap: 10px;
  min-height: 46px;
  padding: 8px 10px;
  border-radius: var(--radius-row);
  transition: background 0.15s ease;
}
.lib-row.is-dragging { opacity: 0.45; }
.lib-row:hover { background: var(--c-hover); }
.lib-panel-sort .select-menu-trigger{width:100%}
.lib-row.is-current { background: var(--c-hover); }
.lib-row.is-draft { background: color-mix(in srgb, var(--color-ds) 5%, var(--c-panel)); }
.lib-row.is-draft:hover, .lib-row.is-draft.is-current { background: color-mix(in srgb, var(--color-ds) 9%, var(--c-panel)); }
.lib-row.is-draft .lib-row-icon, .lib-manager-card.is-draft .lib-manager-icon { color: var(--color-ds); }
.lib-manager-card.is-draft { background: color-mix(in srgb, var(--color-ds) 5%, var(--c-pop)); }
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
/*
 * 标题两行：第一行是主标题，第二行是副标题。
 * 副标题只是略小一点、颜色淡一点 —— 拉得太小会像注脚，反而看不出是同一组。
 * 主标题不加粗：这里本身已经是标题位，再加粗整块就太重了。
 */
.brand-line.is-title { font-size: 17px; }
.brand-line.is-sub { font-size: 14.5px; color: var(--c-sub); }
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
  border-color: var(--color-ds);
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
.toolbar-label {
  font-size: 12px;
  color: var(--c-faint);
  padding-left: 6px;
  letter-spacing: 0.02em;
}


/* 新建文档使用填充底色区分状态，无描边。 */
.newdoc-btn { transition: transform .12s ease; }
.newdoc-btn:active {
  transform: scale(0.985);
}

.rail-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-control);
  color: var(--c-faint);
  transition: color 0.15s ease, background 0.15s ease, transform 0.12s ease;
}
.rail-btn:hover {
  color: var(--c-ink);
  background: var(--c-hover);
}
.rail-btn:active {
  transform: scale(0.92);
}
.rail-btn.is-on {
  color: var(--color-ds);
  background: var(--c-active);
}


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
  color: var(--color-ds);
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
.is-reader-rail { background:transparent!important; border:0!important; overflow:visible!important; z-index:60 }
.reader-rail { width:44px; display:flex; align-items:center; flex-direction:column; padding-top:15px }
.manage-entry { margin:0 12px 10px; padding:8px 10px; display:flex; align-items:center; gap:8px; border:1px solid var(--c-line); border-radius:var(--radius-control); color:var(--c-sub); font-size:12px; text-align:left; cursor:pointer; background:var(--c-surface) }
.manage-entry:hover { background:var(--c-field); color:var(--c-text) }
.manage-entry:focus-visible { outline:2px solid var(--c-ink); outline-offset:2px }
.entry-chevron { margin-left:auto }
.tree-menu-item:disabled { opacity:.45; cursor:default }
.tree-menu-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lib-panel-sort .select-menu-trigger{min-height:30px;padding:5px 11px;background:transparent;border-color:transparent}
.lib-panel-sort .select-menu-trigger:hover{background:var(--c-field)}
.lib-panel-sort :deep(.select-menu-trigger){min-height:30px;width:100%;padding:5px 11px;background:transparent;border-color:transparent}
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
.transfer-library-grid button.is-on{border-color:var(--color-ds);background:var(--c-active)}
.transfer-library-grid button.is-draft{background:color-mix(in srgb,var(--color-ds) 5%,var(--c-pop))}
.transfer-library-grid button.is-draft:hover{background:color-mix(in srgb,var(--color-ds) 9%,var(--c-pop))}
.transfer-library-grid button.is-draft.is-on{border-color:var(--color-ds);background:var(--c-active)}
.transfer-library-grid button span{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--c-ink);font-size:12px}
.transfer-library-grid button small{color:var(--c-faint);font-size:10px}
.transfer-backdrop.overlay-enter-active .transfer-dialog,.transfer-backdrop.overlay-leave-active .transfer-dialog{transition:transform var(--motion-enter) var(--motion-ease),opacity var(--motion-enter) ease}
.transfer-backdrop.overlay-enter-from .transfer-dialog,.transfer-backdrop.overlay-leave-to .transfer-dialog{transform:translateY(5px) scale(.975);opacity:0}
@media(max-width:520px){.transfer-dialog{padding:20px}.transfer-library-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.transfer-library-head{display:block}.transfer-library-head input{margin-top:8px}}
@media(max-width:520px){.lib-manager{width:calc(100vw - 16px);max-height:calc(100dvh - 24px);border-radius:28px}.lib-manager-head{padding:20px 20px 14px}.lib-manager-grid{grid-template-columns:repeat(2,minmax(0,1fr));padding-inline:20px}.lib-manager-tools{padding-inline:20px}.lib-manager-search-row :deep(.select-menu-trigger){width:105px}.lib-manager-filters button{padding-inline:8px}.lib-manager-footer{padding-inline:20px}.lib-preview-detail{max-height:calc(100dvh - 130px);margin:0 14px 14px;padding:14px}.lib-preview-actions{flex-wrap:wrap}.lib-preview-actions button{flex:1;white-space:nowrap}}
@media(max-width:520px){.preview-list{padding-inline:20px}.preview-list-row{align-items:stretch;flex-direction:column;gap:7px}.preview-list-actions{justify-content:flex-end;flex-wrap:wrap}}
.workspace-history-footer{flex:none;padding:7px 10px 12px;border-top:1px solid var(--c-line)}
.workspace-history-link{display:flex;align-items:center;gap:10px;width:100%;min-height:36px;padding:7px 10px;border-radius:var(--radius-control);color:var(--c-sub);font-size:12px;text-align:left;white-space:nowrap}
.workspace-history-link:hover{background:var(--c-field);color:var(--c-ink)}
.workspace-history-link svg{flex:none}
</style>

<style scoped>
.workspace-footer{position:relative;flex-shrink:0;padding-top:8px;border-top:0}.workspace-footer .manage-entry{width:calc(100% - 24px);border:0;background:transparent;margin-bottom:12px}.workspace-footer .manage-entry span{flex:1}.identity-menu{position:absolute;bottom:60px;left:12px;right:12px;padding:6px;background:var(--c-pop);box-shadow:var(--c-pop-shadow);border:0;border-radius:var(--radius-surface);z-index:50}.identity-menu button{display:block;width:100%;padding:9px;text-align:left;font-size:12px;border-radius:var(--radius-control)}.identity-menu button:hover{background:var(--c-hover)}
</style>
<style scoped>.lib-icon-edit{display:grid;place-items:center;padding:5px;border-radius:var(--radius-control);margin-left:-5px}.lib-icon-edit:not(:disabled):hover{background:var(--c-hover)}.lib-icon-edit:disabled{cursor:default}.workspace-footer .manage-entry{gap:10px;padding:10px 8px}.workspace-footer .manage-entry:hover{background:var(--c-hover)}</style>
