# 🌌 COSMOS v3 - Super Text2Image Web App

一個基於 Python Streamlit 打造的**極致視覺・超級圖像產生器**。本專案將原本的 React 設計完整移植至 Streamlit，保留了精美的深色霓虹科技美學，並集成了強大的多引擎生圖與智慧優化管線。
🚀 Live Demo: https://prompt-image-generator.streamlit.app/
## ✨ 特色功能

1. **🚀 多節點生圖引擎（三層自動備援）**：
   - **主節點 (Hugging Face)**：預設調度 `nvidia/Cosmos3-Super-Text2Image`，並支援手動切換至 `FLUX.1-schnell` 或 `stable-diffusion-3.5-large`。內建備用 Token 智慧輪詢以確保連線率。
   - **高規備份 (Google Imagen 4.0)**：當 Hugging Face 運算資源擁擠時，自動無縫啟用 Google 專用高畫質生圖通道。
   - **終極保底 (Pollinations AI)**：若上述均受阻，將使用公共免 Token 通道，保證任何情況下都能順利出圖。

2. **🤖 Gemini 提示詞智慧優化**：
   - 整合 `gemini-2.5-flash` 模型。使用者輸入簡單描述（如「海灘上的小女孩」），可一鍵優化重構為細節飽滿、光影藝術感十足的專業英文生圖 Prompt。

3. **🎨 豐富的風格與尺寸調整**：
   - 快速切換視覺風格（預設/賽博朋克/日系動漫/電影寫實/奇幻魔幻/像素藝術）。
   - 提供 1:1, 16:9, 9:16, 4:3, 3:4 等常用比例與解析度設定。
   - 支援調整排除內容 (Negative Prompt)、生成步數 (Steps) 與隨機數種子 (Seed)。

4. **💾 本機歷史與實用工具**：
   - 自動保留當次瀏覽器的生成歷史紀錄（最多 9 筆），隨時一鍵重新載入。
   - 支援一鍵複製完整 Prompt 與下載高解析度圖片。

---

## 🛠️ 本地執行指南

### 1. 準備環境
請確保系統已安裝 Python 3.8+ 版本。

### 2. 安裝依賴套件
在專案根目錄執行以下指令安裝所需套件：
```bash
pip install -r requirements.txt
```

### 3. 啟動應用程式
```bash
streamlit run app.py
```
啟動後，瀏覽器會自動開啟 `http://localhost:8501`。

---

## 🚀 部署至 streamlit.io (Streamlit Cloud)

本專案已完成優化，支援一鍵部署至 Streamlit 雲端：

1. 將本專案推送至您的 GitHub。
2. 前往 [Streamlit Community Cloud](https://share.streamlit.io/) 並登入您的 GitHub。
3. 點選 **New app**，選擇此儲存庫與主檔案 `app.py`，點擊 **Deploy**。
4. **設定秘密金鑰 (Secrets)**：
   - 在部署完成的頁面右下角，進入 **Settings > Secrets**。
   - 新增您的 Gemini API 金鑰（用於 Prompt 優化與 Imagen 備份通道）：
     ```toml
     GEMINI_API_KEY = "您的_gemini_api_金鑰"
     ```
   - 點擊 **Save** 即可！
