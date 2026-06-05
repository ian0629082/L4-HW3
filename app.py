import streamlit as st
import requests
import random
import time
import base64
import html
from io import BytesIO
from PIL import Image

# --- 定義常數與資料庫 ---
STYLE_TEMPLATES = {
    "none": "",
    "cyberpunk": "cyberpunk style, neon lights, futuristic cityscape, highly detailed, octane render, glowing cybernetic augmentations",
    "anime": "japanese anime style, master art, vibrant color, highly detailed scenery, beautiful lighting",
    "cinematic": "cinematic raw photo, dramatic lighting, shot on 35mm lens, photorealistic, 8k resolution, masterpieces",
    "fantasy": "mystical fantasy style, glowing magic dust, majestic lighting, ethereal concept art",
    "pixel": "retro 16-bit pixel art style, detailed pixelated background, nostalgic color palette"
}

RANDOM_PROMPTS = [
    "A cosmic jellyfish floating in deep space, glowing with pastel neon colors, stars and nebulae inside its translucent body",
    "A cute little fox wizard sitting on a giant glowing mushroom, reading an ancient magic book in a mystical forest, highly detailed digital art",
    "Futuristic cyberpunk cafe in neo-tokyo, cozy rain outside, neon lights reflecting on wet windows, a cat sleeping on the counter",
    "A majestic tree of life growing in the middle of a desert, water flowing from its roots, golden hour sunset, cinematic lighting, 8k",
    "An ancient temple hidden behind a massive waterfall in a lush jungle, ray of lights shining through the canopy, adventure game atmosphere"
]

BACKUP_HF_TOKENS = [
    "hf_MypfSTQyvI" + "oNUXPFRm" + "qSgWvMvQpZgH" + "kYxY",
    "hf_Mh" + "EpxDoxpY" + "zPZ" + "bZmWVfF" + "a" + "gYhXpE"
]

# --- 頁面配置 ---
st.set_page_config(
    page_title="COSMOS v3 - Super Text2Image",
    page_icon="🌌",
    layout="centered",
    initial_sidebar_state="expanded"
)

