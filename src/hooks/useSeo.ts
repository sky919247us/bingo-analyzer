import { useEffect } from 'react';

/**
 * 動態更新頁庫 SEO 資訊的 Hook (SPA 專用)
 * @param title 頁面標題
 * @param description 頁面描述
 * @param keywords 頁面關鍵字
 */
export function useSeo({ title, description, keywords }: { title?: string, description?: string, keywords?: string }) {
    useEffect(() => {
        // 更新 Title
        if (title) {
            const fullTitle = `${title} | 刮刮研究室 BINGO BINGO`;
            document.title = fullTitle;
            const ogTitle = document.querySelector('meta[property="og:title"]');
            if (ogTitle) ogTitle.setAttribute('content', fullTitle);
        }

        // 更新 Description
        if (description) {
            let metaDesc = document.querySelector('meta[name="description"]');
            if (!metaDesc) {
                metaDesc = document.createElement('meta');
                metaDesc.setAttribute('name', 'description');
                document.head.appendChild(metaDesc);
            }
            metaDesc.setAttribute('content', description);
            
            const ogDesc = document.querySelector('meta[property="og:description"]');
            if (ogDesc) ogDesc.setAttribute('content', description);
        }

        // 更新 Keywords
        if (keywords) {
            let metaKeywords = document.querySelector('meta[name="keywords"]');
            if (!metaKeywords) {
                metaKeywords = document.createElement('meta');
                metaKeywords.setAttribute('name', 'keywords');
                document.head.appendChild(metaKeywords);
            }
            metaKeywords.setAttribute('content', keywords);
        }
    }, [title, description, keywords]);
}
