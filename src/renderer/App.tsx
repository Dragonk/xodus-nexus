import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  ArrowDownToLine, Check, ChevronRight, CircleAlert, CircleUserRound,
  Clock3, Cog, Download, FolderOpen, Gamepad2, Github, HardDrive, Home, Languages, Library,
  LoaderCircle, LogIn, MoreHorizontal, PackageCheck, Pause, Play, Plus, RefreshCw, Rocket, Search, Settings2,
  Store, Terminal, Trash2, X,
} from 'lucide-react';
import type { AccountLibraryPage, AppSnapshot, CatalogProduct, CatalogSearchResult, DiagnosticLog, Game, GameContentPlan, GameLaunchOptions, Page, Settings } from '../shared/types';
import { estimatedSecondsRemaining } from '../shared/utils';
import { runtimeDisplay } from '../shared/runtime-display';
import { subscriptionBadge } from '../shared/subscription';
import { defaultLaunchTools, normalizeLaunchTools } from '../shared/launch-tools';
import type { GameLaunchTools } from '../shared/types';
import { PackageInstallProvider, usePackageInstall } from './PackageInstall';
import { defaultLibraryFilters, loadLibraryFilters, saveLibraryFilters, type LibraryFilters } from './library-preferences';
import { InstallQueueShortcut } from './InstallQueueShortcut';
import { GamepadNavigation } from './GamepadNavigation';
import { ConfirmationProvider, useConfirmation } from './Confirmation';
import { GameRemovalContents } from './GameRemovalContents';
import { applyLanguageSetting, formatTimeRemaining, isLanguage, t, useLanguage } from './i18n';
export type { LibraryFilters } from './library-preferences';

const emptySnapshot: AppSnapshot = {
  backend: {
    available: false, source: 'none', updateAvailable: false, checking: false, updating: false,
    externalRoot: '',
    capabilities: { commands: [], account: false, login: false, logout: false, download: false, streaming: false, run: false },
    prerequisites: { git: false, cargo: false, rustc: false, protoc: false },
  },
  runtime: {
    installed: false, checking: false, updating: false,
    runtimeRoot: '', artifactAvailable: false,
    prerequisites: { gh: false, authenticated: false, tar: false, sha512sum: false },
  },
  games: [], downloads: [],
  settings: {
    installRoot: '', market: 'neutral', parallelDownloads: 4, winePath: '',
    externalXodusRoot: '', runtimeRoot: '', verboseLogs: false, language: '',
  },
  auth: { running: false, stored: null, note: '' },
};

type Toast = { kind: 'success' | 'error' | 'info'; message: string };

function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking remote method '[^']+': Error:\s*/, '');
}

function StatusDot({ tone = 'green' }: { tone?: 'green' | 'amber' | 'red' }) {
  return <span className={`status-dot ${tone}`} />;
}

export function GameTitle({ title }: { title: string }) {
  return <strong title={title}>{title}</strong>;
}

function NavItem({ active, icon, label, badge, onClick, autoSelect = false }: {
  active: boolean; icon: React.ReactNode; label: string; badge?: number; onClick: () => void; autoSelect?: boolean;
}) {
  return <button className={`nav-item ${active ? 'active' : ''}`} data-gamepad-auto-select={autoSelect ? '' : undefined} onClick={onClick}>
    {icon}<span>{label}</span>{badge ? <b>{badge}</b> : null}
  </button>;
}

export function Sidebar({ data, page, go, openGame }: { data: AppSnapshot; page: Page; go: (page: Page) => void; openGame?: (id: string) => void }) {
  const account = data.auth.gamertag ?? data.auth.username ?? (data.auth.stored === true ? t('nav.microsoftAccount', 'Microsoft account') : t('nav.signIn', 'Sign in'));
  return <aside className="sidebar">
    <button className="account-summary" onClick={() => go('settings')}><AccountAvatar auth={data.auth} /><span><strong>{account}</strong><AccountMembership auth={data.auth} /></span><ChevronRight /></button>
    <nav><NavItem autoSelect active={page === 'home'} icon={<Home />} label={t('nav.home', 'Home')} onClick={() => go('home')} /><NavItem autoSelect active={page === 'library'} icon={<Library />} label={t('nav.library', 'My Library')} onClick={() => go('library')} /><NavItem autoSelect active={page === 'store'} icon={<Store />} label={t('nav.store', 'Store')} onClick={() => go('store')} /></nav>
    {data.games.length > 0 ? <div className="recents"><span>{t('nav.mostRecent', 'Most recent')}</span>{data.games.slice(0, 5).map(game => <button key={game.id} onClick={() => openGame ? openGame(game.id) : go('library')}><Cover game={game} /><GameTitle title={game.title} /></button>)}</div> : null}
    <div className="sidebar-bottom"><NavItem active={page === 'settings'} icon={<Cog />} label={t('nav.settings', 'Settings')} onClick={() => go('settings')} /><InstallQueueShortcut downloads={data.downloads} games={data.games} active={page === 'downloads'} openQueue={() => go('downloads')} /></div>
  </aside>;
}

function AccountMembership({ auth }: { auth: AppSnapshot['auth'] }) {
  const label = auth.stored === true ? subscriptionBadge(auth.subscription) : undefined;
  if (label) return <small className="account-membership" title={t('account.subscriptionVerified', 'Subscription verified {date}', { date: new Date(auth.subscription!.checkedAt).toLocaleString() })}>{label}</small>;
  return auth.stored === true ? null : <small>{auth.stored === false ? t('account.notSignedIn', 'Not signed in') : t('account.statusUnavailable', 'Status unavailable')}</small>;
}

function AccountAvatar({ auth, large = false }: { auth: AppSnapshot['auth']; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [auth.avatarDataUrl]);
  return <div className={`account-avatar${large ? ' large' : ''}`}>
    {auth.avatarDataUrl && !failed ? <img src={auth.avatarDataUrl} alt={t('account.avatarAlt', 'Xbox profile picture')} onError={() => setFailed(true)} /> : <CircleUserRound />}
  </div>;
}

export function TopStatus({ data, go }: { data: AppSnapshot; go: (page: Page) => void }) {
  return <div className="top-status">
    {data.launcherUpdate?.latestVersion || data.launcherUpdate?.restartRequired ? <button className="update-notice" title={data.launcherUpdate.restartRequired ? t('update.restartToFinish', 'Restart to finish launcher update') : t('update.launcherAvailable', 'Launcher {version} is available', { version: data.launcherUpdate.latestVersion })} onClick={() => go('settings')}><ArrowDownToLine /><strong>{data.launcherUpdate.restartRequired ? t('update.restartAvailable', 'Restart available') : t('update.updateAvailable', 'Update available')}</strong></button> : null}
    <StatusDot tone={data.backend.available ? 'green' : 'red'} /><span>{data.backend.available ? t('status.xodusReady', 'Xodus ready') : t('status.backendOffline', 'Backend offline')}</span><button title={t('nav.settings', 'Settings')} onClick={() => go('settings')}><Settings2 /></button>
  </div>;
}

export function DiagnosticDialog({ log, close }: { log: DiagnosticLog; close: () => void }) {
  return <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}><section className="game-dialog diagnostic-dialog" role="dialog" aria-modal="true" aria-label={t('diagnostic.dialogTitle', 'Diagnostic log')}><h2>{log.name}</h2><p>{t('diagnostic.private', 'Private diagnostic log — review before sharing.')}{log.truncated ? t('diagnostic.truncated', ' Showing the most recent 512 KiB.') : ''}</p><pre>{log.content || t('diagnostic.empty', 'The log is empty.')}</pre><div className="dialog-actions"><button className="secondary" data-gamepad-cancel onClick={close}>{t('common.close', 'Close')}</button></div></section></div>;
}

export function Cover({ game, className = '', variant = 'cover' }: { game: Game; className?: string; variant?: 'cover' | 'hero' }) {
  const sources = [...new Set([variant === 'hero' ? game.heroUrl : undefined, game.coverUrl, game.coverDataUrl].filter((url): url is string => Boolean(url)))];
  const key = sources.join('\n');
  const [failure, setFailure] = useState({ key: '', index: 0 });
  const index = failure.key === key ? failure.index : 0;
  const art = sources[index];
  if (art) return <img className={`game-cover ${art === game.coverDataUrl ? 'cover-local' : 'cover-store'} ${className}`} src={art} alt={t('common.artworkAlt', '{title} artwork', { title: game.title })} onError={() => setFailure({ key, index: index + 1 })} />;
  return <div className={`cover-placeholder ${className}`}><Gamepad2 /></div>;
}

function StatePill({ game }: { game: Game }) {
  const label = game.installState === 'ready' ? t('state.ready', 'Ready') : game.installState === 'incomplete' ? t('state.incomplete', 'Incomplete') : t('state.imported', 'Imported');
  return <span className={`state-pill ${game.installState}`}>
    {game.installState === 'ready' ? <Check /> : <CircleAlert />}{label}
  </span>;
}

function SectionTitle({ title, action, onClick }: { title: string; action?: string; onClick?: () => void }) {
  return <div className="section-title"><h2>{title}</h2>{action && onClick ? <button onClick={onClick}>{action}<ChevronRight /></button> : null}</div>;
}

function useGameLaunchOptions(game: Game | undefined, data: AppSnapshot): GameLaunchOptions | undefined {
  const [options, setOptions] = useState<GameLaunchOptions>();
  useEffect(() => {
    setOptions(undefined);
    if (!game) return;
    let cancelled = false;
    window.launcher.getGameLaunchOptions(game.id)
      .then((value) => { if (!cancelled) setOptions(value); })
      .catch((error) => { if (!cancelled) setOptions({ cloudSaves: false, cloudReason: errorMessage(error), vcInstall: false, vcReason: errorMessage(error) }); });
    return () => { cancelled = true; };
  }, [game?.id, data.settings.winePath, data.settings.runtimeRoot, data.runtime.winePath, data.backend.binaryPath, data.backend.commit, data.backend.available]);
  return options;
}