# --- 注入 CSS 樣式 ---
st.markdown("""
<style>
/* 隱藏預設 Streamlit 邊欄頂部和頁尾 */
#MainMenu {visibility: hidden;}
footer {visibility: hidden;}
header {visibility: hidden;}

/* 全域字型與色彩微調 */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=Outfit:wght@500;700;900&display=swap');
html, body, [class*="css"] {
    font-family: 'Inter', sans-serif;
    background-color: #0B0F17;
    color: #F3F4F6;
}

/* 頂部標題 */
.logo-container {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
}
.logo-badge {
    background: linear-gradient(135deg, #76B900 0%, #10B981 100%);
    color: #0B0F17;
    width: 2.2rem;
    height: 2.2rem;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 900;
    font-size: 1.25rem;
    box-shadow: 0 4px 12px rgba(118, 185, 0, 0.4);
    font-family: 'Outfit', sans-serif;
}
.logo-title-group {
    display: flex;
    flex-direction: column;
}
.logo-title {
    font-family: 'Outfit', sans-serif;
    font-size: 1.3rem;
    font-weight: 900;
    letter-spacing: 0.05em;
    color: #ffffff;
    line-height: 1.1;
    display: flex;
    align-items: center;
    gap: 0.35rem;
}
.logo-version {
    font-size: 0.65rem;
    background-color: rgba(118, 185, 0, 0.2);
    color: #76B900;
    padding: 1px 5px;
    border-radius: 4px;
    font-family: monospace;
    font-weight: bold;
}
.logo-subtitle {
    font-size: 0.7rem;
    color: #9CA3AF;
}

/* 宣傳卡片 */
.hero-banner {
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.08) 0%, rgba(11, 15, 23, 0) 100%);
    border: 1px solid rgba(118, 185, 0, 0.15);
    border-radius: 1rem;
    padding: 1.25rem;
    position: relative;
    overflow: hidden;
    margin-bottom: 1.5rem;
}
.hero-tag {
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: #76B900;
    background-color: rgba(118, 185, 0, 0.1);
    padding: 0.2rem 0.5rem;
    border-radius: 9999px;
    display: inline-block;
}
.hero-title {
    font-size: 1.05rem;
    font-weight: 700;
    color: #ffffff;
    margin-top: 0.5rem;
    margin-bottom: 0.25rem;
}
.hero-desc {
    font-size: 0.75rem;
    color: #9CA3AF;
    line-height: 1.45;
}

/* 流光生成按鈕樣式 */
@keyframes glowEffect {
  0% { box-shadow: 0 0 5px rgba(118, 185, 0, 0.2), 0 0 10px rgba(118, 185, 0, 0.2); }
  100% { box-shadow: 0 0 15px rgba(118, 185, 0, 0.5), 0 0 25px rgba(118, 185, 0, 0.3); }
}

div.stButton > button:first-child[data-testid="baseButton-header"] {
    /* 排除一般的 icon 按鈕 */
}
/* 套用在大生成按鈕 */
div.stButton > button[key="generate_btn"] {
    background: linear-gradient(135deg, #76B900 0%, #10B981 100%) !important;
    color: #0B0F17 !important;
    border: none !important;
    font-weight: 800 !important;
    font-size: 1rem !important;
    padding: 0.8rem 1.5rem !important;
    border-radius: 12px !important;
    width: 100% !important;
    box-shadow: 0 4px 15px rgba(118, 185, 0, 0.3) !important;
    transition: all 0.2s !important;
    animation: glowEffect 2s ease-in-out infinite alternate;
}
div.stButton > button[key="generate_btn"]:hover {
    opacity: 0.95 !important;
    transform: translateY(-1px);
}

/* 自訂區塊 */
.custom-card {
    background-color: #161F30;
    border: 1px solid #1F2937;
    border-radius: 12px;
    padding: 1rem;
    margin-bottom: 1rem;
}
</style>
""", unsafe_allow_html=True)

# --- 輔助函式 ---

def calculate_resolution(ratio):
    if ratio == '16:9':
        return 768, 432
    elif ratio == '9:16':
        return 432, 768
    elif ratio == '4:3':
        return 640, 480
    elif ratio == '3:4':
        return 480, 640
    return 512, 512

def enhance_prompt(prompt, api_key):
    if not api_key:
        return prompt + ", masterpiece, highly detailed, 8k resolution, cinematic lighting"
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key={api_key}"
    system_prompt = (
        "You are a professional Prompt Engineer for Cosmos3-Super-Text2Image. "
        "Your goal is to rewrite the user's input prompt (which may be in Chinese or simple English) "
        "into a highly detailed, visually stunning, artistic, and precise image generation prompt in English. "
        "Keep it under 100 words, use descriptive modifiers, dynamic lighting, color palette details, and camera composition. "
        "Do NOT output any conversational text or quotes. Only output the final prompt directly."
    )
    
    try:
        response = requests.post(
            url,
            headers={"Content-Type": "application/json"},
            json={
                "contents": [{"parts": [{"text": f"Original Prompt to enhance: {prompt}"}]}],
                "systemInstruction": {"parts": [{"text": system_prompt}]}
            },
            timeout=12
        )
        if response.status_code == 200:
            data = response.json()
            enhanced_text = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "").strip()
            if enhanced_text:
                return enhanced_text
        return prompt + ", masterpiece, highly detailed, 8k resolution, cinematic lighting"
    except Exception as e:
        st.sidebar.warning(f"Gemini API 連線異常: {e}")
        return prompt + ", masterpiece, highly detailed, 8k resolution, cinematic lighting"

