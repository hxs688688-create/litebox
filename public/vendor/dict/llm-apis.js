/* LiteBox v5 · vendor/dict/llm-apis.js — 大模型 API 速查数据（Step 18 第一批 5 家；Step 19 · 五 扩到 15 家）
 *
 * 结构：window.LB.dict.llmApis = { 厂商key: { vendor, vendorUrl, models: [...] } }
 * 模型字段：id（API 模型名）/ context（上下文窗口，tokens）/ maxOutput（单次最大输出，tokens）
 *   / inputPrice / outputPrice（美元 / 1M tokens 刊例快照）/ vision（视觉输入）
 *   / tools（函数调用）/ reasoning（推理链）/ cache（缓存命中输入价，$/1M，无则省略）
 *   / accessFromCN：'direct' 国内可直连 | 'proxy' 需要代理 | 'partial' 部分地区/ISP 可直连
 * 价格为公开刊例的静态快照，仅作速查参考，实时价以各厂商定价页为准。 */
(function () {
  'use strict';
  window.LB = window.LB || {};
  window.LB.dict = window.LB.dict || {};
  window.LB.dict.llmApis = {
    openai: {
      vendor: 'OpenAI',
      vendorUrl: 'https://openai.com/api/pricing/',
      models: [
        { id: 'gpt-4o', context: 128000, maxOutput: 16384, inputPrice: 2.50, outputPrice: 10.00, vision: true, tools: true, reasoning: false, cache: 1.25, accessFromCN: 'proxy' },
        { id: 'gpt-4o-mini', context: 128000, maxOutput: 16384, inputPrice: 0.15, outputPrice: 0.60, vision: true, tools: true, reasoning: false, cache: 0.075, accessFromCN: 'proxy' },
        { id: 'gpt-4.1', context: 1047576, maxOutput: 32768, inputPrice: 2.00, outputPrice: 8.00, vision: true, tools: true, reasoning: false, cache: 0.50, accessFromCN: 'proxy' },
        { id: 'gpt-4.1-mini', context: 1047576, maxOutput: 32768, inputPrice: 0.40, outputPrice: 1.60, vision: true, tools: true, reasoning: false, cache: 0.10, accessFromCN: 'proxy' },
        { id: 'o3', context: 200000, maxOutput: 100000, inputPrice: 2.00, outputPrice: 8.00, vision: true, tools: true, reasoning: true, cache: 0.50, accessFromCN: 'proxy' },
        { id: 'o4-mini', context: 200000, maxOutput: 100000, inputPrice: 1.10, outputPrice: 4.40, vision: true, tools: true, reasoning: true, cache: 0.275, accessFromCN: 'proxy' }
      ]
    },
    anthropic: {
      vendor: 'Anthropic',
      vendorUrl: 'https://www.anthropic.com/pricing',
      models: [
        { id: 'claude-opus-4', context: 200000, maxOutput: 32000, inputPrice: 15.00, outputPrice: 75.00, vision: true, tools: true, reasoning: true, cache: 1.50, accessFromCN: 'proxy' },
        { id: 'claude-sonnet-4', context: 200000, maxOutput: 64000, inputPrice: 3.00, outputPrice: 15.00, vision: true, tools: true, reasoning: true, cache: 0.30, accessFromCN: 'proxy' },
        { id: 'claude-haiku-4-5', context: 200000, maxOutput: 64000, inputPrice: 1.00, outputPrice: 5.00, vision: true, tools: true, reasoning: true, cache: 0.10, accessFromCN: 'proxy' },
        { id: 'claude-3-7-sonnet', context: 200000, maxOutput: 64000, inputPrice: 3.00, outputPrice: 15.00, vision: true, tools: true, reasoning: true, accessFromCN: 'proxy' },
        { id: 'claude-3-5-sonnet', context: 200000, maxOutput: 8192, inputPrice: 3.00, outputPrice: 15.00, vision: true, tools: true, reasoning: false, cache: 0.30, accessFromCN: 'proxy' },
        { id: 'claude-3-5-haiku', context: 200000, maxOutput: 8192, inputPrice: 0.80, outputPrice: 4.00, vision: false, tools: true, reasoning: false, cache: 0.08, accessFromCN: 'proxy' }
      ]
    },
    google: {
      vendor: 'Google (Gemini)',
      vendorUrl: 'https://ai.google.dev/pricing',
      models: [
        { id: 'gemini-2.5-pro', context: 1048576, maxOutput: 65536, inputPrice: 1.25, outputPrice: 10.00, vision: true, tools: true, reasoning: true, accessFromCN: 'proxy' },
        { id: 'gemini-2.5-flash', context: 1048576, maxOutput: 65536, inputPrice: 0.30, outputPrice: 2.50, vision: true, tools: true, reasoning: true, cache: 0.075, accessFromCN: 'proxy' },
        { id: 'gemini-2.5-flash-lite', context: 1048576, maxOutput: 65536, inputPrice: 0.10, outputPrice: 0.40, vision: true, tools: true, reasoning: false, accessFromCN: 'proxy' },
        { id: 'gemini-2.0-flash', context: 1048576, maxOutput: 8192, inputPrice: 0.10, outputPrice: 0.40, vision: true, tools: true, reasoning: false, accessFromCN: 'proxy' },
        { id: 'gemini-2.0-flash-lite', context: 1048576, maxOutput: 8192, inputPrice: 0.075, outputPrice: 0.30, vision: true, tools: false, reasoning: false, accessFromCN: 'proxy' },
        { id: 'gemini-1.5-pro', context: 2097152, maxOutput: 8192, inputPrice: 1.25, outputPrice: 5.00, vision: true, tools: true, reasoning: false, accessFromCN: 'proxy' }
      ]
    },
    meta: {
      vendor: 'Meta (Llama)',
      vendorUrl: 'https://www.llama.com/',
      models: [
        { id: 'llama-4-maverick', context: 1048576, maxOutput: 8192, inputPrice: 0.22, outputPrice: 0.88, vision: true, tools: true, reasoning: false, accessFromCN: 'proxy' },
        { id: 'llama-4-scout', context: 1048576, maxOutput: 8192, inputPrice: 0.11, outputPrice: 0.34, vision: true, tools: true, reasoning: false, accessFromCN: 'proxy' },
        { id: 'llama-3.3-70b-instruct', context: 131072, maxOutput: 8192, inputPrice: 0.12, outputPrice: 0.30, vision: false, tools: true, reasoning: false, accessFromCN: 'proxy' },
        { id: 'llama-3.1-405b-instruct', context: 131072, maxOutput: 8192, inputPrice: 0.90, outputPrice: 0.90, vision: false, tools: true, reasoning: false, accessFromCN: 'proxy' },
        { id: 'llama-3.2-11b-vision', context: 131072, maxOutput: 8192, inputPrice: 0.05, outputPrice: 0.05, vision: true, tools: false, reasoning: false, accessFromCN: 'proxy' }
      ]
    },
    mistral: {
      vendor: 'Mistral AI',
      vendorUrl: 'https://mistral.ai/pricing',
      models: [
        { id: 'mistral-large-latest', context: 131072, maxOutput: 8192, inputPrice: 2.00, outputPrice: 6.00, vision: false, tools: true, reasoning: false, accessFromCN: 'proxy' },
        { id: 'mistral-medium-latest', context: 131072, maxOutput: 8192, inputPrice: 0.40, outputPrice: 2.00, vision: false, tools: true, reasoning: false, accessFromCN: 'proxy' },
        { id: 'mistral-small-latest', context: 131072, maxOutput: 8192, inputPrice: 0.10, outputPrice: 0.30, vision: false, tools: true, reasoning: false, accessFromCN: 'proxy' },
        { id: 'magistral-medium-latest', context: 40000, maxOutput: 8192, inputPrice: 2.00, outputPrice: 5.00, vision: false, tools: false, reasoning: true, accessFromCN: 'proxy' },
        { id: 'pixtral-large-latest', context: 131072, maxOutput: 8192, inputPrice: 2.00, outputPrice: 6.00, vision: true, tools: true, reasoning: false, accessFromCN: 'proxy' }
      ]
    },
    xai: {
      vendor: 'xAI (Grok)',
      vendorUrl: 'https://docs.x.ai/docs/models',
      models: [
        { id: 'grok-4', context: 256000, maxOutput: 32768, inputPrice: 3.00, outputPrice: 15.00, vision: false, tools: true, reasoning: true, accessFromCN: 'proxy' },
        { id: 'grok-3', context: 131072, maxOutput: 32768, inputPrice: 3.00, outputPrice: 15.00, vision: false, tools: true, reasoning: false, accessFromCN: 'proxy' },
        { id: 'grok-3-mini', context: 131072, maxOutput: 32768, inputPrice: 0.30, outputPrice: 0.50, vision: false, tools: true, reasoning: true, accessFromCN: 'proxy' },
        { id: 'grok-2-vision-1212', context: 32768, maxOutput: 8192, inputPrice: 2.00, outputPrice: 10.00, vision: true, tools: false, reasoning: false, accessFromCN: 'proxy' }
      ]
    },
    deepseek: {
      vendor: 'DeepSeek',
      vendorUrl: 'https://api-docs.deepseek.com/quick_start/pricing',
      models: [
        { id: 'deepseek-chat', context: 128000, maxOutput: 8192, inputPrice: 0.28, outputPrice: 0.42, vision: false, tools: true, reasoning: false, cache: 0.028, accessFromCN: 'direct' },
        { id: 'deepseek-reasoner', context: 128000, maxOutput: 65536, inputPrice: 0.28, outputPrice: 0.42, vision: false, tools: false, reasoning: true, cache: 0.028, accessFromCN: 'direct' },
        { id: 'deepseek-r1-0528', context: 128000, maxOutput: 32768, inputPrice: 0.55, outputPrice: 2.19, vision: false, tools: false, reasoning: true, accessFromCN: 'direct' },
        { id: 'deepseek-v3-0324', context: 128000, maxOutput: 8192, inputPrice: 0.27, outputPrice: 1.10, vision: false, tools: true, reasoning: false, accessFromCN: 'direct' },
        { id: 'deepseek-coder', context: 128000, maxOutput: 8192, inputPrice: 0.14, outputPrice: 0.28, vision: false, tools: true, reasoning: false, accessFromCN: 'direct' }
      ]
    },
    moonshot: {
      vendor: '月之暗面 (Kimi)',
      vendorUrl: 'https://platform.moonshot.cn/pricing',
      models: [
        { id: 'moonshot-v1-8k', context: 8192, maxOutput: 4096, inputPrice: 1.70, outputPrice: 1.70, vision: false, tools: true, reasoning: false, accessFromCN: 'direct' },
        { id: 'moonshot-v1-32k', context: 32768, maxOutput: 8192, inputPrice: 3.30, outputPrice: 3.30, vision: false, tools: true, reasoning: false, accessFromCN: 'direct' },
        { id: 'moonshot-v1-128k', context: 131072, maxOutput: 16384, inputPrice: 8.30, outputPrice: 8.30, vision: false, tools: true, reasoning: false, accessFromCN: 'direct' },
        { id: 'kimi-k2-0711-preview', context: 131072, maxOutput: 8192, inputPrice: 0.15, outputPrice: 2.50, vision: false, tools: true, reasoning: false, accessFromCN: 'direct' },
        { id: 'kimi-k2-0905-preview', context: 262144, maxOutput: 16384, inputPrice: 0.42, outputPrice: 1.30, vision: false, tools: true, reasoning: false, accessFromCN: 'direct' },
        { id: 'kimi-latest', context: 131072, maxOutput: 8192, inputPrice: 8.30, outputPrice: 8.30, vision: true, tools: true, reasoning: false, accessFromCN: 'direct' },
        { id: 'moonshot-v1-8k-vision-preview', context: 8192, maxOutput: 4096, inputPrice: 1.70, outputPrice: 1.70, vision: true, tools: false, reasoning: false, accessFromCN: 'direct' }
      ]
    },
    zhipu: {
      vendor: '智谱 (GLM)',
      vendorUrl: 'https://open.bigmodel.cn/pricing',
      models: [
        { id: 'glm-4.5', context: 131072, maxOutput: 98304, inputPrice: 0.82, outputPrice: 2.75, vision: false, tools: true, reasoning: true, accessFromCN: 'direct' },
        { id: 'glm-4.5-air', context: 131072, maxOutput: 98304, inputPrice: 0.11, outputPrice: 0.41, vision: false, tools: true, reasoning: true, accessFromCN: 'direct' },
        { id: 'glm-4.5-flash', context: 131072, maxOutput: 98304, inputPrice: 0, outputPrice: 0, vision: false, tools: true, reasoning: true, accessFromCN: 'direct' },
        { id: 'glm-4-plus', context: 128000, maxOutput: 4096, inputPrice: 6.90, outputPrice: 6.90, vision: false, tools: true, reasoning: false, accessFromCN: 'direct' },
        { id: 'glm-4v-plus', context: 65536, maxOutput: 4096, inputPrice: 1.40, outputPrice: 1.40, vision: true, tools: false, reasoning: false, accessFromCN: 'direct' }
      ]
    },
    qwen: {
      vendor: '阿里通义 (Qwen)',
      vendorUrl: 'https://help.aliyun.com/zh/model-studio/models',
      models: [
        { id: 'qwen3-235b-a22b', context: 131072, maxOutput: 65536, inputPrice: 0.55, outputPrice: 2.19, vision: false, tools: true, reasoning: true, accessFromCN: 'direct' },
        { id: 'qwen-max', context: 131072, maxOutput: 8192, inputPrice: 1.60, outputPrice: 6.40, vision: false, tools: true, reasoning: false, accessFromCN: 'direct' },
        { id: 'qwen-plus', context: 131072, maxOutput: 8192, inputPrice: 0.55, outputPrice: 2.19, vision: false, tools: true, reasoning: false, cache: 0.14, accessFromCN: 'direct' },
        { id: 'qwen-turbo', context: 131072, maxOutput: 8192, inputPrice: 0.04, outputPrice: 0.14, vision: false, tools: true, reasoning: false, accessFromCN: 'direct' },
        { id: 'qwen-vl-max', context: 32768, maxOutput: 2048, inputPrice: 0.41, outputPrice: 1.24, vision: true, tools: false, reasoning: false, accessFromCN: 'direct' }
      ]
    },
    doubao: {
      vendor: '字节豆包',
      vendorUrl: 'https://www.volcengine.com/docs/82379/1099320',
      models: [
        { id: 'doubao-seed-1.6', context: 256000, maxOutput: 32768, inputPrice: 0.11, outputPrice: 0.55, vision: true, tools: true, reasoning: true, accessFromCN: 'direct' },
        { id: 'doubao-seed-1.6-flash', context: 256000, maxOutput: 32768, inputPrice: 0.021, outputPrice: 0.084, vision: true, tools: true, reasoning: true, accessFromCN: 'direct' },
        { id: 'doubao-1.5-pro-32k', context: 32768, maxOutput: 12288, inputPrice: 0.11, outputPrice: 0.28, vision: false, tools: true, reasoning: false, accessFromCN: 'direct' },
        { id: 'doubao-1.5-vision-pro-32k', context: 32768, maxOutput: 12288, inputPrice: 0.42, outputPrice: 1.26, vision: true, tools: false, reasoning: false, accessFromCN: 'direct' }
      ]
    },
    hunyuan: {
      vendor: '腾讯混元',
      vendorUrl: 'https://cloud.tencent.com/document/product/1729/97731',
      models: [
        { id: 'hunyuan-turbo', context: 262144, maxOutput: 16384, inputPrice: 2.10, outputPrice: 8.40, vision: false, tools: true, reasoning: false, accessFromCN: 'direct' },
        { id: 'hunyuan-turbos', context: 262144, maxOutput: 32768, inputPrice: 0.14, outputPrice: 0.55, vision: false, tools: true, reasoning: true, accessFromCN: 'direct' },
        { id: 'hunyuan-large', context: 262144, maxOutput: 16384, inputPrice: 0.56, outputPrice: 2.10, vision: false, tools: true, reasoning: false, accessFromCN: 'direct' },
        { id: 'hunyuan-standard', context: 262144, maxOutput: 16384, inputPrice: 0.11, outputPrice: 0.14, vision: false, tools: true, reasoning: false, accessFromCN: 'direct' },
        { id: 'hunyuan-vision', context: 32768, maxOutput: 8192, inputPrice: 2.40, outputPrice: 2.40, vision: true, tools: false, reasoning: false, accessFromCN: 'direct' }
      ]
    },
    ernie: {
      vendor: '百度文心',
      vendorUrl: 'https://cloud.baidu.com/doc/WENXINWORKSHOP/s/hlrk4akp7',
      models: [
        { id: 'ernie-4.5-turbo', context: 131072, maxOutput: 16384, inputPrice: 0.11, outputPrice: 0.42, vision: false, tools: true, reasoning: false, accessFromCN: 'direct' },
        { id: 'ernie-4.5-turbo-vl', context: 65536, maxOutput: 16384, inputPrice: 0.14, outputPrice: 0.56, vision: true, tools: true, reasoning: false, accessFromCN: 'direct' },
        { id: 'ernie-4.0-8k', context: 8192, maxOutput: 4096, inputPrice: 4.20, outputPrice: 8.40, vision: false, tools: true, reasoning: false, accessFromCN: 'direct' },
        { id: 'ernie-speed-128k', context: 131072, maxOutput: 4096, inputPrice: 0, outputPrice: 0, vision: false, tools: false, reasoning: false, accessFromCN: 'direct' },
        { id: 'ernie-lite-8k', context: 8192, maxOutput: 4096, inputPrice: 0, outputPrice: 0, vision: false, tools: false, reasoning: false, accessFromCN: 'direct' }
      ]
    },
    spark: {
      vendor: '讯飞星火',
      vendorUrl: 'https://www.xfyun.cn/doc/spark/HTTP%E8%B0%83%E7%94%A8%E6%96%87%E6%A1%A3.html',
      models: [
        { id: 'spark-4.0-ultra', context: 128000, maxOutput: 8192, inputPrice: 1.68, outputPrice: 1.68, vision: false, tools: true, reasoning: false, accessFromCN: 'direct' },
        { id: 'spark-max', context: 32768, maxOutput: 8192, inputPrice: 0.28, outputPrice: 0.28, vision: false, tools: true, reasoning: false, accessFromCN: 'direct' },
        { id: 'spark-pro', context: 131072, maxOutput: 8192, inputPrice: 0.13, outputPrice: 0.13, vision: false, tools: false, reasoning: false, accessFromCN: 'direct' },
        { id: 'spark-lite', context: 131072, maxOutput: 8192, inputPrice: 0, outputPrice: 0, vision: false, tools: false, reasoning: false, accessFromCN: 'direct' }
      ]
    },
    minimax: {
      vendor: 'MiniMax',
      vendorUrl: 'https://platform.minimaxi.com/document/price',
      models: [
        { id: 'minimax-m1', context: 1048576, maxOutput: 40960, inputPrice: 0.55, outputPrice: 2.19, vision: false, tools: true, reasoning: true, accessFromCN: 'direct' },
        { id: 'minimax-text-01', context: 1000000, maxOutput: 40960, inputPrice: 0.14, outputPrice: 1.10, vision: false, tools: false, reasoning: false, accessFromCN: 'direct' },
        { id: 'abab6.5s-chat', context: 245760, maxOutput: 8192, inputPrice: 0.14, outputPrice: 0.14, vision: false, tools: false, reasoning: false, accessFromCN: 'direct' },
        { id: 'abab6.5g-chat', context: 8192, maxOutput: 8192, inputPrice: 4.20, outputPrice: 4.20, vision: false, tools: false, reasoning: false, accessFromCN: 'direct' }
      ]
    }
  };
})();
