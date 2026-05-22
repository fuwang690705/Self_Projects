<template>
  <main class="app-shell">
    <section
      class="phone-frame"
      :class="{ 'is-player': activeTab === 'player', 'is-subpage': activeTab === 'profile' }"
      :style="activeTab === 'player' ? { '--cover-seed': coverGradient } : null"
    >
      <section
        ref="contentRef"
        class="content"
        @touchstart="onPullStart"
        @touchmove="onPullMove"
        @touchend="onPullEnd"
        @touchcancel="onPullEnd"
      >
        <section v-show="activeTab === 'bookshelf'" class="view bookshelf-view">
          <div
            class="pull-refresh-indicator"
            :class="{ active: pullDistance > 0 }"
            :style="{ height: `${pullDistance}px` }"
          >
            <span>{{ pullRefreshText }}</span>
          </div>

          <form class="home-source-search" @submit.prevent="submitHomeSourceSearch">
            <label class="home-source-field">
              <el-icon><Search /></el-icon>
              <input
                v-model="homeSearchKeyword"
                type="search"
                placeholder="&#x641c;&#x7d22;&#x6709;&#x58f0;&#x4e66;&#x3001;&#x4e3b;&#x64ad;&#x6216;&#x4f5c;&#x8005;"
                @focus="openSourceSearch"
              />
            </label>
            <button type="submit">&#x641c;&#x7d22;</button>
          </form>

          <div v-if="isLoadingBooks" class="skeleton-stack">
            <el-skeleton :rows="5" animated />
          </div>

          <section v-else-if="!books.length" class="bookshelf-empty">
            <span class="empty-mark">听</span>
            <strong>书架还是空的</strong>
          </section>

          <template v-else>
            <button v-if="currentBook" class="continue-card" type="button" @click="openBookFromShelf(currentBook)">
              <span class="continue-icon">
                <el-icon><Headset /></el-icon>
              </span>
              <span class="continue-copy">
                <small>继续收听</small>
                <strong>{{ currentBook.title }}</strong>
                <em>{{ currentChapter?.name || bookSubTitle(currentBook) }}</em>
              </span>
              <span class="continue-action">
                {{ isPlaying ? '播放中' : '继续' }}
              </span>
            </button>

            <div class="book-section-head">
              <div>
                <span>LIBRARY</span>
                <strong>全部书籍</strong>
              </div>
              <small>{{ books.length }} 本</small>
            </div>

            <div class="book-list">
              <button
                v-for="book in books"
                :key="book.id"
                class="book-row"
                :class="{ active: book.id === currentBook?.id }"
                @click="openBookFromShelf(book)"
              >
                <span class="book-row-cover">
                  <img v-if="coverVisible(book)" :src="coverUrlFor(book)" alt="" @error="markCoverFailed(book)" />
                  <span v-else>{{ book.title.slice(0, 1) }}</span>
                </span>
                <span class="book-row-copy">
                  <strong class="marquee-title" :class="{ scrolling: isLongBookTitle(book.title) }">
                    <span v-if="isLongBookTitle(book.title)" class="marquee-track">
                      <span>{{ book.title }}</span>
                      <span aria-hidden="true">{{ book.title }}</span>
                    </span>
                    <span v-else>{{ book.title }}</span>
                  </strong>
                  <small>{{ bookAuthor(book) }}</small>
                  <em>{{ bookSubTitle(book) }}</em>
                </span>
                <span class="book-row-meta">
                  <el-icon><ArrowRight /></el-icon>
                </span>
              </button>
            </div>
          </template>
        </section>

        <section v-show="activeTab === 'player'" class="view player-view">
          <div class="player-backdrop" :style="{ '--cover-seed': coverGradient }">
            <div class="player-topbar">
              <button class="icon-button" @click="activeTab = 'bookshelf'" aria-label="返回书架">
                <el-icon><ArrowLeft /></el-icon>
              </button>
              <strong>正在播放</strong>
              <span class="topbar-actions">
                <button class="icon-button" :class="{ active: isFavorite }" @click="toggleFavorite" aria-label="收藏">
                  <el-icon><StarFilled v-if="isFavorite" /><Star v-else /></el-icon>
                </button>
                <button class="icon-button" @click="settingsSheetVisible = true" aria-label="播放设置">
                  <el-icon><MoreFilled /></el-icon>
                </button>
              </span>
            </div>

            <div class="player-upper">
              <div class="cover-stage">
                <div class="cover-blur"></div>
                <div class="player-art" :class="{ playing: isPlaying }">
                  <span>{{ bookInitial }}</span>
                  <strong>{{ currentBook?.title || '我的听书' }}</strong>
                  <em>My Read Audio</em>
                </div>
              </div>

              <div v-if="currentBook" class="track-meta">
                <p>{{ currentBook.title }}</p>
                <span>{{ chapterSubTitle }}</span>
                <small v-if="currentChapter">剩余 {{ remainingTime }}</small>
              </div>
            </div>
          </div>

          <div class="player-console">
            <div class="progress-area">
              <div class="wave-progress-card" :class="{ disabled: !currentChapter }">
                <div class="waveform-track" aria-hidden="true">
                  <span
                    v-for="(bar, index) in waveBars"
                    :key="index"
                    class="wave-bar"
                    :class="{ active: index < waveActiveCount }"
                    :style="{ height: `${bar}px` }"
                  ></span>
                </div>
                <el-slider
                  v-model="sliderValue"
                  :max="duration || 100"
                  :disabled="!currentChapter"
                  :show-tooltip="false"
                  @change="seekTo"
                />
                <div class="time-row">
                  <span>{{ formatTime(currentTime) }}</span>
                  <span>{{ remainingTime }}</span>
                </div>
              </div>
            </div>

            <div class="player-controls">
              <button class="control-button chapter-button" :disabled="!hasPrevious" @click="playPrevious" aria-label="上一章">
                <span class="chapter-skip-icon previous" aria-hidden="true"></span>
              </button>
              <button class="control-button jump-button" :disabled="!currentChapter" @click="jumpBy(-15)" aria-label="快退十五秒">
                <span>-15</span>
              </button>
              <button class="control-button play-button" :disabled="!currentChapter || isLoadingAudio" @click="togglePlay" aria-label="播放">
                <el-icon v-if="isPlaying"><VideoPause /></el-icon>
                <el-icon v-else><VideoPlay /></el-icon>
              </button>
              <button class="control-button jump-button" :disabled="!currentChapter" @click="jumpBy(15)" aria-label="快进十五秒">
                <span>+15</span>
              </button>
              <button class="control-button chapter-button" :disabled="!hasNext" @click="playNext" aria-label="下一章">
                <span class="chapter-skip-icon next" aria-hidden="true"></span>
              </button>
            </div>

            <div class="utility-row">
              <button class="utility-chip" @click="sleepSheetVisible = true">
                <el-icon><Timer /></el-icon>
                <span>{{ sleepTimerLabel }}</span>
              </button>
              <button class="utility-chip" @click="speedSheetVisible = true">
                <el-icon><Odometer /></el-icon>
                <span>{{ playbackRate.toFixed(1) }}x</span>
              </button>
              <button class="utility-chip primary" @click="chapterSheetVisible = true">
                <el-icon><Operation /></el-icon>
                <span>目录</span>
              </button>
            </div>
          </div>

          <audio
            ref="audioRef"
            preload="metadata"
            @loadedmetadata="onLoadedMetadata"
            @timeupdate="onTimeUpdate"
            @play="onAudioPlay"
            @pause="onAudioPause"
            @ended="onEnded"
            @error="onAudioError"
          />
        </section>

        <section v-show="activeTab === 'me'" class="view profile-view">
          <section class="profile-hero">
            <button class="profile-identity" @click="handleAvatarClick">
              <span class="profile-avatar profile-avatar-large">
                <img v-if="user?.avatarUrl" :src="user.avatarUrl" alt="" />
                <el-icon v-else><UserFilled /></el-icon>
              </span>
              <span class="profile-copy">
                <small>{{ user ? '个人空间' : '欢迎回来' }}</small>
                <strong>{{ user?.nickname || '未登录' }}</strong>
                <em>{{ user ? (user.email || `账号 ${user.account}`) : '登录后同步收藏和播放记录' }}</em>
              </span>
              <el-icon><ArrowRight /></el-icon>
            </button>

            <div class="profile-metrics">
              <span>
                <small>今日收听</small>
                <strong>{{ formatListenDuration(todayListenSeconds) }}</strong>
              </span>
              <span>
                <small>连续打卡</small>
                <strong>{{ streakDays }} 天</strong>
              </span>
              <span>
                <small>收藏</small>
                <strong>{{ favoriteBooks.length }} 本</strong>
              </span>
            </div>
          </section>

          <div class="profile-section-title">
            <span>常用</span>
          </div>

          <div class="menu-list profile-menu">
            <button class="profile-menu-favorites" @click="activeTab = 'favorites'">
              <el-icon><Collection /></el-icon>
              <span>我的收藏</span>
              <small>{{ favoriteBooks.length }} 本</small>
              <el-icon><ArrowRight /></el-icon>
            </button>
            <button class="profile-menu-source" @click="openSourceManager">
              <el-icon><FolderOpened /></el-icon>
              <span>书源管理</span>
              <small>{{ selectedLocalSourceName || `${presetBookSources.length} 个预设` }}</small>
              <el-icon><ArrowRight /></el-icon>
            </button>
            <button v-if="false" class="profile-menu-search" @click="openSourceSearch">
              <el-icon><Search /></el-icon>
              <span>网络书源</span>
              <small>聚合搜索</small>
              <el-icon><ArrowRight /></el-icon>
            </button>
            <button v-if="false" class="profile-menu-settings" @click="openSettings">
              <el-icon><Setting /></el-icon>
              <span>AList 网盘授权</span>
              <small>WebDAV / 本地目录</small>
              <el-icon><ArrowRight /></el-icon>
            </button>
            <button class="profile-menu-about" @click="aboutVisible = true">
              <el-icon><InfoFilled /></el-icon>
              <span>关于极简听书</span>
              <small>版本与说明</small>
              <el-icon><ArrowRight /></el-icon>
            </button>
          </div>
        </section>

        <section v-show="activeTab === 'profile'" class="view profile-detail-view">
          <div class="profile-detail-topbar">
            <button class="icon-button" @click="activeTab = 'me'" aria-label="返回我的">
              <el-icon><ArrowLeft /></el-icon>
            </button>
            <strong>个人信息</strong>
            <span></span>
          </div>

          <section class="profile-editor-card">
            <input
              ref="avatarInputRef"
              class="avatar-file-input"
              type="file"
              accept="image/*"
              @change="onAvatarFileChange"
            />

            <div class="profile-info-list">
              <button class="profile-info-row avatar-row" type="button" @click="triggerAvatarPicker">
                <span class="profile-info-label">头像</span>
                <span class="profile-info-value">
                  <span class="profile-avatar profile-avatar-preview">
                    <img v-if="profileForm.avatarUrl" :src="profileForm.avatarUrl" alt="" />
                    <el-icon v-else><UserFilled /></el-icon>
                  </span>
                  <el-icon><ArrowRight /></el-icon>
                </span>
              </button>

              <label class="profile-info-row">
                <span class="profile-info-label">昵称</span>
                <span class="profile-info-value editable">
                  <input v-model="profileForm.nickname" maxlength="32" placeholder="未设置" />
                  <el-icon><ArrowRight /></el-icon>
                </span>
              </label>

              <div class="profile-info-row">
                <span class="profile-info-label">账号</span>
                <span class="profile-info-value muted">
                  {{ user?.account || '-' }}
                </span>
              </div>

              <label class="profile-info-row">
                <span class="profile-info-label">绑定邮箱</span>
                <span class="profile-info-value editable">
                  <input v-model="profileForm.email" type="email" placeholder="去绑定" />
                  <el-icon><ArrowRight /></el-icon>
                </span>
              </label>
            </div>

          </section>

          <div class="dialog-actions profile-page-actions">
            <el-button type="primary" :loading="isSavingProfile" @click="submitProfile">保存资料</el-button>
            <el-button v-if="user" class="profile-logout-button" text @click="logoutFromProfile">
              <el-icon><SwitchButton /></el-icon>
              退出登录
            </el-button>
          </div>
        </section>

        <section v-show="activeTab === 'sourceManager'" class="view source-manager-view">
          <div class="profile-detail-topbar">
            <button class="icon-button" @click="activeTab = 'me'" aria-label="返回我的">
              <el-icon><ArrowLeft /></el-icon>
            </button>
            <strong>书源管理</strong>
            <span></span>
          </div>

          <input
            ref="localSourceInputRef"
            class="local-source-input"
            type="file"
            webkitdirectory
            directory
            multiple
            @change="onLocalSourceFolderChange"
          />

          <section class="source-manager-section">
            <div class="source-manager-head">
              <span>预设书源</span>
              <small>暂不支持手动添加</small>
            </div>
            <div class="preset-source-list">
              <article v-for="source in presetBookSources" :key="source.id" class="preset-source-row">
                <span class="preset-source-mark">{{ source.name.slice(0, 1) }}</span>
                <span class="preset-source-copy">
                  <strong>{{ source.name }}</strong>
                  <small>{{ source.url }}</small>
                </span>
              </article>
            </div>
          </section>

          <section class="source-manager-section local-source-section">
            <div class="source-manager-head">
              <span>本地书源</span>
              <small>{{ selectedLocalSourceName || '未选择' }}</small>
            </div>

            <div class="local-source-format">
              <strong>目录格式示例</strong>
              <p>推荐：根目录 / 作者名 / 书名 / 001 章节名.mp3</p>
              <p>也支持：根目录 / 书名 / 001 章节名.mp3</p>
              <p>封面图可放在书籍目录内，命名为 cover.jpg、cover.png 或 folder.jpg。</p>
            </div>

            <div class="local-source-example" aria-label="本地书源目录示例">
              <span>听书库</span>
              <span>└─ 刘慈欣</span>
              <span>　 └─ 三体</span>
              <span>　 　 ├─ cover.jpg</span>
              <span>　 　 ├─ 001 科学边界.mp3</span>
              <span>　 　 └─ 002 台球.mp3</span>
            </div>

            <div v-if="selectedLocalSourceName" class="local-source-current">
              <el-icon><FolderChecked /></el-icon>
              <span>
                <strong>{{ selectedLocalSourceName }}</strong>
                <small>{{ selectedLocalSourceSummary }}</small>
              </span>
            </div>

            <p class="local-source-note">
              手机浏览器通常不会暴露完整文件路径；这里会打开系统文件夹选择器并记录选择结果，后续 App 原生目录授权可复用这个入口。
            </p>

            <div class="dialog-actions">
              <el-button type="primary" @click="chooseLocalSourceFolder">
                <el-icon><FolderOpened /></el-icon>
                选择本地文件夹
              </el-button>
            </div>
          </section>
        </section>

        <section v-show="activeTab === 'favorites'" class="view favorites-view">
          <div class="page-topbar">
            <button class="icon-button" @click="activeTab = 'me'" aria-label="返回我的">
              <el-icon><ArrowLeft /></el-icon>
            </button>
            <div>
              <strong>我的收藏</strong>
              <small>{{ favoriteBooks.length }} 本收藏的书</small>
            </div>
          </div>

          <div v-if="favoriteBooks.length" class="favorite-list">
            <button v-for="book in favoriteBooks" :key="book.id" class="favorite-book" @click="openFavoriteBook(book)">
              <span class="cover-mark">{{ book.title.slice(0, 1) }}</span>
              <span class="favorite-copy">
                <strong>{{ book.title }}</strong>
                <small>{{ favoriteBookSubTitle(book) }}</small>
              </span>
              <el-icon><ArrowRight /></el-icon>
            </button>
          </div>

          <el-empty v-else description="暂无收藏" />
        </section>

        <section v-show="activeTab === 'sourceSearch'" class="view source-search-view">
          <div class="page-topbar">
            <button class="icon-button" @click="activeTab = 'bookshelf'" aria-label="返回书架">
              <el-icon><ArrowLeft /></el-icon>
            </button>
            <div>
              <strong>搜索有声书</strong>
              <small>查看详情、试听或加入书架</small>
            </div>
          </div>

          <form class="source-search-box" @submit.prevent="searchNetworkSources">
            <el-input v-model="sourceSearchKeyword" clearable placeholder="输入书名、作者或主播" />
            <el-button type="primary" :loading="isSearchingSources" native-type="submit">
              搜索
            </el-button>
          </form>

          <div v-if="sourceSearchResults.length" class="source-result-list">
            <article v-for="item in sourceSearchResults" :key="item.id" class="source-result-card">
              <span class="source-result-cover">
                <img v-if="coverVisible(item)" :src="coverUrlFor(item)" alt="" @error="markCoverFailed(item)" />
                <span v-else>{{ item.title.slice(0, 1) }}</span>
              </span>
              <span class="source-result-copy">
                <strong>{{ item.title }}</strong>
                <small>{{ item.description || item.sourceName }}</small>
                <em class="source-platform-tag">{{ item.sourceName }}</em>
              </span>
              <el-button
                size="small"
                type="primary"
                :loading="previewingSourceBookId === item.id"
                @click="openSourceBookDetail(item)"
              >
                详情
              </el-button>
            </article>
          </div>

          <el-empty
            v-else
            :description="sourceSearchEmptyText"
          />
        </section>
      </section>

      <nav v-show="!['profile', 'sourceManager'].includes(activeTab)" class="bottom-nav">
        <div class="nav-arch-bg" aria-hidden="true">
          <svg class="arch-svg" width="160" height="26" viewBox="0 0 160 26" xmlns="http://www.w3.org/2000/svg">
            <path d="M 0 26 C 40 26, 50 0, 80 0 C 110 0, 120 26, 160 26 L 160 28 L 0 28 Z" fill="var(--nav-bg)" />
          </svg>
        </div>

        <div class="nav-items">
          <button
            class="nav-item"
            :class="{ active: activeTab === 'bookshelf' || activeTab === 'sourceSearch' }"
            @click="activeTab = 'bookshelf'"
          >
            <span class="nav-icon-shell">
              <el-icon><Collection /></el-icon>
            </span>
            <span class="nav-label">书架</span>
          </button>
          <button
            class="nav-item nav-player-toggle"
            :class="{
              active: activeTab === 'player',
              playing: isPlaying,
              ready: !!currentChapter
            }"
            @click="activeTab = 'player'"
          >
            <span
              class="player-dock"
              :style="{
                '--player-progress': `${playerProgressPercent}%`
              }"
            >
              <span class="player-core">
                <el-icon><Headset /></el-icon>
              </span>
            </span>
            <span class="nav-label player-label">
              {{ activeTab === 'player' ? '播放器' : isPlaying ? '播放中' : currentChapter ? '继续听' : '播放器' }}
            </span>
          </button>
          <button
            class="nav-item"
            :class="{ active: activeTab === 'me' || activeTab === 'favorites' || activeTab === 'profile' || activeTab === 'sourceManager' }"
            @click="activeTab = 'me'"
          >
            <span class="nav-icon-shell">
              <el-icon><User /></el-icon>
            </span>
            <span class="nav-label">我的</span>
          </button>
        </div>
      </nav>
    </section>

    <el-dialog v-model="loginVisible" width="min(92vw, 400px)" :show-close="true" class="clean-dialog auth-dialog">
      <template #header>
        <div class="auth-dialog-head">
          <span class="auth-mark">
            <el-icon><Headset /></el-icon>
          </span>
          <div>
            <small>MY READ</small>
            <strong>{{ loginMode === 'login' ? '欢迎回来' : '创建账户' }}</strong>
          </div>
        </div>
      </template>

      <div class="auth-tabs" role="tablist">
        <button :class="{ active: loginMode === 'login' }" @click="loginMode = 'login'">登录</button>
        <button :class="{ active: loginMode === 'register' }" @click="loginMode = 'register'">注册</button>
      </div>

      <el-form v-if="aliyunAdvancedVisible || !aliyunForm.clientId" class="auth-form" label-position="top" @submit.prevent>
        <el-form-item v-if="loginMode === 'register'" label="昵称">
          <el-input v-model="loginForm.nickname" placeholder="给自己起个名字">
            <template #prefix>
              <el-icon><EditPen /></el-icon>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item label="账号">
          <el-input v-model="loginForm.account" placeholder="手机号或用户名">
            <template #prefix>
              <el-icon><User /></el-icon>
            </template>
          </el-input>
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="loginForm.password" type="password" show-password placeholder="至少 6 位">
            <template #prefix>
              <el-icon><Lock /></el-icon>
            </template>
          </el-input>
        </el-form-item>
      </el-form>

      <div class="dialog-actions auth-actions">
        <el-button class="auth-primary" type="primary" :loading="isAuthing" @click="submitLogin">
          {{ loginMode === 'login' ? '登录' : '注册并登录' }}
        </el-button>
        <el-button class="auth-quick" :loading="isAuthing" @click="doQuickLogin">
          <el-icon><Lightning /></el-icon>
          快速登录
        </el-button>
      </div>
    </el-dialog>

    <el-dialog v-model="settingsVisible" width="min(92vw, 460px)" class="clean-dialog source-dialog">
      <template #header>
        <strong>授权中心</strong>
      </template>
      <div class="source-card connected" v-if="authStatus?.sourceType === 'local'">
        <span class="source-logo">本</span>
        <div>
          <strong>当前优先使用本地音频目录</strong>
          <p>把音频文件放到服务器本地目录后，书架刷新即可读取播放。</p>
        </div>
      </div>
      <div class="source-card connected" v-else-if="authStatus?.sourceType === 'aliyun'">
        <span class="source-logo">云</span>
        <div>
          <strong>已连接旧版阿里云盘直连</strong>
          <p>后续建议切到 AList WebDAV，由 AList 管理阿里云盘授权和刷新。</p>
        </div>
      </div>
      <div class="source-card connected" v-else-if="authStatus?.sourceType === 'webdav'">
        <span class="source-logo">A</span>
        <div>
          <strong>已连接 WebDAV 听书源</strong>
          <p>如果地址来自 AList，阿里云盘授权和 token 刷新都由 AList 处理。</p>
        </div>
      </div>
      <div class="source-card" v-else>
        <span class="source-logo">A</span>
        <div>
          <strong>推荐使用 AList 连接阿里云盘</strong>
          <p>阿里云盘授权交给 AList，我们只保存 AList 暴露的 WebDAV 地址。</p>
        </div>
      </div>

      <section class="alist-guide">
        <div class="alist-qr">
          <img :src="alistQrUrl" alt="AList 阿里云盘扫码授权工具二维码" />
        </div>
        <div class="alist-steps">
          <div>
            <strong>1. 用 AList 扫码授权</strong>
            <p>打开 AList 的 Aliyundrive Open 工具，按页面提示扫码或跳转 App，拿到 refresh_token。</p>
          </div>
          <div>
            <strong>2. 在 AList 后台添加存储</strong>
            <p>驱动选择“阿里云盘 Open”，粘贴 refresh_token；普通用户可继续使用 AList 默认应用。</p>
          </div>
          <div>
            <strong>3. 在这里保存 AList WebDAV</strong>
            <p>WebDAV 地址通常是 AList 站点加 /dav/，目录路径填写你的挂载路径或听书目录。</p>
          </div>
        </div>
      </section>

      <div class="dialog-actions">
        <el-button type="primary" @click="openExternal(alistTokenToolUrl)">
          打开扫码授权工具
        </el-button>
        <el-button @click="openExternal(alistAliyunDocUrl)">查看 AList 配置文档</el-button>
        <el-button text @click="webdavSettingsVisible = !webdavSettingsVisible">
          {{ webdavSettingsVisible ? '收起 AList WebDAV 配置' : '填写 AList WebDAV 配置' }}
        </el-button>
        <el-button text @click="localSettingsVisible = !localSettingsVisible">
          {{ localSettingsVisible ? '收起本地目录配置' : '展开本地目录配置' }}
        </el-button>
      </div>

      <section v-if="localSettingsVisible" class="fallback-settings">
        <el-form label-position="top" @submit.prevent>
          <el-form-item label="本地音频根目录">
            <el-input v-model="localForm.rootDir" placeholder="/app/data/library 或 C:\\Audiobooks" />
          </el-form-item>
          <el-form-item label="默认书架标题">
            <el-input v-model="localForm.bookTitle" placeholder="根目录下散放音频时使用" />
          </el-form-item>
          <el-form-item label="启用本地目录">
            <el-switch v-model="localForm.enabled" />
          </el-form-item>
        </el-form>
        <div class="folder-rule">
          <strong>目录规范</strong>
          <p>推荐：根目录 / 作者名 / 书名 / 001 章节名.mp3</p>
          <p>也支持：根目录 / 书名 / 001 章节名.mp3</p>
        </div>
        <div class="dialog-actions">
          <el-button type="primary" :loading="isSavingSettings" @click="submitLocalSettings">保存本地目录</el-button>
        </div>
      </section>

      <section v-if="webdavSettingsVisible" class="fallback-settings">
        <el-form label-position="top" @submit.prevent>
          <el-form-item label="AList WebDAV 地址">
            <el-input v-model="settingsForm.baseUrl" placeholder="https://alist.example.com/dav/" />
          </el-form-item>
          <el-form-item label="AList 用户名">
            <el-input v-model="settingsForm.username" />
          </el-form-item>
          <el-form-item label="AList 密码">
            <el-input v-model="settingsForm.password" type="password" show-password placeholder="留空表示不修改" />
          </el-form-item>
          <el-form-item label="听书目录路径">
            <el-input v-model="settingsForm.rootPath" placeholder="/阿里云盘/听书" />
          </el-form-item>
          <el-form-item label="书架标题">
            <el-input v-model="settingsForm.bookTitle" />
          </el-form-item>
        </el-form>
        <div class="folder-rule">
          <strong>AList WebDAV 地址示例</strong>
          <p>如果 AList 站点是 https://alist.example.com，WebDAV 地址填 https://alist.example.com/dav/。</p>
          <p>目录路径可以填 /，也可以填 /阿里云盘/听书 来只读取指定文件夹。</p>
        </div>
        <div class="dialog-actions">
          <el-button type="primary" :loading="isSavingSettings" @click="submitSettings">保存 AList WebDAV</el-button>
        </div>
      </section>
    </el-dialog>

    <el-dialog v-model="aboutVisible" width="min(92vw, 380px)" class="clean-dialog">
      <template #header>
        <strong>关于极简听书</strong>
      </template>
      <p class="about-copy">一个面向移动端的私人听书播放器，当前支持 WebDAV 音频目录、书架、播放进度和倍速播放。</p>
    </el-dialog>

    <el-dialog v-model="sourceDetailVisible" width="min(92vw, 420px)" class="clean-dialog source-detail-dialog">
      <template #header>
        <strong>书源详情</strong>
      </template>

      <section v-if="selectedSourceBook" class="source-detail-panel">
        <div class="source-detail-head">
          <span class="source-detail-cover">
            <img
              v-if="coverVisible(selectedSourceBook)"
              :src="coverUrlFor(selectedSourceBook)"
              alt=""
              @error="markCoverFailed(selectedSourceBook)"
            />
            <span v-else>{{ selectedSourceBook.title.slice(0, 1) }}</span>
          </span>
          <span class="source-detail-copy">
            <em class="source-platform-tag">{{ selectedSourceBook.sourceName }}</em>
            <strong>{{ selectedSourceBook.title }}</strong>
            <small>{{ sourceBookMeta(selectedSourceBook) }}</small>
          </span>
        </div>

        <p v-if="selectedSourceBook.description" class="source-detail-desc">
          {{ selectedSourceBook.description }}
        </p>

        <div class="source-detail-stats">
          <span>
            <small>平台</small>
            <strong>{{ selectedSourceBook.sourceName }}</strong>
          </span>
          <span>
            <small>章节</small>
            <strong>{{ selectedSourceBook.chapters?.length || 0 }}</strong>
          </span>
        </div>

        <div v-if="visibleSourcePreviewChapters.length" class="source-chapter-preview">
          <strong>章节预览</strong>
          <button
            v-for="chapter in visibleSourcePreviewChapters"
            :key="chapter.fileId"
            type="button"
            @click="listenSourceBook(chapter)"
          >
            <span>{{ chapterDisplayName(chapter) }}</span>
            <small>试听</small>
          </button>
        </div>

        <div class="dialog-actions source-detail-actions">
          <el-button :loading="addingSourceBookId === selectedSourcePayload?.id" @click="addNetworkBook(selectedSourcePayload)">
            加入收藏
          </el-button>
          <el-button type="primary" :loading="isLoadingAudio" @click="listenSourceBook()">
            试听
          </el-button>
        </div>
      </section>
    </el-dialog>

    <el-drawer
      v-model="chapterSheetVisible"
      direction="btt"
      size="80%"
      :with-header="false"
      modal-class="sheet-overlay"
      class="sheet-drawer"
    >
      <section class="sheet-panel">
        <div class="sheet-handle"></div>
        <div class="sheet-head">
          <div>
            <span class="sheet-kicker">播放列表</span>
            <h3 class="sheet-title-clamp">{{ currentBook?.title || '选择章节' }}</h3>
          </div>
          <span class="sheet-count-pill">{{ chapters.length }} 章</span>
        </div>

        <el-empty v-if="!chapters.length" description="当前还没有可播放章节" />

        <div v-else class="sheet-list">
          <button
            v-for="(chapter, index) in chapters"
            :key="chapter.fileId"
            class="sheet-chapter-item"
            :class="{ active: chapter.fileId === currentChapter?.fileId }"
            @click="selectChapterFromSheet(chapter)"
          >
            <span class="sheet-chapter-index">{{ String(index + 1).padStart(2, '0') }}</span>
            <span class="sheet-chapter-copy">
              <strong v-if="chapterDisplayName(chapter)">{{ chapterDisplayName(chapter) }}</strong>
              <small v-if="chapterMetaText(chapter)">{{ chapterMetaText(chapter) }}</small>
            </span>
            <span v-if="chapter.fileId === currentChapter?.fileId" class="sheet-status-pill" :class="{ playing: isPlaying }">
              {{ isPlaying ? '播放中' : '当前' }}
            </span>
            <span v-else class="sheet-play-button">
              <el-icon><VideoPlay /></el-icon>
            </span>
          </button>
        </div>
      </section>
    </el-drawer>

    <el-drawer
      v-model="settingsSheetVisible"
      direction="btt"
      size="36%"
      :with-header="false"
      modal-class="sheet-overlay"
      class="sheet-drawer settings-drawer"
    >
      <section class="sheet-panel compact">
        <div class="sheet-handle"></div>
        <div class="sheet-head">
          <div>
            <span class="sheet-kicker">播放设置</span>
            <h3>章节偏移</h3>
          </div>
        </div>
        <div class="setting-list">
          <label class="setting-row">
            <span>跳过片头</span>
            <el-input-number v-model="skipIntroSeconds" :min="0" :max="600" controls-position="right" />
          </label>
          <label class="setting-row">
            <span>跳过片尾</span>
            <el-input-number v-model="skipOutroSeconds" :min="0" :max="600" controls-position="right" />
          </label>
        </div>
      </section>
    </el-drawer>

    <el-drawer
      v-model="speedSheetVisible"
      direction="btt"
      size="42%"
      :with-header="false"
      modal-class="sheet-overlay"
      class="sheet-drawer speed-drawer"
    >
      <section class="sheet-panel compact">
        <div class="sheet-handle"></div>
        <div class="sheet-head">
          <div>
            <span class="sheet-kicker">&#x64ad;&#x653e;&#x901f;&#x5ea6;</span>
            <h3>{{ playbackRate.toFixed(1) }}x</h3>
          </div>
          <button class="speed-reset" @click="setPlaybackRate(1)">&#x6062;&#x590d; 1.0x</button>
        </div>

        <div class="speed-sheet-body">
          <div class="speed-live-readout">
            <strong>{{ playbackRateDraft.toFixed(1) }}x</strong>
            <span>{{ playbackRateDraft < 1 ? '&#x6162;&#x901f;&#x7ec6;&#x542c;' : playbackRateDraft === 1 ? '&#x6807;&#x51c6;&#x901f;&#x5ea6;' : '&#x52a0;&#x901f;&#x64ad;&#x653e;' }}</span>
          </div>
          <div class="speed-presets">
            <button
              v-for="rate in [0.8, 1.0, 1.2, 1.5, 2.0]"
              :key="rate"
              class="speed-preset"
              :class="{ active: playbackRate === rate }"
              @click="setPlaybackRate(rate)"
            >
              {{ rate.toFixed(1) }}x
            </button>
          </div>
          <el-slider
            v-model="playbackRateDraft"
            :min="0.5"
            :max="3"
            :step="0.1"
            :show-tooltip="true"
            @input="setPlaybackRate"
          />
        </div>
      </section>
    </el-drawer>

    <el-drawer
      v-model="sleepSheetVisible"
      direction="btt"
      size="62%"
      :with-header="false"
      modal-class="sheet-overlay"
      class="sheet-drawer sleep-drawer"
    >
      <section class="sheet-panel compact">
        <div class="sheet-handle"></div>
        <div class="sheet-head">
          <div>
            <span class="sheet-kicker">&#x5b9a;&#x65f6;&#x5173;&#x95ed;</span>
            <h3>{{ sleepTimerLabel }}</h3>
          </div>
          <button v-if="sleepMode" class="speed-reset" @click="clearSleepTimer">&#x53d6;&#x6d88;</button>
        </div>

        <div class="sleep-section">
          <strong>&#x6309;&#x7ae0;&#x8282;&#x5173;&#x95ed;</strong>
          <div class="sleep-options compact-options">
            <button
              v-for="count in [1, 2, 3, 5]"
              :key="count"
              class="sleep-option"
              :class="{ active: sleepMode === 'chapters' && sleepChapterCount === count }"
              @click="setSleepAfterChapters(count)"
            >
              {{ count }} &#x96c6;&#x540e;
            </button>
          </div>
          <div class="custom-sleep-row">
            <div class="sleep-stepper chapter-stepper">
              <button @click="adjustCustomSleepChapters(-1)">-</button>
              <span>{{ customSleepChapters }} &#x96c6;</span>
              <button @click="adjustCustomSleepChapters(1)">+</button>
            </div>
            <button class="sleep-option custom-apply" @click="setSleepAfterChapters(customSleepChapters)">&#x542f;&#x7528;</button>
          </div>
        </div>

        <div class="sleep-section">
          <strong>&#x6309;&#x65f6;&#x957f;&#x5173;&#x95ed;</strong>
          <div class="sleep-options compact-options">
            <button
              v-for="minute in [15, 30, 45, 60]"
              :key="minute"
              class="sleep-option"
              :class="{ active: sleepMode === 'minutes' && sleepTimerMinutes === minute }"
              @click="setSleepTimer(minute)"
            >
              {{ minute }} &#x5206;&#x949f;
            </button>
          </div>
          <div class="custom-sleep-row">
            <div class="sleep-time-picker">
              <div class="sleep-stepper">
                <button @click="adjustCustomSleepHours(-1)">-</button>
                <span>{{ customSleepHours }} &#x5c0f;&#x65f6;</span>
                <button @click="adjustCustomSleepHours(1)">+</button>
              </div>
              <div class="sleep-stepper">
                <button @click="adjustCustomSleepMinutes(-5)">-</button>
                <span>{{ customSleepMinutes }} &#x5206;&#x949f;</span>
                <button @click="adjustCustomSleepMinutes(5)">+</button>
              </div>
            </div>
            <button class="sleep-option custom-apply" @click="setSleepTimer(customSleepTotalMinutes)">&#x542f;&#x7528;</button>
          </div>
        </div>
      </section>
    </el-drawer>
  </main>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  getAuthConfig,
  getAuthStatus,
  getAudioUrl,
  getBooks,
  getPlaybackRecords,
  getUserSession,
  loginUser,
  logoutUser,
  previewSubscribedBook,
  quickLogin,
  registerUser,
  addSubscribedBook,
  saveAuthConfig,
  savePlaybackRecord,
  searchSubscriptionBooks,
  updateUserProfile
} from './api'
import { loadPlaybackState, savePlaybackState } from './storage'