export function HomePage({ data, go, action }: {
  data: AppSnapshot; go: (page: Page) => void; action: (fn: () => Promise<unknown>, success?: string) => void;
}) {
  const featured = data.games[0];
  const active = data.downloads.find((task) => task.status === 'running' || task.status === 'paused');
  const canPlay = Boolean(featured?.installState === 'ready' && data.backend.capabilities.run && (data.settings.winePath || data.runtime.winePath));
  const launchOptions = useGameLaunchOptions(featured, data);
  const spotlightArt = featured?.heroUrl ?? featured?.coverUrl;

  return <main className="page home-page">
    <section className={`spotlight ${spotlightArt ? 'has-art' : ''}`} style={spotlightArt ? { '--spotlight-art': `url(${spotlightArt})` } as React.CSSProperties : undefined}>
      <div className="spotlight-copy">
        <span className="overline">{featured ? t('home.continuePlaying', 'CONTINUE PLAYING') : 'XODUS NEXUS'}</span>
        <h1>{featured?.title ?? t('home.headline', 'Your PC games, brought together.')}</h1>
        <p>{featured
          ? featured.installMessage ?? t('home.readyInLibrary', '{publisher} · Ready in your library', { publisher: featured.publisher ?? t('home.localXboxInstallation', 'Local Xbox PC installation') })
          : t('home.importHint', 'Import an existing Xodus installation or install a game you own using its Microsoft Store Product ID.')}</p>
        <div className="button-row">
          {featured && canPlay
            ? <button className="primary" onClick={() => action(() => window.launcher.launchGame(featured.id))}><Play fill="currentColor" />{t('common.play', 'Play')}</button>
            : <button className="primary" onClick={() => go(featured ? 'settings' : 'library')}><ChevronRight />{featured ? t('home.finishSetup', 'Finish setup') : t('home.importGame', 'Import a game')}</button>}
          <button className="secondary" onClick={() => go('library')}><Library />{t('home.viewLibrary', 'View library')}</button>
        </div>
      </div>
      {featured ? <div className="spotlight-meta"><StatePill game={featured} />{launchOptions?.cloudSaves ? <span>{t('home.cloudSaves', 'Cloud saves')}</span> : null}<span>{featured.storeId ? t('common.storeId', 'Store ID {id}', { id: featured.storeId }) : t('home.localImport', 'Local import')}</span></div> : null}
    </section>

    <SectionTitle title={t('home.recentlyAdded', 'Recently added')} action={t('home.seeAll', 'See all')} onClick={() => go('library')} />
    {data.games.length > 0 ? <div className="poster-row">
      {data.games.slice(0, 6).map((game) => <button className="poster-card" key={game.id} onClick={() => go('library')}>
        <Cover game={game} /><GameTitle title={game.title} /><span>{game.publisher ?? (game.storeId ? t('home.msStoreInstallation', 'Microsoft Store installation') : t('common.localInstallation', 'Local installation'))}</span>
      </button>)}
    </div> : <div className="empty-strip"><Gamepad2 /><div><strong>{t('home.noGamesImported', 'No games imported')}</strong><span>{t('home.emptyLibraryNote', 'Your library is built only from real local manifests.')}</span></div><button className="secondary" onClick={() => go('library')}>{t('home.importFolder', 'Import folder')}</button></div>}

    <SectionTitle title={t('home.quickAccess', 'Quick access')} />
    <div className="quick-grid">
      <button onClick={() => go('store')}><Store /><span><strong>{t('home.installGame', 'Install a game')}</strong><small>{t('home.verifiedProductId', 'Use a verified Product ID')}</small></span><ChevronRight /></button>
      <button onClick={() => go('downloads')}><Download /><span><strong>{active ? active.title : t('home.installQueue', 'Install queue')}</strong><small>{active ? active.phase : t('home.noActiveDownloads', 'No active downloads')}</small></span><ChevronRight /></button>
      <button onClick={() => go('settings')}><Settings2 /><span><strong>{t('home.xodusRuntime', 'Xodus runtime')}</strong><small>{data.runtime.installed ? t('home.customRuntimeReady', 'Custom runtime ready') : t('home.runtimeSetupRequired', 'Runtime setup required')}</small></span><ChevronRight /></button>
    </div>
    <div className="support-bar"><CircleAlert /><div><strong>{t('home.compatibilityStatus', 'Compatibility status')}</strong><span>{t('home.compatibilityNote', 'Package ownership and installation do not guarantee Wine, GameRuntime, or anti-cheat compatibility. Unsupported features are labelled explicitly.')}</span></div></div>
  </main>;
}

function StorePage({ data, toast, go, initialQuery }: { data: AppSnapshot; toast: (value: Toast) => void; go: (page: Page) => void; initialQuery: string }) {
  const startPackageInstall = usePackageInstall();
  const [catalog, setCatalog] = useState<CatalogSearchResult>();
  const [featured, setFeatured] = useState<CatalogSearchResult>();
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [featuredError, setFeaturedError] = useState<string>();
  const [selected, setSelected] = useState<CatalogProduct>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [manualProductId, setManualProductId] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [destination, setDestination] = useState(data.settings.installRoot);
  const [busy, setBusy] = useState<string>();
  useEffect(() => { if (!selected) setDestination(data.settings.installRoot); }, [data.settings.installRoot, selected]);
  useEffect(() => {
    if (initialQuery.trim().length < 2) return;
    let cancelled = false;
    window.launcher.searchCatalog(initialQuery).then((result) => {
      if (!cancelled) { setCatalog(result); setSelected(undefined); }
    }).catch((error) => { if (!cancelled) toast({ kind: 'error', message: errorMessage(error) }); });
    return () => { cancelled = true; }
  }, [initialQuery]);
  useEffect(() => {
    let cancelled = false;
    window.launcher.getFeaturedCatalog()
      .then((result) => { if (!cancelled) setFeatured(result); })
      .catch((error) => { if (!cancelled) setFeaturedError(errorMessage(error)); })
      .finally(() => { if (!cancelled) setFeaturedLoading(false); });
    return () => { cancelled = true; }
  }, []);

  function installDestination(product: CatalogProduct): string {
    const folder = product.title.normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80) || product.productId;
    return data.settings.installRoot.replace(/\/+$/, '') + '/' + folder;
  }

  function selectProduct(product: CatalogProduct) {
    setSelected(product);
    setDestination(installDestination(product));
  }

  async function loadMore() {
    if (!catalog?.cursor) return;
    setLoadingMore(true);
    try {
      const next = await window.launcher.searchCatalog(catalog.query, catalog.cursor);
      setCatalog({ ...next, products: [...catalog.products, ...next.products] });
    } catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
    finally { setLoadingMore(false); }
  }

  async function install(product: CatalogProduct, target = installDestination(product)) {
    setBusy(product.productId);
    try {
      if (!await startPackageInstall({ productId: product.installProductId ?? product.productId, title: product.title, destination: target })) return;
      toast({ kind: 'success', message: t('store.checkingLicenseInstalling', 'Xodus is checking the license and installing {title}.', { title: product.title }) });
      go('downloads');
    } catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
    finally { setBusy(undefined); }
  }

  async function manualInstall(event: FormEvent) {
    event.preventDefault(); setBusy('manual');
    try {
      if (!await startPackageInstall({ productId: manualProductId, title: manualTitle, destination })) return;
      toast({ kind: 'success', message: t('store.streamingStarted', 'Xodus streaming started.') }); go('downloads');
    } catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
    finally { setBusy(undefined); }
  }

  async function chooseDestination() {
    const selected = await window.launcher.chooseDirectory(destination);
    if (selected) setDestination(selected);
  }

  const installedIds = new Set(data.games.flatMap((game) => game.storeId?.toUpperCase() ?? []));
  const isInstalled = (product: CatalogProduct) => installedIds.has(product.productId) || Boolean(product.installProductId && installedIds.has(product.installProductId));
  const productGrid = (products: CatalogProduct[]) => <div className="catalog-grid">{products.map((product) => {
    const installed = isInstalled(product);
    return <article className={`catalog-card ${selected?.productId === product.productId ? 'selected' : ''}`} key={product.productId}>
      <button className="catalog-card-main" onClick={() => selectProduct(product)}>{product.posterUrl ? <img src={product.posterUrl} alt={t('store.coverAlt', '{title} cover', { title: product.title })} /> : <div className="catalog-cover-placeholder"><Gamepad2 /></div>}<span className={`catalog-support ${product.installability}`}>{product.installability === 'supported' ? 'PC' : product.installability === 'unknown' ? '?' : t('store.unsupported', 'Unsupported')}</span><div><GameTitle title={product.title} /><small>{product.publisher ?? product.productId}</small><span>{product.purchasePrice ?? t('store.priceUnavailable', 'Price unavailable')}{product.includedWith ? ` · ${product.includedWith}` : ''}</span></div></button>
      <button className="catalog-card-install" disabled={product.installability !== 'supported' || Boolean(busy) || !data.backend.capabilities.streaming || installed} onClick={() => install(product)}>{busy === product.productId ? <LoaderCircle className="spin" /> : installed ? <Check /> : <Download />}{installed ? t('common.installed', 'Installed') : t('common.install', 'Install')}</button>
    </article>;
  })}</div>;
  return <main className="page store-page">
    <header className="page-header"><div><h1>{t('store.title', 'Store')}</h1></div><span className="catalog-source"><StatusDot />{t('store.microsoftStore', 'Microsoft Store')}</span></header>
    {!catalog ? <section className="featured-catalog"><SectionTitle title={t('store.featured', 'Featured')} />{featuredLoading ? <div className="catalog-loading"><LoaderCircle className="spin" /><span>{t('store.loadingCollection', 'Loading live Store collection…')}</span></div> : featured?.products.length ? <><div className="featured-rail">{featured.products.slice(0, 3).map((product) => <button className="featured-tile" key={product.productId} onClick={() => selectProduct(product)}>{product.heroUrl || product.posterUrl ? <img src={product.heroUrl ?? product.posterUrl} alt="" /> : <div className="featured-tile-placeholder"><Gamepad2 /></div>}<span className="featured-tile-copy"><GameTitle title={product.title} /><small>{product.publisher ?? t('store.microsoftStore', 'Microsoft Store')} · {product.installability === 'supported' ? t('store.pcPackageVerified', 'PC package verified') : t('store.checkPackageSupport', 'Check package support')}</small></span></button>)}</div><SectionTitle title={t('store.trending', 'Trending PC games')} />{productGrid(featured.products.slice(3))}</> : <div className="catalog-empty"><Store /><h2>{t('store.featuredUnavailable', 'Featured games are temporarily unavailable')}</h2><p>{featuredError ?? t('store.searchStillWorks', 'Search still works with live Microsoft Store data.')}</p></div>}</section> : null}

    {selected ? <section className={`catalog-selection ${selected.heroUrl ? 'has-art' : ''}`} style={selected.heroUrl ? { '--catalog-hero': `url(${selected.heroUrl})` } as React.CSSProperties : undefined}>
      <div className="catalog-selection-copy"><span className="overline">{t('store.selectedProduct', 'SELECTED PRODUCT')}</span><h2>{selected.title}</h2><div className="catalog-badges">{selected.purchasePrice ? <span>{selected.purchasePrice}</span> : null}{selected.includedWith ? <span className="pass">{t('store.availableWith', 'Available with {name}', { name: selected.includedWith })}</span> : null}<span className={selected.installability}>{selected.installability === 'supported' ? t('store.pcMsixvcVerified', 'PC MSIXVC verified') : selected.installability}</span></div><p>{selected.description}</p><small>{selected.publisher ?? t('store.publisherUnavailable', 'Publisher unavailable')} · {t('common.storeId', 'Store ID {id}', { id: selected.productId })}{selected.installProductId ? ` · ${t('store.packageId', 'Package ID {id}', { id: selected.installProductId })}` : ''}</small></div>
      <div className="catalog-install-box"><p className={selected.installability === 'supported' ? 'supported' : 'unsupported'}>{selected.supportNote}</p><label>{t('store.installLocation', 'Install location')}<div className="input-action"><input value={destination} onChange={(event) => setDestination(event.target.value)} /><button type="button" onClick={chooseDestination} title={t('common.chooseFolder', 'Choose folder')}><FolderOpen /></button></div></label><div className="button-row"><button className="primary" disabled={selected.installability !== 'supported' || Boolean(busy) || !data.backend.capabilities.streaming || isInstalled(selected)} onClick={() => install(selected, destination)}>{busy === selected.productId ? <LoaderCircle className="spin" /> : isInstalled(selected) ? <Check /> : <ArrowDownToLine />}{isInstalled(selected) ? t('common.installed', 'Installed') : t('store.installWithXodus', 'Install with Xodus')}</button>{selected.storeUrl ? <button className="secondary" onClick={() => window.open(selected.storeUrl, '_blank')}>{t('store.storePage', 'Store page')}</button> : null}</div></div>
    </section> : null}

    {catalog ? <><SectionTitle title={t('store.resultsFor', 'Results for “{query}”', { query: catalog.query })} />{productGrid(catalog.products)}{catalog.products.length === 0 ? <div className="empty-state compact"><div><Search /></div><h2>{t('store.noGamesFound', 'No games found')}</h2><p>{t('store.tryDifferentTitle', 'Try a different title or a Microsoft Store Product ID.')}</p></div> : null}{catalog.hasMore ? <div className="load-more"><button className="secondary" disabled={loadingMore} onClick={loadMore}>{loadingMore ? <LoaderCircle className="spin" /> : <Plus />}{t('store.loadMore', 'Load more results')}</button></div> : null}</> : null}

    <SectionTitle title={t('store.installByProductId', 'Install by Product ID')} />
    <form className="manual-install" onSubmit={manualInstall}><label>{t('store.productId', 'Product ID')}<input value={manualProductId} onChange={(event) => setManualProductId(event.target.value)} placeholder={t('store.productIdPlaceholder', 'For example: 9N4PT8HGCDHQ')} required /></label><label>{t('store.queueName', 'Queue name')} <em>{t('store.optional', 'Optional')}</em><input value={manualTitle} onChange={(event) => setManualTitle(event.target.value)} /></label><label>{t('store.installLocation', 'Install location')}<div className="input-action"><input value={destination} onChange={(event) => setDestination(event.target.value)} required /><button type="button" onClick={chooseDestination}><FolderOpen /></button></div></label><button className="secondary" disabled={Boolean(busy) || !data.backend.capabilities.streaming}>{busy === 'manual' ? <LoaderCircle className="spin" /> : <Terminal />}{t('store.installUnlistedId', 'Install unlisted ID')}</button></form>
  </main>;
}