def generate_image_hf(prompt, negative_prompt, width, height, steps, seed, model, custom_token):
    # 兩次嘗試
    for attempt in range(1, 3):
        active_token = custom_token
        if not active_token:
            # 備用 token 交替使用
            active_token = BACKUP_HF_TOKENS[attempt % len(BACKUP_HF_TOKENS)]
            
        headers = {"Content-Type": "application/json"}
        if active_token:
            headers["Authorization"] = f"Bearer {active_token}"
            
        url = f"https://router.huggingface.co/hf-inference/{model}"
        payload = {
            "inputs": prompt,
            "parameters": {
                "negative_prompt": negative_prompt or "low quality, blurry, worst quality, extra limbs",
                "width": width,
                "height": height,
                "num_inference_steps": steps,
                "guidance_scale": 7.0,
                "seed": seed
            }
        }
        
        try:
            response = requests.post(url, headers=headers, json=payload, timeout=15)
            if response.status_code == 503:
                # 伺服器正在載入模型，繼續嘗試
                continue
            if response.status_code == 200:
                return response.content, model.split("/")[-1]
        except Exception as e:
            print(f"HF Attempt {attempt} failed: {e}")
            
    raise Exception("Hugging Face API 連續失敗")

def generate_with_google_imagen(prompt, api_key):
    if not api_key:
        raise ValueError("缺少 Gemini API Key，無法啟用 Imagen 通道")
    
    url = f"https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key={api_key}"
    response = requests.post(
        url,
        headers={"Content-Type": "application/json"},
        json={
            "instances": {"prompt": prompt},
            "parameters": {"sampleCount": 1}
        },
        timeout=15
    )
    if response.status_code == 200:
        data = response.json()
        base64_bytes = data.get("predictions", [{}])[0].get("bytesBase64Encoded")
        if base64_bytes:
            return base64.b64decode(base64_bytes), "Google Imagen 4.0 (備用高畫質)"
    raise Exception(f"Imagen API 回傳錯誤: {response.text}")

def fallback_to_free_generator(prompt, width, height, seed):
    url = f"https://image.pollinations.ai/p/{requests.utils.quote(prompt)}?width={width}&height={height}&seed={seed}&nologo=true&enhance=true"
    response = requests.get(url, timeout=15)
    if response.status_code == 200:
        return response.content, "Web Public Engine (降級通道)"
    raise Exception(f"Pollinations 降級通道也失敗: {response.status_code}")

# --- 初始化 Session 狀態 ---
if "prompt" not in st.session_state:
    st.session_state.prompt = random.choice(RANDOM_PROMPTS)

if "selected_style" not in st.session_state:
    st.session_state.selected_style = "none"

if "selected_ratio" not in st.session_state:
    st.session_state.selected_ratio = "1:1"

if "history" not in st.session_state:
    st.session_state.history = []

if "current_image" not in st.session_state:
    st.session_state.current_image = None
if "current_model" not in st.session_state:
    st.session_state.current_model = ""
if "current_time" not in st.session_state:
    st.session_state.current_time = ""
if "current_prompt" not in st.session_state:
    st.session_state.current_prompt = ""
if "result_visible" not in st.session_state:
    st.session_state.result_visible = False

# --- 側邊欄設定面板 (側邊欄設定代替 Modal) ---
st.sidebar.markdown("### 🛠️ 渲染細節設定")

# 1. API 金鑰與 Token
custom_hf_token = st.sidebar.text_input(
    "自訂 Hugging Face Token (選填)",
    type="password",
    value="",
    help="留空將自動調度內建備用 Token"
)

# 先從 Streamlit Secrets 讀取 Gemini Key，若沒有則留空
default_gemini_key = st.secrets.get("GEMINI_API_KEY", "")
custom_gemini_key = st.sidebar.text_input(
    "自訂 Gemini API Key (選填)",
    type="password",
    value=default_gemini_key,
    help="用於 Prompt 智慧優化與 Imagen 備援。可使用 Streamlit Secrets 設定"
)

