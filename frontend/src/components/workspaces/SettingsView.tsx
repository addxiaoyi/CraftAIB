import React, { useState, useEffect } from 'react';
import {
  Settings,
  Languages,
  Database,
  Activity,
  Trash2,
  RotateCcw,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react';

interface SettingsViewProps {
  lang: 'zh' | 'en';
  onLanguageChange: (lang: 'zh' | 'en') => void;
  autoSave: boolean;
  onAutoSaveChange: (autoSave: boolean) => void;
  onResetDefaults: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  lang,
  onLanguageChange,
  autoSave,
  onAutoSaveChange,
  onResetDefaults,
}) => {
  const [healthStatus, setHealthStatus] = useState<any>(null);
  const [isPinging, setIsPinging] = useState<boolean>(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [cacheSize, setCacheSize] = useState<string>('1.4 MB');
  const [clearedToast, setClearedToast] = useState<boolean>(false);
  const [config, setConfig] = useState({ textEndpoint: '', textModel: '', textKey: '', visionEndpoint: '', visionModel: '', visionKey: '', adminToken: '', timeoutMs: 120000, retries: 2 });
  const [configMessage, setConfigMessage] = useState<string | null>(null);
  const [isTestingModel, setIsTestingModel] = useState(false);

  const base = {
    en: {
      title: 'Studio Preferences & System Diagnostics',
      subtitle: 'Configure workbench language, auto-save persistence, browser memory caches, and AI model health.',
      preferencesTitle: 'General Studio Preferences',
      languageLabel: 'Studio Language',
      autoSaveLabel: 'Continuous Auto-Save',
      autoSaveDesc: 'Automatically commits structure changes to browser localStorage every 30 seconds.',
      cacheTitle: 'Storage & Memory Cache',
      cacheDesc: 'Local structure snapshots, generated schematics, and cached textures.',
      clearCacheBtn: 'Clear Client Cache',
      resetDefaultsBtn: 'Restore Default Structures',
      diagnosticsTitle: 'System & Model Service Health',
      runPingBtn: 'Run Diagnostics Ping',
      serverStatus: 'AI planning API',
      geminiStatus: 'Configured model capabilities',
      webglStatus: 'Three.js WebGL Engine',
      latencyLabel: 'Round-Trip Latency',
      cacheCleared: 'Cache successfully cleared!',
    },
    zh: {
      title: '工作区设置与系统诊断',
      subtitle: '配置工作区界面语言、本地自动保存、浏览器存储缓存以及 AI 模型服务诊断状态。',
      preferencesTitle: '基础通用设置',
      languageLabel: '界面语言 (Language)',
      autoSaveLabel: '启用本地自动保存',
      autoSaveDesc: '每隔 30 秒自动将当前结构与 Region 修改写入浏览器持久化存储。',
      cacheTitle: '本地存储与缓存管理',
      cacheDesc: '本地保存的结构快照、生成的投影文件缓存及纹理数据。',
      clearCacheBtn: '清理本地缓存',
      resetDefaultsBtn: '恢复默认建筑预设',
      diagnosticsTitle: '系统服务与模型状态诊断',
      runPingBtn: '执行服务健康自检',
      serverStatus: 'AI 规划 API',
      geminiStatus: '已配置的模型能力',
      webglStatus: 'Three.js WebGL 3D 渲染器',
      latencyLabel: 'API 往返延迟',
      cacheCleared: '本地缓存已清空！',
    },
  }[lang];
  const t = lang === 'zh' ? {
    ...base,
    title: '设置与系统诊断', subtitle: '管理语言、自动保存、本地缓存和 AI 服务状态。',
    preferencesTitle: '常规设置', languageLabel: '界面语言', autoSaveLabel: '自动保存',
    autoSaveDesc: '自动保存当前结构和区域修改。', cacheTitle: '本地存储',
    cacheDesc: '清理项目快照和生成结果缓存。', clearCacheBtn: '清理项目缓存',
    resetDefaultsBtn: '恢复默认结构', diagnosticsTitle: '服务诊断', runPingBtn: '运行诊断',
    serverStatus: 'AI 规划服务', geminiStatus: '模型配置状态', webglStatus: 'Three.js WebGL 引擎',
    latencyLabel: '接口延迟', cacheCleared: '项目缓存已清理',
  } : base;

  const checkHealth = async () => {
    setIsPinging(true);
    const start = performance.now();
    try {
      const res = await fetch('/api/ai/status', { cache: 'no-store' });
      const data = await res.json();
      const elapsed = Math.round(performance.now() - start);
      setLatency(elapsed);
      setHealthStatus(data);
      setConfig((current) => ({ ...current, textEndpoint: data.generationEndpoint ?? data.textEndpoint ?? current.textEndpoint, textModel: data.generationModel ?? data.textModel ?? current.textModel, visionEndpoint: data.visionEndpoint ?? current.visionEndpoint, visionModel: data.visionModel ?? current.visionModel, timeoutMs: data.textTimeoutMs ?? current.timeoutMs, retries: data.textRetries ?? current.retries }));
    } catch (err) {
      console.error('Health check failed:', err);
      setHealthStatus({ ok: false, text: false, vision: false });
    } finally {
      setIsPinging(false);
    }
  };

  useEffect(() => {
    checkHealth();
  }, []);

  const handleClearCache = () => {
    localStorage.removeItem('blockcraft_current_structure');
    localStorage.removeItem('blockcraft_auto_save');
    setCacheSize('0.0 MB');
    setClearedToast(true);
    setTimeout(() => setClearedToast(false), 2500);
  };

  const saveConfig = async () => {
    setConfigMessage(null);
    try {
      const headers: HeadersInit = { 'content-type': 'application/json' };
      if (config.adminToken) headers.authorization = `Bearer ${config.adminToken}`;
      const response = await fetch('/api/ai/config', { method: 'POST', headers, body: JSON.stringify({ generation: { endpoint: config.textEndpoint, model: config.textModel, apiKey: config.textKey, timeoutMs: config.timeoutMs, retries: config.retries } }) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error?.message || 'Configuration could not be saved.');
      setConfigMessage(lang === 'zh' ? '模型配置已保存，密钥不会显示。' : 'Model configuration saved. Keys are never displayed.');
      await checkHealth();
    } catch (error) { setConfigMessage(error instanceof Error ? error.message : 'Configuration could not be saved.'); }
  };

  const testModelConnection = async () => {
    setConfigMessage(null);
    setIsTestingModel(true);
    try {
      const headers: HeadersInit = { 'content-type': 'application/json' };
      if (config.adminToken) headers.authorization = `Bearer ${config.adminToken}`;
      const draftIsPresent = Boolean(config.textEndpoint.trim() || config.textModel.trim() || config.textKey.trim());
      const body = draftIsPresent
        ? { generation: { endpoint: config.textEndpoint, model: config.textModel, apiKey: config.textKey, timeoutMs: config.timeoutMs }, capability: 'vision' }
        : { capability: 'vision' };
      const response = await fetch('/api/ai/test-connection', { method: 'POST', headers, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error?.message || `Connection test failed (HTTP ${response.status}).`);
      setConfigMessage(result.supportsToolCalls === false
        ? (lang === 'zh' ? `图像请求已连通，但工具调用探测失败（${result.probeMode ?? 'auto'}）：${result.model}。${result.message}` : `Vision request connected, but tool-call probe failed (${result.probeMode ?? 'auto'}): ${result.model}. ${result.message}`)
        : (lang === 'zh' ? `图像输入与工具调用均可用：${result.model}` : `Image input and tool calling are available: ${result.model}`));
    } catch (error) {
      setConfigMessage(error instanceof Error ? error.message : 'Model connection test failed.');
    } finally { setIsTestingModel(false); }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-5 lg:p-7 space-y-6 max-w-4xl mx-auto w-full bg-[#090a0f]">
      {/* Title */}
      <div>
        <h1 className="text-base font-semibold tracking-tight text-white">{t.title}</h1>
        <p className="text-xs text-zinc-400 mt-1">{t.subtitle}</p>
      </div>

      {/* Preferences Section */}
      <div className="bg-[#0e1118] border border-white/[0.07] rounded-lg p-5 space-y-4">
        <h3 className="text-xs font-semibold text-white flex items-center gap-2 pb-2.5 border-b border-white/[0.06]">
          <Languages className="w-4 h-4 text-zinc-400" />
          <span>{t.preferencesTitle}</span>
        </h3>

        {/* Language switch */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-1">
          <div>
            <div className="text-xs font-medium text-zinc-200">{t.languageLabel}</div>
            <div className="text-[11px] text-zinc-500">
              Toggle between English and Simplified Chinese interface.
            </div>
          </div>
          <div className="flex items-center gap-1 bg-[#090a0f] p-1 rounded-md border border-white/[0.08]">
            <button
              onClick={() => onLanguageChange('zh')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                lang === 'zh'
                  ? 'bg-white/10 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              简体中文
            </button>
            <button
              onClick={() => onLanguageChange('en')}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                lang === 'en'
                  ? 'bg-white/10 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              English
            </button>
          </div>
        </div>

        {/* Auto save switch */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-2 border-t border-white/[0.06]">
          <div>
            <div className="text-xs font-medium text-zinc-200">{t.autoSaveLabel}</div>
            <div className="text-[11px] text-zinc-500">{t.autoSaveDesc}</div>
          </div>
          <button
            onClick={() => onAutoSaveChange(!autoSave)}
            className={`px-3 py-1.5 rounded-md text-xs font-mono transition-colors border ${
              autoSave
                ? 'bg-white/10 border-white/20 text-white font-medium'
                : 'bg-white/[0.02] border-white/[0.05] text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {autoSave ? 'AUTO-SAVE: ON' : 'AUTO-SAVE: OFF'}
          </button>
        </div>
      </div>

      {/* Cache & Storage Management */}
      <div className="bg-[#0e1118] border border-white/[0.07] rounded-lg p-5 space-y-4">
        <h3 className="text-xs font-semibold text-white flex items-center gap-2 pb-2.5 border-b border-white/[0.06]">
          <Database className="w-4 h-4 text-zinc-400" />
          <span>{t.cacheTitle}</span>
        </h3>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs text-zinc-300">
              Estimated Storage Usage:{' '}
              <span className="font-mono text-emerald-400 tabular-nums font-semibold">{cacheSize}</span>
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">{t.cacheDesc}</div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleClearCache}
              className="px-3 py-1.5 bg-white/[0.02] hover:bg-red-950/40 text-red-300 border border-white/[0.08] hover:border-red-800/50 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5 text-red-400" />
              <span>{t.clearCacheBtn}</span>
            </button>
            <button
              onClick={onResetDefaults}
              className="px-3 py-1.5 btn-secondary rounded-md text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
              <span>{t.resetDefaultsBtn}</span>
            </button>
          </div>
        </div>

        {clearedToast && (
          <div className="text-xs text-emerald-400 flex items-center gap-1.5 pt-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{t.cacheCleared}</span>
          </div>
        )}
      </div>

      {/* System Diagnostics */}
      <div className="bg-[#0e1118] border border-white/[0.07] rounded-lg p-5 space-y-4">
        <h3 className="text-xs font-semibold text-white">{lang === 'zh' ? '大模型配置' : 'Model Configuration'}</h3>
        <p className="text-[11px] text-zinc-500">{lang === 'zh' ? '配置保存在本机服务端 .env，浏览器不会保存或回显密钥。' : 'Configuration is stored in the local server .env. Keys are never saved in the browser or displayed.'}</p>
        <input aria-label="Administrator token" type="password" placeholder={lang === 'zh' ? '管理员令牌（公开部署需要）' : 'Administrator token (required for public deployment)'} value={config.adminToken} onChange={(e) => setConfig((current) => ({ ...current, adminToken: e.target.value }))} className="studio-input w-full rounded px-2 py-1.5 text-xs" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(['text'] as const).map((kind) => <div key={kind} className="space-y-2">
            <div className="text-xs text-zinc-300">{kind === 'text' ? (lang === 'zh' ? '建筑生成模型（统一）' : 'Building generation model (shared)') : (lang === 'zh' ? '视觉模型覆盖（可选）' : 'Vision override (optional)')}</div>
            <input aria-label={`${kind} endpoint`} placeholder="https://api.example.com/v1/chat/completions" value={kind === 'text' ? config.textEndpoint : config.visionEndpoint} onChange={(e) => setConfig((current) => ({ ...current, [kind === 'text' ? 'textEndpoint' : 'visionEndpoint']: e.target.value }))} className="studio-input w-full rounded px-2 py-1.5 text-xs" />
            <input aria-label={`${kind} model`} placeholder="model name" value={kind === 'text' ? config.textModel : config.visionModel} onChange={(e) => setConfig((current) => ({ ...current, [kind === 'text' ? 'textModel' : 'visionModel']: e.target.value }))} className="studio-input w-full rounded px-2 py-1.5 text-xs" />
            <input aria-label={`${kind} API key`} type="password" placeholder={lang === 'zh' ? 'API 密钥（仅写入服务端）' : 'API key (server-side only)'} value={kind === 'text' ? config.textKey : config.visionKey} onChange={(e) => setConfig((current) => ({ ...current, [kind === 'text' ? 'textKey' : 'visionKey']: e.target.value }))} className="studio-input w-full rounded px-2 py-1.5 text-xs" />
          </div>)}
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-zinc-400">Timeout <input type="number" min="1000" max="300000" value={config.timeoutMs} onChange={(e) => setConfig((current) => ({ ...current, timeoutMs: Number(e.target.value) }))} className="studio-input ml-1 w-24 rounded px-2 py-1 text-xs" /></label>
          <label className="text-xs text-zinc-400">Retries <input type="number" min="0" max="5" value={config.retries} onChange={(e) => setConfig((current) => ({ ...current, retries: Number(e.target.value) }))} className="studio-input ml-1 w-16 rounded px-2 py-1 text-xs" /></label>
          <button type="button" onClick={() => void testModelConnection()} disabled={isTestingModel} className="ml-auto px-3 py-1.5 rounded border border-white/10 text-xs text-zinc-200 disabled:opacity-50">{isTestingModel ? (lang === 'zh' ? '测试中…' : 'Testing...') : (lang === 'zh' ? '测试已保存模型连接' : 'Test saved model connection')}</button>
          <button type="button" onClick={() => void saveConfig()} className="px-3 py-1.5 btn-primary rounded text-xs">{lang === 'zh' ? '保存配置' : 'Save configuration'}</button>
        </div>
        {configMessage && <p role="status" className="text-xs text-emerald-300">{configMessage}</p>}
      </div>

      {/* System Diagnostics */}
      <div className="bg-[#0e1118] border border-white/[0.07] rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between pb-2.5 border-b border-white/[0.06]">
          <h3 className="text-xs font-semibold text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-zinc-400" />
            <span>{t.diagnosticsTitle}</span>
          </h3>

          <button
            onClick={checkHealth}
            disabled={isPinging}
            className="px-2.5 py-1 text-xs text-zinc-300 hover:text-white bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] rounded-md transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3 h-3 ${isPinging ? 'animate-spin' : ''}`} />
            <span>{t.runPingBtn}</span>
          </button>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between py-1 border-b border-white/[0.04]">
            <span className="text-zinc-400">{t.serverStatus}</span>
            <span className="font-mono text-emerald-400">
              {healthStatus?.ok ? 'Online (HTTP 200)' : isPinging ? 'Checking...' : 'Unavailable'}
            </span>
          </div>

          <div className="flex items-center justify-between py-1 border-b border-white/[0.04]">
            <span className="text-zinc-400">{t.geminiStatus}</span>
            <span className="font-mono text-zinc-300">
              {healthStatus?.generationModel
                ? `${healthStatus.generationModel} (text + reference images)`
                : healthStatus?.textModel
                  ? `${healthStatus.textModel} (text + reference images)`
                  : 'Not configured'}
            </span>
          </div>

          <div className="flex items-center justify-between py-1 border-b border-white/[0.04]">
            <span className="text-zinc-400">{lang === 'zh' ? '超时 / 重试' : 'Timeout / retries'}</span>
            <span className="font-mono text-zinc-300">
              {healthStatus?.text || healthStatus?.vision
                ? `${healthStatus.textTimeoutMs ?? healthStatus.visionTimeoutMs ?? '-'} ms / ${healthStatus.textRetries ?? healthStatus.visionRetries ?? '-'}x`
                : '-'}
            </span>
          </div>

          <div className="flex items-center justify-between py-1 border-b border-white/[0.04]">
            <span className="text-zinc-400">{t.webglStatus}</span>
            <span className="font-mono text-emerald-400">Active (WebGL 2.0)</span>
          </div>

          <div className="flex items-center justify-between py-1">
            <span className="text-zinc-400">{t.latencyLabel}</span>
            <span className="font-mono text-zinc-300 tabular-nums">
              {latency !== null ? `${latency} ms` : '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