export function GameContextMenu({ x, y, game, options, busy, onBrowse, onSettings, onInstallVc, onRemove, onShortcut }: {
  x: number; y: number; game: Game; options?: GameLaunchOptions; busy: boolean;
  onBrowse: () => void; onSettings: () => void; onInstallVc: () => void; onRemove: () => void;
  onShortcut?: (destination: 'desktop' | 'applications' | 'steam') => void;
}) {
  return <div className="game-context-menu" data-game-menu role="menu" style={{ left: x, top: y }} onClick={(event) => event.stopPropagation()}>
    <button role="menuitem" onClick={onBrowse}><FolderOpen />{t('gameMenu.browseFiles', 'Browse game files')}</button>
    <button role="menuitem" onClick={onSettings}><Settings2 />{t('gameMenu.gameSettings', 'Game settings')}</button>
    <button role="menuitem" disabled={!onShortcut || game.installState !== 'ready'} onClick={() => onShortcut?.('desktop')}><Plus />{t('gameMenu.createDesktopShortcut', 'Create desktop shortcut')}</button>
    <button role="menuitem" disabled={!onShortcut || game.installState !== 'ready'} onClick={() => onShortcut?.('applications')}><Plus />{t('gameMenu.addToApplications', 'Add to applications menu')}</button>
    <button role="menuitem" disabled={!onShortcut || game.installState !== 'ready'} title={t('gameMenu.steamShortcutHint', 'Add a shortcut with available artwork, including while Steam is running.')} onClick={() => onShortcut?.('steam')}><Plus />{t('gameMenu.addToSteam', 'Add to Steam')}</button>
    <button role="menuitem" disabled={busy || game.installState !== 'ready' || !options?.vcInstall} title={options?.vcReason} onClick={onInstallVc}><Download />{t('gameMenu.installVc', 'Install / update VC++')}</button>
    <button role="menuitem" className="danger" onClick={onRemove}><Trash2 />{t('gameMenu.removeGame', 'Remove game…')}</button>
  </div>;
}

interface AccountGamesProps {
  data: AppSnapshot; toast: (value: Toast) => void; selectedId?: string;
  select?: (game: Game) => void; menu?: (game: Game, x: number, y: number) => void;
  filters?: LibraryFilters; onFiltersChange?: (filters: LibraryFilters) => void;
}

export function LibraryPagination({ loading, hasMore, load, searching = false }: { loading: boolean; hasMore: boolean; load: () => void; searching?: boolean }) {
  if (searching) return <div className="library-pagination"><span className="library-loading" role="status"><LoaderCircle className="spin" />{t('library.searchingAll', 'Searching all library games…')}</span></div>;
  if (!loading && !hasMore) return null;
  return <div className="library-pagination">
    {hasMore ? <button className="secondary" disabled={loading} onClick={load}>
      {loading ? <><LoaderCircle className="spin" />{t('library.loadingGames', 'Loading games…')}</> : t('library.loadMoreGames', 'Load more games')}
    </button> : <span className="library-loading" role="status"><LoaderCircle className="spin" />{t('library.loadingAccountGames', 'Loading account games…')}</span>}
  </div>;
}

export function AccountGames({ data, toast, selectedId, select, menu, filters, onFiltersChange }: AccountGamesProps) {
  const startPackageInstall = usePackageInstall();
  const [localFilters, setLocalFilters] = useState<LibraryFilters>(defaultLibraryFilters);
  const selectedFilters = filters ?? localFilters;
  const { kind, playState, query } = selectedFilters;
  const updateFilters = (patch: Partial<LibraryFilters>) => (onFiltersChange ?? setLocalFilters)({ ...selectedFilters, ...patch });
  const setKind = (kind: LibraryFilters['kind']) => updateFilters({ kind });
  const setPlayState = (playState: LibraryFilters['playState']) => updateFilters({ playState });
  const setQuery = (query: string) => updateFilters({ query });
  const [result, setResult] = useState<AccountLibraryPage>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [installing, setInstalling] = useState<string>();
  const [searchTerm, setSearchTerm] = useState('');
  useEffect(() => {
    if (!query.trim()) { setSearchTerm(''); return; }
    const timer = window.setTimeout(() => setSearchTerm(query.trim()), 300);
    return () => { window.clearTimeout(timer); }
  }, [query]);
  const identity = data.auth.stored + ':' + data.auth.username + ':' + data.auth.running + ':' + data.settings.market + ':' + data.backend.binaryPath + ':' + kind;
  const currentIdentity = useRef(identity);
  currentIdentity.current = identity;
  const [loadedIdentity, setLoadedIdentity] = useState(identity);
  const available = data.auth.stored === true && !data.auth.running && data.backend.capabilities.library;
  useEffect(() => {
    let cancelled = false;
    setResult(undefined); setLoadedIdentity(identity); setError(undefined);
    if (!available) { setBusy(false); return; }
    setBusy(true);
    window.launcher.getAccountLibrary(kind).then(value => { if (!cancelled) setResult(value); })
      .catch(error => { if (!cancelled) setError(errorMessage(error)); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; }
  }, [identity, available]);
  // Never display the previous account's cards while the identity effect settles.
  const visible = loadedIdentity === identity ? result : undefined;
  // Installed games are already in the snapshot. Account searches must also
  // resolve every remaining licensed page before reporting no matches.
  const searching = available && playState !== 'installed' && Boolean(query.trim()) && !error && (busy || Boolean(visible?.cursor));
  useEffect(() => {
    if (!searching || busy || !visible?.cursor || searchTerm !== query.trim()) return;
    void load();
  }, [identity, searching, busy, visible?.cursor, searchTerm, query]);
  const installed = new Set(data.games.flatMap(game => game.storeId?.toUpperCase() ?? []));
  const queued = new Set(data.downloads.filter(task => ['running', 'queued', 'paused'].includes(task.status)).map(task => task.productId.toUpperCase()));
  const products = (visible?.products ?? []).filter(product => !installed.has(product.productId) && !installed.has(product.installProductId ?? ''));
  const access = (game: Game) => game.storeId ? visible?.accessByProductId[game.storeId.toUpperCase()] : undefined;
  const rows = [
    ...data.games.filter(game => playState !== 'installable' && (kind === 'all' || access(game) === kind)).sort((a, b) => a.title.localeCompare(b.title))
      .map(game => ({ id: game.id, title: game.title, game, product: undefined })),
    ...products.filter(() => playState !== 'installed').map(product => ({ id: product.productId, title: product.title, product, game: undefined })),
  ].filter(row => row.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  async function load(refresh = false) {
    setBusy(true); setError(undefined);
    try {
      const next = await window.launcher.getAccountLibrary(kind, refresh ? undefined : visible?.cursor, refresh);
      if (currentIdentity.current !== identity) return;
      if (!refresh && visible?.cursor && next.cursor === visible.cursor) throw Error(t('library.paginationError', 'Library pagination did not advance. Refresh the library to try again.'));
      // This instance is remounted on identity changes, so pending callbacks
      // cannot publish another account's products into the active component.
      setResult(old => ({ ...next, products: refresh ? next.products : [...(old?.products ?? []), ...next.products.filter(p => !old?.products.some(old => old.productId === p.productId))] }));
    } catch (error) { if (currentIdentity.current === identity) setError(errorMessage(error)); }
    finally { if (currentIdentity.current === identity) setBusy(false); }
  }
  async function install(product: CatalogProduct) {
    setInstalling(product.productId);
    try {
      const folder = product.title.normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80) || product.productId;
      if (!await startPackageInstall({ productId: product.installProductId ?? product.productId, title: product.title,
        destination: data.settings.installRoot.replace(/\/+$/, '') + '/' + folder })) return;
      toast({ kind: 'success', message: t('library.addedToQueue', '{title} added to Install Queue.', { title: product.title }) });
    } catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
    finally { setInstalling(undefined); }
  }
  return <section className="account-games">
    <div className="library-filters" data-gamepad-filters>
      <label>{t('library.access', 'Access')}<select aria-label={t('library.access', 'Access')} value={kind} onChange={event => setKind(event.target.value as AccountLibraryPage['kind'])}><option value="all">{t('library.allGames', 'All games')}</option><option value="owned">{t('library.owned', 'Owned')}</option><option value="gamepass">{t('library.inGamePass', 'In Game Pass')}</option></select></label>
      <label>{t('library.playState', 'Play state')}<select aria-label={t('library.playState', 'Play state')} value={playState} onChange={event => setPlayState(event.target.value as typeof playState)}><option value="all">{t('library.allStates', 'All states')}</option><option value="installed">{t('common.installed', 'Installed')}</option><option value="installable">{t('library.readyToInstall', 'Ready to install')}</option></select></label>
      <label className="library-filter-search">{t('library.search', 'Search')}<input aria-label={t('library.searchLibrary', 'Search library')} placeholder={t('library.searchPlaceholder', 'Search your games')} value={query} onChange={event => setQuery(event.target.value)} /></label>
      <button className="secondary library-refresh" aria-label={t('library.refreshLibrary', 'Refresh library')} title={t('library.refreshLibrary', 'Refresh library')} disabled={!available || busy} onClick={() => load(true)}>{busy ? <LoaderCircle className="spin" /> : <RefreshCw />}</button>
    </div>
    <div className="account-games-results">
    {!available ? <p>{data.auth.stored !== true ? t('library.signInToLoad', 'Sign in to load your account games. Installed games remain available.') : !data.backend.capabilities.library ? t('library.updateBackend', 'Update the Xodus backend to load account licenses.') : t('library.waitForSignIn', 'Wait for sign-in to finish.')}</p> : null}
      {error ? <div className="alert amber"><CircleAlert /><span>{error}</span></div> : null}
      <div className="catalog-grid" data-gamepad-grid>{rows.map(row => {
        if (row.game) {
          const game = row.game;
          const license = access(game);
          return <div className={`library-card-wrap catalog-card ${selectedId === game.id ? 'selected' : ''}`} data-gamepad-card key={game.id} onContextMenu={event => { event.preventDefault(); menu?.(game, event.clientX, event.clientY); }}>
            <button className="library-card catalog-card-main" data-gamepad-auto-select data-gamepad-detail-target={game.id} onClick={() => select?.(game)} onKeyDown={event => { if (event.key === 'F10' && event.shiftKey) { event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); menu?.(game, rect.left + 16, rect.top + 16); } }}><Cover game={game} /><div><GameTitle title={game.title} /><small>{game.publisher ?? t('common.localInstallation', 'Local installation')}</small><span>{license === 'owned' ? t('library.owned', 'Owned') : license === 'gamepass' ? t('library.gamePass', 'Game Pass') : t('common.localInstallation', 'Local installation')}</span></div></button>
            <span className="catalog-card-status"><Check />{data.gameUpdates?.[game.id]?.available ? t('library.updateAvailable', 'Update available') : t('common.installed', 'Installed')}</span>
            <button className="library-card-menu-button" data-game-menu-trigger data-gamepad-skip aria-label={t('library.optionsFor', 'Options for {title}', { title: game.title })} aria-haspopup="menu" title={t('library.optionsFor', 'Options for {title}', { title: game.title })} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); menu?.(game, rect.right, rect.bottom); }}><MoreHorizontal /></button>
          </div>;
        }
        const product = row.product!;
        const present = installed.has(product.productId) || installed.has(product.installProductId ?? '');
        const downloading = queued.has(product.productId) || queued.has(product.installProductId ?? '');
        return <article className="catalog-card" data-gamepad-card key={product.productId}>
          <div className="catalog-card-main">{product.posterUrl ? <img src={product.posterUrl} alt={t('store.coverAlt', '{title} cover', { title: product.title })} loading="lazy" /> : <div className="catalog-cover-placeholder"><Gamepad2 /></div>}<span className="catalog-support supported">PC</span><div><GameTitle title={product.title} /><small>{product.publisher ?? product.productId}</small><span>{product.access === 'owned' ? t('library.owned', 'Owned') : t('library.gamePass', 'Game Pass')}</span></div></div>
          <button className="catalog-card-install" disabled={present || downloading || Boolean(installing) || !data.backend.capabilities.streaming} onClick={() => install(product)}>{present ? <Check /> : <Download />}{present ? t('common.installed', 'Installed') : downloading ? t('library.inInstallQueue', 'In Install Queue') : installing === product.productId ? t('common.preparing', 'Preparing…') : t('common.install', 'Install')}</button>
        </article>;
      })}</div>
      {!busy && !searching && !error && !rows.length ? <p>{visible?.cursor && playState !== 'installed' ? t('library.noMatchLoaded', 'No games match these filters in the loaded results. Load more to continue.') : t('library.noMatch', 'No games match these filters.')}</p> : null}
      <div data-gamepad-library-footer><LibraryPagination loading={busy} hasMore={Boolean(visible?.cursor)} searching={searching} load={() => { void load(); }} />
      <p className="account-library-note">{t('library.note', 'Only licensed games with a verified, supported PC package are listed. Add-ons and unsupported packages are excluded. Installation checks your license again.')}</p></div>
    </div>
  </section>;
}

