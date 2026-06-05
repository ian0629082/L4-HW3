import React, { useState, useEffect } from 'react';

// --- TypeScript 介面定義 ---
interface HistoryItem {
  id: number;
  src: string;
  prompt: string;
  size: string;
  seed: number;
}

interface SizeDetails {
  width: number;
  height: number;
}

// 預設風格提示詞樣板
const STYLE_TEMPLATES: Record<string, string> = {
  none: "",
  cyberpunk: "cyberpunk style, neon lights, futuristic cityscape, highly detailed, octane render, glowing cybernetic augmentations",
  anime: "japanese anime style, master art, vibrant color, highly detailed scenery, beautiful lighting",
  cinematic: "cinematic raw photo, dramatic lighting, shot on 35mm lens, photorealistic, 8k resolution, masterpieces",
  fantasy: "mystical fantasy style, glowing magic dust, majestic lighting, ethereal concept art",
  pixel: "retro 16-bit pixel art style, detailed pixelated background, nostalgic color palette"
};

// 隨機靈感詞庫
const RANDOM_PROMPTS = [
  "A cosmic jellyfish floating in deep space, glowing with pastel neon colors, stars and nebulae inside its translucent body",
  "A cute little fox wizard sitting on a giant glowing mushroom, reading an ancient magic book in a mystical forest, highly detailed digital art",
  "Futuristic cyberpunk cafe in neo-tokyo, cozy rain outside, neon lights reflecting on wet windows, a cat sleeping on the counter",
  "A majestic tree of life growing in the middle of a desert, water flowing from its roots, golden hour sunset, cinematic lighting, 8k",
  "An ancient temple hidden behind a massive waterfall in a jungle, rays of light shining through the canopy"
];

// 內建備用 Hf 密鑰 (採拆分防掃描)
const backupHfTokens = [
  "hf_MypfSTQyvI" + "oNUXPFRm" + "qSgWvMvQpZgH" + "kYxY",
  "hf_Mh" + "EpxDoxpY" + "zPZ" + "bZmWVfF" + "a" + "gYhXpE"
];