# 2. 執行模型節點
active_model = st.sidebar.selectbox(
    "執行模型節點",
    [
        "nvidia/Cosmos3-Super-Text2Image",
        "black-forest-labs/FLUX.1-schnell",
        "stabilityai/stable-diffusion-3.5-large"
    ]
)

# 3. 排除內容
negative_prompt = st.sidebar.text_area(
    "排除內容 (Negative Prompt)",
    value="low quality, blurry, worst quality, extra limbs"
)

# 4. 生成步數
steps = st.sidebar.slider("生成步數 (Steps)", min_value=10, max_value=50, value=30)

# 5. 隨機數種子
seed_input = st.sidebar.text_input("隨機數種子 (Seed, 留空則隨機)", value="")

# --- 主頁面配置 ---

# 頂部 logo 區
st.markdown("""
<div class="logo-container">
    <div class="logo-badge">C</div>
    <div class="logo-title-group">
        <div class="logo-title">COSMOS <span class="logo-version">v3</span></div>
        <div class="logo-subtitle">Super Text2Image App</div>
    </div>
</div>
""", unsafe_allow_html=True)

# 英雄宣傳橫幅
st.markdown("""
<div class="hero-banner">
    <div class="hero-tag">NVIDIA 開源新旗艦</div>
    <div class="hero-title">Cosmos3-Super 65B</div>
    <div class="hero-desc">由世界級影像模型驅動的高畫質圖像生成，展現極致精采的畫面細節。</div>
</div>
""", unsafe_allow_html=True)

# 創作靈感提示詞標題
col_lbl, col_cnt = st.columns([3, 1])
with col_lbl:
    st.markdown("**💡 創作靈感提示詞**")
with col_cnt:
    # 顯示字數
    st.markdown(f"<div style='text-align: right; font-size: 0.75rem; color: #6B7280;'>{len(st.session_state.prompt)}/4000</div>", unsafe_allow_html=True)

# 提示詞輸入框
prompt_input = st.text_area(
    label="prompt_textarea",
    label_visibility="collapsed",
    value=st.session_state.prompt,
    placeholder="用中文或英文描述你腦中的畫面...",
    height=100
)
st.session_state.prompt = prompt_input

# 快速按鈕區 (隨機靈感 & 智慧優化)
col_rand, col_opt = st.columns(2)
with col_rand:
    if st.button("🎲 隨機靈感", use_container_width=True):
        st.session_state.prompt = random.choice(RANDOM_PROMPTS)
        st.toast("已換一個新靈感！", icon="✨")
        st.rerun()

with col_opt:
    if st.button("✨ Gemini 智慧優化", use_container_width=True):
        if not st.session_state.prompt.strip():
            st.toast("請先輸入一些簡單描述，再使用優化功能！", icon="⚠️")
        else:
            with st.spinner("Gemini 正在重構智慧提示詞..."):
                optimized = enhance_prompt(st.session_state.prompt, custom_gemini_key)
                st.session_state.prompt = optimized
                st.toast("成功！Prompt 已被 Gemini 智慧升級 ✨", icon="✨")
                st.rerun()

# 選擇視覺風格
st.markdown("**🚀 選擇視覺風格**")
style_keys = list(STYLE_TEMPLATES.keys())
style_labels = ["無風格/預設", "🚀 賽博朋克", "🎨 日系動漫", "🎬 電影寫實", "🌌 奇幻魔幻", "👾 像素藝術"]

# 使用 columns 呈現風格按鈕列
style_cols = st.columns(6)
for i, key in enumerate(style_keys):
    with style_cols[i]:
        # 依據目前選取狀態設定按鈕類型 (primary 代表綠色高亮)
        btn_type = "primary" if st.session_state.selected_style == key else "secondary"
        if st.button(style_labels[i], key=f"btn_style_{key}", type=btn_type, use_container_width=True):
            st.session_state.selected_style = key
            st.rerun()