function AccountGamesForUser(props: AccountGamesProps) {
  const { data } = props;
  return <AccountGames key={`${data.auth.username}:${data.auth.stored}:${data.auth.running}:${data.settings.market}:${data.backend.binaryPath}`} {...props} />;
}

export function ContentList({ plan, disabled, pending, install }: { plan: GameContentPlan; disabled: boolean; pending?: string; install: (id: string) => void }) {
  return <div className="content-list">{plan.items.length ? plan.items.map(item => <article key={item.productId}>
    <div><strong title={item.title}>{item.title}</strong><small>{item.access === 'owned' ? t('library.owned', 'Owned') : item.access === 'gamepass' ? t('library.gamePass', 'Game Pass') : t('library.licenseNotVerified', 'License not verified')} · {item.status === 'installed' ? t('common.installed', 'Installed') : item.status === 'available' ? t('content.notInstalled', 'Not installed') : item.status === 'unsupported' ? t('content.unsupportedPackage', 'Unsupported package') : t('content.unavailable', 'Unavailable')}</small>
      {item.downloadBytes ? <small>{t('content.downloadMiB', 'Download: {size} MiB', { size: (item.downloadBytes / 1024 ** 2).toFixed(1) })}</small> : null}<small>{item.note}</small></div>
    <button className="secondary" disabled={disabled || Boolean(pending) || !item.access || !['available', 'installed'].includes(item.status)} onClick={() => install(item.productId)}><Download />{pending === item.productId ? t('common.preparing', 'Preparing…') : item.status === 'installed' ? t('content.repair', 'Repair') : t('common.install', 'Install')}</button>
  </article>) : <p>{t('content.noPackages', 'No related content packages are declared by this game.')}</p>}</div>;
}

function GameContentDialog({ game, data, close, toast }: { game: Game; data: AppSnapshot; close: () => void; toast: (value: Toast) => void }) {
  const confirm = useConfirmation();
  const [plan, setPlan] = useState<GameContentPlan>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<string>();
  const [revision, setRevision] = useState(0);
  const queue = data.downloads.filter(task => task.kind === 'content' && task.gameId === game.id);
  const queueState = queue.map(task => task.id + ':' + task.status).join(',');
  const busy = data.downloads.some(task => ['running', 'paused', 'queued'].includes(task.status)) || Boolean(data.gameOperation && ['preparing', 'running', 'stopping'].includes(data.gameOperation.status));
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(undefined); setPlan(undefined);
    window.launcher.getGameContent(game.id).then(value => { if (!cancelled) setPlan(value); })
      .catch(error => { if (!cancelled) setError(errorMessage(error)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; }
  }, [game.id, data.auth.username, data.auth.stored, data.auth.running, data.backend.binaryPath, data.settings.market, revision, queueState]);
  async function install(id: string) {
    const item = plan?.items.find(item => item.productId === id);
    if (!item || !await confirm({ title: t('content.confirmTitle', '{action} {title}?', { action: item.status === 'installed' ? t('content.repair', 'Repair') : t('common.install', 'Install'), title: item.title }), message: t('content.confirmMessage', 'This downloads licensed content into a separate managed folder. Close the game first.'), confirmLabel: item.status === 'installed' ? t('content.repair', 'Repair') : t('common.install', 'Install') })) return;
    setPending(id); setError(undefined);
    try { await window.launcher.installGameContent(game.id, id); toast({ kind: 'success', message: t('content.addedToQueue', 'Content added to Install Queue.') }); }
    catch (error) { setError(errorMessage(error)); }
    finally { setPending(undefined); }
  }
  return <div className="dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !pending) close(); }}><section className="game-dialog content-dialog" role="dialog" aria-modal="true" aria-label={t('content.dialogLabel', 'Content for {title}', { title: game.title })}>
    <h2>{t('content.manageContent', 'Manage content')}</h2><p>{game.title}</p><p>{t('content.dialogIntro', 'Only verified licensed PC content can be installed. Content stays separate from the base game. Restart the game after installation. Requires a runtime with Store content support.')}</p>
    {loading ? <p role="status"><LoaderCircle className="spin" />{t('content.checking', 'Checking account licenses and packages…')}</p> : null}
    {error ? <p role="alert" className="error-text">{error}</p> : null}
    {plan?.runtimeSupported === false ? <p className="error-text">{t('content.updateRuntime', 'Update the Nexus runtime in Settings before installing related content.')}</p> : null}
    {plan && !loading ? <ContentList plan={plan} disabled={busy || !data.backend.capabilities.streaming || plan.runtimeSupported === false} pending={pending} install={id => { void install(id); }} /> : null}
    {queue.some(task => ['running', 'paused', 'queued'].includes(task.status)) ? <p>{t('content.queueNote', 'Content download is in Install Queue. Pause, resume or cancel it there.')}</p> : null}
    <div className="dialog-actions"><button className="secondary" disabled={loading || Boolean(pending)} onClick={() => setRevision(value => value + 1)}><RefreshCw />{t('common.refresh', 'Refresh')}</button><button className="secondary" disabled={Boolean(pending)} data-gamepad-cancel onClick={close}>{t('common.close', 'Close')}</button></div>
  </section></div>;
}

export function GameLaunchToolFields({ value, change }: { value: GameLaunchTools; change: (value: GameLaunchTools) => void }) {
  const update = (patch: Partial<GameLaunchTools>) => change({ ...value, ...patch });
  return <fieldset className="game-launch-tools"><legend>{t('tools.legend', 'Launch tools')}</legend>
    <label className="tool-checkbox"><input type="checkbox" checked={value.dualSenseCompatibility === true} onChange={event => update({ dualSenseCompatibility: event.target.checked })} /><span>{t('tools.dualSenseMode', 'DualSense compatibility mode')}</span></label>
    <small>{t('tools.dualSenseHint', 'Try this if a standard DualSense controller is not detected. Disables its native HIDRAW input for this game only. Advanced haptics and adaptive triggers may be unavailable. Does not change Xbox controller settings.')}</small>
    <label className="tool-checkbox"><input type="checkbox" checked={value.mangoHud === true} onChange={event => update({ mangoHud: event.target.checked })} /><span>{t('tools.mangoHud', 'Enable MangoHud')}</span></label>
    <label className="tool-checkbox"><input type="checkbox" checked={value.gamescope === true} onChange={event => update({ gamescope: event.target.checked })} /><span>{t('tools.gamescope', 'Run in gamescope')}</span></label>
    {value.gamescope ? <label>{t('tools.gamescopeOptions', 'Gamescope options')}<input value={value.gamescopeArgs} maxLength={2048} placeholder={t('tools.gamescopeOptionsPlaceholder', '-W 1920 -H 1080 -f')} onChange={event => update({ gamescopeArgs: event.target.value })} /><small>{t('tools.gamescopeHint', 'Only options. Nexus adds the game command. MangoHud with gamescope requires mangoapp.')}</small></label> : null}
    <label>{t('tools.launchOptions', 'Launch options')}<textarea rows={3} value={value.launchOptions} maxLength={2048} placeholder={t('tools.launchOptionsPlaceholder', 'PROTON_ENABLE_WAYLAND=1 gamemoderun %command% --launcher-skip')} onChange={event => update({ launchOptions: event.target.value })} /><small>{t('tools.launchOptionsHint', 'NAME=value and wrappers before %command%, game arguments after it. Quotes are supported, not shell expansion. Variables are passed to Wine; Proton-script-only options depend on runtime support.')}</small></label>
    <small>{t('tools.generalHint', 'Tools must already be installed. Applies to this game and its shortcuts, not the launcher.')}</small>
  </fieldset>;
}