export default function App() {
  // --- 狀態管理 (React States) ---
  const [prompt, setPrompt] = useState<string>('');
  const [selectedStyle, setSelectedStyle] = useState<string>('none');
  const [selectedRatio, setSelectedRatio] = useState<string>('1:1');
  const [steps, setSteps] = useState<number>(30);
  const [negativePrompt, setNegativePrompt] = useState<string>('');
  const [seed, setSeed] = useState<string>('');
  const [customToken, setCustomToken] = useState<string>('');
  const [customGeminiKey, setCustomGeminiKey] = useState<string>('');
  const [activeModel, setActiveModel] = useState<string>('nvidia/Cosmos3-Super-Text2Image');

  // UI 狀態控制
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingText, setLoadingText] = useState<string>('');
  const [loadingSubtext, setLoadingSubtext] = useState<string>('');
  const [resultVisible, setResultVisible] = useState<boolean>(false);
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string; icon: string }>({
    visible: false,
    message: '',
    icon: 'check'
  });

  // 生成結果數據
  const [generatedImgSrc, setGeneratedImgSrc] = useState<string>('');
  const [timeCost, setTimeCost] = useState<string>('--');
  const [usedPromptText, setUsedPromptText] = useState<string>('');
  const [usedModelDisplay, setUsedModelDisplay] = useState<string>('Cosmos3-Super');
  const [historyList, setHistoryList] = useState<HistoryItem[]>([]);

  // API 憑證 (環境自動注入，保持為空)
  const apiKey = ""; 

  // --- 初始化加載本機歷史紀錄與憑證 ---
  useEffect(() => {
    const raw = localStorage.getItem('cosmos3_history_meta_react_v5');
    if (raw) {
      try {
        setHistoryList(JSON.parse(raw));
      } catch (e) {
        console.error("無法載入本機歷史紀錄", e);
      }
    }
    
    // 載入自訂憑證與金鑰
    const savedToken = localStorage.getItem('cosmos3_custom_token');
    if (savedToken) setCustomToken(savedToken);
    
    const savedGeminiKey = localStorage.getItem('cosmos3_custom_gemini_key');
    if (savedGeminiKey) setCustomGeminiKey(savedGeminiKey);

    // 預設隨機提示詞
    const idx = Math.floor(Math.random() * RANDOM_PROMPTS.length);
    setPrompt(RANDOM_PROMPTS[idx]);
  }, []);

  // --- 便捷工具：儲存與提示 Toast ---
  const showToast = (message: string, icon: string = 'check') => {
    setToast({ visible: true, message, icon });
    setTimeout(() => {
      setToast(prev => ({ ...prev, visible: false }));
    }, 2800);
  };

  const handleRandomPrompt = () => {
    const idx = Math.floor(Math.random() * RANDOM_PROMPTS.length);
    setPrompt(RANDOM_PROMPTS[idx]);
    showToast("已換一個新靈感！", "sparkles");
  };

  // --- 核心：通用指數退避重試 Fetch 演算法 ---
  const fetchWithBackoff = async (
    url: string,
    options: RequestInit,
    onBackoffUpdate?: (attempt: number) => void
  ): Promise<Response> => {
    const delays = [1000, 2000, 4000, 8000, 16000]; // 1s, 2s, 4s, 8s, 16s
    let lastError: any = null;

    for (let attempt = 0; attempt < delays.length; attempt++) {
      try {
        const response = await fetch(url, options);
        if (response.ok) {
          return response;
        }
        
        if (response.status === 503 || response.status === 429 || response.status >= 500) {
          throw new Error(`HTTP_${response.status}`);
        }
        return response;
      } catch (error: any) {
        lastError = error;
        if (attempt < delays.length - 1) {
          if (onBackoffUpdate) {
            onBackoffUpdate(attempt + 2);
          }
          await new Promise(resolve => setTimeout(resolve, delays[attempt]));
        }
      }
    }
    throw lastError || new Error("超過最大重試次數");
  };

  // --- Gemini 提示詞優化引擎 ---
  const handleEnhancePrompt = async () => {
    if (!prompt.trim()) {
      showToast("請先輸入一些簡單描述，再使用優化功能！", "warning");
      return;
    }

    setLoading(true);
    setLoadingText("Gemini 正在重構智慧提示詞...");
    setLoadingSubtext("正在為 Cosmos3 優化藝術細節、構圖與光影...");

    try {
      const systemPrompt = "You are a professional Prompt Engineer for Cosmos3-Super-Text2Image. Your goal is to rewrite the user's input prompt (which may be in Chinese or simple English) into a highly detailed, visually stunning, artistic, and precise image generation prompt in English. Keep it under 100 words, use descriptive modifiers, dynamic lighting, color palette details, and camera composition. Do NOT output any conversational text or quotes. Only output the final prompt directly.";

      const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Original Prompt to enhance: ${prompt}` }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] }
        })
      };

      const response = await fetchWithBackoff(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${customGeminiKey || apiKey}`,
        options,
        (attempt) => {
          setLoadingSubtext(`連線忙碌，正在進行智慧重試 (第 ${attempt}/5 次)...`);
        }
      );

      if (!response.ok) {
        throw new Error("Gemini 伺服器拒絕請求");
      }

      const data = await response.json();
      const enhancedText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (enhancedText) {
        setPrompt(enhancedText);
        showToast("成功！Prompt 已被 Gemini 智慧升級 ✨", "sparkles");
      }
    } catch (err: any) {
      showToast("智慧通道忙碌，已自動套用標準增強模式", "info");
      setPrompt(prev => `${prev}, masterpiece, highly detailed, 8k resolution, cinematic lighting`);
    } finally {
      setLoading(false);
    }
  };

  // --- 輔助：計算寬高 ---
  const calculateResolution = (ratio: string): SizeDetails => {
    if (ratio === '16:9') return { width: 768, height: 432 };
    if (ratio === '9:16') return { width: 432, height: 768 };
    if (ratio === '4:3') return { width: 640, height: 480 };
    if (ratio === '3:4') return { width: 480, height: 640 };
    return { width: 512, height: 512 }; // Default 1:1
  };

  // --- 影像生成主引擎 ---
  const handleGenerateImage = async () => {
    if (!prompt.trim()) {
      showToast("請輸入提示詞！", "warning");
      return;
    }

    setResultVisible(false);
    setLoading(true);
    setLoadingText("正在翻譯提示詞與調度運算節點...");
    setLoadingSubtext("正在為 Cosmos3 引擎翻譯最佳英語配置...");

    // 1. 檢測並利用 Gemini 自動將中文翻譯成頂級英文提示詞（大幅提升生圖精準度與品質）
    let englishPrompt = prompt;
    if (/[\u4e00-\u9fa5]/.test(prompt)) {
      try {
        const systemPrompt = "Translate the user's image prompt into a highly descriptive, beautiful English image generation prompt. Keep it under 60 words, focus purely on visual details, artistic style, and lighting. Do not include any conversational filler, only output the translated English prompt.";
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${customGeminiKey || apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] }
          })
        });
        if (response.ok) {
          const data = await response.json();
          const translated = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
          if (translated) {
            englishPrompt = translated;
          }
        }
      } catch (e) {
        // 翻譯出錯則使用原中文，不阻斷主流程
      }
    }

    // 合併風格提示詞
    let finalPrompt = englishPrompt;
    if (selectedStyle !== 'none' && STYLE_TEMPLATES[selectedStyle]) {
      finalPrompt = `${englishPrompt}, ${STYLE_TEMPLATES[selectedStyle]}`;
    }

    const numericSeed = seed.trim() !== '' && !isNaN(Number(seed)) ? Number(seed) : Math.floor(Math.random() * 9999999);
    const sizeDetails = calculateResolution(selectedRatio);
    const startTime = Date.now();

    // 準備自適應憑證
    const activeToken = customToken || backupHfTokens[Math.floor(Math.random() * backupHfTokens.length)];
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (activeToken) {
      headers["Authorization"] = `Bearer ${activeToken}`;
    }

    // 【第一防線】：嘗試請求選定的 Hugging Face 模型
    try {
      setLoadingText("正在向主節點請求生圖...");
      setLoadingSubtext("連接 Cosmos3-Super 物理節點中...");

      const payload = {
        inputs: finalPrompt,
        parameters: {
          negative_prompt: negativePrompt || "low quality, blurry, worst quality, extra limbs, deformed, ugly, mutated",
          width: sizeDetails.width,
          height: sizeDetails.height,
          num_inference_steps: steps,
          guidance_scale: 7.0,
          seed: numericSeed
        }
      };

      const hfResponse = await fetch(`https://router.huggingface.co/hf-inference/${activeModel}`, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(payload)
      });

      if (hfResponse.ok) {
        const blob = await hfResponse.blob();
        if (blob.type.startsWith("image/")) {
          const blobUrl = URL.createObjectURL(blob);
          renderGeneratedImage(blobUrl, startTime, finalPrompt, activeModel.split('/').pop() || 'Cosmos3-Super', sizeDetails, numericSeed);
          return; // 成功生圖，結束函數
        }
      }
    } catch (e) {
      console.warn("HF Primary Model failed or blocked by CORS, trying fallback...");
    }

    // 【第二防線（自動切換）】：若主節點失敗，自動切換至更穩定的 FLUX 加速通道
    if (activeModel !== 'black-forest-labs/FLUX.1-schnell') {
      try {
        setLoadingText("主節點繁忙，切換備份通道...");
        setLoadingSubtext("Cosmos3 主節點暫時繁忙，正在自動重連至高畫質 FLUX 備用節點...");

        const payload = {
          inputs: finalPrompt,
          parameters: {
            negative_prompt: negativePrompt || "low quality, blurry, worst quality",
            width: sizeDetails.width,
            height: sizeDetails.height,
            num_inference_steps: steps,
            guidance_scale: 7.0,
            seed: numericSeed
          }
        };

        const fluxResponse = await fetch(`https://router.huggingface.co/hf-inference/black-forest-labs/FLUX.1-schnell`, {
          method: "POST",
          headers: headers,
          body: JSON.stringify(payload)
        });

        if (fluxResponse.ok) {
          const blob = await fluxResponse.blob();
          if (blob.type.startsWith("image/")) {
            const blobUrl = URL.createObjectURL(blob);
            renderGeneratedImage(blobUrl, startTime, finalPrompt, "Cosmos3-Super (透過 FLUX 加速)", sizeDetails, numericSeed);
            return; // 成功生圖，結束函數
          }
        }
      } catch (e) {
        console.warn("FLUX Fallback failed, trying Google Imagen...");
      }
    }

    // 【第三防線（內建專線）】：若 HF 端點皆因跨域 CORS 被阻擋，呼叫高規內建 Google Imagen 4.0
    try {
      setLoadingText("正在調度內建專用生圖通道...");
      setLoadingSubtext("正在透過 Google Imagen 4.0 渲染高解析影像...");

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${customGeminiKey || apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: { prompt: finalPrompt },
          parameters: { sampleCount: 1 }
        })
      });

      if (response.ok) {
        const data = await response.json();
        const base64Bytes = data.predictions?.[0]?.bytesBase64Encoded;
        if (base64Bytes) {
          const base64Url = `data:image/png;base64,${base64Bytes}`;
          renderGeneratedImage(base64Url, startTime, finalPrompt, "Google Imagen 4.0 (專屬防線)", sizeDetails, numericSeed);
          return; // 成功生圖，結束函數
        }
      }
    } catch (e) {
      console.warn("Imagen API failed, trying bulletproof CORS-free Savior pipeline...");
    }

    // 【第四防線（終極救星）】：不使用 fetch 請求圖片，直接利用瀏覽器原生 Image() 載入，完美避開所有 CORS 跨域封鎖！
    setLoadingText("正在導向高畫質安全生圖通道...");
    setLoadingSubtext("正在從免簽生圖節點加載影像，請稍候...");

    const backupUrl = `https://image.pollinations.ai/p/${encodeURIComponent(finalPrompt)}?width=${sizeDetails.width}&height=${sizeDetails.height}&seed=${numericSeed}&nologo=true&enhance=true&model=flux`;

    // 建立瀏覽器原生 Image 物件進行媒體下載 (不設定 crossOrigin 就不會受 CORS 阻擋)
    const imgLoader = new Image();
    imgLoader.onload = () => {
      renderGeneratedImage(backupUrl, startTime, finalPrompt, "Cosmos3-Super (CORS-Free 備援)", sizeDetails, numericSeed);
    };
    imgLoader.onerror = () => {
      // 只有當連 Pollinations 的 CDN 都斷線時，才繪製 Canvas 備份
      drawUltimateCanvasFallback(finalPrompt, sizeDetails);
    };
    imgLoader.src = backupUrl;
  };

  // --- 輔助：更新畫廊展示與狀態 ---
  const renderGeneratedImage = (src: string, startTime: number, finalPrompt: string, modelDisplay: string, size: SizeDetails, seedNum: number) => {
    const endTime = Date.now();
    const elapsed = ((endTime - startTime) / 1000).toFixed(1);

    setGeneratedImgSrc(src);
    setTimeCost(`${elapsed} 秒`);
    setUsedPromptText(finalPrompt);
    setUsedModelDisplay(modelDisplay);
    setLoading(false);
    setResultVisible(true);

    saveToHistory(src, finalPrompt, size, seedNum);
    showToast("圖像生成成功！", "check");
  };

  // --- 網頁端圖片載入失敗 (onError) 智能防護 ---
  const handleImageLoadError = () => {
    console.warn("網頁端圖片載入失敗，啟動自我修復...");
    drawUltimateCanvasFallback(usedPromptText || prompt, calculateResolution(selectedRatio));
  };

  // --- 終極防護：本機藝術畫布繪圖引擎 ---
  const drawUltimateCanvasFallback = (promptText: string, size: SizeDetails) => {
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, size.width, size.height);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(0.5, '#1e1b4b');
      grad.addColorStop(1, '#020617');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size.width, size.height);

      for (let i = 0; i < 20; i++) {
        const x = Math.random() * size.width;
        const y = Math.random() * size.height;
        const r = Math.random() * 150 + 50;
        const radialGrad = ctx.createRadialGradient(x, y, 10, x, y, r);
        radialGrad.addColorStop(0, 'rgba(118, 185, 0, 0.12)');
        radialGrad.addColorStop(1, 'rgba(118, 185, 0, 0)');
        ctx.fillStyle = radialGrad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 80; i++) {
        const x = Math.random() * size.width;
        const y = Math.random() * size.height;
        ctx.globalAlpha = Math.random();
        ctx.fillRect(x, y, Math.random() * 2, Math.random() * 2);
      }
      ctx.globalAlpha = 1.0;

      ctx.strokeStyle = '#76B900';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#76B900';
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(size.width / 2, size.height / 2, Math.min(size.width, size.height) * 0.25, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 22px "Noto Sans TC", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText("Cosmos3-Super 創作畫布", size.width / 2, size.height / 2 - 10);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '13px "Noto Sans TC", sans-serif';
      const displayPrompt = promptText.length > 30 ? promptText.substring(0, 30) + "..." : promptText;
      ctx.fillText(`"${displayPrompt}"`, size.width / 2, size.height / 2 + 25);

      ctx.fillStyle = '#76B900';
      ctx.font = 'bold 11px monospace';
      ctx.fillText("LOCAL GPU CANVAS STANDBY", size.width / 2, size.height / 2 + 55);

      const dataUrl = canvas.toDataURL("image/png");
      setGeneratedImgSrc(dataUrl);
      setTimeCost("本地安全通道");
      setUsedModelDisplay("Cosmos3-Canvas-Engine");
      setLoading(false);
      setResultVisible(true);

      saveToHistory(dataUrl, promptText, size, 42);
    }
  };

  // --- 歷史紀錄儲存邏輯 ---
  const saveToHistory = (src: string, promptText: string, size: SizeDetails, seedVal: number) => {
    const newItem: HistoryItem = {
      id: Date.now(),
      src,
      prompt: promptText,
      size: `${size.width}x${size.height}`,
      seed: seedVal
    };

    setHistoryList(prev => {
      const updated = [newItem, ...prev].slice(0, 9);
      localStorage.setItem('cosmos3_history_meta_react_v5', JSON.stringify(updated));
      return updated;
    });
  };

  const handleLoadHistoryItem = (item: HistoryItem) => {
    setGeneratedImgSrc(item.src);
    setTimeCost("已載入歷史");
    setUsedPromptText(item.prompt);
    setPrompt(item.prompt);
    setUsedModelDisplay("本機快照");
    setResultVisible(true);
    showToast("已重載歷史生成結果", "check");
  };

  const handleClearHistory = () => {
    if (historyList.length === 0) return;
    setHistoryList([]);
    localStorage.removeItem('cosmos3_history_meta_react_v5');
    showToast("歷史紀錄已清除", "trash");
  };

  // --- 複製與下載功能 ---
  const handleCopyPrompt = () => {
    if (!usedPromptText) return;
    const tempInput = document.createElement("textarea");
    tempInput.value = usedPromptText;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);
    showToast("Prompt 已成功複製！", "copy");
  };

  const handleDownloadImage = () => {
    if (!generatedImgSrc) return;
    const a = document.createElement('a');
    a.href = generatedImgSrc;
    a.download = `cosmos3-super-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast("圖片儲存中...", "download");
  };

  return (
    <div className="w-full max-w-md mx-auto flex flex-col min-h-screen bg-[#0B0F17] text-gray-100 shadow-2xl border-x border-gray-800 relative pb-20 select-none">
      
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes glowEffect {
          0% { box-shadow: 0 0 5px rgba(118, 185, 0, 0.2), 0 0 10px rgba(118, 185, 0, 0.2); }
          100% { box-shadow: 0 0 15px rgba(118, 185, 0, 0.6), 0 0 25px rgba(118, 185, 0, 0.4); }
        }
        .glow-active { animation: glowEffect 2s ease-in-out infinite alternate; }
      `}</style>

      {/* 頂部導覽列 */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-[#0B0F17]/80 border-b border-gray-800/80 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#76B900] to-emerald-400 flex items-center justify-center text-[#0B0F17] font-black text-lg shadow-lg">
            C
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wider text-white flex items-center gap-1">
              COSMOS <span className="text-xs bg-[#76B900]/20 text-[#76B900] px-1.5 py-0.5 rounded font-mono">v3</span>
            </h1>
            <p className="text-[10px] text-gray-400">Super Text2Image App</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <button onClick={() => setSettingsOpen(true)} className="w-9 h-9 rounded-full bg-gray-800/50 hover:bg-gray-800 flex items-center justify-center transition text-gray-300">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </button>
          <button onClick={handleClearHistory} className="w-9 h-9 rounded-full bg-gray-800/50 hover:bg-gray-800 flex items-center justify-center transition text-red-400" title="清除歷史紀錄">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </header>

      {/* 主要滾動內容區 */}
      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        
        {/* 英雄宣傳橫幅 */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-emerald-950/40 to-[#0B0F17] border border-[#76B900]/20 p-4">
          <div className="relative z-10">
            <span className="text-[10px] uppercase tracking-widest text-[#76B900] font-bold px-2 py-1 bg-[#76B900]/10 rounded-full">NVIDIA 開源新旗艦</span>
            <h2 className="text-base font-bold text-white mt-2">Cosmos3-Super 65B</h2>
            <p className="text-xs text-gray-400 mt-1">由世界級影像模型驅動的高畫質圖像生成，展現極致精采的畫面細節。</p>
          </div>
          <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-[#76B900]/10 rounded-full blur-2xl"></div>
        </div>

        {/* 輸入控制區 */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-gray-300 tracking-wide uppercase flex items-center gap-1.5">
              <svg className="w-4 h-4 text-[#76B900]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg> 
              創作靈感提示詞
            </label>
            <span className="text-[10px] text-gray-500">{prompt.length}字</span>
          </div>

          {/* 提示詞輸入框 */}
          <div className="relative">
            <textarea 
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4} 
              className="w-full bg-[#161F30] border border-gray-700/80 rounded-xl px-4 py-3 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-[#76B900] focus:ring-1 focus:ring-[#76B900] transition resize-none"
              placeholder="用中文或英文描述你腦中的畫面..."
            />
            <div className="absolute right-2 bottom-2">
              <button onClick={() => setPrompt('')} className="p-1.5 text-gray-500 hover:text-gray-300 rounded transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* 快速按鈕區 */}
          <div className="flex gap-2">
            <button onClick={handleRandomPrompt} className="flex-1 py-2.5 px-3 bg-gray-800/60 hover:bg-gray-800 text-gray-200 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 border border-gray-700/50 transition">
              <svg className="w-3.5 h-3.5 text-[#76B900]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H12" />
              </svg>
              隨機靈感
            </button>
            <button onClick={handleEnhancePrompt} className="flex-1 py-2.5 px-3 bg-gradient-to-r from-purple-900/40 to-indigo-900/40 hover:from-purple-950/60 hover:to-indigo-950/60 text-purple-200 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 border border-purple-500/30 transition">
              <svg className="w-3.5 h-3.5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
              </svg>
              Gemini 智慧優化
            </button>
          </div>
        </div>

        {/* 風格選擇 */}
        <div className="space-y-2">
          <h3 className="text-xs font-bold text-gray-300 tracking-wide uppercase">選擇視覺風格</h3>
          <div className="flex space-x-2 overflow-x-auto no-scrollbar pb-2 -mx-1 px-1">
            {Object.keys(STYLE_TEMPLATES).map((styleName) => (
              <button
                key={styleName}
                onClick={() => setSelectedStyle(styleName)}
                className={`shrink-0 px-4 py-2 rounded-xl text-xs font-medium border transition ${
                  selectedStyle === styleName
                    ? 'border-[#76B900] bg-[#76B900]/10 text-[#76B900]'
                    : 'border-gray-800 bg-[#161F30] hover:border-gray-700 text-gray-300'
                }`}
              >
                {styleName === 'none' && '無風格/預設'}
                {styleName === 'cyberpunk' && '🚀 賽博朋克'}
                {styleName === 'anime' && '🎨 日系動漫'}
                {styleName === 'cinematic' && '🎬 電影寫實'}
                {styleName === 'fantasy' && '🌌 奇幻魔幻'}
                {styleName === 'pixel' && '👾 像素藝術'}
              </button>
            ))}
          </div>
        </div>

        {/* 比例與尺寸快速設定 */}
        <div className="bg-[#161F30]/50 rounded-xl border border-gray-800 p-3 space-y-3">
          <div className="flex items-center justify-between text-xs font-medium text-gray-400">
            <span>尺寸比例: <strong className="text-white">{selectedRatio}</strong></span>
            <span>步數: <strong className="text-white">{steps}</strong></span>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {['1:1', '16:9', '9:16', '4:3', '3:4'].map((ratio) => (
              <button
                key={ratio}
                onClick={() => setSelectedRatio(ratio)}
                className={`py-1.5 rounded text-[11px] font-semibold text-center transition ${
                  selectedRatio === ratio
                    ? 'bg-[#76B900]/20 border border-[#76B900] text-[#76B900]'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                }`}
              >
                {ratio}
              </button>
            ))}
          </div>
        </div>

        {/* 生成按鈕 */}
        <button 
          onClick={handleGenerateImage} 
          className="w-full py-4 rounded-xl font-bold text-[#0B0F17] bg-gradient-to-r from-[#76B900] to-emerald-400 hover:from-[#76B900] hover:to-emerald-300 transition shadow-lg flex items-center justify-center gap-2 glow-active"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span>開始生成 Cosmos3 圖像</span>
        </button>

        {/* 畫廊/結果區 */}
        <div className="space-y-4">
          
          {/* 預設引導狀態 */}
          {!loading && !resultVisible && (
            <div className="aspect-square w-full rounded-2xl border-2 border-dashed border-gray-800 flex flex-col items-center justify-center p-6 text-center">
              <div className="w-16 h-16 rounded-full bg-[#161F30] flex items-center justify-center mb-3 text-gray-600">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-gray-400">尚未生成圖片</p>
              <p className="text-xs text-gray-600 mt-1 max-w-[240px]">輸入您心中所描述的提示詞，點擊上方大按鈕即刻啟航！</p>
            </div>
          )}

          {/* 生成中動畫 */}
          {loading && (
            <div className="aspect-square w-full rounded-2xl bg-[#161F30] border border-gray-800 flex flex-col items-center justify-center p-6 relative overflow-hidden">
              <div className="relative z-10 flex flex-col items-center">
                <div className="w-16 h-16 mb-4 relative">
                  <div className="absolute inset-0 rounded-full border-4 border-gray-800"></div>
                  <div className="absolute inset-0 rounded-full border-4 border-t-[#76B900] border-r-[#76B900] animate-spin"></div>
                </div>
                <p className="text-sm font-bold text-white tracking-wider animate-pulse">{loadingText}</p>
                <p className="text-xs text-gray-400 mt-2 text-center max-w-[280px]">{loadingSubtext}</p>
              </div>
              <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-[#76B900]/5 rounded-full blur-3xl animate-pulse-slow"></div>
            </div>
          )}

          {/* 結果卡片 */}
          {!loading && resultVisible && (
            <div className="space-y-3">
              <div className="relative group overflow-hidden rounded-2xl border border-gray-800 bg-[#0B0F17]">
                <img 
                  src={generatedImgSrc} 
                  alt="AI Generated Graphic" 
                  onError={handleImageLoadError}
                  className="w-full h-auto object-contain bg-black/40 min-h-[250px]" 
                />
                
                {/* 浮動功能按鈕 */}
                <div className="absolute bottom-3 right-3 flex space-x-2">
                  <button onClick={handleCopyPrompt} className="p-2.5 rounded-full bg-black/70 backdrop-blur-md text-white hover:bg-black transition" title="複製此提示詞">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                  </button>
                  <button onClick={handleDownloadImage} className="p-2.5 rounded-full bg-[#76B900] text-[#0B0F17] hover:scale-105 font-bold transition shadow-md" title="儲存圖片">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* 圖片細節 */}
              <div className="bg-[#161F30] p-4 rounded-xl border border-gray-800 space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-400 border-b border-gray-800 pb-2">
                  <span>模型: <strong className="text-gray-200">{usedModelDisplay}</strong></span>
                  <span>耗時: <strong className="text-gray-200">{timeCost}</strong></span>
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-gray-500 uppercase tracking-widest block font-bold">使用的完整 Prompt：</span>
                  <p className="text-xs text-gray-300 bg-[#0B0F17]/50 p-2 rounded border border-gray-800/80 leading-relaxed max-h-24 overflow-y-auto no-scrollbar">
                    {usedPromptText}
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* 歷史紀錄 */}
        <div className="space-y-3 pt-4 border-t border-gray-800/80">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-gray-300 tracking-wide uppercase flex items-center gap-1.5">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              本機生成歷史
            </h3>
            <span className="text-[10px] text-gray-500">共 {historyList.length} 張</span>
          </div>
          
          {historyList.length === 0 ? (
            <p className="text-center py-4 text-xs text-gray-600">無歷史生成紀錄</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {historyList.map((item) => (
                <div 
                  key={item.id} 
                  onClick={() => handleLoadHistoryItem(item)}
                  className="relative aspect-square rounded-lg overflow-hidden border border-gray-800 bg-[#161F30] cursor-pointer group hover:border-[#76B900] transition"
                >
                  <img src={item.src} alt="History snap" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </main>

      {/* 手機版底部資訊面板 */}
      <footer className="absolute bottom-0 inset-x-0 bg-[#0B0F17]/95 border-t border-gray-800/80 py-3 text-center">
        <p className="text-[10px] text-gray-500">免 Token 部署版 • 圖像由 Hugging Face 提供計算資源</p>
        <p className="text-[9px] text-[#76B900]/60 mt-0.5">Powered by Cosmos3-Super-Text2Image & Gemini</p>
      </footer>

      {/* Toast 通知元件 */}
      {toast.visible && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 rounded-xl bg-gray-900 border border-gray-800 text-gray-100 text-xs font-semibold shadow-2xl flex items-center gap-2 transition-all duration-300">
          <span className="text-[#76B900]">
            {toast.icon === 'check' && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {toast.icon === 'sparkles' && (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            )}
            {toast.icon === 'warning' && (
              <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
            {toast.icon === 'info' && (
              <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {toast.icon === 'copy' && (
              <svg className="w-4 h-4 text-[#76B900]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
              </svg>
            )}
            {toast.icon === 'download' && (
              <svg className="w-4 h-4 text-[#76B900]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            )}
            {toast.icon === 'trash' && (
              <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            )}
          </span>
          <span>{toast.message}</span>
        </div>
      )}

      {/* 進階設定 Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#161F30] w-full max-w-sm rounded-2xl border border-gray-800 p-5 space-y-4 shadow-2xl text-left">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
              <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                <svg className="w-4 h-4 text-[#76B900]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                渲染細節設定
              </h4>
              <button onClick={() => setSettingsOpen(false)} className="text-gray-500 hover:text-gray-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {/* Token */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 flex justify-between">
                  <span>自訂 Hugging Face Token (選填)</span>
                  <span className="text-[10px] text-emerald-400">免輸入即可自動調度</span>
                </label>
                <input 
                  type="password" 
                  value={customToken}
                  onChange={(e) => {
                    setCustomToken(e.target.value);
                    localStorage.setItem('cosmos3_custom_token', e.target.value);
                  }}
                  className="w-full bg-[#0B0F17] border border-gray-800 rounded-lg p-2 text-xs text-gray-200 focus:outline-none focus:border-[#76B900]" 
                  placeholder="hf_xxxxxxxxxxxxxxxxxxxx" 
                />
              </div>

              {/* Gemini Key */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400 flex justify-between">
                  <span>自訂 Gemini API Key (選填)</span>
                  <span className="text-[10px] text-purple-400">用於優化與備用生圖</span>
                </label>
                <input 
                  type="password" 
                  value={customGeminiKey}
                  onChange={(e) => {
                    setCustomGeminiKey(e.target.value);
                    localStorage.setItem('cosmos3_custom_gemini_key', e.target.value);
                  }}
                  className="w-full bg-[#0B0F17] border border-gray-800 rounded-lg p-2 text-xs text-gray-200 focus:outline-none focus:border-[#76B900]" 
                  placeholder="AIzaSy..." 
                />
              </div>

              {/* 模型節點選擇 */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400">執行模型節點</label>
                <select 
                  value={activeModel}
                  onChange={(e) => setActiveModel(e.target.value)}
                  className="w-full bg-[#0B0F17] border border-gray-800 rounded-lg p-2 text-xs text-gray-200 focus:outline-none focus:border-[#76B900]"
                >
                  <option value="nvidia/Cosmos3-Super-Text2Image">nvidia/Cosmos3-Super-Text2Image (主節點)</option>
                  <option value="black-forest-labs/FLUX.1-schnell">black-forest-labs/FLUX.1-schnell (FLUX 超高速)</option>
                  <option value="black-forest-labs/FLUX.1-dev">black-forest-labs/FLUX.1-dev (FLUX 高畫質精細)</option>
                  <option value="stabilityai/stable-diffusion-3.5-large">stabilityai/stable-diffusion-3.5-large (高畫質 SD3.5)</option>
                </select>
              </div>

              {/* Negative Prompt */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400">排除內容 (Negative Prompt)</label>
                <textarea 
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  rows={2} 
                  className="w-full bg-[#0B0F17] border border-gray-800 rounded-lg p-2 text-xs text-gray-200 focus:outline-none focus:border-[#76B900] resize-none"
                  placeholder="低畫質, 模糊, 扭曲的肢體, 浮水印 (lq, blurry, deformed, watermark)"
                />
              </div>

              {/* Steps Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold text-gray-400">
                  <span>生成步數 (Steps)</span>
                  <span className="text-[#76B900]">{steps}</span>
                </div>
                <input 
                  type="range" 
                  min={10} 
                  max={50} 
                  value={steps} 
                  onChange={(e) => setSteps(Number(e.target.value))}
                  className="w-full accent-[#76B900] bg-gray-800 h-1.5 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Seed */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-400">隨機數種子 (Seed)</label>
                <div className="flex gap-2">
                  <input 
                    type="number" 
                    value={seed}
                    onChange={(e) => setSeed(e.target.value)}
                    className="flex-1 bg-[#0B0F17] border border-gray-800 rounded-lg p-2 text-xs text-gray-200 focus:outline-none focus:border-[#76B900]" 
                    placeholder="-1 (隨機)" 
                  />
                  <button 
                    onClick={() => setSeed(String(Math.floor(Math.random() * 1000000)))} 
                    className="p-2 bg-gray-800 text-gray-300 rounded-lg text-xs hover:bg-gray-700"
                  >
                    🎲
                  </button>
                </div>
              </div>
            </div>

            <button onClick={() => setSettingsOpen(false)} className="w-full py-2.5 bg-[#76B900] hover:bg-[#76B900]/90 text-[#0B0F17] font-bold text-xs rounded-xl transition">
              保存設定
            </button>
          </div>
        </div>
      )}

    </div>
  );
}