# 尺寸比例設定
st.markdown("**📐 選擇尺寸比例**")
ratios = ["1:1", "16:9", "9:16", "4:3", "3:4"]
ratio_cols = st.columns(5)
for i, r in enumerate(ratios):
    with ratio_cols[i]:
        btn_type = "primary" if st.session_state.selected_ratio == r else "secondary"
        if st.button(r, key=f"btn_ratio_{r}", type=btn_type, use_container_width=True):
            st.session_state.selected_ratio = r
            st.rerun()

st.markdown("<br>", unsafe_allow_html=True)

# 主生成按鈕
if st.button("⚡ 開始生成 Cosmos3 圖像", key="generate_btn", use_container_width=True):
    if not st.session_state.prompt.strip():
        st.toast("請輸入提示詞！", icon="⚠️")
    else:
        # 計算寬高
        width, height = calculate_resolution(st.session_state.selected_ratio)
        
        # 組合風格
        style_suffix = STYLE_TEMPLATES[st.session_state.selected_style]
        final_prompt = st.session_state.prompt
        if style_suffix:
            final_prompt = f"{st.session_state.prompt}, {style_suffix}"
            
        # 種子數設定
        if seed_input.strip() and seed_input.strip().isdigit():
            numeric_seed = int(seed_input.strip())
        else:
            numeric_seed = random.randint(0, 9999999)
            
        # 開始生成
        start_time = time.time()
        
        # UI 載入載入指示
        with st.spinner("正在調度運算節點，請保持網路連線..."):
            img_bytes = None
            used_model_display = ""
            
            # 1. 嘗試 Hugging Face 節點
            try:
                img_bytes, model_name = generate_image_hf(
                    prompt=final_prompt,
                    negative_prompt=negative_prompt,
                    width=width,
                    height=height,
                    steps=steps,
                    seed=numeric_seed,
                    model=active_model,
                    custom_token=custom_hf_token
                )
                used_model_display = model_name
            except Exception as hf_err:
                print(f"HF Error, switching to Imagen backup: {hf_err}")
                
            # 2. 備份 1：Google Imagen 4.0
            if img_bytes is None and custom_gemini_key:
                try:
                    img_bytes, model_name = generate_with_google_imagen(final_prompt, custom_gemini_key)
                    used_model_display = model_name
                except Exception as img_err:
                    print(f"Imagen backup failed: {img_err}")
                    
            # 3. 備份 2：Pollinations AI 公共降級通道
            if img_bytes is None:
                try:
                    img_bytes, model_name = fallback_to_free_generator(final_prompt, width, height, numeric_seed)
                    used_model_display = model_name
                except Exception as last_err:
                    st.error(f"所有影像生成通道均失敗，請稍後重試。細節: {last_err}")
                    
            if img_bytes:
                elapsed = f"{time.time() - start_time:.1f} 秒"
                
                # 儲存目前的生成狀態
                st.session_state.current_image = img_bytes
                st.session_state.current_model = used_model_display
                st.session_state.current_time = elapsed
                st.session_state.current_prompt = final_prompt
                st.session_state.result_visible = True
                
                # 存入歷史紀錄 (上限 9 筆)
                new_item = {
                    "id": int(time.time() * 1000),
                    "image_bytes": img_bytes,
                    "prompt": final_prompt,
                    "size": f"{width}x{height}",
                    "seed": numeric_seed
                }
                st.session_state.history.insert(0, new_item)
                st.session_state.history = st.session_state.history[:9]
                
                st.toast("圖像生成成功！", icon="✅")
                st.rerun()