const activeTab = ref('bookshelf')
const audioRef = ref(null)
const avatarInputRef = ref(null)
const localSourceInputRef = ref(null)
const contentRef = ref(null)
const authStatus = ref(null)
const user = ref(null)
const books = ref([])
const currentBook = ref(null)
const currentChapter = ref(null)
const currentTime = ref(0)
const duration = ref(0)
const sliderValue = ref(0)
const playbackRate = ref(1)
const isPlaying = ref(false)
const isLoadingBooks = ref(false)
const isLoadingAudio = ref(false)
const isSavingSettings = ref(false)
const isAuthing = ref(false)
const loginVisible = ref(false)
const settingsVisible = ref(false)
const aboutVisible = ref(false)
const loginMode = ref('login')
const pendingResumeTime = ref(0)
const chapterSheetVisible = ref(false)
const settingsSheetVisible = ref(false)
const speedSheetVisible = ref(false)
const sleepSheetVisible = ref(false)
const webdavSettingsVisible = ref(false)
const localSettingsVisible = ref(false)
const aliyunAdvancedVisible = ref(false)
const playbackRateDraft = ref(1)
const sleepTimerMinutes = ref(0)
const sleepTimerRemaining = ref(0)
const sleepMode = ref('')
const sleepChapterCount = ref(0)
const customSleepMinutes = ref(20)
const customSleepHours = ref(0)
const customSleepChapters = ref(4)
const customSleepTotalMinutes = computed(() => Math.max(1, (customSleepHours.value * 60) + customSleepMinutes.value))
const alistTokenToolUrl = 'https://alist.nn.ci/tool/aliyundrive/request'
const alistAliyunDocUrl = 'https://alist.nn.ci/guide/drivers/aliyundrive_open.html'
const alistQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=8&data=${encodeURIComponent(alistTokenToolUrl)}`
const playerSettings = loadJson('my-read-player-settings', { skipIntroSeconds: 0, skipOutroSeconds: 0 })
const skipIntroSeconds = ref(playerSettings.skipIntroSeconds || 0)
const skipOutroSeconds = ref(playerSettings.skipOutroSeconds || 0)
const isFavorite = ref(false)
const isSavingProfile = ref(false)
const favoriteBooks = ref([])
const playbackRecords = ref({})
const totalListenSeconds = ref(0)
const todayListenSeconds = ref(0)
const streakDays = ref(0)
const pullDistance = ref(0)
const pullStartY = ref(0)
const isPulling = ref(false)
const homeSearchKeyword = ref('')
const sourceSearchKeyword = ref('')
const sourceSearchResults = ref([])
const isSearchingSources = ref(false)
const addingSourceBookId = ref('')
const previewingSourceBookId = ref('')
const sourceDetailVisible = ref(false)
const selectedSourcePayload = ref(null)
const selectedSourceBook = ref(null)
const selectedLocalSourceName = ref('')
const selectedLocalSourceSummary = ref('')
let sleepTimerId = null
let lastTrackedTime = 0
let lastProgressSync = 0
let audioErrorToastVisible = false

const settingsForm = reactive({
  baseUrl: '',
  username: '',
  password: '',
  rootPath: '/',
  bookTitle: '我的听书'
})

const localForm = reactive({
  enabled: true,
  rootDir: '',
  bookTitle: '本地听书'
})

const aliyunForm = reactive({
  apiBase: 'https://openapi.alipan.com',
  clientId: '',
  clientSecret: '',
  redirectUri: '',
  scope: 'user:base,file:all:read',
  rootFileId: 'root',
  bookTitle: '我的听书'
})

const loginForm = reactive({
  account: '',
  password: '',
  nickname: ''
})

const profileForm = reactive({
  nickname: '',
  email: '',
  avatarUrl: ''
})

const rates = [0.75, 1, 1.25, 1.5, 2]
const waveBars = [
  26, 34, 39, 36, 33, 31, 29, 24, 18, 20, 25, 30,
  32, 35, 38, 33, 25, 20, 24, 30, 36, 41, 39, 35,
  31, 26, 20, 24, 31, 36, 34, 32, 35, 37, 34, 28,
  22, 18, 23, 29, 34, 38, 35, 30
]

const presetBookSources = [
  { id: 'ting15', name: 'Ting15', url: 'https://m.ting15.com' },
  { id: 'bilibili', name: 'BiliBili', url: 'https://m.bilibili.com' },
  { id: 'kuwo', name: '酷我畅听', url: 'https://kuwo.cn' },
  { id: 'lanren', name: '懒人听书', url: 'https://m.lrts.me' },
  { id: 'bokan', name: '博看有声', url: 'https://voicewk.bookan.com.cn' },
  { id: 'yuntu', name: '云图有声', url: 'http://yuntuwechat.yuntuys.com' }
]

const localSourceState = loadJson('my-read-local-source-selection', {
  name: '',
  summary: ''
})
selectedLocalSourceName.value = localSourceState.name || ''
selectedLocalSourceSummary.value = localSourceState.summary || ''

const chapters = computed(() => currentBook.value?.chapters || [])
const sourcePreviewChapters = computed(() => (selectedSourceBook.value?.chapters || []).slice(0, 8))
const visibleSourcePreviewChapters = computed(() => sourcePreviewChapters.value.filter((chapter) => chapterDisplayName(chapter)))
const currentIndex = computed(() => chapters.value.findIndex((item) => item.fileId === currentChapter.value?.fileId))
const hasPrevious = computed(() => currentIndex.value > 0)
const hasNext = computed(() => currentIndex.value >= 0 && currentIndex.value < chapters.value.length - 1)
const bookInitial = computed(() => currentBook.value?.title?.slice(0, 1) || '听')
const coverGradient = computed(() => {
  const seed = currentBook.value?.title || '我的听书'
  const hue = Array.from(seed).reduce((total, char) => total + char.charCodeAt(0), 0) % 360
  return `linear-gradient(135deg, hsl(${hue} 42% 38%), hsl(${(hue + 72) % 360} 46% 54%))`
})
const playerProgressPercent = computed(() => {
  if (!currentChapter.value || !duration.value) return 0
  return Math.min(100, Math.max(0, (currentTime.value / duration.value) * 100))
})
const waveActiveCount = computed(() => Math.round((playerProgressPercent.value / 100) * waveBars.length))
const chapterSubTitle = computed(() => {
  if (!currentChapter.value) return authStatus.value?.configured ? '等待选择章节' : '登录后配置听书源'
  const index = currentIndex.value + 1
  return index > 0 ? `${currentChapter.value.name}（${index}/${chapters.value.length}）` : currentChapter.value.name
})
const remainingTime = computed(() => {
  if (!duration.value || !currentChapter.value) return '--:--'
  return formatTime(Math.max(0, duration.value - currentTime.value))
})
const sleepTimerLabel = computed(() => {
  if (sleepMode.value === 'chapters') return sleepChapterCount.value + ' \u96c6\u540e'
  if (sleepMode.value === 'minutes') return Math.ceil(sleepTimerRemaining.value / 60) + ' \u5206\u949f\u540e'
  return '\u5b9a\u65f6\u5173\u95ed'
})
const pullRefreshText = computed(() => {
  if (isLoadingBooks.value) return '正在刷新'
  return pullDistance.value >= 64 ? '松开刷新' : '下拉刷新'
})
const sourceStatusCopy = computed(() => {
  if (authStatus.value?.sourceType === 'local') return '当前使用本地音频目录，网盘为可选备用渠道'
  if (authStatus.value?.sourceType === 'aliyun') return '当前使用旧版阿里云盘直连，建议迁移到 AList WebDAV'
  if (authStatus.value?.sourceType === 'webdav') return '当前通过 WebDAV 读取音频，可直接连接 AList /dav/'
  return '登录后在授权中心连接 AList WebDAV'
})
const sourceSearchEmptyText = computed(() => {
  if (isSearchingSources.value) return '正在搜索'
  return sourceSearchKeyword.value.trim() ? '没有找到匹配书籍' : '输入关键词开始搜索'
})

onMounted(async () => {
  const saved = loadPlaybackState()
  playbackRate.value = saved.playbackRate || 1
  playbackRateDraft.value = playbackRate.value
  pendingResumeTime.value = saved.currentTime || 0
  loadSavedCollections()
  loadListeningStats()

  const savedRecords = await loadPlaybackRecords()
  await Promise.allSettled([loadUser(), loadConfig(), loadAuthStatus()])
  if (new URLSearchParams(window.location.search).get('aliyun') === 'connected') {
    ElMessage.success('阿里云盘授权成功')
    window.history.replaceState({}, '', window.location.pathname)
  }
  await loadBooks({ ...saved, records: savedRecords })
})

onUnmounted(() => {
  if (sleepTimerId) window.clearInterval(sleepTimerId)
  persistPlaybackProgress(true)
})

watch([currentBook, currentChapter, currentTime, playbackRate], () => {
  savePlaybackState({
    currentBookId: currentBook.value?.id,
    currentChapterId: currentChapter.value?.fileId,
    currentTime: currentTime.value,
    playbackRate: playbackRate.value
  })
  persistPlaybackProgress()
})

watch(playbackRate, (rate) => {
  if (audioRef.value) audioRef.value.playbackRate = rate
  playbackRateDraft.value = rate
})

watch([skipIntroSeconds, skipOutroSeconds], () => {
  saveJson('my-read-player-settings', {
    skipIntroSeconds: skipIntroSeconds.value,
    skipOutroSeconds: skipOutroSeconds.value
  })
})

function handleAvatarClick() {
  if (user.value) {
    openProfileEditor()
    return
  }
  loginVisible.value = true
}

function syncProfileForm(nextUser = user.value) {
  Object.assign(profileForm, {
    nickname: nextUser?.nickname || '',
    email: nextUser?.email || '',
    avatarUrl: nextUser?.avatarUrl || ''
  })
}

function openProfileEditor() {
  syncProfileForm()
  activeTab.value = 'profile'
}

function triggerAvatarPicker() {
  avatarInputRef.value?.click()
}

async function onAvatarFileChange(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    ElMessage.warning('请选择图片文件')
    return
  }

  try {
    profileForm.avatarUrl = await resizeAvatarFile(file)
  } catch (error) {
    ElMessage.error(error.message || '头像读取失败')
  }
}

function resizeAvatarFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('头像读取失败'))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => reject(new Error('头像格式不支持'))
      image.onload = () => {
        const size = 240
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const context = canvas.getContext('2d')
        const sourceSize = Math.min(image.width, image.height)
        const sourceX = (image.width - sourceSize) / 2
        const sourceY = (image.height - sourceSize) / 2
        context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      image.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

function openSettings() {
  if (!user.value) {
    loginVisible.value = true
    return
  }
  settingsVisible.value = true
}

function openSourceManager() {
  activeTab.value = 'sourceManager'
}

async function chooseLocalSourceFolder() {
  if ('showDirectoryPicker' in window) {
    try {
      const directoryHandle = await window.showDirectoryPicker({ mode: 'read' })
      selectedLocalSourceName.value = directoryHandle.name || '本地文件夹'
      selectedLocalSourceSummary.value = '已选择文件夹，等待 App 原生读取'
      saveLocalSourceSelection()
      ElMessage.success('已选择本地书源文件夹')
      return
    } catch (error) {
      if (error?.name === 'AbortError') return
      ElMessage.warning('系统文件夹选择器不可用，已切换为文件夹上传选择')
    }
  }

  localSourceInputRef.value?.click()
}

function onLocalSourceFolderChange(event) {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  if (!files.length) return

  const firstPath = files[0].webkitRelativePath || files[0].name
  const folderName = firstPath.split('/').filter(Boolean)[0] || '本地文件夹'
  const audioCount = files.filter((file) => /\.(mp3|m4a|aac|wav|flac|wma)$/i.test(file.name)).length
  const coverCount = files.filter((file) => /(^|\/)(cover|folder)\.(jpe?g|png|webp)$/i.test(file.webkitRelativePath || file.name)).length

  selectedLocalSourceName.value = folderName
  selectedLocalSourceSummary.value = `${audioCount} 个音频文件${coverCount ? `，${coverCount} 张封面` : ''}`
  saveLocalSourceSelection()
  ElMessage.success('已选择本地书源文件夹')
}

function saveLocalSourceSelection() {
  saveJson('my-read-local-source-selection', {
    name: selectedLocalSourceName.value,
    summary: selectedLocalSourceSummary.value
  })
}

function openSourceSearch() {
  if (!user.value) {
    loginVisible.value = true
    return
  }
  if (homeSearchKeyword.value.trim()) {
    sourceSearchKeyword.value = homeSearchKeyword.value.trim()
  }
  activeTab.value = 'sourceSearch'
}

async function submitHomeSourceSearch() {
  const keyword = homeSearchKeyword.value.trim()
  if (!keyword) {
    openSourceSearch()
    return
  }
  sourceSearchKeyword.value = keyword
  openSourceSearch()
  if (user.value) await searchNetworkSources()
}

async function searchNetworkSources() {
  const keyword = sourceSearchKeyword.value.trim()
  if (!keyword) {
    ElMessage.warning('请输入搜索关键词')
    return
  }

  isSearchingSources.value = true
  try {
    const data = await searchSubscriptionBooks(keyword)
    sourceSearchResults.value = data.items || []
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    isSearchingSources.value = false
  }
}

async function openSourceBookDetail(item) {
  if (!item) return
  previewingSourceBookId.value = item.id
  selectedSourcePayload.value = item
  selectedSourceBook.value = null
  try {
    const data = await previewSubscribedBook(item)
    selectedSourceBook.value = {
      ...data.item,
      description: item.description || data.item.description || ''
    }
    sourceDetailVisible.value = true
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    previewingSourceBookId.value = ''
  }
}

async function addNetworkBook(item) {
  if (!item) return
  addingSourceBookId.value = item.id
  try {
    await addSubscribedBook(item)
    ElMessage.success('已加入收藏')
    await loadBooks()
    sourceDetailVisible.value = false
    activeTab.value = 'bookshelf'
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    addingSourceBookId.value = ''
  }
}

async function listenSourceBook(chapter = null) {
  if (!selectedSourceBook.value) return
  const targetChapter = chapter || selectedSourceBook.value.chapters?.[0]
  if (!targetChapter) {
    ElMessage.warning('没有可试听章节')
    return
  }
  currentBook.value = selectedSourceBook.value
  currentChapter.value = targetChapter
  sourceDetailVisible.value = false
  await selectChapter(targetChapter, true)
}

function onPullStart(event) {
  if (activeTab.value !== 'bookshelf' || isLoadingBooks.value) return
  if ((contentRef.value?.scrollTop || 0) > 0) return
  pullStartY.value = event.touches?.[0]?.clientY || 0
  isPulling.value = true
}

function onPullMove(event) {
  if (!isPulling.value || activeTab.value !== 'bookshelf') return
  const currentY = event.touches?.[0]?.clientY || 0
  const delta = currentY - pullStartY.value
  if (delta <= 0) {
    pullDistance.value = 0
    return
  }
  pullDistance.value = Math.min(88, Math.round(delta * 0.45))
}

async function onPullEnd() {
  if (!isPulling.value) return
  const shouldRefresh = pullDistance.value >= 64
  isPulling.value = false
  if (shouldRefresh) {
    pullDistance.value = 44
    await loadBooks()
  }
  pullDistance.value = 0
}

async function loadUser() {
  const data = await getUserSession()
  user.value = data.user
  syncProfileForm(data.user)
}

async function submitLogin() {
  if (!loginForm.account.trim() || !loginForm.password.trim()) {
    ElMessage.warning('请填写账号和密码')
    return
  }

  isAuthing.value = true
  try {
    const data = loginMode.value === 'login'
      ? await loginUser(loginForm)
      : await registerUser(loginForm)
    user.value = data.user
    syncProfileForm(data.user)
    loginVisible.value = false
    ElMessage.success('欢迎回来')
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    isAuthing.value = false
  }
}

async function doQuickLogin() {
  isAuthing.value = true
  try {
    const data = await quickLogin()
    user.value = data.user
    syncProfileForm(data.user)
    loginVisible.value = false
    ElMessage.success('已进入体验账号')
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    isAuthing.value = false
  }
}

async function logout() {
  await logoutUser()
  user.value = null
  activeTab.value = 'me'
  syncProfileForm(null)
  ElMessage.success('已退出登录')
}

async function logoutFromProfile() {
  await logout()
}

async function submitProfile() {
  if (!user.value) {
    loginVisible.value = true
    return
  }

  isSavingProfile.value = true
  try {
    const data = await updateUserProfile({
      nickname: profileForm.nickname,
      email: profileForm.email,
      avatarUrl: profileForm.avatarUrl
    })
    user.value = data.user
    syncProfileForm(data.user)
    ElMessage.success('资料已更新')
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    isSavingProfile.value = false
  }
}

async function loadAuthStatus() {
  try {
    authStatus.value = await getAuthStatus()
  } catch (error) {
    ElMessage.warning(error.message)
  }
}

async function loadConfig() {
  try {
    const data = await getAuthConfig()
    const wd = data.webdav || {}
    const local = data.local || {}
    Object.assign(aliyunForm, {
      apiBase: data.apiBase || 'https://openapi.alipan.com',
      clientId: data.clientId || '',
      clientSecret: '',
      redirectUri: data.redirectUri || '',
      scope: data.scope || 'user:base,file:all:read',
      rootFileId: data.rootFileId || 'root',
      bookTitle: data.bookTitle || '我的听书'
    })
    Object.assign(settingsForm, {
      baseUrl: wd.baseUrl || '',
      username: wd.username || '',
      password: '',
      rootPath: wd.rootPath || '/',
      bookTitle: wd.bookTitle || '我的听书'
    })
    Object.assign(localForm, {
      enabled: local.enabled !== false,
      rootDir: local.rootDir || '',
      bookTitle: local.bookTitle || '本地听书'
    })
  } catch (error) {
    ElMessage.warning(error.message)
  }
}

function openExternal(url) {
  window.open(url, '_blank', 'noopener,noreferrer')
}

async function submitLocalSettings() {
  if (localForm.enabled && !localForm.rootDir.trim()) {
    ElMessage.warning('请填写本地音频根目录')
    return
  }

  isSavingSettings.value = true
  try {
    const result = await saveAuthConfig({
      local: {
        enabled: localForm.enabled,
        rootDir: localForm.rootDir,
        bookTitle: localForm.bookTitle
      }
    })
    authStatus.value = result.status
    settingsVisible.value = false
    ElMessage.success('本地目录已保存')
    await loadBooks()
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    isSavingSettings.value = false
  }
}

async function submitSettings() {
  if (!settingsForm.baseUrl.trim()) return ElMessage.warning('请填写 WebDAV 地址')
  if (!settingsForm.username.trim()) return ElMessage.warning('请填写用户名')

  isSavingSettings.value = true
  try {
    const payload = {
      webdav: {
        baseUrl: settingsForm.baseUrl,
        username: settingsForm.username,
        rootPath: settingsForm.rootPath,
        bookTitle: settingsForm.bookTitle
      }
    }
    if (settingsForm.password.trim()) payload.webdav.password = settingsForm.password

    const result = await saveAuthConfig(payload)
    authStatus.value = result.status
    settingsForm.password = ''
    settingsVisible.value = false
    ElMessage.success('设置已保存')
    await loadBooks()
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    isSavingSettings.value = false
  }
}

async function loadBooks(saved = loadPlaybackState()) {
  isLoadingBooks.value = true
  try {
    const data = await getBooks()
    books.value = data.books || []
    const records = saved.records || playbackRecords.value
    const latestRecord = Object.values(records).sort((a, b) => Number(b.updatedAt || 0) - Number(a.updatedAt || 0))[0]
    const restoredBookId = latestRecord?.bookId || saved.currentBookId
    const restoredChapterId = latestRecord?.chapterId || saved.currentChapterId
    const restoredTime = latestRecord ? latestRecord.currentTime : saved.currentTime
    const restoredBook = books.value.find((book) => book.id === restoredBookId)
    currentBook.value = restoredBook || books.value[0] || null
    if (!currentBook.value) return

    const restoredChapter = chapters.value.find((item) => item.fileId === restoredChapterId)
    currentChapter.value = restoredChapter || chapters.value[0] || null
    if (currentChapter.value && restoredChapterId === currentChapter.value.fileId) {
      pendingResumeTime.value = restoredTime || 0
    }
  } catch (error) {
    ElMessage.error(error.message)
  } finally {
    isLoadingBooks.value = false
  }
}

function selectBook(book, resume = false) {
  currentBook.value = book
  const record = playbackRecords.value[book.id]
  const chapter = resume && record
    ? (book.chapters || []).find((item) => item.fileId === record.chapterId)
    : null
  currentChapter.value = chapter || (book.chapters || [])[0] || null
  pendingResumeTime.value = chapter ? record.currentTime || 0 : 0
}

async function openBookFromShelf(book) {
  selectBook(book, true)
  if (currentChapter.value) {
    await selectChapter(currentChapter.value, false)
  } else {
    activeTab.value = 'player'
  }
}

async function selectChapter(chapter, shouldAutoPlay = false) {
  if (!chapter) return
  const resumeTime = currentChapter.value?.fileId === chapter.fileId ? pendingResumeTime.value : 0
  currentChapter.value = chapter
  currentTime.value = 0
  sliderValue.value = 0
  pendingResumeTime.value = resumeTime
  activeTab.value = 'player'
  await loadAudioForChapter(chapter, shouldAutoPlay)
}

async function loadAudioForChapter(chapter, shouldAutoPlay) {
  if (!audioRef.value || !chapter) return

  isLoadingAudio.value = true
  try {
    const { url, duration: probedDuration } = await getAudioUrl(chapter.fileId)
    if (!url) throw new Error('没有获取到音频播放地址')
    await verifyAudioStream(url)
    duration.value = Number.isFinite(probedDuration) && probedDuration > 0 ? probedDuration : 0
    audioRef.value.pause()
    audioRef.value.removeAttribute('src')
    audioRef.value.src = url
    audioRef.value.playbackRate = playbackRate.value
    audioRef.value.load()

    if (shouldAutoPlay) {
      await nextTick()
      await audioRef.value.play().catch(() => {
        throw new Error('当前音频无法播放，请检查音频格式或听书源配置')
      })
    }
  } catch (error) {
    ElMessage.error(normalizeAudioError(error))
  } finally {
    isLoadingAudio.value = false
  }
}

async function verifyAudioStream(url) {
  const response = await fetch(url, {
    headers: { Range: 'bytes=0-1' }
  })
  if (response.ok || response.status === 206) {
    await response.body?.cancel?.().catch(() => {})
    return
  }

  const payload = await response.json().catch(() => null)
  const message = payload?.error?.message || payload?.message || `音频流不可用：${response.status}`
  throw new Error(message)
}

function normalizeAudioError(error) {
  const message = String(error?.message || '')
  if (message.includes('supported sources') || message.includes('MEDIA_ERR_SRC_NOT_SUPPORTED')) {
    return '当前音频无法播放，请检查音频格式或听书源配置'
  }
  return message || '音频播放失败'
}

async function togglePlay() {
  if (!audioRef.value || !currentChapter.value) return

  if (!audioRef.value.src) {
    await loadAudioForChapter(currentChapter.value, true)
    return
  }

  if (audioRef.value.paused) {
    await audioRef.value.play().catch((error) => ElMessage.error(normalizeAudioError(error)))
  } else {
    audioRef.value.pause()
  }
}

async function seekTo(value) {
  if (!audioRef.value || !Number.isFinite(value)) return
  if (!audioRef.value.src && currentChapter.value) {
    pendingResumeTime.value = value
    await loadAudioForChapter(currentChapter.value, false)
    return
  }
  const nextTime = Math.max(0, Math.min(duration.value || value, value))
  audioRef.value.currentTime = nextTime
  currentTime.value = nextTime
  sliderValue.value = nextTime
  persistPlaybackProgress(true)
}

function jumpBy(seconds) {
  if (!audioRef.value || !currentChapter.value) return
  const nextTime = Math.min(duration.value || 0, Math.max(0, currentTime.value + seconds))
  seekTo(nextTime)
}

function onLoadedMetadata() {
  const metadataDuration = audioRef.value?.duration || 0
  if (Number.isFinite(metadataDuration) && metadataDuration > 0) {
    duration.value = metadataDuration
  }
  audioRef.value.playbackRate = playbackRate.value

  const resumeTime = pendingResumeTime.value > 0
    ? pendingResumeTime.value
    : skipIntroSeconds.value

  if (resumeTime > 0 && resumeTime < duration.value) {
    audioRef.value.currentTime = resumeTime
    currentTime.value = resumeTime
    sliderValue.value = resumeTime
    pendingResumeTime.value = 0
  }
}

function onTimeUpdate() {
  currentTime.value = audioRef.value?.currentTime || 0
  sliderValue.value = currentTime.value
  if (skipOutroSeconds.value > 0 && duration.value > 0 && duration.value - currentTime.value <= skipOutroSeconds.value) {
    if (hasNext.value) playNext()
    else audioRef.value?.pause()
    return
  }
  trackListeningProgress()
}

function onAudioPlay() {
  isPlaying.value = true
  lastTrackedTime = audioRef.value?.currentTime || 0
}

function onAudioPause() {
  isPlaying.value = false
  persistPlaybackProgress(true)
}

function onEnded() {
  if (sleepMode.value === 'chapters') {
    sleepChapterCount.value = Math.max(0, sleepChapterCount.value - 1)
    if (sleepChapterCount.value <= 0) {
      stopForSleepTimer('\u003f\u003f\u003f\u003f\u003f\u003f\u003f\u003f')
      return
    }
  }
  if (hasNext.value) playNext()
}

async function onAudioError() {
  if (!currentChapter.value || isLoadingAudio.value || audioErrorToastVisible) return
  audioErrorToastVisible = true
  isPlaying.value = false
  ElMessage.error(normalizeAudioError(new Error(audioRef.value?.error?.message || 'MEDIA_ERR_SRC_NOT_SUPPORTED')))
  window.setTimeout(() => {
    audioErrorToastVisible = false
  }, 1200)
}

function cycleRate() {
  const currentRateIndex = rates.indexOf(playbackRate.value)
  playbackRate.value = rates[(currentRateIndex + 1) % rates.length]
}

function setPlaybackRate(rate) {
  const normalized = Math.round(Number(rate) * 10) / 10
  playbackRate.value = normalized
  playbackRateDraft.value = normalized
}

function toggleFavorite() {
  if (!currentBook.value) return
  const exists = favoriteBooks.value.some((book) => book.id === currentBook.value.id)
  if (exists) {
    favoriteBooks.value = favoriteBooks.value.filter((book) => book.id !== currentBook.value.id)
  } else {
    favoriteBooks.value.unshift({
      id: currentBook.value.id,
      title: currentBook.value.title,
      chapterCount: chapters.value.length,
      savedAt: Date.now()
    })
  }
  saveJson('my-read-favorites', favoriteBooks.value)
  updateFavoriteState()
  ElMessage.success(isFavorite.value ? '\u003f\u003f\u003f\u003f\u003f\u003f\u003f' : '\u003f\u003f\u003f\u003f\u003f')
}

function setSleepTimer(minutes) {
  const normalized = Math.max(1, Number(minutes) || 1)
  sleepMode.value = 'minutes'
  sleepTimerMinutes.value = normalized
  sleepTimerRemaining.value = normalized * 60
  sleepChapterCount.value = 0
  sleepSheetVisible.value = false
  if (sleepTimerId) window.clearInterval(sleepTimerId)
  sleepTimerId = window.setInterval(() => {
    sleepTimerRemaining.value = Math.max(0, sleepTimerRemaining.value - 1)
    if (sleepTimerRemaining.value > 0) return
    stopForSleepTimer('\u003f\u003f\u003f\u003f\u003f\u003f\u003f\u003f')
  }, 1000)
}

function setSleepAfterChapters(count) {
  sleepMode.value = 'chapters'
  sleepChapterCount.value = Math.max(1, Number(count) || 1)
  sleepTimerMinutes.value = 0
  sleepTimerRemaining.value = 0
  if (sleepTimerId) window.clearInterval(sleepTimerId)
  sleepTimerId = null
  sleepSheetVisible.value = false
  ElMessage.success('\u003f\u003f\u003f\u003f\u003f ' + sleepChapterCount.value + ' \u003f\u003f\u003f\u003f')
}

function adjustCustomSleepChapters(delta) {
  customSleepChapters.value = Math.min(99, Math.max(1, Number(customSleepChapters.value || 1) + delta))
}

function adjustCustomSleepHours(delta) {
  customSleepHours.value = Math.min(23, Math.max(0, Number(customSleepHours.value || 0) + delta))
  if (customSleepHours.value === 0 && customSleepMinutes.value === 0) customSleepMinutes.value = 5
}

function adjustCustomSleepMinutes(delta) {
  customSleepMinutes.value = Math.min(55, Math.max(0, Number(customSleepMinutes.value || 0) + delta))
  if (customSleepHours.value === 0 && customSleepMinutes.value === 0) customSleepMinutes.value = 5
}

function clearSleepTimer() {
  if (sleepTimerId) window.clearInterval(sleepTimerId)
  sleepTimerId = null
  sleepTimerMinutes.value = 0
  sleepTimerRemaining.value = 0
  sleepMode.value = ''
  sleepChapterCount.value = 0
  sleepSheetVisible.value = false
}

function stopForSleepTimer(message) {
  clearSleepTimer()
  audioRef.value?.pause()
  ElMessage.info(message)
}

watch(currentBook, updateFavoriteState)

function selectChapterFromSheet(chapter) {
  chapterSheetVisible.value = false
  selectChapter(chapter, true)
}

function playPrevious() {
  if (hasPrevious.value) selectChapter(chapters.value[currentIndex.value - 1], true)
}

function playNext() {
  if (hasNext.value) selectChapter(chapters.value[currentIndex.value + 1], true)
}

function loadSavedCollections() {
  favoriteBooks.value = loadJson('my-read-favorites', [])
  updateFavoriteState()
}

function updateFavoriteState() {
  isFavorite.value = Boolean(currentBook.value && favoriteBooks.value.some((book) => book.id === currentBook.value.id))
}

function openFavoriteBook(book) {
  const target = books.value.find((item) => item.id === book.id)
  if (!target) return
  selectBook(target, true)
  if (currentChapter.value) {
    selectChapter(currentChapter.value, true)
  } else {
    activeTab.value = 'bookshelf'
  }
}

async function loadPlaybackRecords() {
  try {
    const data = await getPlaybackRecords()
    playbackRecords.value = Object.fromEntries((data.records || []).map((record) => [record.bookId, record]))
    return playbackRecords.value
  } catch (error) {
    console.warn(error.message)
    return playbackRecords.value
  }
}

function persistPlaybackProgress(force = false) {
  if (!currentBook.value || !currentChapter.value) return
  const now = Date.now()
  if (!force && now - lastProgressSync < 5000) return
  lastProgressSync = now

  const record = {
    bookId: currentBook.value.id,
    bookTitle: currentBook.value.title,
    chapterId: currentChapter.value.fileId,
    chapterName: currentChapter.value.name,
    chapterIndex: Math.max(0, currentIndex.value),
    chapterCount: chapters.value.length,
    currentTime: currentTime.value,
    duration: duration.value,
    updatedAt: now
  }
  playbackRecords.value = {
    ...playbackRecords.value,
    [record.bookId]: record
  }
  savePlaybackRecord(record).catch((error) => console.warn(error.message))
}

function favoriteBookSubTitle(book) {
  const record = playbackRecords.value[book.id]
  if (!record) return `${book.chapterCount || 0} 章`
  return `继续 ${record.chapterName || '上次章节'} · ${formatTime(record.currentTime)}`
}

function bookAuthor(book) {
  return book.author || book.authorName || book.creator || '未知作者'
}

function sourceBookMeta(book) {
  return [book.author, book.narrator, `${book.chapters?.length || 0} 章`].filter(Boolean).join(' · ')
}

function bookSubTitle(book) {
  const record = playbackRecords.value[book.id]
  const chapterCount = (book.chapters || []).length
  if (record?.chapterName) return `上次听到 ${record.chapterName} · 共${chapterCount}章`
  return `共${chapterCount}章`
}

function chapterDisplayName(chapter) {
  const name = String(chapter?.name || '').trim()
  if (!name || /^chapter\s*\d*$/i.test(name)) return ''
  return name
}

function chapterMetaText(chapter) {
  if (chapter?.fileId === currentChapter.value?.fileId) return isPlaying.value ? '播放中' : '已选中'
  return ''
}

function isLongBookTitle(title = '') {
  return String(title).length > 14
}

function coverVisible(item) {
  return Boolean(item?.coverUrl && !item.coverLoadFailed)
}

function coverUrlFor(item) {
  const url = String(item?.coverUrl || '').trim()
  if (!url) return ''
  if (url.startsWith('/api/source-cover')) return url
  if (!/^https?:\/\//i.test(url)) return url
  return `/api/source-cover?url=${encodeURIComponent(url)}`
}

function markCoverFailed(item) {
  if (item) item.coverLoadFailed = true
}

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback))
  } catch {
    return fallback
  }
}

function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function loadListeningStats() {
  const today = new Date().toISOString().slice(0, 10)
  const stats = loadJson('my-read-listening-stats', { total: 0, days: {} })
  totalListenSeconds.value = stats.total || 0
  todayListenSeconds.value = stats.days?.[today] || 0
  streakDays.value = calculateStreak(stats.days || {}, today)
}

function trackListeningProgress() {
  if (!audioRef.value || !isPlaying.value) return
  const next = audioRef.value.currentTime || 0
  const delta = next - lastTrackedTime
  lastTrackedTime = next
  if (delta <= 0 || delta > 5) return
  const today = new Date().toISOString().slice(0, 10)
  const stats = loadJson('my-read-listening-stats', { total: 0, days: {} })
  stats.total = (stats.total || 0) + delta
  stats.days = stats.days || {}
  stats.days[today] = (stats.days[today] || 0) + delta
  saveJson('my-read-listening-stats', stats)
  totalListenSeconds.value = stats.total
  todayListenSeconds.value = stats.days[today]
  streakDays.value = calculateStreak(stats.days, today)
}

function calculateStreak(days, today) {
  let streak = 0
  const cursor = new Date(today + 'T00:00:00')
  while (days[cursor.toISOString().slice(0, 10)] > 0) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

function formatTime(seconds) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  const mins = Math.floor(value / 60)
  const secs = value % 60
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

function formatListenDuration(seconds, includeDays = false) {
  const value = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  const totalMinutes = Math.floor(value / 60)
  const days = includeDays ? Math.floor(totalMinutes / 1440) : 0
  const hours = includeDays ? Math.floor((totalMinutes % 1440) / 60) : Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (includeDays) return `${days}天${hours}小时${minutes}分钟`
  return `${hours}小时${minutes}分钟`
}

</script>