export function LibraryPage({ data, toast, filters, onFiltersChange, selection }: Pick<AccountGamesProps, 'data' | 'toast' | 'filters' | 'onFiltersChange'> & { selection?: { id: string } }) {
  const confirm = useConfirmation();
  const [selectedId, setSelectedId] = useState<string>();
  const [menu, setMenu] = useState<{ id: string; x: number; y: number }>();
  const [dialogGame, setDialogGame] = useState<{ id: string; kind: 'settings' | 'remove' }>();
  const [editTitle, setEditTitle] = useState('');
  const [editLocale, setEditLocale] = useState('');
  const [editTools, setEditTools] = useState<GameLaunchTools>({ ...defaultLaunchTools });
  const [localeOptions, setLocaleOptions] = useState<string[]>([]);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [diagnosticLog, setDiagnosticLog] = useState<DiagnosticLog>();
  const [contentGameId, setContentGameId] = useState<string>();
  const selected = data.games.find((game) => game.id === selectedId) ?? data.games[0];
  useEffect(() => { if (!selectedId && data.games[0]) setSelectedId(data.games[0].id); }, [data.games, selectedId]);
  useEffect(() => {
    if (!selection || !data.games.some(game => game.id === selection.id)) return;
    setSelectedId(selection.id);
    setMenu(undefined);
  }, [selection]);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(undefined);
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('[data-game-menu], [data-game-menu-trigger]')) close();
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('pointerdown', outside);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('pointerdown', outside); window.removeEventListener('scroll', close, true); window.removeEventListener('keydown', escape); };
  }, [menu]);

  function openMenu(game: Game, x: number, y: number) {
    setSelectedId(game.id);
    setMenu({ id: game.id, x: Math.max(8, Math.min(x, window.innerWidth - 230)), y: Math.max(8, Math.min(y, window.innerHeight - 270)) });
  }

  function openDialog(game: Game, kind: 'settings' | 'remove') {
    setMenu(undefined);
    setEditTitle(game.title);
    setEditLocale(game.locale ?? '');
    setEditTools({ ...defaultLaunchTools, ...game.launchTools });
    setLocaleOptions([]);
    if (kind === 'settings') void window.launcher.getGameLocales(game.id).then(setLocaleOptions).catch((error) => toast({ kind: 'error', message: errorMessage(error) }));
    setDialogGame({ id: game.id, kind });
  }

  async function saveGameSettings(event: FormEvent) {
    event.preventDefault();
    if (!dialogGame) return;
    setDialogBusy(true);
    try {
      await window.launcher.updateGame(dialogGame.id, { title: editTitle.trim(), locale: editLocale, launchTools: normalizeLaunchTools(editTools) });
      toast({ kind: 'success', message: t('game.settingsSaved', 'Game settings saved.') });
      setDialogGame(undefined);
    } catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
    finally { setDialogBusy(false); }
  }

  async function removeGame(mode: 'library' | 'delete-files') {
    if (!dialogGame) return;
    setDialogBusy(true);
    try {
      await window.launcher.removeGame(dialogGame.id, mode);
      setSelectedId(undefined);
      setDialogGame(undefined);
      toast({ kind: 'success', message: mode === 'library' ? t('game.removedFromLibrary', 'Removed from library. Game files were kept.') : t('game.filesDeleted', 'Game files permanently deleted.') });
    } catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
    finally { setDialogBusy(false); }
  }

  async function importGame() {
    try {
      const game = await window.launcher.importGame();
      if (game) { setSelectedId(game.id); toast({ kind: 'success', message: t('game.imported', 'Imported {title}.', { title: game.title }) }); }
    } catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
  }

  async function play() {
    if (!selected) return;
    try { await window.launcher.launchGame(selected.id); }
    catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
  }

  async function stopGame() {
    try { await window.launcher.cancelGame(); }
    catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
  }

  async function installVc(game: Game) {
    try {
      await window.launcher.installGameVcRuntime(game.id);
      toast({ kind: 'success', message: t('game.vcReady', 'Microsoft VC++ is ready in this game’s Proton prefix. Press Play.') });
    } catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
  }

  async function updateInstalledGame() {
    if (!selected || !await confirm({ title: t('game.updateTitle', 'Update {title}?', { title: selected.title }), message: t('game.updateMessage', 'Xodus may replace changed game files in place. Do not run the game until the update finishes.'), confirmLabel: t('game.updateConfirmLabel', 'Update game') })) return;
    try {
      await window.launcher.updateInstalledGame(selected.id);
      toast({ kind: 'success', message: t('game.updateStarted', 'Update started for {title}. See Install Queue.', { title: selected.title }) });
    } catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
  }

  async function checkUpdates(id?: string) {
    try { await window.launcher.checkGameUpdates(id); }
    catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
  }
  async function openDiagnosticLog(id: string) {
    try { setDiagnosticLog(await window.launcher.readDiagnosticLog(id)); }
    catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
  }

  const selectedOperation = selected && data.gameOperation?.gameId === selected.id ? data.gameOperation : undefined;
  const gameBusy = Boolean(selectedOperation && ['preparing', 'running', 'stopping'].includes(selectedOperation.status));
  const launchOptions = useGameLaunchOptions(selected, data);
  const menuGame = data.games.find((game) => game.id === menu?.id);
  const modalGame = data.games.find((game) => game.id === dialogGame?.id);
  return <main className="page library-page">
    <header className="page-header"><div><h1>{t('library.pageTitle', 'My Library')}</h1><p>{t('library.pageSubtitle', 'Your owned games, Game Pass games and local installations.')}</p></div><div className="button-row"><button className="secondary" disabled={data.auth.stored !== true || gameBusy || Object.values(data.gameUpdates ?? {}).some(update => update.checking)} onClick={() => checkUpdates()}><RefreshCw />{t('library.checkGameUpdates', 'Check game updates')}</button><button className="secondary" onClick={importGame}><Plus />{t('library.importGame', 'Import game')}</button></div></header>
    <div className={`library-layout${data.games.length ? '' : ' account-only'}`}>
      <AccountGamesForUser data={data} toast={toast} filters={filters} onFiltersChange={onFiltersChange} selectedId={selected?.id} select={game => setSelectedId(game.id)} menu={openMenu} />
      {selected ? <aside className="game-detail" data-gamepad-detail={selected.id}>
        <div className="detail-art"><Cover game={selected} variant="hero" /></div>
        <div className="detail-copy"><StatePill game={selected} /><h2>{selected.title}</h2><span>{selected.publisher ?? t('game.publisherNotProvided', 'Publisher not provided')}</span></div>
        {selected.installMessage ? <div className="alert amber"><CircleAlert /><span>{selected.installMessage}</span></div> : null}
<div className="game-update-status">{data.gameUpdates?.[selected.id]?.available ? <p className="success-text">{t('game.updateAvailable', 'Update available · {current} → {latest}', { current: selected.installedVersion ?? t('game.installedVersion', 'Installed version'), latest: data.gameUpdates[selected.id].latestVersion })}</p> : data.gameUpdates?.[selected.id]?.available === false ? <p>{t('game.upToDate', 'Up to date · {version}', { version: data.gameUpdates[selected.id].latestVersion })}</p> : null}{data.gameUpdates?.[selected.id]?.error ? <p className="error-text">{data.gameUpdates[selected.id].error}</p> : null}</div>
        <dl><div><dt>{t('game.storeIdLabel', 'Store ID')}</dt><dd>{selected.storeId ?? t('game.notFound', 'Not found')}</dd></div><div><dt>{t('game.executable', 'Executable')}</dt><dd>{selected.executable ?? t('game.notFound', 'Not found')}</dd></div><div><dt>{t('game.location', 'Location')}</dt><dd title={selected.path}>{selected.path}</dd></div></dl>
        <div className="detail-actions">
          <button className="primary" data-gamepad-play disabled={gameBusy || selected.installState !== 'ready' || !data.backend.capabilities.run || !(data.settings.winePath || data.runtime.winePath)} onClick={() => play()}>{gameBusy ? <LoaderCircle className="spin" /> : <Play fill="currentColor" />}{gameBusy ? t('common.working', 'Working…') : t('common.play', 'Play')}</button>
          <button className="secondary" disabled={gameBusy || data.gameUpdates?.[selected.id]?.checking || !selected.storeId || selected.installState !== 'ready' || !data.backend.capabilities.streaming || data.downloads.some((task) => task.status === 'running')} onClick={() => data.gameUpdates?.[selected.id]?.available ? updateInstalledGame() : checkUpdates(selected.id)} title={t('game.checkVersionTitle', 'Check the installed package version without changing game files')}><RefreshCw />{data.gameUpdates?.[selected.id]?.checking ? t('common.checking', 'Checking…') : data.gameUpdates?.[selected.id]?.available ? t('game.updateGame', 'Update game') : t('game.checkForUpdates', 'Check for updates')}</button>
          {gameBusy && !(selectedOperation?.kind === 'prerequisite' && selectedOperation.status === 'running') ? <button className="secondary danger" onClick={stopGame}><X />{t('common.stop', 'Stop')}</button> : null}
          <button className="icon-button" onClick={() => window.launcher.openPath(selected.path)} title={t('game.openGameFolder', 'Open game folder')}><FolderOpen /></button>
          <button className="secondary" disabled={gameBusy || !selected.storeId || data.auth.stored !== true || !data.backend.capabilities.library} onClick={() => setContentGameId(selected.id)}><PackageCheck />{t('content.manageContent', 'Manage content')}</button>
        </div>
        {selectedOperation ? <div className={`game-operation ${selectedOperation.status}`}><div><strong>{selectedOperation.kind === 'prerequisite' ? selectedOperation.status === 'failed' ? t('operation.prerequisiteFailed', 'Prerequisite failed') : selectedOperation.status === 'complete' ? t('operation.prerequisiteReady', 'Prerequisite ready') : t('operation.installingPrerequisite', 'Installing prerequisite') : selectedOperation.status === 'failed' ? t('operation.launchFailed', 'Launch failed') : selectedOperation.status === 'complete' ? t('operation.gameExited', 'Game exited') : t('operation.launchingGame', 'Launching game')}</strong><span>{selectedOperation.phase}</span></div>{selectedOperation.log.length > 0 ? <pre>{selectedOperation.log.slice(-12).join('\n')}</pre> : null}{selectedOperation.logPath ? <button className="secondary" onClick={() => openDiagnosticLog(selectedOperation.id)}><FolderOpen />{t('operation.openDiagnosticLog', 'Open diagnostic log')}</button> : null}</div> : null}
      </aside> : null}
    </div>
    {menu && menuGame ? <GameContextMenu x={menu.x} y={menu.y} game={menuGame} options={launchOptions} busy={gameBusy}
      onBrowse={() => { setMenu(undefined); void window.launcher.openPath(menuGame.path).catch((error) => toast({ kind: 'error', message: errorMessage(error) })); }}
      onSettings={() => openDialog(menuGame, 'settings')}
      onShortcut={(destination) => {
        setMenu(undefined);
        void (destination === 'steam' ? window.launcher.addToSteam(menuGame.id) : window.launcher.createGameShortcut(menuGame.id, destination))
          .then(() => toast({ kind: 'success', message: destination === 'steam' ? t('shortcuts.steamAdded', 'Game added to Steam with available artwork.') : destination === 'desktop' ? t('shortcuts.desktopCreated', 'Desktop shortcut created. Your desktop may ask you to allow launching it.') : t('shortcuts.applicationsAdded', 'Game added to applications menu.') }))
          .catch((error) => toast({ kind: 'error', message: errorMessage(error) }));
      }}
      onInstallVc={() => { setMenu(undefined); void installVc(menuGame); }}
      onRemove={() => openDialog(menuGame, 'remove')} /> : null}
{diagnosticLog ? <DiagnosticDialog log={diagnosticLog} close={() => setDiagnosticLog(undefined)} /> : null}
    {contentGameId && data.games.find(game => game.id === contentGameId) ? <GameContentDialog key={contentGameId + ':' + data.auth.username + ':' + data.auth.stored} game={data.games.find(game => game.id === contentGameId)!} data={data} close={() => setContentGameId(undefined)} toast={toast} /> : null}
    {dialogGame && modalGame ? <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !dialogBusy) setDialogGame(undefined); }}><section className="game-dialog" role="dialog" aria-modal="true" aria-label={dialogGame.kind === 'remove' ? t('game.removeDialogLabel', 'Remove {title}', { title: modalGame.title }) : t('game.settingsDialogLabel', 'Settings for {title}', { title: modalGame.title })}>
      {dialogGame.kind === 'remove' ? <GameRemovalContents game={modalGame} busy={dialogBusy} close={() => setDialogGame(undefined)} remove={mode => { void removeGame(mode); }} /> : <form onSubmit={saveGameSettings}>
        <h2>{t('game.settingsTitle', 'Game settings')}</h2>
        <label>{t('game.displayName', 'Display name')}<input required value={editTitle} onChange={(event) => setEditTitle(event.target.value)} /></label>
        <label>{t('game.languageLabel', 'Game language')}<select value={editLocale} onChange={(event) => setEditLocale(event.target.value)}><option value="">{t('game.systemDefault', 'System default')}</option>{localeOptions.map((locale) => <option key={locale} value={locale}>{locale}</option>)}{editLocale && !localeOptions.some((locale) => locale.toLowerCase() === editLocale.toLowerCase()) ? <option value={editLocale}>{editLocale}</option> : null}</select></label>
        <p>{t('game.manifestLanguages', 'Available languages come from the game manifest. All games use the active Xodus Runtime.')}</p>
        <GameLaunchToolFields value={editTools} change={setEditTools} />
        <div className="dialog-actions"><button type="button" className="secondary" disabled={dialogBusy} data-gamepad-cancel onClick={() => setDialogGame(undefined)}>{t('common.cancel', 'Cancel')}</button><button className="primary" disabled={dialogBusy || !editTitle.trim()}><Check />{t('common.save', 'Save')}</button></div>
      </form>}
    </section></div> : null}
  </main>;
}
export function DownloadsPage({ data, toast }: { data: AppSnapshot; toast: (value: Toast) => void }) {
  const startPackageInstall = usePackageInstall();
  const [expanded, setExpanded] = useState<string>();
  const [retrying, setRetrying] = useState<string>();
  async function cancel(id: string) {
    try { await window.launcher.cancelDownload(id); }
    catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
  }
  async function pauseOrResume(task: AppSnapshot['downloads'][number]) {
    try {
      if (task.status === 'paused') await window.launcher.resumeDownload(task.id);
      else await window.launcher.pauseDownload(task.id);
    } catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
  }
  async function remove(id: string) {
    try { await window.launcher.removeDownload(id); if (expanded === id) setExpanded(undefined); }
    catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
  }
  async function clearFinished() {
    try { await window.launcher.clearFinishedDownloads(); setExpanded(undefined); toast({ kind: 'success', message: t('downloads.clearedFinished', 'Finished queue entries cleared. Game files were kept.') }); }
    catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
  }
  async function retry(task: AppSnapshot['downloads'][number]) {
    setRetrying(task.id);
    try {
      if (task.kind === 'update' && task.gameId) await window.launcher.updateInstalledGame(task.gameId);
      else if (task.kind === 'content') {
        if (!task.gameId) throw Error(t('downloads.contentNoParent', 'This content download has no parent game.'));
        await window.launcher.installGameContent(task.gameId, task.productId);
      }
      else if (!await startPackageInstall({ productId: task.productId, title: task.title, destination: task.destination })) return;
      toast({ kind: 'success', message: t('downloads.retrying', 'Retrying {title} with Xodus.', { title: task.title }) });
    } catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
    finally { setRetrying(undefined); }
  }

  const size = (bytes: number) => bytes >= 1024 ** 3 ? (bytes / 1024 ** 3).toFixed(1) + ' GiB' : bytes >= 1024 ** 2 ? (bytes / 1024 ** 2).toFixed(1) + ' MiB' : Math.round(bytes / 1024) + ' KiB';
  const finishedCount = data.downloads.filter((task) => !['running', 'paused', 'queued'].includes(task.status)).length;
  const ordered = [
    ...data.downloads.filter(task => task.status === 'running' || task.status === 'paused'),
    ...data.downloads.filter(task => task.status === 'queued').reverse(),
    ...data.downloads.filter(task => !['running', 'paused', 'queued'].includes(task.status)),
  ];
  return <main className="page downloads-page">
    <header className="page-header"><div><h1>{t('downloads.title', 'Install Queue')}</h1></div>{finishedCount ? <button className="secondary" onClick={clearFinished}><Trash2 />{t('downloads.clearFinished', 'Clear finished')}</button> : null}</header>
    {data.downloadProgressSupported === false ? <div className="alert amber"><CircleAlert /><span>{t('downloads.progressAlert', 'Update the Nexus backend in Settings for numeric download progress and Pause/Resume. Downloads still work with an older backend.')}</span></div> : null}
    {data.downloads.length === 0 ? <div className="empty-state"><div><Download /></div><h2>{t('downloads.empty', 'Nothing in the queue')}</h2><p>{t('downloads.emptyHint', 'Installations started from Store will appear here.')}</p></div> : <div className="download-list">{ordered.map((task) => {
      const running = task.status === 'running'; const paused = task.status === 'paused'; const queued = task.status === 'queued'; const active = running || paused || queued; const failed = task.status === 'failed';
      const secondsLeft = running ? estimatedSecondsRemaining(task.transferRate, task.downloadedBytes, task.totalBytes) : undefined;
      return <article className={`download-item ${task.status}`} key={task.id}>
        <div className="download-status">{task.coverUrl ? <img className="download-cover" src={task.coverUrl} alt={t('common.artworkAlt', '{title} artwork', { title: task.title })} /> : running ? <LoaderCircle className="spin" /> : queued ? <Clock3 /> : paused ? <Pause /> : failed ? <CircleAlert /> : task.status === 'complete' ? <PackageCheck /> : <X />}{task.coverUrl && (running || failed) ? <span className={`download-badge ${failed ? 'failed' : ''}`}>{running ? <LoaderCircle className="spin" /> : <CircleAlert />}</span> : null}</div>
        <div className="download-main"><div className="download-heading"><div><h3>{task.kind === 'update' ? t('downloads.updateLabel', 'Update · {title}', { title: task.title }) : task.title}</h3><span>{task.productId} · {task.destination}</span></div><strong>{task.progress === null ? (running ? t('downloads.active', 'Active') : task.status) : Math.round(task.progress) + '%'}</strong></div><div className={`progress-track ${task.progress === null && running ? 'indeterminate' : ''}`}><i style={task.progress !== null ? { width: task.progress + '%' } : undefined} /></div><p className={failed ? 'error-text' : ''}>{task.error ?? task.phase}{task.totalBytes ? ` · ${size(task.downloadedBytes ?? 0)} / ${size(task.totalBytes)}` : ''}{task.transferRate ? ` · ${task.transferRate}` : ''}{secondsLeft ? ` · ${formatTimeRemaining(secondsLeft)}` : ''}</p>{expanded === task.id ? <pre className="task-log">{task.log.length ? task.log.join('\n') : t('downloads.noOutput', 'Xodus has not emitted text output yet.')}</pre> : null}</div>
        <div className="download-actions">{active ? <>{!queued ? <button disabled={!task.canPause || task.controlPending} onClick={() => pauseOrResume(task)} title={paused ? t('downloads.resume', 'Resume download') : task.canPause ? t('downloads.pause', 'Pause download') : t('downloads.pauseUnavailable', 'Pause is available while downloading game files')}>{task.controlPending ? <LoaderCircle className="spin" /> : paused ? <Play /> : <Pause />}</button> : null}<button onClick={() => cancel(task.id)} title={t('downloads.cancel', 'Cancel download')}><X /></button></> : null}{failed || task.status === 'cancelled' ? <button disabled={Boolean(retrying) || (task.kind === 'update' || task.kind === 'content') && data.downloads.some((entry) => ['running', 'paused', 'queued'].includes(entry.status))} onClick={() => retry(task)} title={t('downloads.retry', 'Retry installation')}><RefreshCw className={retrying === task.id ? 'spin' : ''} /></button> : null}<button onClick={() => setExpanded(expanded === task.id ? undefined : task.id)} title={t('downloads.showLog', 'Show log')}><Terminal /></button><button onClick={() => window.launcher.openPath(task.destination)} title={t('downloads.openFolder', 'Open folder')}><FolderOpen /></button>{!active ? <button onClick={() => remove(task.id)} title={t('downloads.remove', 'Remove from queue')}><Trash2 /></button> : null}</div>
      </article>;
    })}</div>}
  </main>;
}