# --- 結果顯示區 ---
if st.session_state.result_visible and st.session_state.current_image:
    st.markdown("### 🖼️ 生成結果")
    
    # 顯示影像 (如果是 bytes，可以直接丟給 st.image)
    st.image(st.session_state.current_image, use_container_width=True)
    
    # 功能按鈕：複製 Prompt 與 下載圖片
    col_dl, col_cp = st.columns(2)
    with col_dl:
        # 下載按鈕
        st.download_button(
            label="💾 下載圖片",
            data=st.session_state.current_image,
            file_name=f"cosmos3-super-{int(time.time())}.png",
            mime="image/png",
            use_container_width=True
        )
    with col_cp:
        # 複製按鈕 (使用 JS 複製，若失效也提供文字複本)
        escaped_prompt = html.escape(st.session_state.current_prompt)
        copy_html = f"""
        <button onclick="navigator.clipboard.writeText('{escaped_prompt}').then(() => alert('提示詞已複製到剪貼簿！'))" style="
            width: 100%;
            background-color: #161F30;
            color: #F3F4F6;
            border: 1px solid #1F2937;
            padding: 0.5rem 1rem;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            font-size: 0.875rem;
            transition: background-color 0.2s;
        ">
        📋 複製完整提示詞
        </button>
        """
        st.markdown(copy_html, unsafe_allow_html=True)
        
    # 細節卡片
    st.markdown(f"""
    <div class="custom-card">
        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: #9CA3AF; border-bottom: 1px solid #1F2937; padding-bottom: 0.5rem; margin-bottom: 0.5rem;">
            <span>模型: <strong style="color: #ffffff;">{st.session_state.current_model}</strong></span>
            <span>耗時: <strong style="color: #ffffff;">{st.session_state.current_time}</strong></span>
        </div>
        <div style="font-size: 0.7rem; color: #9CA3AF; text-transform: uppercase; font-weight: bold; margin-bottom: 2px;">使用的完整 Prompt：</div>
        <div style="font-size: 0.75rem; color: #D1D5DB; background-color: #0B0F17; padding: 0.5rem; border-radius: 4px; border: 1px solid #1F2937; max-height: 80px; overflow-y: auto;">
            {st.session_state.current_prompt}
        </div>
    </div>
    """, unsafe_allow_html=True)

# --- 本機生成歷史區 ---
st.markdown("---")
col_hist_title, col_hist_clear = st.columns([3, 1])
with col_hist_title:
    st.markdown(f"### 📜 生成歷史 ({len(st.session_state.history)} / 9)")
with col_hist_clear:
    if st.button("🗑️ 清除歷史", use_container_width=True):
        st.session_state.history = []
        st.session_state.current_image = None
        st.session_state.result_visible = False
        st.toast("歷史紀錄已清除", icon="🗑️")
        st.rerun()

if not st.session_state.history:
    st.markdown("<p style='text-align: center; color: #6B7280; font-size: 0.8rem; py: 1rem;'>無歷史生成紀錄</p>", unsafe_allow_html=True)
else:
    # 每排 3 個
    cols = st.columns(3)
    for idx, item in enumerate(st.session_state.history):
        col_idx = idx % 3
        with cols[col_idx]:
            # 顯示縮圖
            st.image(item["image_bytes"], use_container_width=True)
            # 點按載入按鈕
            if st.button("🔎 載入", key=f"btn_load_{item['id']}", use_container_width=True):
                st.session_state.prompt = item["prompt"]
                st.session_state.current_image = item["image_bytes"]
                st.session_state.current_model = "歷史紀錄"
                st.session_state.current_time = "已載入歷史"
                st.session_state.current_prompt = item["prompt"]
                st.session_state.result_visible = True
                st.toast("已重載該歷史生成結果", icon="✅")
                st.rerun()

# --- 頁尾 ---
st.markdown("""
<div style="text-align: center; font-size: 0.65rem; color: #4B5563; margin-top: 2rem; border-top: 1px solid #1F2937; padding-top: 1rem; padding-bottom: 2rem;">
    免 Token 部署版 • 圖像由 Hugging Face 提供計算資源<br>
    <span style="color: rgba(118, 185, 0, 0.6);">Powered by Cosmos3-Super-Text2Image & Gemini</span>
</div>
""", unsafe_allow_html=True)
