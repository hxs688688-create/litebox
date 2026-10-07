/* LiteBox v5 · registry/categories.js — 分类注册表（数据源，Step 2A；Step 5E 补齐 10 分类 emoji 图标） */
(() => {
  window.LB = window.LB || {};
  LB.categories = {
    list: ["图片设计", "文本语言", "文件文档", "学习效率", "财务计算", "日常生活", "网络工具", "资讯", "音视频", "聚会娱乐", "求职办公"],
    icon: {
      '图片设计':'🎨',
      '文本语言':'📝',
      '文件文档':'📁',
      '学习效率':'🎓',
      '财务计算':'💰',
      '日常生活':'🏠',
      '网络工具':'🌐',
      '资讯':'📰',
      '音视频':'🎬',
      '聚会娱乐':'🎉',
      '求职办公':'💼'
    },
    gradient: {
      '图片设计':'linear-gradient(135deg,#f43f5e,#fb7185)',
      '文本语言':'linear-gradient(135deg,#6366f1,#818cf8)',
      '文件文档':'linear-gradient(135deg,#0ea5e9,#38bdf8)',
      '学习效率':'linear-gradient(135deg,#10b981,#34d399)',
      '财务计算':'linear-gradient(135deg,#f59e0b,#fbbf24)',
      '日常生活':'linear-gradient(135deg,#8b5cf6,#a78bfa)',
      '网络工具':'linear-gradient(135deg,#06b6d4,#22d3ee)',
      '资讯':'linear-gradient(135deg,var(--brand1),var(--brand2))',
      '音视频':'linear-gradient(135deg,#ec4899,#f472b6)',
      '聚会娱乐':'linear-gradient(135deg,#f97316,#fb923c)',
      '求职办公':'linear-gradient(135deg,#14b8a6,#2dd4bf)'
    }
  };
})();