function ToggleStatus({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`dependency ${ok ? 'ok' : ''}`}>{ok ? <Check /> : <X />}{label}</span>;
}

export function SettingsPage({ data, toast }: { data: AppSnapshot; toast: (value: Toast) => void }) {
  const confirm = useConfirmation();
  const [form, setForm] = useState<Settings>(data.settings);
  const [busy, setBusy] = useState<string>();
  const [logs, setLogs] = useState<string[]>([]);
  const [runtimeLogs, setRuntimeLogs] = useState<string[]>([]);
  useEffect(() => setForm(data.settings), [data.settings]);
  useEffect(() => window.launcher.onOperationLog(({ scope, line }) => {
    if (scope === 'backend') setLogs((items) => [...items.slice(-199), line]);
    if (scope === 'runtime') setRuntimeLogs((items) => [...items.slice(-199), line]);
  }), []);

  async function invoke(name: string, fn: () => Promise<unknown>, success?: string) {
    setBusy(name);
    try { await fn(); if (success) toast({ kind: 'success', message: success }); }
    catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
    finally { setBusy(undefined); }
  }

  async function pick(kind: 'install' | 'backend' | 'runtime' | 'wine') {
    const selected = kind === 'wine'
      ? await window.launcher.chooseFile(form.winePath)
      : await window.launcher.chooseDirectory(kind === 'install' ? form.installRoot : kind === 'backend' ? form.externalXodusRoot : form.runtimeRoot);
    if (selected) setForm((current) => ({ ...current, [kind === 'install' ? 'installRoot' : kind === 'backend' ? 'externalXodusRoot' : kind === 'runtime' ? 'runtimeRoot' : 'winePath']: selected }));
  }

  function changeLanguage(language: string) {
    setForm((current) => ({ ...current, language }));
    applyLanguageSetting(language || undefined);
    void invoke('language', () => window.launcher.updateSettings({ ...form, language }), t('settings.languageSavedToast', 'Language saved.'));
  }

  const caps = data.backend.capabilities;
  const runtimeInfo = runtimeDisplay(data.runtime);
  return <main className="page settings-page">
    <header className="page-header"><div><h1>{t('nav.settings', 'Settings')}</h1><p>{t('settings.pageSubtitle', 'Account, backend, runtime, and storage.')}</p></div></header>

    <section className="settings-card compact launcher-card">
      {data.launcherUpdate?.phase ? <p>{data.launcherUpdate.phase}</p> : null}
      {data.launcherUpdate?.updating ? <div className="progress-track"><i style={{ width: (data.launcherUpdate.progress ?? 0) + '%' }} /></div> : null}
      {data.launcherUpdate?.error ? <div className="alert amber"><CircleAlert /><span>{data.launcherUpdate.error}</span></div> : null}
      <div className="settings-heading"><div className="settings-icon"><Rocket /></div><div><span className="overline">XODUS NEXUS</span><h2>{data.launcherUpdate?.currentVersion ?? t('settings.developmentBuild', 'Development build')}</h2><p>{data.launcherUpdate?.latestVersion ? t('settings.versionAvailable', 'Version {version} is available.', { version: data.launcherUpdate.latestVersion }) : t('settings.checkGitHub', 'Check GitHub for launcher updates.')}</p></div></div>
      <div className="button-row">
        {data.launcherUpdate?.latestVersion && data.launcherUpdate.canInstall && !data.launcherUpdate.restartRequired ? <button className="primary" disabled={data.launcherUpdate.updating || Boolean(busy)} onClick={async () => { if (await confirm({ title: t('settings.installLauncherUpdateTitle', 'Install launcher update?'), message: t('settings.installLauncherUpdateMessage', 'The current AppImage will be backed up. Games and downloads must be stopped first.'), confirmLabel: t('settings.installUpdateConfirm', 'Install update') })) void invoke('launcher-install', () => window.launcher.installLauncherUpdate()); }}><ArrowDownToLine />{data.launcherUpdate.updating ? t('settings.updating', 'Updating…') : t('settings.installLauncherUpdate', 'Install launcher update')}</button> : null}
        {data.launcherUpdate?.releaseUrl && !data.launcherUpdate.canInstall ? <a className="primary" href={data.launcherUpdate.releaseUrl} target="_blank" rel="noreferrer"><ArrowDownToLine />{t('settings.downloadUpdate', 'Download update')}</a> : null}
        {data.launcherUpdate?.restartRequired ? <button className="primary" onClick={() => invoke('launcher-restart', () => window.launcher.restartLauncher())}><RefreshCw />{t('settings.restartLauncher', 'Restart launcher')}</button> : null}
        {data.launcherUpdate?.canRollback ? <button className="secondary" disabled={data.launcherUpdate.updating || Boolean(busy)} onClick={async () => { if (await confirm({ title: t('settings.restorePreviousTitle', 'Restore previous launcher?'), message: t('settings.restorePreviousMessage', 'Your settings and games will not change.'), confirmLabel: t('settings.restoreLauncher', 'Restore launcher') })) void invoke('launcher-rollback', () => window.launcher.rollbackLauncherUpdate()); }}>{t('settings.restoreLauncher', 'Restore launcher')}</button> : null}
        <button className="secondary" disabled={data.launcherUpdate?.checking || data.launcherUpdate?.updating || data.launcherUpdate?.restartRequired} onClick={() => invoke('update-check', () => window.launcher.checkLauncherUpdate(), t('settings.updateCheckFinished', 'Update check finished.'))}>{data.launcherUpdate?.checking ? <LoaderCircle className="spin" /> : <RefreshCw />}{t('settings.checkForUpdates', 'Check for updates')}</button>
        <button className="secondary" disabled={Boolean(busy)} title={t('settings.steamHint', 'Add Nexus with artwork, including while Steam is running.')} onClick={() => invoke('steam-launcher', () => window.launcher.addToSteam(), t('settings.nexusAddedToSteam', 'Nexus added to Steam.'))}><Plus />{t('settings.addToSteam', 'Add Nexus to Steam')}</button>
      </div>
    </section>

    <section className="settings-card account-card">
      <div className="settings-heading"><AccountAvatar auth={data.auth} large /><div><span className="overline">{t('settings.microsoftAccount', 'MICROSOFT ACCOUNT')}</span><h2>{data.auth.gamertag ?? data.auth.username ?? (data.auth.stored === false ? t('account.notSignedIn', 'Not signed in') : t('settings.accountStatusUnavailable', 'Account status unavailable'))}</h2><p>{data.auth.stored === true ? t('settings.credentialsStored', 'Credentials stored by Xodus') : t('settings.authWebview', 'Authentication uses the original Xodus webview')}</p></div><span className={`status-label ${data.auth.stored === true ? 'ready' : data.auth.stored === false ? 'off' : 'unknown'}`}><StatusDot tone={data.auth.stored === true ? 'green' : data.auth.stored === false ? 'red' : 'amber'} />{data.auth.stored === true ? t('settings.statusStored', 'STORED') : data.auth.stored === false ? t('settings.statusSignedOut', 'SIGNED OUT') : t('settings.statusUnknown', 'UNKNOWN')}</span></div>
      <div className="account-note"><CircleAlert /><span>{data.auth.note}</span></div>
      <div className="button-row"><button className="primary" disabled={!caps.login || data.auth.running} onClick={() => invoke('login', () => window.launcher.login(), t('settings.signInCompleted', 'Xodus sign-in completed.'))}>{data.auth.running ? <LoaderCircle className="spin" /> : <LogIn />}{data.auth.stored ? t('settings.signInAgain', 'Sign in again') : t('settings.signInWithXodus', 'Sign in with Xodus')}</button><button className="secondary" disabled={!caps.logout || data.auth.running || data.auth.stored === false} onClick={() => invoke('logout', () => window.launcher.logout(), t('settings.credentialsRemoved', 'Stored Xodus user credentials were removed.'))}>{t('settings.signOut', 'Sign out')}</button><button className="secondary" disabled={!caps.account || data.auth.running} onClick={() => invoke('account', () => window.launcher.refreshAccount())}><RefreshCw />{t('settings.refreshStatus', 'Refresh status')}</button></div>
      <PasskeySignInNotice />
    </section>

    <section className="settings-card">
      <div className="settings-heading"><div className="settings-icon"><Terminal /></div><div><h2>{t('settings.backendTitle', 'Xodus backend')}</h2><p>{data.backend.version ? t('settings.nexusBackend', 'Nexus backend {version}', { version: data.backend.version }) : data.backend.available ? t('settings.backendCli', 'Backend CLI {version}', { version: data.backend.capabilities.version ?? t('settings.unknownVersion', 'unknown version') }) : t('settings.installPrebuiltBackend', 'Install the prebuilt Nexus backend')}</p></div><span className={`status-label ${data.backend.available ? 'ready' : 'off'}`}><StatusDot tone={data.backend.available ? 'green' : 'red'} />{data.backend.available ? t('settings.statusValidated', 'VALIDATED') : t('settings.statusOffline', 'OFFLINE')}</span></div>
      {data.backend.blockReason ? <div className="alert amber"><CircleAlert /><span>{data.backend.blockReason}</span></div> : null}
      {data.backend.phase ? <p className="runtime-phase">{data.backend.phase}</p> : null}
      <div className="button-row end"><button className="secondary" disabled={Boolean(busy) || data.backend.checking || data.backend.updating} onClick={() => invoke('backend-check', () => window.launcher.checkBackendUpdate())}>{busy === 'backend-check' || data.backend.checking ? <LoaderCircle className="spin" /> : <RefreshCw />}{t('settings.checkForUpdates', 'Check for updates')}</button>{data.backend.releaseAvailable && data.backend.updateAvailable ? <button className="primary" disabled={Boolean(busy) || data.backend.updating || data.backend.checking} onClick={() => invoke('backend-update', () => window.launcher.updateBackend(), t('settings.backendActivated', 'The Nexus backend was verified, installed and activated.'))}>{busy === 'backend-update' || data.backend.updating ? <LoaderCircle className="spin" /> : <ArrowDownToLine />}{data.backend.available ? t('settings.updateBackend', 'Update backend') : t('settings.installBackend', 'Install backend')}</button> : null}</div>
    </section>

    <section className="settings-card">
      <div className="settings-heading"><div className="settings-icon"><Gamepad2 /></div><div><h2>{t('settings.runtimeTitle', 'Nexus runtime')}</h2><p>{data.runtime.installed ? t('settings.runtimeActive', 'Active: {title} · {version}', { title: runtimeInfo.title, version: runtimeInfo.version }) : t('settings.noRuntimeSelected', 'No runtime selected')}</p></div><span className={`status-label ${data.runtime.installed && runtimeInfo.source === 'Nexus runtime' ? 'ready' : 'unknown'}`}><StatusDot tone={data.runtime.installed && runtimeInfo.source === 'Nexus runtime' ? 'green' : 'amber'} />{!data.runtime.installed ? t('settings.statusMissing', 'MISSING') : runtimeInfo.source === 'Nexus runtime' ? t('settings.statusReady', 'READY') : t('settings.statusOtherRuntime', 'OTHER RUNTIME')}</span></div>
      {data.runtime.nexusError ? <div className="alert amber"><CircleAlert /><span>{data.runtime.nexusError}</span></div> : null}
      {data.runtime.error ? <div className="alert amber"><CircleAlert /><span>{data.runtime.error}</span></div> : null}{data.runtime.phase ? <div className="runtime-phase"><LoaderCircle className={data.runtime.updating ? 'spin' : ''} /><span>{data.runtime.phase}</span></div> : null}
      <div className="button-row end">
        <button className="secondary" disabled={Boolean(busy) || data.runtime.nexusChecking} onClick={() => invoke('runtime-check', () => window.launcher.checkNexusRuntime())}>{busy === 'runtime-check' || data.runtime.nexusChecking ? <LoaderCircle className="spin" /> : <RefreshCw />}{t('settings.checkForUpdates', 'Check for updates')}</button>
        {data.runtime.nexusAvailable && data.runtime.name !== data.runtime.nexusName?.replace(/-x86_64\.tar\.xz$/, '') ? <button className="primary" disabled={Boolean(busy) || data.runtime.updating} onClick={() => invoke('runtime-install-nexus', () => window.launcher.installNexusRuntime(), t('settings.runtimeInstalled', 'Nexus runtime was verified, installed, and selected.'))}>{busy === 'runtime-install-nexus' || data.runtime.updating ? <LoaderCircle className="spin" /> : <ArrowDownToLine />}{t('settings.installNexusRuntime', 'Install Nexus runtime')}{data.runtime.nexusVersion ? ` ${data.runtime.nexusVersion.replace(/^runtime-/, '')}` : ''}</button> : null}
      </div>
      {data.runtime.updating || runtimeLogs.length > 0 ? <pre className="build-log">{runtimeLogs.join('\n') || t('settings.waitingForOutput', 'Waiting for output…')}</pre> : null}
    </section>

    <section className="settings-card language-card">
      <div className="settings-heading"><div className="settings-icon"><Languages /></div><div><h2>{t('settings.languageTitle', 'Language')}</h2><p>{t('settings.languageDescription', 'Choose the interface language. System default follows your operating system.')}</p></div></div>
      <div className="form-grid"><label>{t('settings.languageLabel', 'Launcher language')}<select value={form.language ?? ''} onChange={(event) => changeLanguage(event.target.value)}><option value="">{t('settings.languageSystemDefault', 'System default')}</option><option value="en">English</option><option value="pl">Polski</option></select></label></div>
    </section>

    <div className="settings-storage">
      <section className="settings-card compact"><div className="settings-heading"><div className="settings-icon"><HardDrive /></div><div><h2>{t('settings.storageTitle', 'Storage and launch paths')}</h2><p>{t('settings.storageNote', 'The external Xodus checkout is never modified.')}</p></div></div><div className="form-grid"><label>{t('settings.defaultGameLocation', 'Default game location')}<div className="input-action"><input value={form.installRoot} onChange={(event) => setForm({ ...form, installRoot: event.target.value })} /><button onClick={() => pick('install')}><FolderOpen /></button></div></label><label>{t('settings.market', 'Market')}<input value={form.market} onChange={(event) => setForm({ ...form, market: event.target.value })} /></label><label>{t('settings.parallelStreams', 'Parallel streams')}<input type="number" min="1" max="16" value={form.parallelDownloads} onChange={(event) => setForm({ ...form, parallelDownloads: Number(event.target.value) })} /></label><label>{t('settings.externalXodusSource', 'External Xodus source')}<div className="input-action"><input value={form.externalXodusRoot} onChange={(event) => setForm({ ...form, externalXodusRoot: event.target.value })} /><button onClick={() => pick('backend')}><FolderOpen /></button></div></label><label>{t('settings.runtimeDirectory', 'Versioned runtime directory')}<div className="input-action"><input value={form.runtimeRoot} onChange={(event) => setForm({ ...form, runtimeRoot: event.target.value })} /><button onClick={() => pick('runtime')}><FolderOpen /></button></div></label><label>{t('settings.wineBinary', 'Wine / Xodus Proton binary')}<div className="input-action"><input value={form.winePath} onChange={(event) => setForm({ ...form, winePath: event.target.value })} placeholder={t('settings.wineAutoSelected', 'Selected automatically by the runtime manager')} /><button onClick={() => pick('wine')}><FolderOpen /></button></div></label></div><div className="save-row"><span>{t('settings.settingsStoredNote', 'Settings are stored locally in Electron userData.')}</span><button className="primary" disabled={busy === 'save'} onClick={() => invoke('save', () => window.launcher.updateSettings(form), t('settings.settingsSaved', 'Settings saved.'))}>{busy === 'save' ? <LoaderCircle className="spin" /> : <Check />}{t('common.save', 'Save')}</button></div></section>
    </div>
    <details className="settings-card settings-diagnostics">
      <summary><Settings2 /><span>{t('settings.advancedDiagnostics', 'Advanced / Diagnostics')}</span><ChevronRight /></summary>
      <div className="diagnostics-content">
        <section><h3>{t('settings.gameLogging', 'Game logging')}</h3><div className="toggle-row"><label className="toggle"><input type="checkbox" checked={form.verboseLogs} onChange={(event) => setForm({ ...form, verboseLogs: event.target.checked })} /><span>{t('settings.verboseLogs', 'Verbose game logs')}</span></label><p>{t('settings.verboseLogsHint', 'Writes full Wine, vkd3d-proton and Xodus diagnostics to the per-game log file and stops coalescing repeated lines. Slower and much larger logs; use temporarily when diagnosing a crash.')}</p></div><div className="button-row"><button className="secondary" disabled={Boolean(busy)} onClick={() => invoke('save-diagnostics', () => window.launcher.updateSettings({ verboseLogs: form.verboseLogs }), t('settings.loggingSaved', 'Logging settings saved.'))}>{t('settings.saveDiagnostics', 'Save diagnostics')}</button></div></section>
        <section><h3>{t('settings.backendDetails', 'Backend details')}</h3><p className="diagnostic-path mono">{data.backend.binaryPath ?? t('settings.noBackendSelected', 'No backend selected')}</p><div className="meta-grid"><div><span>{t('settings.sourceLabel', 'SOURCE')}</span><strong>{data.backend.source === 'external' ? t('settings.sourceExternal', 'External installation · read-only') : data.backend.delivery === 'release' ? t('settings.sourceRelease', 'Nexus GitHub Release') : data.backend.source === 'managed' ? t('settings.sourceManaged', 'Local versioned build') : '—'}</strong></div><div><span>{t('settings.commitLabel', 'COMMIT')}</span><strong className="mono">{data.backend.commit?.slice(0, 12) ?? '—'}</strong></div></div><button className="secondary" disabled={Boolean(busy) || data.backend.updating || data.backend.checking} onClick={() => invoke('backend-rebuild', () => window.launcher.rebuildBackend(), t('settings.backendBuilt', 'Pinned backend source was built and activated.'))}><Github />{t('settings.buildBackend', 'Build backend from source')}</button>{data.backend.updating || logs.length > 0 ? <pre className="build-log">{logs.join('\n') || t('settings.waitingForBackendOutput', 'Waiting for backend output…')}</pre> : null}</section>
        <section><h3>{t('settings.runtimeDetails', 'Runtime details')}</h3><p className="diagnostic-path mono">{data.runtime.winePath ?? t('settings.noRuntimeSelected', 'No runtime selected')}</p><div className="meta-grid"><div><span>{t('settings.sourceLabel', 'SOURCE')}</span><strong>{runtimeInfo.source}</strong></div><div><span>{t('settings.buildLabel', 'BUILD')}</span><strong className="mono">{data.runtime.commit ?? '—'}</strong></div></div></section>
        <section><h3>{t('settings.buildDependencies', 'Build dependencies')}</h3><div className="dependency-grid"><ToggleStatus ok={data.backend.prerequisites.git} label="Git" /><ToggleStatus ok={data.backend.prerequisites.cargo} label="Cargo" /><ToggleStatus ok={data.backend.prerequisites.rustc} label="Rust 1.99" /><ToggleStatus ok={data.backend.prerequisites.protoc} label="protoc" /></div><p className="fine-print">{t('settings.buildDepsNote', 'Building Xodus also requires a C/C++ toolchain, CMake, OpenSSL 3 and D-Bus development packages.')}</p></section>
      </div>
    </details>
  </main>;
}

function backendSetupHint(backend: AppSnapshot['backend']): string {
  if (backend.checking) return t('settings.checkingBackend', 'Checking for the Xodus backend…');
  if (backend.updating) return backend.phase ? t('settings.installingBackendPhase', 'Installing the Xodus backend… {phase}', { phase: backend.phase }) : t('settings.installingBackend', 'Installing the Xodus backend…');
  if (backend.blockReason) return backend.blockReason;
  return t('settings.signInUnlock', 'Sign-in unlocks once the Xodus backend is installed.');
}

function PasskeySignInNotice() {
  return <p className="passkey-sign-in-notice">{t('settings.passkeyNotice', 'Passkey sign-in requires Google Chrome installed on this computer. Other browsers are not supported. If Microsoft sign-in gets stuck, choose Continue in browser in the sign-in window.')}</p>;
}

export function FirstRunWizard({ data, toast }: { data: AppSnapshot; toast: (value: Toast) => void }) {
  const [installRoot, setInstallRoot] = useState(data.settings.installRoot);
  const [saving, setSaving] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  async function browse() {
    try {
      const picked = await window.launcher.chooseDirectory(installRoot);
      if (picked) setInstallRoot(picked);
    } catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
  }
  async function signIn() {
    setSigningIn(true);
    try { await window.launcher.login(); }
    catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
    finally { setSigningIn(false); }
  }
  async function finish() {
    setSaving(true);
    try {
      await window.launcher.updateSettings({ installRoot, firstRunCompleted: true });
      toast({ kind: 'success', message: t('wizard.welcomeToast', 'Welcome to Xodus Nexus. Install a game from the Store to get started.') });
    } catch (error) { toast({ kind: 'error', message: errorMessage(error) }); }
    finally { setSaving(false); }
  }

  return <div className="wizard-overlay">
    <div className="wizard" role="dialog" aria-modal="true" aria-label={t('wizard.dialogLabel', 'Set up Xodus Nexus')}>
      <div><span className="overline">{t('wizard.welcomeOverline', 'WELCOME')}</span><h1>{t('wizard.title', 'Set up Xodus Nexus')}</h1></div>
      <p>{t('wizard.intro', 'Choose where games install. Everything else can be changed later in Settings.')}</p>
      <label className="wizard-field">{t('wizard.gamesFolder', 'Games folder')}
        <div className="input-action"><input value={installRoot} onChange={(event) => setInstallRoot(event.target.value)} /><button onClick={() => void browse()} title={t('common.browse', 'Browse')}><FolderOpen /></button></div>
        <small>{t('wizard.gamesFolderHint', 'New games download and extract into this folder.')}</small>
      </label>
      <div className="wizard-account">
        <div><strong>{t('wizard.microsoftAccount', 'Microsoft account')}</strong><small>{data.backend.available ? (data.auth.stored === true ? t('wizard.signedInAs', 'Signed in as {name}', { name: data.auth.username ?? t('wizard.storedAccount', 'stored account') }) : data.auth.stored === false ? t('wizard.notSignedInYet', 'Not signed in yet — Store browsing works without an account') : t('wizard.accountChecking', 'Account status is still being checked')) : backendSetupHint(data.backend)}</small></div>
        <button className="secondary" disabled={!data.backend.capabilities.login || signingIn || data.auth.running} onClick={() => void signIn()}>{signingIn ? <LoaderCircle className="spin" /> : <LogIn />}{data.auth.stored ? t('settings.signInAgain', 'Sign in again') : t('wizard.signIn', 'Sign in')}</button>
      </div>
      <div className="wizard-actions">
        <PasskeySignInNotice />
        <span>{t('wizard.laterNote', 'Signing in can also be done later from Settings.')}</span>
        <button className="primary" disabled={saving} onClick={() => void finish()}>{saving ? <LoaderCircle className="spin" /> : <Check />}{t('wizard.start', 'Start using Xodus Nexus')}</button>
      </div>
    </div>
  </div>;
}

export function GlobalSearch({ games, page, query, change, submit, select }: {
  games: Game[]; page: Page; query: string; change: (value: string) => void;
  submit: (value: string) => void; select: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [page]);
  const term = query.trim().toLowerCase();
  const results = term ? games.filter(game => (game.title + ' ' + (game.storeId ?? '')).toLowerCase().includes(term)) : [];
  const visible = open && page !== 'store' && results.length > 0;
  return <div className="search-box" onFocus={() => setOpen(true)} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}><Search /><input value={query} onChange={event => { change(event.target.value); setOpen(true); }} onKeyDown={event => {
    if (event.key === 'Escape') setOpen(false);
    if (event.key === 'Enter' && term.length >= 2) { setOpen(false); submit(query.trim()); }
  }} aria-expanded={visible} aria-controls={visible ? 'global-search-results' : undefined} placeholder={t('search.placeholder', 'Search games, add-ons and your library')} />
    {query ? <button aria-label={t('search.clear', 'Clear search')} onClick={() => { change(''); setOpen(false); }}><X /></button> : null}
    {visible ? <div className="search-results" id="global-search-results">{results.map(game => <button key={game.id} onClick={() => { setOpen(false); change(''); select(game.id); }}><Cover game={game} /><span><GameTitle title={game.title} /><small>{game.storeId ?? game.path}</small></span></button>)}</div> : null}
  </div>;
}

export default function App() {
  const [page, setPage] = useState<Page>(() => window.location.hash === '#store' ? 'store' : 'home');
  const [data, setData] = useState<AppSnapshot>(emptySnapshot);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast>();
  const [search, setSearch] = useState('');
  const [submittedSearch, setSubmittedSearch] = useState('');
  // App stays mounted while pages change, unlike LibraryPage/AccountGames.
  const [libraryFilters, setLibraryFilters] = useState<LibraryFilters>(() => loadLibraryFilters());
  const [librarySelection, setLibrarySelection] = useState<{ id: string }>();
  // Re-renders the whole tree when the active language changes.
  useLanguage();
  useEffect(() => { applyLanguageSetting(data.settings.language); }, [data.settings.language]);

  useEffect(() => {
    void window.launcher.getSnapshot().then((value) => { setData(value); setLoading(false); }).catch((error) => { setToast({ kind: 'error', message: errorMessage(error) }); setLoading(false); });
    return window.launcher.onSnapshot(setData);
  }, []);
  useEffect(() => { if (!toast) return; const timeout = window.setTimeout(() => setToast(undefined), 5000); return () => { window.clearTimeout(timeout); }; }, [toast]);
  useEffect(() => {
    // XODUS_DEMO_TOUR=1 cycles through the pages for screenshot capture.
    if (!window.launcher.isDemoTour()) return;
    const order: Page[] = ['home', 'library', 'store', 'downloads', 'settings'];
    let index = 0;
    const timer = window.setInterval(() => { index = (index + 1) % order.length; setPage(order[index]); }, 7000);
    return () => { window.clearInterval(timer); };
  }, []);


  function changeLibraryFilters(filters: LibraryFilters) {
    setLibraryFilters(filters);
    if (!saveLibraryFilters(filters)) setToast({ kind: 'error', message: t('app.filtersError', 'Library filters could not be saved. They may reset after restarting Nexus.') });
  }

  function openLibraryGame(id: string) {
    if (!data.games.some(game => game.id === id)) return;
    setLibrarySelection({ id });
    setSearch('');
    changeLibraryFilters({ ...defaultLibraryFilters, playState: 'installed' });
    setPage('library');
  }

  function action(fn: () => Promise<unknown>, success?: string) { void fn().then(() => success && setToast({ kind: 'success', message: success })).catch((error) => setToast({ kind: 'error', message: errorMessage(error) })); }

  if (loading) return <div className="boot"><div className="brand-mark">X</div><LoaderCircle className="spin" /><span>{t('app.loading', 'Loading Xodus Nexus')}</span></div>;
  return <ConfirmationProvider><PackageInstallProvider><div className="app-shell">
    {!data.settings.firstRunCompleted ? <FirstRunWizard data={data} toast={(value) => setToast(value)} /> : null}
    <Sidebar data={data} page={page} go={setPage} openGame={openLibraryGame} />

    <section className="content-shell">
      <header className="topbar"><GlobalSearch games={data.games} page={page} query={search} change={setSearch} submit={value => { setSubmittedSearch(value); setPage('store'); }} select={openLibraryGame} /><TopStatus data={data} go={setPage} /></header>
      <div className="page-scroll">{page === 'home' ? <HomePage data={data} go={setPage} action={action} /> : null}{page === 'store' ? <StorePage data={data} toast={setToast} go={setPage} initialQuery={submittedSearch} /> : null}{page === 'library' ? <LibraryPage data={data} toast={setToast} filters={libraryFilters} onFiltersChange={changeLibraryFilters} selection={librarySelection} /> : null}{page === 'downloads' ? <DownloadsPage data={data} toast={setToast} /> : null}{page === 'settings' ? <SettingsPage data={data} toast={setToast} /> : null}</div>
    </section>
    {toast ? <div className={`toast ${toast.kind}`}>{toast.kind === 'success' ? <Check /> : toast.kind === 'error' ? <CircleAlert /> : <Terminal />}<span>{toast.message}</span><button onClick={() => setToast(undefined)}><X /></button></div> : null}
  </div><GamepadNavigation back={() => setPage('home')} page={delta => setPage(current => {
    const pages: Page[] = ['home', 'library', 'store'];
    const index = pages.indexOf(current);
    return index === -1 ? pages[delta > 0 ? 0 : pages.length - 1] : pages[(index + delta + pages.length) % pages.length];
  })} /></PackageInstallProvider></ConfirmationProvider>;
}
